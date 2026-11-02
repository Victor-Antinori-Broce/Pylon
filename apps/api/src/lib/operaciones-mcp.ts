/**
 * Las operaciones del SDK de kons como herramientas MCP
 * ============================================================================
 *
 * Cada operación montada de un kon del SDK es una herramienta (salvo las
 * excluidas con motivo), con el MISMO esquema que su ruta REST
 * (`operaciones-openapi.ts`).
 *
 * ── CÓMO SE EJECUTA UNA HERRAMIENTA ────────────────────────────────────────
 *
 * No se llama al handler a pelo: se construye la petición HTTP de la
 * operación y se pasa por un PIPELINE interno con las mismas piezas que la API
 * pone delante de un kon, en el mismo orden:
 *
 *   contexto de petición (requestId, traza, request-scope)
 *   → identidad = el agente de la sesión MCP (`agent` + `user` con sus scopes,
 *     igual que deja la autenticación global con `Bearer kitsuden_agent_*`)
 *   → las puertas por prefijo de `auth-guard` (`RUTAS_SOLO_ADMIN`)
 *   → `Idempotency-Key` (si el agente manda `idempotency_key`)
 *   → errores en problem+json
 *   → la transacción RLS del kon (`montarRlsDeKon`)
 *   → el router del kon (validación, permiso, handler)
 *
 * Así una herramienta NO puede hacer nada que la misma clave no pudiera hacer
 * por REST: hereda la autorización, la RLS y la idempotencia sin duplicarlas.
 * Lo que la sesión MCP añade encima es su lista `allowedTools`.
 *
 * Lo que NO pasa por aquí (diferencias conocidas con REST): el límite de
 * peticiones por kon (el MCP tiene el suyo, 200/min), la comprobación de
 * Origin (es para cookies) y la negociación de formato de REST: el texto del
 * resultado sale en el formato más corto SIN pérdida (`auto`, lib/formatos.ts)
 * y `_meta["kitsuden/format"]` dice cuál; `structuredContent` lleva los datos.
 */

import {
  costeDeOperacion,
  exclusionMcp,
  nombreDeHerramienta,
  buildProblem,
  errorCodeFromLegacy,
  errorCodeForStatus,
  type FirmanteDeAgente,
  type ProblemDetails,
} from "@kitsuden/shared";
import { Hono, type Context, type Next } from "hono";

import {
  concedeOperacion,
  operacionesMontadas,
  versionDeOperacionesMontadas,
  type OperacionCualquiera,
} from "../../../../packages/engine/src/operaciones";
import { leerEventosSse } from "../../../../packages/engine/src/flujos";
import { denegacionesDeAgente, puertaDeAdmin, RUTAS_SOLO_ADMIN } from "../middleware/auth-guard";
import { idempotencia } from "../middleware/idempotencia";
import { problemasHttp } from "../middleware/problemas-http";
import { requestContextMiddleware } from "../middleware/telemetry";

import { CLAVE_IDEMPOTENCIA_VALIDA, huellaDePeticion, repeticionGuardada } from "./idempotencia";
import { codificarRespuesta, META_FORMATO } from "./formatos";
import { almacenesPorDefecto } from "./idempotencia-almacenes";
import { logger } from "./logger";
import { montarRlsDeKon } from "./module-loader";
import {
  ARG_CUERPO,
  ARG_IDEMPOTENCIA,
  herramientaMcp,
  peticionDesdeArgumentos,
  uriDeGuia,
  type HerramientaMcp,
} from "./operaciones-openapi";
import { resultadoDeError } from "./problemas-mcp";
import type { ModoDeEnvoltorio } from "./ajustes-mcp";
import { envolverFilas, META_PROCEDENCIA, procedenciaDeFilas, type Procedencia } from "./procedencia";
import { db } from "../db";

/** Lo que el MCP sabe del agente de una sesión. */
export interface AgenteDeSesion {
  agentId: string;
  agentName: string;
  apiKeyId: string;
  scopes: string[];
  allowedTools: string[];
  /** Fase F: el firmante humano del agente (ver @kitsuden/shared firmante.ts). */
  sponsor?: FirmanteDeAgente | null;
  /** Envoltorio del contenido no confiable (panel; lib/procedencia.ts). */
  untrustedWrap?: ModoDeEnvoltorio;
}

interface Entrada {
  konId: string;
  mountPath: string;
  op: OperacionCualquiera;
  herramienta: HerramientaMcp;
}

