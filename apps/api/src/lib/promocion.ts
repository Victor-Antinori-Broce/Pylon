/**
 * Promoción de código escrito por agentes (fase I) — la ejecución
 * ============================================================================
 *
 * El contrato (modos, configuración de fábrica, diff de capacidades, la tabla
 * de decisión) está en `@kitsuden/shared` (`promocion.ts`) y el escaneo en
 * `escaneo-de-codigo.ts`; la guía pública en `docs/agents/promotion.md`. Aquí:
 *
 *   · el BORRADOR: una fila de `code_versions` (la versión activa no se toca
 *     nunca: activar es escribir OTRA versión en la acción); reenviar el mismo
 *     contenido devuelve la misma fila;
 *   · las PRUEBAS en el sandbox de QuickJS con `kitsuden.api` y `fetch`
 *     SIMULADOS por cada caso (corren aunque `ENABLE_CODE_ACTIONS` esté
 *     apagado: no salen de aquí);
 *   · el ESCANEO local + el diff de lo declarado frente a la versión activa +
 *     lo que toca (secretos, usuarios y roles, configuración de seguridad,
 *     operaciones sensibles según la clasificación de la fase F);
 *   · la DECISIÓN: `suggestion` → propuesta en la bandeja de la fase F
 *     (`POST /api/promotion/versions/:id/activate`, que al aprobarse se
 *     ejecuta con la identidad del agente y la marca de la aprobación);
 *     `turbo` → activación inmediata solo si NINGÚN motivo aplica;
 *   · la ACTIVACIÓN vigilada y la VUELTA ATRÁS (sola por tasa de errores en la
 *     ventana, o a mano), auditadas y notificadas.
 *
 * Todo lo que ESCRIBE va con la conexión global (`db`, contexto vacío = el
 * sistema): un agente nunca escribe `code_versions` ni `actions` por sí mismo.
 * Lo que un agente LEE de lo suyo pasa por la transacción RLS de la petición
 * (routes/promocion.ts).
 */

import {
  MAX_PRUEBAS_POR_BORRADOR,
  capacidadesDe,
  concedeScope,
  decidirPromocion,
  diffDeCapacidades,
  escanearCodigo,
  fusionarConfigDePromocion,
  leerConfigDePromocion,
  nombreDeSecreto,
  partirScopes,
  reglaLegadaCasa,
  scopeFinoDeOperacion,
  toqueDeCamino,
  toqueDeScope,
  type CapacidadesDeCodigo,
  type CasoDePrueba,
  type ConfigDePromocion,
  type DecisionDePromocion,
  type DiffDeCapacidades,
  type EstadoDeVersion,
  type HallazgoDeEscaneo,
  type InformeDeEscaneo,
  type ModoDePromocion,
  type RespuestaSimulada,
  type ResumenDePruebas,
  type ToqueSensible,
} from "@kitsuden/shared";
import { createHash } from "node:crypto";

import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";

import { messageOf } from "../../../../packages/engine/src/errors";
import { operacionDeRuta } from "../../../../packages/engine/src/operaciones";
import { db } from "../db";
import { actionExecutions, actions, agentIdentities, approvalSettings, codeVersions } from "../db/schema";
import { registrarAccionDeAgente, type AuditAction } from "../services/agent-audit";
import type { AgentAuthContext } from "../services/agent-auth";
import { sendAgentWebhook } from "../services/agent-webhooks";

import {
  crearPropuesta,
  instantaneaDeAprobaciones,
  modoDeAgente,
  propuestaPorId,
  sensibilidadDeOperacion,
} from "./aprobaciones";
import { observarEjecucionesDeCodigo } from "./actions/engine";
import { logger } from "./logger";
import {
  accionesDeCodigoHabilitadas,
  executeSandbox,
  type PeticionDeFetchSimulada,
  type RespuestaDeSandbox,
} from "./worker-sandbox";

export type Version = typeof codeVersions.$inferSelect;
type Accion = typeof actions.$inferSelect;

export const KON_DE_PROMOCION = "kon-promotion";
export const RUTA_DE_PROMOCION = "/api/promotion";
export const OPERACION_DE_ACTIVAR = "activar-version";
export const SCOPE_PROMOCION = "promotion:propose";