let indice: { version: number; porNombre: Map<string, Entrada> } | null = null;

function herramientas(): Map<string, Entrada> {
  const version = versionDeOperacionesMontadas();
  if (indice?.version === version) return indice.porNombre;
  const porNombre = new Map<string, Entrada>();
  for (const { konId, mountPath, operaciones } of operacionesMontadas()) {
    for (const op of operaciones) {
      const herramienta = herramientaMcp(konId, mountPath, op);
      if (!herramienta) continue;
      if (porNombre.has(herramienta.name)) {
        logger.warn({ herramienta: herramienta.name }, "[mcp] nombre de herramienta repetido; se queda la primera");
        continue;
      }
      porNombre.set(herramienta.name, { konId, mountPath, op, herramienta });
    }
  }
  indice = { version, porNombre };
  return porNombre;
}

/** El usuario con el que el agente de la sesión llega a las operaciones. */
function usuarioDelAgente(a: AgenteDeSesion) {
  return { id: a.agentId, name: a.agentName, role: "agent", scopes: a.scopes, sponsor: a.sponsor ?? null };
}

/**
 * ¿Debe VER este agente la herramienta? Si su lista `allowedTools` la deja y
 * si el permiso de la operación se lo concede (la MISMA comprobación que hace
 * la ruta REST: scopes ∪ roles ∪ política del kon): anunciar las que no puede
 * usar solo invita a fallar. Las que dependen del recurso
 * (`politica.enHandler`) se anuncian: se decide al ejecutar.
 */
async function visible(agente: AgenteDeSesion, e: Entrada): Promise<boolean> {
  if (agente.allowedTools.length > 0 && !agente.allowedTools.includes(e.herramienta.name)) return false;
  if (!e.op.permiso || e.op.permiso.politica?.enHandler) return true;
  return concedeOperacion(e.konId, e.op, usuarioDelAgente(agente));
}

/** Las herramientas de operaciones que esta sesión puede ver (para `tools/list`). */
export async function herramientasDeOperaciones(agente: AgenteDeSesion): Promise<HerramientaMcp[]> {
  const salida: HerramientaMcp[] = [];
  for (const e of herramientas().values()) if (await visible(agente, e)) salida.push(e.herramienta);
  return salida;
}

/**
 * Lo que gasta de la cuota una llamada a esta herramienta del SDK (fase E):
 * escritura si no es GET, y el `coste` declarado (1 por defecto). `null` si
 * no es una herramienta del SDK.
 */
export function consumoDeHerramientaDeOperacion(
  nombre: string
): { escritura: boolean; unidades: number } | null {
  const e = herramientas().get(nombre);
  if (!e) return null;
  return { escritura: e.op.metodo !== "GET", unidades: costeDeOperacion(e.op) };
}

/**
 * Fase F: la petición REST que haría esta herramienta del SDK (para decidir si
 * necesita aprobación y guardarla como propuesta). `null` si no es del SDK;
 * `{ error }` si los argumentos no valen (entonces no se propone: la llamada
 * sigue y devuelve su error de validación).
 */