/** Camino que guarda la propuesta de la bandeja (y que se ejecuta al aprobarla). */
export function caminoDeActivacion(versionId: string): string {
  return `${RUTA_DE_PROMOCION}/versions/${versionId}/activate`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Errores con estado (las rutas los traducen a problem+json)
// ═══════════════════════════════════════════════════════════════════════════

export class ErrorDePromocion extends Error {
  constructor(
    readonly estado: 403 | 404 | 409 | 422,
    message: string,
    readonly motivo: string,
    readonly version?: Version
  ) {
    super(message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Configuración (fila `code_promotion` de approval_settings) y modo por agente
// ═══════════════════════════════════════════════════════════════════════════

const ID_CONFIG = "code_promotion";

export async function leerConfigGuardada(): Promise<{
  config: ConfigDePromocion;
  updatedBy: string | null;
  updatedAt: Date | null;
}> {
  const [fila] = await db.select().from(approvalSettings).where(eq(approvalSettings.id, ID_CONFIG)).limit(1);
  return { config: leerConfigDePromocion(fila?.value), updatedBy: fila?.updatedBy ?? null, updatedAt: fila?.updatedAt ?? null };
}

async function auditar(e: {
  agentId: string | null;
  keyId?: string | null;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    await registrarAccionDeAgente({
      agentId: e.agentId,
      keyId: e.keyId ?? undefined,
      action: e.action,
      resource: e.resource,
      resourceId: e.resourceId,
      details: e.details,
      success: e.success ?? true,
      errorMessage: e.errorMessage,
    });
  } catch (err) {
    logger.error({ err, action: e.action }, "[promocion] no se pudo escribir la auditoría");
    throw err;
  }
}

export async function guardarConfigDePromocion(
  cambio: Partial<Record<keyof ConfigDePromocion, unknown>>,
  quien: string
): Promise<{ antes: ConfigDePromocion; despues: ConfigDePromocion }> {
  const antes = (await leerConfigGuardada()).config;
  const despues = fusionarConfigDePromocion(antes, cambio); // lanza con el motivo
  await db
    .insert(approvalSettings)
    .values({ id: ID_CONFIG, value: despues, updatedBy: quien, updatedAt: new Date() })
    .onConflictDoUpdate({ target: approvalSettings.id, set: { value: despues, updatedBy: quien, updatedAt: new Date() } });
  await auditar({
    agentId: null,
    action: "promotion_settings_changed",
    resource: "code_promotion",
    details: { by: quien, before: antes, after: despues },
  });
  return { antes, despues };
}

export async function modoDePromocionDe(agentId: string): Promise<ModoDePromocion> {
  const [a] = await db
    .select({ modo: agentIdentities.promotionMode })
    .from(agentIdentities)
    .where(eq(agentIdentities.id, agentId))
    .limit(1);
  return a?.modo === "turbo" ? "turbo" : "suggestion";
}

export async function guardarModoDePromocion(
  agentId: string,
  modo: ModoDePromocion,
  quien: string
): Promise<{ antes: string; despues: ModoDePromocion } | null> {
  const [a] = await db
    .select({ modo: agentIdentities.promotionMode })
    .from(agentIdentities)
    .where(eq(agentIdentities.id, agentId))
    .limit(1);
  if (!a) return null;
  await db.update(agentIdentities).set({ promotionMode: modo, updatedAt: new Date() }).where(eq(agentIdentities.id, agentId));
  await auditar({
    agentId,
    action: "promotion_mode_changed",
    resource: "promotion_mode",
    details: { by: quien, before: a.modo, after: modo },
  });
  return { antes: a.modo, despues: modo };
}

// ═══════════════════════════════════════════════════════════════════════════
// Huellas
// ═══════════════════════════════════════════════════════════════════════════

/** JSON con las claves ordenadas: la misma entrada da el mismo texto. */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
    .join(",")}}`;
}

const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex");

export function huellaDeContenido(codigo: string, caps: CapacidadesDeCodigo, pruebas: CasoDePrueba[]): string {
  return sha256(canonico({ code: codigo, capabilities: caps, tests: pruebas }));
}

/** Lo que corre AHORA en la acción (código + capacidades): la base contra la que se probó un borrador. */
export function huellaDeAccion(accion: Pick<Accion, "config"> | null): string | null {
  if (!accion) return null;
  const config = (accion.config ?? {}) as Record<string, unknown>;
  return sha256(canonico({ code: typeof config.code === "string" ? config.code : "", capabilities: capacidadesDe(config) }));
}

/** La misma huella que `huellaDeAccion`, para lo que escribe una versión en la acción. */
function huellaDeVersionEnAccion(v: Pick<Version, "code" | "capabilities">): string {
  return sha256(canonico({ code: v.code, capabilities: capacidadesDe(v.capabilities) }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Pruebas en el sandbox (API y fetch simulados)
// ═══════════════════════════════════════════════════════════════════════════

export interface ResultadoDeCaso {
  name: string;
  status: "passed" | "failed" | "errored";
  durationMs: number;
  exitReason: string;
  error: string | null;
  /** Qué no casó con `expect` (en inglés: lo lee el agente). */
  mismatches: string[];
  /** Llamadas del código sin respuesta simulada (respondieron 404). */
  unmockedCalls: string[];
  logs: string;
}

export interface InformeDePruebas extends ResumenDePruebas {
  cases: ResultadoDeCaso[];
  /** Pruebas declaradas en la acción que se añadieron a las del borrador. */
  fromTarget: number;
  durationMs: number;
}

const PRESUPUESTO_DE_PRUEBAS_MS = 60_000;
const TIEMPO_MAXIMO_POR_PRUEBA_MS = 10_000;
const PRUEBAS_A_LA_VEZ = 3;

function respuestaSimulada(r: RespuestaSimulada | undefined, url: string): RespuestaDeSandbox | null {
  if (!r) return null;
  const cuerpo = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? null);
  return {
    status: typeof r.status === "number" ? r.status : 200,
    headers: { "content-type": typeof r.body === "string" ? "text/plain" : "application/json", ...(r.headers ?? {}) },
    body: cuerpo,
    url,
  };
}

/** `{ a: 1 }` contra `{ a: 1 }`: igualdad profunda por forma canónica. */
function igualProfundo(a: unknown, b: unknown): boolean {
  return canonico(a) === canonico(b);
}

async function ejecutarCaso(codigo: string, caps: CapacidadesDeCodigo, caso: CasoDePrueba): Promise<ResultadoDeCaso> {
  const sinSimular: string[] = [];
  const simuladas = caso.api ?? {};
  const fetchs = caso.fetch ?? {};
  const api = async (metodo: string, camino: string): Promise<RespuestaDeSandbox> => {
    const sinQuery = camino.split("?")[0]!;
    const r =
      respuestaSimulada(simuladas[`${metodo} ${camino}`], camino) ??
      respuestaSimulada(simuladas[`${metodo} ${sinQuery}`], camino);
    if (r) return r;
    sinSimular.push(`${metodo} ${camino}`);
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: `No simulated response for ${metodo} ${camino} in this test` }),
      url: camino,
    };
  };
  const fetchSimulado = async (p: PeticionDeFetchSimulada): Promise<RespuestaDeSandbox> => {
    const r =
      respuestaSimulada(fetchs[`${p.method} ${p.url}`], p.url) ??
      (p.method === "GET" ? respuestaSimulada(fetchs[p.url], p.url) : null);
    if (r) return r;
    sinSimular.push(`${p.method} ${p.url}`);
    return { status: 404, headers: {}, body: "", url: p.url };
  };

  const r = await executeSandbox({
    code: codigo,
    payload: caso.event ?? {},
    envVars: caso.env ?? {},
    timeoutMs: Math.min(caso.timeoutMs ?? caps.timeoutMs, TIEMPO_MAXIMO_POR_PRUEBA_MS),
    memoryLimitMb: caps.memoryLimitMb,
    fetchAllow: caps.fetchAllow,
    maxCalls: caps.maxCalls,
    api,
    prueba: { fetch: fetchSimulado },
  });

  const esperado = caso.expect ?? {};
  const fallos: string[] = [];
  const debeIrBien = esperado.success ?? true;
  if (r.success !== debeIrBien) {
    fallos.push(debeIrBien ? `expected success, got error: ${r.error ?? "unknown"}` : "expected an error, the code succeeded");
  }
  if (Object.prototype.hasOwnProperty.call(esperado, "result") && !igualProfundo(r.result, esperado.result)) {
    fallos.push(`result differs: expected ${canonico(esperado.result).slice(0, 300)}, got ${canonico(r.result).slice(0, 300)}`);
  }
  if (esperado.resultContains !== undefined && !JSON.stringify(r.result ?? null).includes(esperado.resultContains)) {
    fallos.push(`result does not contain ${JSON.stringify(esperado.resultContains)}`);
  }
  if (esperado.errorContains !== undefined && !(r.error ?? "").includes(esperado.errorContains)) {
    fallos.push(`error does not contain ${JSON.stringify(esperado.errorContains)}`);
  }
  if (esperado.logsContain !== undefined && !(r.logs ?? "").includes(esperado.logsContain)) {
    fallos.push(`logs do not contain ${JSON.stringify(esperado.logsContain)}`);
  }
  // Un tiempo agotado o un intérprete caído es ERROR de la prueba (no un fallo esperado).
  const errorada = r.exitReason === "timeout" || r.exitReason === "killed";
  return {
    name: caso.name,
    status: errorada && !(esperado.success === false) ? "errored" : fallos.length ? "failed" : "passed",
    durationMs: r.durationMs,
    exitReason: r.exitReason,
    error: r.error,
    mismatches: fallos,
    unmockedCalls: [...new Set(sinSimular)],
    logs: (r.logs ?? "").slice(0, 2000),
  };
}

/** Las pruebas del borrador + las que declara la acción (las del borrador ganan por nombre). */
export function pruebasAEjecutar(delBorrador: CasoDePrueba[], deLaAccion: unknown): { casos: CasoDePrueba[]; deLaAccion: number } {
  const nombres = new Set(delBorrador.map((c) => c.name));
  const declaradas = Array.isArray(deLaAccion)
    ? (deLaAccion as CasoDePrueba[]).filter((c) => c && typeof c === "object" && typeof c.name === "string" && !nombres.has(c.name))
    : [];
  const casos = [...delBorrador, ...declaradas].slice(0, MAX_PRUEBAS_POR_BORRADOR * 2);
  return { casos, deLaAccion: Math.max(0, casos.length - delBorrador.length) };
}

export async function ejecutarPruebas(
  codigo: string,
  caps: CapacidadesDeCodigo,
  casos: CasoDePrueba[],
  deLaAccion = 0
): Promise<InformeDePruebas> {
  const inicio = Date.now();
  const resultados: ResultadoDeCaso[] = new Array(casos.length);
  let siguiente = 0;
  const trabajador = async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= casos.length) return;
      const caso = casos[i]!;
      if (Date.now() - inicio > PRESUPUESTO_DE_PRUEBAS_MS) {
        resultados[i] = {
          name: caso.name,
          status: "errored",
          durationMs: 0,
          exitReason: "skipped",
          error: `Not run: the ${PRESUPUESTO_DE_PRUEBAS_MS / 1000} s test budget was used up`,
          mismatches: [],
          unmockedCalls: [],
          logs: "",
        };
        continue;
      }
      try {
        resultados[i] = await ejecutarCaso(codigo, caps, caso);
      } catch (err) {
        resultados[i] = {
          name: caso.name,
          status: "errored",
          durationMs: 0,
          exitReason: "error",
          error: messageOf(err),
          mismatches: [],
          unmockedCalls: [],
          logs: "",
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PRUEBAS_A_LA_VEZ, casos.length) }, trabajador));
  return {
    total: resultados.length,
    passed: resultados.filter((r) => r.status === "passed").length,
    failed: resultados.filter((r) => r.status === "failed").length,
    errored: resultados.filter((r) => r.status === "errored").length,
    cases: resultados,
    fromTarget: deLaAccion,
    durationMs: Date.now() - inicio,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Escaneo + capacidades + lo que toca
// ═══════════════════════════════════════════════════════════════════════════

export interface Analisis {
  escaneo: InformeDeEscaneo;
  diff: DiffDeCapacidades;
  toques: ToqueSensible[];
  /** Llamadas a operaciones sensibles (`METODO camino` → clave de la operación o `legacy`). */
  sensibles: { method: string; path: string; operation: string | null }[];
  llamadaSinClasificar: boolean;
}

export async function analizarBorrador(p: {
  codigo: string;
  caps: CapacidadesDeCodigo;
  activa: CapacidadesDeCodigo | null;
  codigoActivo: string | null;
  scopesDelAutor: string[] | null;
}): Promise<Analisis> {
  const escaneo = escanearCodigo(p.codigo, { fetchAllow: p.caps.fetchAllow });
  const hallazgos: HallazgoDeEscaneo[] = [...escaneo.findings];

  // Un agente no declara para su código lo que él mismo no tiene.
  if (p.scopesDelAutor) {
    const { concesiones } = partirScopes(p.caps.scopes);
    const ajenos = concesiones.filter((s) => !concedeScope(p.scopesDelAutor!, s));
    if (ajenos.length) {
      hallazgos.push({
        rule: "scope_beyond_author",
        severity: "medium",
        line: 1,
        message: `Declares scopes the submitting agent does not hold: ${ajenos.join(", ")}`,
      });
    }
  }

  // Decisión 3 del propietario (2026-10-28): turbo solo cuenta lo NUEVO. Lo que
  // la versión activa ya tocaba (un DELETE, un camino de usuarios, un scope de
  // secretos…) no frena; lo que el borrador AÑADE, sí. La activa es la última
  // versión (también la foto `baseline` o una edición `manual`).
  const { config } = await instantaneaDeAprobaciones();
  const delBorrador = clasificarToques(escaneo, p.caps, config);
  const delActivo = p.codigoActivo !== null ? clasificarToques(escanearCodigo(p.codigoActivo), p.activa ?? capacidadesDe({}), config) : null;
  const toques = new Set<ToqueSensible>();
  for (const [item, t] of delBorrador.toques) if (!delActivo?.toques.has(item)) toques.add(t);
  const sensibles = delBorrador.sensibles.filter((x) => !delActivo?.sensibles.some((y) => y.clave === x.clave));
  const sinClasificar = delBorrador.sinClasificar;

  const informe: InformeDeEscaneo = {
    ...escaneo,
    findings: hallazgos,
    passed: !hallazgos.some((h) => h.severity === "high" || h.severity === "medium"),
  };
  return {
    escaneo: informe,
    diff: diffDeCapacidades(p.activa, p.caps),
    toques: [...toques].sort(),
    sensibles: sensibles.map(({ method, path, operation }) => ({ method, path, operation })),
    llamadaSinClasificar: sinClasificar,
  };
}

/**
 * Lo que toca un código (con sus capacidades), como CLAVES comparables entre
 * versiones: `scope:<s>`, `path:<METODO> <camino>`, `env:<VAR>` → la categoría;
 * y sus llamadas sensibles con una clave (la operación del SDK, o método +
 * camino en lo legado).
 */
function clasificarToques(
  escaneo: InformeDeEscaneo,
  caps: CapacidadesDeCodigo,
  config: Awaited<ReturnType<typeof instantaneaDeAprobaciones>>["config"]
): {
  toques: Map<string, ToqueSensible>;
  sensibles: { method: string; path: string; operation: string | null; clave: string }[];
  sinClasificar: boolean;
} {
  const toques = new Map<string, ToqueSensible>();
  for (const s of caps.scopes) {
    const t = toqueDeScope(s);
    if (t) toques.set(`scope:${s}`, t);
  }
  const sensibles: { method: string; path: string; operation: string | null; clave: string }[] = [];
  let sinClasificar = false;
  for (const ll of escaneo.apiCalls) {
    if (ll.path === null || ll.method === "*") {
      sinClasificar = true;
      continue;
    }
    const camino = ll.path.split("?")[0]!;
    const t = toqueDeCamino(camino);
    if (t) toques.set(`path:${ll.method} ${camino}`, t);
    const deRuta = operacionDeRuta(ll.method, camino);
    if (deRuta) {
      const s = sensibilidadDeOperacion(config, deRuta.konId, deRuta.op);
      if (s.sensible) sensibles.push({ method: ll.method, path: camino, operation: s.clave, clave: s.clave });
    } else if (config.legacyRules.some((r) => reglaLegadaCasa(r, ll.method, camino))) {
      sensibles.push({ method: ll.method, path: camino, operation: null, clave: `${ll.method} ${camino}` });
    }
  }
  // Variables con nombre de secreto (o `env[x]` calculado).
  for (const v of escaneo.envVars) if (v === "*" || nombreDeSecreto(v)) toques.set(`env:${v}`, "secrets");
  return { toques, sensibles, sinClasificar };
}

// ═══════════════════════════════════════════════════════════════════════════
// Proponer un borrador
// ═══════════════════════════════════════════════════════════════════════════

export interface EntradaDeBorrador {
  target: { actionId?: string; slug?: string; name?: string };
  code: string;
  scopes?: string[];
  fetchAllow?: string[];
  timeoutMs?: number;
  memoryLimitMb?: number;
  maxCalls?: number;
  tests?: CasoDePrueba[];
  description?: string;
}

async function accionPorId(id: string): Promise<Accion | null> {
  const [a] = await db.select().from(actions).where(eq(actions.id, id)).limit(1);
  return a ?? null;
}

async function accionPorSlug(slug: string): Promise<Accion | null> {
  const [a] = await db.select().from(actions).where(eq(actions.slug, slug)).limit(1);
  return a ?? null;
}

async function versionActiva(slug: string): Promise<Version | null> {
  const [v] = await db
    .select()
    .from(codeVersions)
    .where(and(eq(codeVersions.targetSlug, slug), eq(codeVersions.status, "active")))
    .limit(1);
  return v ?? null;
}

export async function versionPorId(id: string): Promise<Version | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [v] = await db.select().from(codeVersions).where(eq(codeVersions.id, id)).limit(1);
  return v ?? null;
}

async function siguienteNumero(slug: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(max(${codeVersions.versionNumber}), 0)::int` })
    .from(codeVersions)
    .where(eq(codeVersions.targetSlug, slug));
  return (r?.n ?? 0) + 1;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function esUnico(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export interface ResultadoDePropuesta {
  version: Version;
  duplicado: boolean;
}

/**
 * El camino entero de un borrador (ver la cabecera). Lanza `ErrorDePromocion`
 * con el estado HTTP cuando la entrada no sirve.
 */
export async function proponerBorrador(
  agente: AgentAuthContext,
  entrada: EntradaDeBorrador,
  canal: "rest" | "mcp" = "rest"
): Promise<ResultadoDePropuesta> {
  // 1. La acción: existente (por id o slug) o nueva (slug + nombre).
  let accion: Accion | null = null;
  if (entrada.target.actionId) {
    accion = await accionPorId(entrada.target.actionId);
    if (!accion) throw new ErrorDePromocion(404, "Action not found", "target_not_found");
  } else if (entrada.target.slug) {
    accion = await accionPorSlug(entrada.target.slug);
  } else {
    throw new ErrorDePromocion(422, "target needs actionId (an existing action) or slug (+ name for a new one)", "target_missing");
  }
  if (accion && accion.type !== "code") {
    throw new ErrorDePromocion(422, `Action ${accion.slug} is of type ${accion.type}; only code actions can be promoted`, "target_not_code");
  }
  const slug = accion?.slug ?? entrada.target.slug!;
  if (!accion) {
    if (!SLUG.test(slug) || slug.length > 200) {
      throw new ErrorDePromocion(422, "slug must be lowercase letters, digits and dashes (max 200)", "invalid_slug");
    }
    if (!entrada.target.name?.trim()) {
      throw new ErrorDePromocion(422, "A new action needs target.name", "target_name_missing");
    }
  }
  const nombre = accion?.name ?? entrada.target.name!.trim().slice(0, 200);

  // 2. Lo declarado y las pruebas; la huella del contenido.
  const caps = capacidadesDe({
    scopes: entrada.scopes,
    fetchAllow: entrada.fetchAllow,
    timeoutMs: entrada.timeoutMs,
    memoryLimitMb: entrada.memoryLimitMb,
    maxCalls: entrada.maxCalls,
  });
  const pruebas = (entrada.tests ?? []).slice(0, MAX_PRUEBAS_POR_BORRADOR);
  const huella = huellaDeContenido(entrada.code, caps, pruebas);

  // 3. El mismo borrador otra vez: la misma versión (en el estado en que esté).
  const [previa] = await db
    .select()
    .from(codeVersions)
    .where(and(eq(codeVersions.agentId, agente.agentId), eq(codeVersions.targetSlug, slug), eq(codeVersions.contentHash, huella)))
    .limit(1);
  if (previa) return { version: await sincronizarConPropuesta(previa), duplicado: true };

  // 4. Contra qué se compara: la versión activa o, si la acción nunca pasó por aquí, lo que corre ahora.
  const activa = await versionActiva(slug);
  const configAccion = (accion?.config ?? {}) as Record<string, unknown>;
  const capsActivas: CapacidadesDeCodigo | null = activa
    ? capacidadesDe(activa.capabilities)
    : accion
      ? capacidadesDe(configAccion)
      : null;
  const codigoActivo = activa?.code ?? (typeof configAccion.code === "string" ? configAccion.code : null);

  // 5. Pruebas, escaneo, decisión.
  const { casos, deLaAccion } = pruebasAEjecutar(pruebas, configAccion.tests);
  const informePruebas = await ejecutarPruebas(entrada.code, caps, casos, deLaAccion);
  const analisis = await analizarBorrador({
    codigo: entrada.code,
    caps,
    activa: capsActivas,
    codigoActivo,
    scopesDelAutor: agente.scopes ?? [],
  });
  const modo = await modoDePromocionDe(agente.agentId);
  const { config } = await leerConfigGuardada();
  const aprob = await instantaneaDeAprobaciones();
  const decision: DecisionDePromocion = decidirPromocion({
    modo,
    config,
    agenteRetenido: aprob.config.enabled && modoDeAgente(aprob, agente.agentId) === "propose",
    diff: analisis.diff,
    pruebas: informePruebas,
    escaneoAprobado: analisis.escaneo.passed,
    toques: analisis.toques,
    operacionSensible: analisis.sensibles.length > 0,
    llamadaSinClasificar: analisis.llamadaSinClasificar,
    objetivoConVariables: tieneVariablesDeEntorno(accion?.config),
  });
  const decisionGuardada = {
    ...decision,
    mode: modo,
    turboAllowed: config.turboAllowed,
    touches: analisis.toques,
    sensitiveCalls: analisis.sensibles,
    decidedAt: new Date().toISOString(),
  };

  // 6. La fila (número siguiente; una carrera con otra igual = esa).
  let version: Version | undefined;
  for (let intento = 0; intento < 4 && !version; intento++) {
    try {
      const [fila] = await db
        .insert(codeVersions)
        .values({
          targetKind: "action",
          targetId: accion?.id ?? null,
          targetSlug: slug,
          targetName: nombre,
          versionNumber: await siguienteNumero(slug),
          origin: "agent",
          agentId: agente.agentId,
          keyId: agente.keyId || null,
          sponsorUserId: agente.sponsor?.userId ?? null,
          channel: canal,
          description: entrada.description?.slice(0, 2000) ?? null,
          code: entrada.code,
          capabilities: caps,
          tests: pruebas,
          contentHash: huella,
          baseHash: huellaDeAccion(accion),
          parentVersionId: activa?.id ?? null,
          mode: modo,
          status: decision.ruta === "turbo" ? "approved" : "awaiting_approval",
          testReport: informePruebas,
          scanReport: analisis.escaneo,
          capabilityDiff: analisis.diff,
          decision: decisionGuardada,
        })
        .returning();
      version = fila;
    } catch (err) {
      if (!esUnico(err)) throw err;
      const [otra] = await db
        .select()
        .from(codeVersions)
        .where(and(eq(codeVersions.agentId, agente.agentId), eq(codeVersions.targetSlug, slug), eq(codeVersions.contentHash, huella)))
        .limit(1);
      if (otra) return { version: otra, duplicado: true };
      // Si no, chocó el número de versión con otra acción en curso: otra vuelta.
    }
  }
  if (!version) throw new Error("No se pudo numerar la versión");

  await auditar({
    agentId: agente.agentId,
    keyId: agente.keyId,
    action: "promotion_submitted",
    resource: `action:${slug}`,
    resourceId: version.id,
    details: {
      versionNumber: version.versionNumber,
      contentHash: huella,
      baseHash: version.baseHash,
      parentVersionId: version.parentVersionId,
      sponsor: version.sponsorUserId,
      channel: canal,
      mode: modo,
      route: decision.ruta,
      reasons: decision.motivos,
      tests: { total: informePruebas.total, passed: informePruebas.passed, failed: informePruebas.failed, errored: informePruebas.errored },
      scan: { passed: analisis.escaneo.passed, findings: analisis.escaneo.findings.map((h) => `${h.severity}:${h.rule}`) },
    },
  });

  // 7. Turbo: se activa ya. Si no: la propuesta de la bandeja.
  if (decision.ruta === "turbo") {
    try {
      const r = await activarVersion(version.id, { tipo: "turbo" });
      return { version: r, duplicado: false };
    } catch (err) {
      if (err instanceof ErrorDePromocion && err.version) return { version: err.version, duplicado: false };
      throw err;
    }
  }
  const { propuesta } = await crearPropuesta({
    agente,
    canal: "rest",
    metodo: "POST",
    camino: caminoDeActivacion(version.id),
    cuerpo: { contentHash: huella },
    tipo: "application/json",
    huella: sha256(`promotion:${version.id}:${huella}`),
    idempotencyKey: null,
    motivo: "sensitive",
    konId: KON_DE_PROMOCION,
    operacionId: OPERACION_DE_ACTIVAR,
    clave: scopeFinoDeOperacion(KON_DE_PROMOCION, OPERACION_DE_ACTIVAR),
    diff: resumenParaLaBandeja(version),
  });
  const [conPropuesta] = await db
    .update(codeVersions)
    .set({ proposalId: propuesta.id, updatedAt: new Date() })
    .where(eq(codeVersions.id, version.id))
    .returning();
  return { version: conPropuesta ?? version, duplicado: false };
}

/** Lo que la bandeja de la fase F enseña como «diff» de la propuesta (sin el código). */
export function resumenParaLaBandeja(v: Version) {
  const pruebas = v.testReport as InformeDePruebas | null;
  const escaneo = v.scanReport as InformeDeEscaneo | null;
  return {
    kind: "promotion",
    versionId: v.id,
    target: { slug: v.targetSlug, name: v.targetName, actionId: v.targetId },
    versionNumber: v.versionNumber,
    contentHash: v.contentHash,
    mode: v.mode,
    decision: v.decision,
    tests: pruebas ? { total: pruebas.total, passed: pruebas.passed, failed: pruebas.failed, errored: pruebas.errored } : null,
    scan: escaneo ? { passed: escaneo.passed, findings: escaneo.findings } : null,
    capabilityDiff: v.capabilityDiff,
    panel: `/approvals?tab=promotion&version=${v.id}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado de la propuesta → estado de la versión
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Una versión que espera aprobación sigue a su propuesta: rechazada o
 * caducada en la bandeja → `rejected` / `expired`; fallida sin activar →
 * `failed` (con el motivo). Se llama al leer (barato: solo las que esperan).
 */
export async function sincronizarConPropuesta(v: Version): Promise<Version> {
  if (v.status !== "awaiting_approval" || !v.proposalId) return v;
  const p = await propuestaPorId(v.proposalId);
  if (!p) return v;
  const pendienteCaducada = p.status === "pending" && p.expiresAt <= new Date();
  let estado: EstadoDeVersion | null = null;
  let error: string | null = null;
  if (p.status === "rejected") estado = "rejected";
  else if (p.status === "expired" || pendienteCaducada) estado = "expired";
  else if (p.status === "failed") {
    estado = "failed";
    error = p.resultError ?? `proposal_failed (HTTP ${p.resultStatus ?? "?"})`;
  }
  if (!estado) return v;
  const [actualizada] = await db
    .update(codeVersions)
    .set({ status: estado, activationError: error, updatedAt: new Date() })
    .where(and(eq(codeVersions.id, v.id), eq(codeVersions.status, "awaiting_approval")))
    .returning();
  if (!actualizada) return (await versionPorId(v.id)) ?? v;
  if (estado === "rejected") {
    await auditar({
      agentId: v.agentId,
      action: "promotion_rejected",
      resource: `action:${v.targetSlug}`,
      resourceId: v.id,
      details: { by: p.decidedBy, comment: p.decisionComment, proposalId: p.id, contentHash: v.contentHash },
    }).catch(() => undefined);
  }
  return actualizada;
}

// ═══════════════════════════════════════════════════════════════════════════
// Activar
// ═══════════════════════════════════════════════════════════════════════════

export type QuienActiva =
  | { tipo: "turbo" }
  | { tipo: "aprobacion"; proposalId: string; approvedBy: string; agentId: string }
  | { tipo: "humano"; userId: string };

/** Does this action's `config` hold environment variables? (their real values reach the code) */
function tieneVariablesDeEntorno(config: unknown): boolean {
  const variables = (config as { envVars?: unknown } | null | undefined)?.envVars;
  return !!variables && typeof variables === "object" && Object.keys(variables).length > 0;
}

/** La `config` de la acción con el código y lo declarado de la versión (lo demás, envVars incluido, se queda). */
function configConVersion(base: Record<string, unknown>, v: Version): Record<string, unknown> {
  const caps = capacidadesDe(v.capabilities);
  return {
    ...base,
    code: v.code,
    scopes: caps.scopes,
    fetchAllow: caps.fetchAllow,
    timeoutMs: caps.timeoutMs,
    memoryLimitMb: caps.memoryLimitMb,
    maxCalls: caps.maxCalls,
    tests: v.tests,
    promotion: { versionId: v.id, versionNumber: v.versionNumber, contentHash: v.contentHash },
  };
}

const quienEs = (q: QuienActiva) =>
  q.tipo === "turbo" ? "turbo" : q.tipo === "aprobacion" ? q.approvedBy : q.userId;

let negativos = new Map<string, number>();

/**
 * Activa la versión (ver la cabecera). Devuelve la versión ACTIVA, o lanza
 * `ErrorDePromocion` (409) con la versión como quedó: `approved` si las
 * acciones de código están apagadas, `failed` si la acción cambió por debajo.
 */
export async function activarVersion(id: string, quien: QuienActiva): Promise<Version> {
  const v = await versionPorId(id);
  if (!v || v.origin !== "agent") throw new ErrorDePromocion(404, "Version not found", "not_found");

  const permitido =
    quien.tipo === "aprobacion"
      ? v.status === "awaiting_approval" && v.proposalId === quien.proposalId && v.agentId === quien.agentId
      : v.status === "approved";
  if (!permitido) {
    throw new ErrorDePromocion(
      409,
      quien.tipo === "humano" && v.status === "awaiting_approval"
        ? "This version is waiting for approval: approve its proposal instead"
        : `Version is ${v.status}`,
      "wrong_state",
      v
    );
  }

  const { config } = await leerConfigGuardada();

  // Sin acciones de código no se activa: queda aprobada y lo dice.
  if (!accionesDeCodigoHabilitadas()) {
    const [aprobada] = await db
      .update(codeVersions)
      .set({ status: "approved", activationError: "code_actions_disabled", updatedAt: new Date() })
      .where(eq(codeVersions.id, v.id))
      .returning();
    await auditar({
      agentId: v.agentId,
      action: "promotion_activation_blocked",
      resource: `action:${v.targetSlug}`,
      resourceId: v.id,
      details: { by: quienEs(quien), via: quien.tipo, reason: "code_actions_disabled", contentHash: v.contentHash },
      success: false,
      errorMessage: "code_actions_disabled",
    });
    throw new ErrorDePromocion(
      409,
      "Code actions are disabled on this server (ENABLE_CODE_ACTIONS): the version stays approved and an admin can activate it once they are enabled",
      "code_actions_disabled",
      aprobada
    );
  }

  const ahora = new Date();
  let resultado: { version: Version; anterior: Version | null; accionId: string } | { estancada: true };
  resultado = await db.transaction(async (tx) => {
    // La acción, bloqueada: nadie la cambia mientras se cambia de versión.
    const [accion] = await tx.select().from(actions).where(eq(actions.slug, v.targetSlug)).limit(1).for("update");
    if (huellaDeAccion(accion ?? null) !== v.baseHash) return { estancada: true } as const;

    const [activa] = await tx
      .select()
      .from(codeVersions)
      .where(and(eq(codeVersions.targetSlug, v.targetSlug), eq(codeVersions.status, "active")))
      .limit(1)
      .for("update");
    let anterior: Version | null = activa ?? null;
    // Alguien editó la acción a mano desde la última activación: lo que corre
    // ya no es la versión activa. Se toma la foto de lo que corre DE VERDAD
    // (volver atrás tiene que dejar eso, no una versión que ya no corría).
    const deriva = !!(activa && accion && huellaDeVersionEnAccion(activa) !== huellaDeAccion(accion));
    if (deriva) {
      await tx.update(codeVersions).set({ status: "superseded", updatedAt: ahora }).where(eq(codeVersions.id, activa!.id));
      anterior = null;
    }
    if (!anterior && accion) {
      // Primera versión promocionada de una acción que ya existía (o una
      // editada a mano): la foto de lo que corría, para poder volver a ello.
      const [n] = await tx
        .select({ n: sql<number>`coalesce(max(${codeVersions.versionNumber}), 0)::int` })
        .from(codeVersions)
        .where(eq(codeVersions.targetSlug, v.targetSlug));
      const configAccion = (accion.config ?? {}) as Record<string, unknown>;
      const [foto] = await tx
        .insert(codeVersions)
        .values({
          targetKind: "action",
          targetId: accion.id,
          targetSlug: accion.slug,
          targetName: accion.name,
          versionNumber: (n?.n ?? 0) + 1,
          origin: "baseline",
          code: typeof configAccion.code === "string" ? configAccion.code : "",
          capabilities: capacidadesDe(configAccion),
          tests: Array.isArray(configAccion.tests) ? configAccion.tests : [],
          contentHash: huellaDeAccion(accion)!,
          mode: "suggestion",
          status: "active",
          activatedAt: accion.createdAt,
          activatedBy: "baseline",
        })
        .returning();
      anterior = foto!;
    }
    if (anterior) {
      await tx
        .update(codeVersions)
        .set({ status: "superseded", updatedAt: ahora })
        .where(eq(codeVersions.id, anterior.id));
    }

    let accionId: string;
    if (accion) {
      await tx
        .update(actions)
        .set({
          config: configConVersion((accion.config ?? {}) as Record<string, unknown>, v),
          status: "active",
          errorCount: 0,
          lastError: null,
          updatedAt: ahora,
        })
        .where(eq(actions.id, accion.id));
      accionId = accion.id;
    } else {
      const [nueva] = await tx
        .insert(actions)
        .values({
          name: v.targetName,
          slug: v.targetSlug,
          description: v.description,
          type: "code",
          trigger: "manual",
          triggerConfig: {},
          config: configConVersion({}, v),
          status: "active",
          // Responsable humano: quien aprobó, o el firmante del agente.
          createdById: quien.tipo === "aprobacion" ? quien.approvedBy : quien.tipo === "humano" ? quien.userId : v.sponsorUserId,
        })
        .returning();
      accionId = nueva!.id;
    }

    const [activada] = await tx
      .update(codeVersions)
      .set({
        status: "active",
        targetId: accionId,
        activatedAt: ahora,
        activatedBy: quienEs(quien),
        previousVersionId: anterior?.id ?? null,
        activationError: null,
        watchUntil: new Date(ahora.getTime() + config.watchMinutes * 60_000),
        watch: {
          state: "watching",
          executions: 0,
          errors: 0,
          minExecutions: config.minExecutions,
          maxErrorRate: config.maxErrorRate,
          watchMinutes: config.watchMinutes,
        },
        updatedAt: ahora,
      })
      .where(eq(codeVersions.id, v.id))
      .returning();
    return { version: activada!, anterior, accionId };
  });

  if ("estancada" in resultado) {
    const [fallida] = await db
      .update(codeVersions)
      .set({ status: "failed", activationError: "stale_base", updatedAt: new Date() })
      .where(eq(codeVersions.id, v.id))
      .returning();
    await auditar({
      agentId: v.agentId,
      action: "promotion_activation_failed",
      resource: `action:${v.targetSlug}`,
      resourceId: v.id,
      details: { by: quienEs(quien), via: quien.tipo, reason: "stale_base", contentHash: v.contentHash, baseHash: v.baseHash },
      success: false,
      errorMessage: "stale_base",
    });
    throw new ErrorDePromocion(
      409,
      "The action changed since this draft was tested (another version was activated or it was edited): submit the draft again",
      "stale_base",
      fallida
    );
  }

  negativos.delete(resultado.accionId);
  await auditar({
    agentId: v.agentId,
    keyId: v.keyId,
    action: "promotion_activated",
    resource: `action:${v.targetSlug}`,
    resourceId: v.id,
    details: {
      by: quienEs(quien),
      via: quien.tipo,
      proposalId: quien.tipo === "aprobacion" ? quien.proposalId : v.proposalId,
      sponsor: v.sponsorUserId,
      versionNumber: v.versionNumber,
      contentHash: v.contentHash,
      previousVersionId: resultado.anterior?.id ?? null,
      previousHash: resultado.anterior?.contentHash ?? null,
      actionId: resultado.accionId,
      watchUntil: resultado.version.watchUntil,
    },
  });
  return resultado.version;
}

// ═══════════════════════════════════════════════════════════════════════════
// Ediciones a mano de una persona (decisión 2 del propietario)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Una persona (admin) cambió el código de una acción por `/api/actions`: queda
 * como versión `manual` ACTIVA, con la base (lo que corría antes) y la versión
 * anterior, para que volver atrás, la auditoría y `stale_base` sigan valiendo.
 * Si lo que corría antes no era la versión activa (una edición por SQL), se
 * guarda antes la foto `baseline` de eso. Sin ventana de vigilancia: es una
 * decisión humana; se puede volver atrás a mano.
 */
export async function registrarEdicionManual(
  antes: Pick<Accion, "id" | "slug" | "name" | "config" | "createdAt"> | null,
  despues: Pick<Accion, "id" | "slug" | "name" | "config">,
  userId: string | null
): Promise<Version> {
  const ahora = new Date();
  const configDespues = (despues.config ?? {}) as Record<string, unknown>;
  const caps = capacidadesDe(configDespues);
  const codigo = typeof configDespues.code === "string" ? configDespues.code : "";
  const pruebas = (Array.isArray(configDespues.tests) ? configDespues.tests : []) as CasoDePrueba[];
  const r = await db.transaction(async (tx) => {
    const [accion] = await tx.select().from(actions).where(eq(actions.id, despues.id)).limit(1).for("update");
    const [activa] = await tx
      .select()
      .from(codeVersions)
      .where(and(eq(codeVersions.targetSlug, despues.slug), eq(codeVersions.status, "active")))
      .limit(1)
      .for("update");
    const numero = async () => {
      const [n] = await tx
        .select({ n: sql<number>`coalesce(max(${codeVersions.versionNumber}), 0)::int` })
        .from(codeVersions)
        .where(eq(codeVersions.targetSlug, despues.slug));
      return (n?.n ?? 0) + 1;
    };
    const baseHash = huellaDeAccion(antes);
    let anterior: Version | null = null;
    if (activa && antes && huellaDeVersionEnAccion(activa) === baseHash) {
      anterior = activa;
    } else if (antes) {
      const configAntes = (antes.config ?? {}) as Record<string, unknown>;
      const [foto] = await tx
        .insert(codeVersions)
        .values({
          targetKind: "action",
          targetId: antes.id,
          targetSlug: antes.slug,
          targetName: antes.name,
          versionNumber: await numero(),
          origin: "baseline",
          code: typeof configAntes.code === "string" ? configAntes.code : "",
          capabilities: capacidadesDe(configAntes),
          tests: Array.isArray(configAntes.tests) ? configAntes.tests : [],
          contentHash: baseHash!,
          mode: "suggestion",
          status: "superseded",
          activatedAt: antes.createdAt,
          activatedBy: "baseline",
        })
        .returning();
      anterior = foto!;
    }
    if (activa) {
      await tx.update(codeVersions).set({ status: "superseded", updatedAt: ahora }).where(eq(codeVersions.id, activa.id));
    }
    const [manual] = await tx
      .insert(codeVersions)
      .values({
        targetKind: "action",
        targetId: despues.id,
        targetSlug: despues.slug,
        targetName: despues.name,
        versionNumber: await numero(),
        origin: "manual",
        agentId: null,
        sponsorUserId: userId,
        channel: "rest",
        description: "Edited by hand (/api/actions)",
        code: codigo,
        capabilities: caps,
        tests: pruebas,
        contentHash: huellaDeContenido(codigo, caps, pruebas),
        baseHash,
        parentVersionId: activa?.id ?? null,
        previousVersionId: anterior?.id ?? null,
        mode: "suggestion",
        status: "active",
        activatedAt: ahora,
        activatedBy: userId ?? "manual",
      })
      .returning();
    // La marca de la versión activa en la acción (no cambia su huella).
    if (accion) {
      await tx
        .update(actions)
        .set({
          config: {
            ...((accion.config ?? {}) as Record<string, unknown>),
            promotion: { versionId: manual!.id, versionNumber: manual!.versionNumber, contentHash: manual!.contentHash },
          },
        })
        .where(eq(actions.id, accion.id));
    }
    return { manual: manual!, anterior };
  });
  negativos.delete(despues.id);
  await auditar({
    agentId: null,
    action: "promotion_manual_edit",
    resource: `action:${despues.slug}`,
    resourceId: r.manual.id,
    details: {
      by: userId,
      versionNumber: r.manual.versionNumber,
      contentHash: r.manual.contentHash,
      baseHash: r.manual.baseHash,
      previousVersionId: r.anterior?.id ?? null,
      previousHash: r.anterior?.contentHash ?? null,
      actionId: despues.id,
    },
  });
  return r.manual;
}

// ═══════════════════════════════════════════════════════════════════════════
// Volver atrás
// ═══════════════════════════════════════════════════════════════════════════

export type QuienVuelve =
  | { tipo: "auto"; estadisticas: { executions: number; errors: number; rate: number } }
  | { tipo: "humano"; userId: string };

/**
 * Deja la acción como estaba antes de esta versión (la anterior vuelve a ser
 * la activa; si no había, la acción se pausa). Solo desde la ACTIVA.
 */
export async function volverAtras(id: string, motivo: string, quien: QuienVuelve): Promise<Version> {
  const ahora = new Date();
  const r = await db.transaction(async (tx) => {
    const [v] = await tx.select().from(codeVersions).where(eq(codeVersions.id, id)).limit(1).for("update");
    if (!v) return { error: new ErrorDePromocion(404, "Version not found", "not_found") };
    if (v.status !== "active" || v.origin === "baseline") {
      return { error: new ErrorDePromocion(409, `Only the active version can be rolled back (this one is ${v.status})`, "wrong_state", v) };
    }
    const [anterior] = v.previousVersionId
      ? await tx.select().from(codeVersions).where(eq(codeVersions.id, v.previousVersionId)).limit(1)
      : [];
    const [accion] = v.targetId
      ? await tx.select().from(actions).where(eq(actions.id, v.targetId)).limit(1).for("update")
      : [];
    const [vuelta] = await tx
      .update(codeVersions)
      .set({
        status: "rolled_back",
        rolledBackAt: ahora,
        rolledBackBy: quien.tipo === "auto" ? "auto" : quien.userId,
        rollbackReason: motivo.slice(0, 2000),
        watch: { ...((v.watch ?? {}) as Record<string, unknown>), state: "rolled_back", ...(quien.tipo === "auto" ? quien.estadisticas : {}) },
        updatedAt: ahora,
      })
      .where(eq(codeVersions.id, v.id))
      .returning();
    if (accion) {
      const base = (accion.config ?? {}) as Record<string, unknown>;
      if (anterior) {
        const restaurada = configConVersion(base, anterior);
        await tx
          .update(actions)
          .set({ config: restaurada, status: "active", errorCount: 0, lastError: null, updatedAt: ahora })
          .where(eq(actions.id, accion.id));
        await tx
          .update(codeVersions)
          .set({ status: "active", updatedAt: ahora })
          .where(eq(codeVersions.id, anterior.id));
      } else {
        // Era la primera: no hay a qué volver, la acción deja de correr.
        await tx.update(actions).set({ status: "paused", updatedAt: ahora }).where(eq(actions.id, accion.id));
      }
    }
    return { version: vuelta!, anterior: anterior ?? null };
  });
  if ("error" in r) throw r.error;

  negativos = new Map();
  const detalles = {
    by: quien.tipo === "auto" ? null : quien.userId,
    automatic: quien.tipo === "auto",
    reason: motivo,
    ...(quien.tipo === "auto" ? { stats: quien.estadisticas } : {}),
    fromVersion: r.version.versionNumber,
    fromHash: r.version.contentHash,
    toVersionId: r.anterior?.id ?? null,
    toHash: r.anterior?.contentHash ?? null,
    actionPaused: !r.anterior,
  };
  await auditar({
    agentId: r.version.agentId,
    action: "promotion_rolled_back",
    resource: `action:${r.version.targetSlug}`,
    resourceId: r.version.id,
    details: detalles,
    success: quien.tipo !== "auto",
    errorMessage: quien.tipo === "auto" ? motivo : undefined,
  });
  logger.warn({ versionId: r.version.id, slug: r.version.targetSlug, ...detalles }, "[promocion] vuelta atrás");
  // El aviso de siempre de los agentes (AGENT_WEBHOOK_URL), si está configurado.
  void sendAgentWebhook({
    id: r.version.id,
    type: "promotion_rolled_back",
    timestamp: ahora.toISOString(),
    agent: { id: r.version.agentId ?? "", name: r.version.agentId ?? "" },
    details: { resource: `action:${r.version.targetSlug}`, ...detalles },
  }).catch(() => undefined);
  return r.version;
}

// ═══════════════════════════════════════════════════════════════════════════
// Vigilancia
// ═══════════════════════════════════════════════════════════════════════════

const NEGATIVO_MS = 10_000;

async function evaluar(v: Version, cerrar: boolean): Promise<void> {
  if (!v.targetId || !v.activatedAt) return;
  const w = (v.watch ?? {}) as { state?: string; minExecutions?: number; maxErrorRate?: number };
  if (w.state !== "watching") return;
  const [c] = await db
    .select({
      total: sql<number>`count(*)::int`,
      errores: sql<number>`count(*) filter (where ${actionExecutions.status} in ('error', 'timeout'))::int`,
    })
    .from(actionExecutions)
    .where(
      and(
        eq(actionExecutions.actionId, v.targetId),
        sql`${actionExecutions.startedAt} >= ${v.activatedAt}`,
        inArray(actionExecutions.status, ["success", "error", "timeout"])
      )
    );
  const total = c?.total ?? 0;
  const errores = c?.errores ?? 0;
  const minimo = w.minExecutions ?? 3;
  const umbral = w.maxErrorRate ?? 0.5;
  const tasa = total > 0 ? errores / total : 0;
  if (total >= minimo && tasa >= umbral) {
    await volverAtras(
      v.id,
      `Automatic rollback: ${errores} of ${total} executions failed or timed out (${Math.round(tasa * 100)}% >= ${Math.round(umbral * 100)}%) within the watch window`,
      { tipo: "auto", estadisticas: { executions: total, errors: errores, rate: tasa } }
    ).catch((err) => {
      if (!(err instanceof ErrorDePromocion)) throw err; // otra vuelta atrás ganó: nada que hacer
    });
    return;
  }
  const nuevo = { ...w, executions: total, errors: errores, ...(cerrar ? { state: "passed" } : {}) };
  const [hecha] = await db
    .update(codeVersions)
    .set({ watch: nuevo, ...(cerrar ? { watchUntil: null } : {}), updatedAt: new Date() })
    .where(and(eq(codeVersions.id, v.id), eq(codeVersions.status, "active")))
    .returning({ id: codeVersions.id });
  if (cerrar && hecha) {
    await auditar({
      agentId: v.agentId,
      action: "promotion_watch_passed",
      resource: `action:${v.targetSlug}`,
      resourceId: v.id,
      details: { executions: total, errors: errores, rate: tasa, contentHash: v.contentHash },
    }).catch(() => undefined);
  }
}

/**
 * Tras cada ejecución de una acción `code` (lo llama el motor de acciones):
 * si una versión suya está en su ventana, recuenta y, por encima del umbral,
 * vuelve atrás. Una consulta indexada; sin versión vigilada, la respuesta se
 * recuerda unos segundos.
 */
export async function vigilarTrasEjecucion(actionId: string): Promise<void> {
  const hasta = negativos.get(actionId);
  if (hasta && hasta > Date.now()) return;
  const [v] = await db
    .select()
    .from(codeVersions)
    .where(and(eq(codeVersions.targetId, actionId), eq(codeVersions.status, "active"), gt(codeVersions.watchUntil, new Date())))
    .limit(1);
  if (!v) {
    negativos.set(actionId, Date.now() + NEGATIVO_MS);
    if (negativos.size > 5000) negativos = new Map();
    return;
  }
  await evaluar(v, false);
}

/** Cierra las ventanas vencidas (y recuenta las abiertas, por si las ejecuciones fueron en otro proceso). */
export async function barrerVigilancias(): Promise<number> {
  const ahora = new Date();
  const filas = await db
    .select()
    .from(codeVersions)
    .where(and(eq(codeVersions.status, "active"), isNotNull(codeVersions.watchUntil)))
    .orderBy(desc(codeVersions.activatedAt))
    .limit(200);
  for (const v of filas) {
    try {
      await evaluar(v, v.watchUntil! <= ahora);
    } catch (err) {
      logger.error({ err, versionId: v.id }, "[promocion] no se pudo evaluar la vigilancia");
    }
  }
  return filas.length;
}

// Cada ejecución de una acción `code` pasa por aquí (motor de acciones).
observarEjecucionesDeCodigo((actionId) => vigilarTrasEjecucion(actionId));

let barrido: ReturnType<typeof setInterval> | null = null;
export function arrancarBarridoDeVigilancias(): void {
  if (barrido) return;
  barrido = setInterval(() => {
    barrerVigilancias().catch(() => undefined);
  }, 60_000);
  (barrido as { unref?: () => void }).unref?.();
}

/** Solo para pruebas. */
export function _olvidarNegativos(): void {
  negativos = new Map();
}

// ═══════════════════════════════════════════════════════════════════════════
// Listados
// ═══════════════════════════════════════════════════════════════════════════

/** Versiones de una acción o de todas, más recientes primero. `ejecutor` = la conexión (RLS o global). */
export async function listarVersiones(
  ejecutor: typeof db,
  f: { agentId?: string | null; status?: string | null; slug?: string | null; limit?: number; offset?: number }
): Promise<Version[]> {
  const condiciones = [];
  if (f.agentId) condiciones.push(eq(codeVersions.agentId, f.agentId));
  if (f.status) condiciones.push(eq(codeVersions.status, f.status));
  if (f.slug) condiciones.push(eq(codeVersions.targetSlug, f.slug));
  const filas = await ejecutor
    .select()
    .from(codeVersions)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(codeVersions.createdAt))
    .limit(Math.min(Math.max(f.limit ?? 50, 1), 200))
    .offset(Math.max(f.offset ?? 0, 0));
  const out: Version[] = [];
  for (const v of filas) out.push(await sincronizarConPropuesta(v));
  return out;
}

/** La vista de una versión (la misma para el agente y el panel; el código solo en el detalle). */
export function vistaDeVersion(v: Version, conCodigo = false) {
  return {
    id: v.id,
    target: { kind: v.targetKind, actionId: v.targetId, slug: v.targetSlug, name: v.targetName },
    versionNumber: v.versionNumber,
    origin: v.origin,
    status: v.status as EstadoDeVersion,
    mode: v.mode,
    agentId: v.agentId,
    sponsorUserId: v.sponsorUserId,
    channel: v.channel,
    description: v.description,
    contentHash: v.contentHash,
    baseHash: v.baseHash,
    parentVersionId: v.parentVersionId,
    previousVersionId: v.previousVersionId,
    capabilities: v.capabilities,
    testCount: Array.isArray(v.tests) ? v.tests.length : 0,
    testReport: v.testReport,
    scanReport: v.scanReport,
    capabilityDiff: v.capabilityDiff,
    decision: v.decision,
    proposal: v.proposalId ? { id: v.proposalId, statusUrl: `/api/proposals/${v.proposalId}` } : null,
    activatedAt: v.activatedAt,
    activatedBy: v.activatedBy,
    watchUntil: v.watchUntil,
    watch: v.watch,
    rolledBackAt: v.rolledBackAt,
    rolledBackBy: v.rolledBackBy,
    rollbackReason: v.rollbackReason,
    activationError: v.activationError,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    ...(conCodigo ? { code: v.code, tests: v.tests } : {}),
  };
}