export function peticionDeHerramienta(
  nombre: string,
  args: unknown
):
  | { konId: string; op: OperacionCualquiera; metodo: string; camino: string; query: string; cuerpo: unknown }
  | { error: string }
  | null {
  const e = herramientas().get(nombre);
  if (!e) return null;
  const argumentos = (args && typeof args === "object" && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
  const validos = Object.keys((e.herramienta.inputSchema.properties ?? {}) as Record<string, unknown>);
  if (Object.keys(argumentos).some((k) => !validos.includes(k))) return { error: "unknown arguments" };
  try {
    const peticion = peticionDesdeArgumentos(e.mountPath, e.op, argumentos);
    const url = new URL(peticion.url);
    return {
      konId: e.konId,
      op: e.op,
      metodo: e.op.metodo,
      camino: url.pathname,
      query: url.search,
      cuerpo: argumentos[ARG_CUERPO],
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * Fase F: ¿es esta llamada la REPETICIÓN de una ya hecha (misma
 * `idempotency_key`, mismos argumentos)? Entonces no se cobra cuota: la
 * idempotencia del pipeline la repetirá sin ejecutar nada.
 */
export async function esRepeticionDeHerramienta(nombre: string, args: unknown, agentId: string): Promise<boolean> {
  const e = herramientas().get(nombre);
  if (!e) return false;
  const argumentos = (args && typeof args === "object" && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
  const clave = argumentos[ARG_IDEMPOTENCIA];
  if (typeof clave !== "string" || !CLAVE_IDEMPOTENCIA_VALIDA.test(clave)) return false;
  try {
    const peticion = peticionDesdeArgumentos(e.mountPath, e.op, argumentos);
    const url = new URL(peticion.url);
    const cabeceras = (peticion.init.headers ?? {}) as Record<string, string>;
    const cuerpo =
      typeof peticion.init.body === "string" ? new TextEncoder().encode(peticion.init.body) : new Uint8Array();
    const huella = huellaDePeticion({
      metodo: e.op.metodo,
      camino: url.pathname,
      query: url.search,
      tipo: cabeceras["content-type"] ?? "",
      cuerpo,
    });
    return await repeticionGuardada(almacenesPorDefecto(), `agent:${agentId}`, clave, huella);
  } catch {
    return false;
  }
}

export interface RecursoDeGuia {
  uri: string;
  name: string;
  mimeType: "text/markdown";
  description: string;
}

/**
 * Las guías (`kitsuden://guia/<herramienta>`) de las herramientas que esta
 * sesión VE: la misma visibilidad que `tools/list`, para no describir lo que
 * el agente no puede usar.
 */
export async function recursosDeGuia(agente: AgenteDeSesion): Promise<RecursoDeGuia[]> {
  const salida: RecursoDeGuia[] = [];
  for (const e of herramientas().values()) {
    if (!e.op.guia || !(await visible(agente, e))) continue;
    salida.push({
      uri: uriDeGuia(e.herramienta.name),
      name: `Guide: ${e.herramienta.name}`,
      mimeType: "text/markdown",
      description: `How to use ${e.herramienta.name}: when, prerequisites, examples, common mistakes`,
    });
  }
  return salida;
}

/**
 * El texto de la guía de una herramienta, o `null` si la URI no es de una
 * guía, la herramienta no tiene o esta sesión no la ve (se responde igual que
 * a una que no existe).
 */
export async function leerGuia(uri: string, agente: AgenteDeSesion): Promise<string | null> {
  const prefijo = uriDeGuia("");
  if (!uri.startsWith(prefijo)) return null;
  const e = herramientas().get(uri.slice(prefijo.length));
  if (!e?.op.guia || !(await visible(agente, e))) return null;
  return guiaEnMarkdown(e);
}

function guiaEnMarkdown(e: Entrada): string {
  const g = e.op.guia!;
  const h = e.herramienta;
  const lineas = [`# ${h.name}`, "", h.title, ""];
  if (g.cuandoUsar) lineas.push("## When to use", "", g.cuandoUsar, "");
  if (g.antes?.length) lineas.push("## Before calling it", "", ...g.antes.map((a) => `- ${a}`), "");
  if (g.ejemplos?.length) {
    lineas.push("## Examples", "");
    for (const ej of g.ejemplos) {
      lineas.push(`### ${ej.titulo}`, "", "```json", JSON.stringify(ej.argumentos, null, 2), "```", "");
    }
  }
  if (g.trampas?.length) {
    lineas.push("## Common mistakes", "", ...g.trampas.map((t) => `- **${t.si}** → ${t.entonces}`), "");
  }
  lineas.push("## Contract", "", h.description, "");
  return lineas.join("\n");
}

/**
 * Para los toolsets (lib/ajustes-mcp.ts): de qué kon es una herramienta del
 * SDK y si solo lee (GET). `null` si no es del SDK.
 */
export function fichaDeHerramientaDeOperacion(nombre: string): { kon: string; soloLectura: boolean } | null {
  const e = herramientas().get(nombre);
  if (!e) return null;
  return { kon: e.konId.replace(/^kon-/, ""), soloLectura: e.op.metodo === "GET" };
}

/** ¿Es una herramienta generada por el SDK? */
export function esHerramientaDeOperacion(nombre: string): boolean {
  return herramientas().has(nombre);
}

/** Para la cobertura: cada operación montada, con su herramienta o su motivo. */
export function inventarioMcpDeOperaciones(): {
  ruta: string;
  nombre: string | null;
  excluida: string | null;
}[] {
  const salida: { ruta: string; nombre: string | null; excluida: string | null }[] = [];
  for (const { konId, mountPath, operaciones } of operacionesMontadas()) {
    for (const op of operaciones) {
      const ruta = `${op.metodo} ${op.ruta === "/" ? mountPath : `${mountPath}${op.ruta}`}`;
      const excluida = exclusionMcp(op);
      salida.push({ ruta, nombre: excluida === null ? nombreDeHerramienta(konId, op) : null, excluida });
    }
  }
  return salida;
}

// ── El pipeline ─────────────────────────────────────────────────────────────

type EnvPipeline = { Bindings: { agente: AgenteDeSesion } };

let pipeline: { version: number; app: Hono<EnvPipeline> } | null = null;

function identidadDelAgente() {
  return async (c: Context<EnvPipeline>, next: Next) => {
    const a = c.env.agente;
    const set = c.set as (k: string, v: unknown) => void;
    set("agent", {
      agentId: a.agentId,
      agentName: a.agentName,
      scopes: a.scopes,
      keyId: a.apiKeyId,
      allowedTools: a.allowedTools,
      sponsor: a.sponsor ?? null,
      rateLimit: 0,
      writesPerDay: null,
      budgetUnitsPerDay: null,
    });
    // La misma forma que deja la autenticación global (index.ts) para un agente
    set("user", {
      ...usuarioDelAgente(a),
      email: `agent@${a.agentId}.kitsuden.local`,
      image: null,
    });
    set("session", null);
    await next();
  };
}

function construirPipeline(): Hono<EnvPipeline> {
  const app = new Hono<EnvPipeline>();
  app.use("*", requestContextMiddleware() as never);
  app.use("*", identidadDelAgente());
  app.use("*", denegacionesDeAgente as never);
  app.use("*", puertaDeAdmin(RUTAS_SOLO_ADMIN) as never);
  app.use(
    "/api/*",
    idempotencia({
      almacenes: almacenesPorDefecto,
      avisar: (mensaje, datos) => logger.warn(datos, mensaje),
    }) as never
  );
  app.use("*", problemasHttp() as never);
  for (const { mountPath, router } of operacionesMontadas()) {
    montarRlsDeKon(app as never, mountPath);
    app.route(mountPath, router as never);
  }
  return app;
}

function app(): Hono<EnvPipeline> {
  const version = versionDeOperacionesMontadas();
  if (pipeline?.version !== version) pipeline = { version, app: construirPipeline() };
  return pipeline.app;
}

/** Claves bajo las que un kon suele devolver su lista. */
const CLAVES_DE_LISTA = ["items", "data", "entries", "results", "rows", "posts", "records"] as const;

/**
 * Las filas de una respuesta de kon: el array, la lista bajo una clave
 * conocida, o el objeto entero como una fila. Devuelve también cómo volver a
 * montar la respuesta con las filas cambiadas.
 */
function filasDeRespuesta(cuerpo: object): { filas: unknown[]; montar: (filas: unknown[]) => unknown } {
  if (Array.isArray(cuerpo)) return { filas: cuerpo, montar: (f) => f };
  const o = cuerpo as Record<string, unknown>;
  for (const k of CLAVES_DE_LISTA) {
    const v = o[k];
    if (Array.isArray(v) && v.every((x) => x && typeof x === "object")) {
      return { filas: v, montar: (f) => ({ ...o, [k]: f }) };
    }
  }
  return { filas: [o], montar: (f) => f[0] };
}

async function marcarProcedencia(
  cuerpo: object,
  agente: AgenteDeSesion
): Promise<{ datos: unknown; procedencia: Procedencia } | null> {
  try {
    const { filas, montar } = filasDeRespuesta(cuerpo);
    const modo = agente.untrustedWrap ?? "none";
    // agent_identities no tiene RLS: la conexión global basta para clasificar.
    const procedencia = await procedenciaDeFilas(filas, db as never, { lector: agente.agentId, wrap: modo });
    return { datos: modo === "none" ? cuerpo : montar(envolverFilas(filas, procedencia, modo)), procedencia };
  } catch (err) {
    logger.warn({ err }, "[mcp] no se pudo calcular la procedencia");
    return null;
  }
}

export interface ResultadoMcp {
  content: { type: "text"; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

function problemaDeArgumentos(nombre: string, detalle: string, extra?: Record<string, unknown>): ProblemDetails {
  return buildProblem({
    code: "KITSUDEN_E_VALIDATION",
    detail: `Argumentos inválidos para '${nombre}': ${detalle}`,
    instance: "/api/mcp",
    extensions: extra,
  });
}

/**
 * Ejecuta una herramienta del SDK. `null` si el nombre no es de una operación
 * (la llamada sigue por las herramientas de siempre).
 */
export async function ejecutarHerramientaDeOperacion(
  nombre: string,
  args: unknown,
  agente: AgenteDeSesion
): Promise<ResultadoMcp | null> {
  const e = herramientas().get(nombre);
  if (!e) return null;

  if (agente.allowedTools.length > 0 && !agente.allowedTools.includes(nombre)) {
    return resultadoDeError(
      buildProblem({
        code: "KITSUDEN_E_FORBIDDEN",
        detail: `Tool '${nombre}' is not in this agent's allowed tools.`,
        instance: "/api/mcp",
      })
    );
  }

  const argumentos = (args && typeof args === "object" && !Array.isArray(args) ? args : {}) as Record<
    string,
    unknown
  >;
  const validos = Object.keys((e.herramienta.inputSchema.properties ?? {}) as Record<string, unknown>);
  const sobran = Object.keys(argumentos).filter((k) => !validos.includes(k));
  if (sobran.length > 0) {
    return resultadoDeError(
      problemaDeArgumentos(
        nombre,
        `no conoce ${sobran.map((s) => `'${s}'`).join(", ")}. Argumentos válidos: ${validos.join(", ") || "(ninguno)"}.` +
          (e.op.entrada?.cuerpo ? ` El cuerpo va entero en '${ARG_CUERPO}'.` : ""),
        { unknownKeys: sobran, validKeys: validos }
      )
    );
  }
  let peticion;
  try {
    peticion = peticionDesdeArgumentos(e.mountPath, e.op, argumentos);
  } catch (err) {
    return resultadoDeError(problemaDeArgumentos(nombre, (err as Error).message));
  }

  const res = await app().request(peticion.url, peticion.init, { agente });
  const tipo = res.headers.get("content-type") ?? "";
  const texto = await res.text();
  let cuerpo: unknown = texto;
  if (tipo.includes("json") && texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = texto;
    }
  }
  // Un flujo (kitsuden2.md C5): por MCP, la LISTA de sus eventos. Un evento
  // `error` es el error de la herramienta (con su problem+json).
  if (res.status === 200 && tipo.includes("text/event-stream")) {
    const eventos = leerEventosSse(texto);
    const fallo = eventos.find((ev) => ev.event === "error");
    if (fallo) {
      let p: unknown;
      try {
        p = JSON.parse(fallo.data);
      } catch {
        p = null;
      }
      return resultadoDeError(
        p && typeof p === "object" && "code" in (p as object)
          ? (p as ProblemDetails)
          : buildProblem({ code: "KITSUDEN_E_INTERNAL", status: 500, instance: "/api/mcp" })
      );
    }
    cuerpo = eventos
      .filter((ev) => !ev.event || ev.event === "message")
      .map((ev) => {
        try {
          return JSON.parse(ev.data) as unknown;
        } catch {
          return ev.data;
        }
      });
  }

  if (res.status >= 400) {
    const problema =
      cuerpo && typeof cuerpo === "object" && "code" in (cuerpo as object)
        ? (cuerpo as ProblemDetails)
        : buildProblem({
            code: errorCodeFromLegacy((cuerpo as { code?: unknown })?.code) ?? errorCodeForStatus(res.status),
            status: res.status,
            detail: typeof cuerpo === "string" ? cuerpo.slice(0, 500) : undefined,
            instance: "/api/mcp",
          });
    return resultadoDeError(problema);
  }

  const replay = res.headers.get("idempotent-replayed") === "true";
  // Una lectura trae lo que escribieron otros: se marca quién (y se envuelve
  // si el agente lo pidió). Las escrituras devuelven lo que el agente mandó.
  const marcado =
    e.op.metodo === "GET" && res.status !== 204 && cuerpo && typeof cuerpo === "object"
      ? await marcarProcedencia(cuerpo, agente)
      : null;
  const datos = res.status === 204 ? null : (marcado?.datos ?? cuerpo);
  const salida =
    typeof datos === "string" ? null : codificarRespuesta(datos, "auto", { clave: `mcp:${nombre}` });
  const meta: Record<string, unknown> = {};
  if (salida) meta[META_FORMATO] = salida.formato;
  if (marcado) meta[META_PROCEDENCIA] = { ...marcado.procedencia, source: `kon:${e.konId.replace(/^kon-/, "")}` };
  return {
    content: [{ type: "text", text: salida ? salida.texto : (datos as string) }],
    ...(Object.keys(meta).length ? { _meta: meta } : {}),
    structuredContent: {
      status: res.status,
      ...(replay ? { idempotentReplayed: true } : {}),
      data: datos,
    },
  };
}
