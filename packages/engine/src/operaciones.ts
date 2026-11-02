/**
 * SDK de kons — el MOTOR: de la declaración de operaciones a un router
 * ============================================================================
 *
 * El contrato (tipos, nombres, resolución de scopes) vive en
 * `@kitsuden/shared` (`operaciones.ts`). Aquí está lo que lo ejecuta:
 *
 *   defineKonSdk({ id, …, operaciones })   → un `KonDefinition` normal cuyo
 *                                            `createRouter` se GENERA.
 *
 * Cada operación se monta como UNA ruta Hono:
 *
 *   [requireAuth | optionalAuth]   según `acceso` (los del contexto del kon:
 *                                  el anfitrión decide cómo se autentica)
 *   → permiso                      scope fino/amplio ∪ roles ∪ política, ANTES
 *                                  de leer el cuerpo (un 403 no espera a un 422)
 *   → validación                   params, query y cuerpo con zod; campos de
 *                                  más en el cuerpo → 422 con `didYouMean`
 *   → manejar(entrada, h)          devuelve los datos (se sirven con
 *                                  `salida.estado`) o una Response hecha
 *
 * Lo que NO hace este fichero, porque ya lo hace el anfitrión para TODA ruta
 * de un kon y así se hereda gratis: la transacción RLS por petición
 * (`montarRlsDeKon`), la idempotencia (`Idempotency-Key`), los errores en
 * problem+json y los límites de peticiones.
 *
 * Reglas para los handlers (docs/kons/README.md, «Rules»):
 *   1. Nada de `Promise.all` sobre la transacción de la petición: una
 *      conexión, una consulta a la vez. En serie, o `ctx.db.segundoPlano`
 *      para lecturas independientes FUERA de la transacción (corren como el
 *      sistema: solo datos públicos).
 *   2. No tragarse un error de SQL dentro de la transacción: la deja abortada
 *      y todo lo que siga falla. Lo que pueda fallar y se quiera seguir, en un
 *      SAVEPOINT (`ctx.db.instance.transaction(fn)`).
 *   3. Las llamadas externas largas (fetch, S3, correo), fuera de la
 *      transacción: antes de la primera consulta o en `segundoPlano`.
 */

import {
  VERSION_SDK_DE_KONS,
  comprobarOperaciones,
  concedePorScopes,
  denegacionDeOperacion,
  esRedireccion,
  operationIdDe,
  type ContextoDeOperacion,
  type EntradaValidada,
  type KonContext,
  type KonDefinition,
  type OperacionDeKon,
  type UsuarioDeOperacion,
} from "@kitsuden/shared";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { z, ZodTypeAny } from "zod";

import { can, type AuthzUser } from "./authz";
import { AppError, respondError } from "./errors";
import { respuestaDeFlujo } from "./flujos";
import type { ConexionTransaccional, UsuarioRls } from "./rls-peticion";
import { withRouteMeta, type RouteValidationMeta } from "./route-meta";
import { buscarCamposDesconocidos, claveParecida } from "./validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- frontera de varianza: cada operación trae sus propios esquemas
export type OperacionCualquiera = OperacionDeKon<any, any, any>;

/** Lo que se le pasa a `defineKonSdk`: un KonDefinition sin `createRouter`. */
export type DefinicionDeKonSdk = Omit<KonDefinition, "createRouter" | "operaciones" | "sdk"> & {
  operaciones: OperacionCualquiera[] | ((ctx: KonContext) => OperacionCualquiera[]);
  /**
   * Rutas que el kon aún no ha pasado al SDK (migración por partes). Se montan
   * DESPUÉS de las operaciones y salen en la lista de legado de la cobertura.
   */
  rutasLegadas?: (ctx: KonContext) => Hono;
};

// ── Un contexto que no hace nada (para LISTAR operaciones sin arrancar) ─────

/**
 * Un `KonContext` en el que todo es otro proxy: se puede desestructurar y
 * llamar sin efecto. Sirve para que el OpenAPI, la cobertura y los tests lean
 * las declaraciones de una fábrica `operaciones(ctx)` sin base ni anfitrión.
 * Los handlers NUNCA se ejecutan con él.
 */
export function ctxInerte(): KonContext {
  const manejador: ProxyHandler<() => void> = {
    get(_t, propiedad) {
      if (propiedad === "then") return undefined; // no es una promesa
      if (propiedad === Symbol.toPrimitive) return () => "[ctx inerte]";
      if (propiedad === Symbol.iterator) return undefined;
      return proxy;
    },
    apply() {
      return proxy;
    },
  };
  const proxy: unknown = new Proxy(() => undefined, manejador);
  return proxy as KonContext;
}

/** Las operaciones de una definición (con el contexto real o uno inerte). */
export function operacionesDe(
  def: Pick<KonDefinition, "operaciones">,
  ctx: KonContext = ctxInerte()
): OperacionCualquiera[] {
  const fuente = def.operaciones;
  if (!fuente) return [];
  return typeof fuente === "function" ? fuente(ctx) : fuente;
}

// ── Permiso ─────────────────────────────────────────────────────────────────

function usuarioDe(c: Context): UsuarioDeOperacion | null {
  return ((c.get as (k: string) => unknown)("user") as UsuarioDeOperacion | undefined) ?? null;
}

/**
 * ¿Concede la operación a este usuario? Unión de las vías de `permiso`
 * (ver `PermisoDeOperacion` en shared). Sin `permiso`, sí.
 */
export async function concedeOperacion(
  konId: string,
  op: OperacionCualquiera,
  usuario: UsuarioDeOperacion | null,
  opciones: { recurso?: unknown; accion?: string; entrada?: EntradaValidada } = {}
): Promise<boolean> {
  const permiso = op.permiso;
  const scopes = Array.isArray(usuario?.scopes) ? usuario.scopes : undefined;
  // Una denegación del agente gana a todo: scopes, roles y política.
  if (scopes && denegacionDeOperacion(scopes, konId, op, opciones.entrada, opciones.recurso)) {
    return false;
  }
  if (!permiso) return true;
  if (scopes && concedePorScopes(scopes, konId, op, opciones.entrada, opciones.recurso).concedido) {
    return true;
  }
  if (permiso.roles && typeof usuario?.role === "string" && permiso.roles.includes(usuario.role)) {
    return true;
  }
  if (permiso.politica) {
    return can(
      usuario as AuthzUser | null,
      opciones.accion ?? permiso.politica.accion,
      opciones.recurso ?? {},
      permiso.politica.recurso
    );
  }
  return false;
}

/**
 * Denegación con la forma de siempre (`error` es TEXTO: el panel, las webs e
 * Inti lo leen así); el middleware de problem+json le añade `code`, `hint`…
 */
class Denegado extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string
  ) {
    super(message);
  }
}

function denegado(c: Context, err: Denegado): Response {
  return c.json(
    { error: err.status === 401 ? "Unauthorized" : "Forbidden", message: err.message },
    err.status
  );
}

function motivoDeDenegacion(konId: string, op: OperacionCualquiera, accion?: string): string {
  const pol = op.permiso?.politica;
  return pol
    ? `No autorizado para '${accion ?? pol.accion}' sobre ${pol.recurso}`
    : `No autorizado para '${operationIdDe(konId, op.id)}'`;
}

// ── Validación ──────────────────────────────────────────────────────────────

function formatIssues(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "_";
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

type Parte = "param" | "query" | "json" | "form";

function validarParte(esquema: ZodTypeAny, crudo: unknown, parte: Parte, c?: Context): unknown {
  const r = esquema.safeParse(crudo);
  const estricto = parte === "json" || parte === "form";
  const { desconocidos, ignorados } = estricto
    ? buscarCamposDesconocidos(esquema, crudo)
    : { desconocidos: [], ignorados: [] };
  // Los de servidor (`id`, `createdAt`…) se ignoran y se dice: un cliente los
  // devuelve al hacer GET → PATCH (igual que `validateRequest`).
  if (ignorados.length > 0) c?.header("X-Kitsuden-Ignored-Fields", ignorados.join(", "));
  if (r.success && desconocidos.length === 0) return r.data;

  const fields = r.success ? {} : formatIssues(r.error);
  for (const d of desconocidos) {
    const clave = d.path ? `${d.path}.${d.key}` : d.key;
    const sugerencia = d.didYouMean ?? claveParecida(d.key, d.validKeys);
    (fields[clave] ??= []).push(
      `Campo desconocido «${clave}».${sugerencia ? ` ¿Quisiste decir «${sugerencia}»?` : ""} Campos válidos: ${
        d.validKeys.join(", ") || "(ninguno)"
      }.`
    );
  }
  throw AppError.validation(
    r.success ? "Campos desconocidos en la petición" : "Validación fallida",
    {
      target: parte,
      fields,
      ...(desconocidos.length > 0
        ? {
            unknownKeys: desconocidos,
            hint:
              "Kitsuden rechaza los campos que no conoce en vez de ignorarlos: " +
              "un campo mal nombrado se perdería sin avisar.",
          }
        : {}),
    }
  );
}

async function leerCuerpo(c: Context, formato: "json" | "multipart"): Promise<unknown> {
  if (formato === "multipart") return c.req.parseBody({ all: true });
  // En texto y no con `json()`: un cuerpo vacío es `undefined` (el esquema
  // decide si es opcional), no un error. Hono guarda el texto: el handler que
  // vuelva a pedir `c.req.json()` recibe el mismo cuerpo.
  const texto = await c.req.text();
  if (!texto.trim()) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    throw AppError.badRequest("Cuerpo JSON inválido");
  }
}

/**
 * Dónde hay un carácter nulo (U+0000), o `null`. Postgres no lo guarda ni en
 * `text` (22021) ni en `jsonb` (22P05, también en las CLAVES): sin esto, una
 * entrada así llegaba a la consulta y salía como 500 (lo encontró
 * Schemathesis, 2026-10-26). Se mira lo crudo, antes del esquema, para que lo
 * cubran también las operaciones con `validaElHandler`.
 */
export function caminoConCaracterNulo(valor: unknown, camino = "", profundidad = 0): string | null {
  if (typeof valor === "string") return valor.includes("\u0000") ? camino || "_" : null;
  if (!valor || typeof valor !== "object" || profundidad > 64) return null;
  for (const [clave, hijo] of Object.entries(valor as Record<string, unknown>)) {
    const aqui = camino ? `${camino}.${clave}` : clave;
    if (clave.includes("\u0000")) return aqui;
    const dentro = caminoConCaracterNulo(hijo, aqui, profundidad + 1);
    if (dentro) return dentro;
  }
  return null;
}

function rechazarCaracterNulo(crudo: unknown, parte: Parte): void {
  const camino = caminoConCaracterNulo(crudo);
  if (!camino) return;
  throw AppError.validation("Validación fallida", {
    target: parte,
    fields: { [camino]: ["El texto no puede contener el carácter nulo (U+0000)."] },
  });
}

async function validarEntrada(c: Context, op: OperacionCualquiera): Promise<EntradaValidada> {
  const e = op.entrada;
  const entrada: EntradaValidada = { params: undefined, query: undefined, cuerpo: undefined };
  if (!e) return entrada;
  rechazarCaracterNulo(c.req.param(), "param");
  rechazarCaracterNulo(c.req.queries(), "query");
  if (e.params) entrada.params = validarParte(e.params, c.req.param(), "param");
  if (e.query) entrada.query = validarParte(e.query, c.req.query(), "query");
  if (e.cuerpo) {
    const formato = e.formato ?? "json";
    const crudo = await leerCuerpo(c, formato);
    if (formato === "json") rechazarCaracterNulo(crudo, "json");
    // `validaElHandler`: contrato heredado (400 propio); el SDK solo lo publica.
    entrada.cuerpo = e.validaElHandler
      ? crudo
      : validarParte(e.cuerpo, crudo, formato === "json" ? "json" : "form", c);
  }
  return entrada;
}

function metadatosDeValidacion(op: OperacionCualquiera): RouteValidationMeta[] {
  const lista: RouteValidationMeta[] = [];
  if (op.entrada?.params) lista.push({ target: "param", schema: op.entrada.params });
  if (op.entrada?.query) lista.push({ target: "query", schema: op.entrada.query });
  if (op.entrada?.cuerpo) {
    lista.push({
      target: op.entrada.formato === "multipart" ? "form" : "json",
      schema: op.entrada.cuerpo,
    });
  }
  return lista;
}

// ── El router ───────────────────────────────────────────────────────────────

/** Ejecuta una operación sobre la petición en curso (lo que monta cada ruta). */
async function ejecutar(
  c: Context,
  konId: string,
  op: OperacionCualquiera,
  ctx: KonContext
): Promise<Response> {
  const usuario = usuarioDe(c);
  try {
    // Denegada para esta clave: ni siquiera las públicas (la denegación es de
    // la CLAVE; sin ella, lo público sigue siendo público).
    const denegada = Array.isArray(usuario?.scopes)
      ? denegacionDeOperacion(usuario.scopes, konId, op)
      : null;
    if (denegada) {
      throw new Denegado(403, `${motivoDeDenegacion(konId, op)} (denied by '${denegada}')`);
    }
    if (op.permiso && !op.permiso.politica?.enHandler) {
      if (!(await concedeOperacion(konId, op, usuario))) {
        throw new Denegado(
          usuario ? 403 : 401,
          usuario ? motivoDeDenegacion(konId, op) : "Session required"
        );
      }
    }

    const entrada = await validarEntrada(c, op);

    const h: ContextoDeOperacion = {
      c,
      ctx,
      usuario,
      konId,
      operacion: op,
      puede: (recurso, accion) =>
        concedeOperacion(konId, op, usuario, { recurso, accion, entrada }),
      autorizar: async (recurso, accion) => {
        if (await concedeOperacion(konId, op, usuario, { recurso, accion, entrada })) return;
        throw new Denegado(
          usuario ? 403 : 401,
          usuario ? motivoDeDenegacion(konId, op, accion) : "Session required"
        );
      },
    };

    const resultado = await op.manejar(entrada as never, h);
    if (resultado instanceof Response) return resultado;
    // Un flujo (kitsuden2.md C5): cada `yield` es un evento SSE, cada paso en
    // su transacción RLS corta con quien pregunta (flujos.ts).
    if (op.salida.flujo) {
      return respuestaDeFlujo(c, resultado, {
        db: (ctx.db?.instance ?? null) as ConexionTransaccional | null,
        usuario: usuario as UsuarioRls | null,
        esquema: op.salida.esquema,
        donde: `${konId}/${op.id}`,
        alFallar: (err) => ctx.logger?.error?.(`[flujo] ${konId}/${op.id}: ${String((err as Error)?.message ?? err)}`),
      });
    }
    const estado = op.salida.estado ?? 200;
    if (estado === 204) return c.body(null, 204);
    // Una redirección necesita su `Location`: solo el handler la sabe.
    if (esRedireccion(estado))
      throw new Error(`${konId}/${op.id}: una redirección debe devolver la Response (c.redirect)`);
    return c.json(resultado as never, estado);
  } catch (err) {
    if (err instanceof Denegado) return denegado(c, err);
    if (err instanceof AppError) return respondError(c, err);
    throw err;
  }
}

/**
 * El router Hono de una lista de operaciones. Se registran en el orden
 * declarado: con caminos que se solapan (`/:id` y `/categories`) manda el
 * primero, igual que con rutas escritas a mano.
 */
export function routerDeOperaciones(
  konId: string,
  operaciones: readonly OperacionCualquiera[],
  ctx: KonContext
): Hono {
  comprobarOperaciones(konId, operaciones);
  const router = new Hono();
  for (const op of operaciones) {
    // Marca la petición como operación del SDK: el `requireAuth` del anfitrión
    // no le aplica la regla de «una clave no es una cuenta» (la operación es
    // un contrato declarado y decide su `permiso`; las que no declaran ninguno,
    // como el estado de una propuesta, están pensadas también para agentes).
    const antes: MiddlewareHandler[] = [
      async (c, next) => {
        (c.set as (k: string, v: unknown) => void)("operacionSdk", true);
        await next();
      },
    ];
    // Los del contexto del kon: el anfitrión decide cómo se autentica. Un
    // contexto de pruebas puede no traer `optionalAuth`: entonces se omite (el
    // anfitrión ya identifica a quien pregunta en cada petición).
    const autenticacion =
      op.acceso === "sesion"
        ? ctx.auth.requireAuth
        : op.acceso === "opcional"
          ? ctx.auth.optionalAuth
          : undefined;
    if (autenticacion) antes.push(autenticacion);
    else if (op.acceso === "sesion") {
      throw new Error(`${konId}/${op.id}: el contexto no trae auth.requireAuth`);
    }
    antes.push(...(op.antes ?? []));

    const manejador = withRouteMeta(async (c: Context) => ejecutar(c, konId, op, ctx), {
      summary: op.resumen,
      description: op.descripcion,
      operationId: operationIdDe(konId, op.id),
      tags: op.etiquetas,
      validation: metadatosDeValidacion(op),
      operacion: { konId, declaracion: op },
    });
    // `on` con una lista de handlers: las sobrecargas de Hono no aceptan el
    // spread, así que se llama con la firma general.
    (router.on as (metodo: string, ruta: string, ...h: MiddlewareHandler[]) => Hono)(
      op.metodo,
      op.ruta,
      ...antes,
      manejador as MiddlewareHandler
    );
  }
  return router;
}

/**
 * Declara un kon con el SDK. Devuelve un `KonDefinition` corriente (el
 * cargador lo monta como a cualquier kon moderno) con `operaciones` y `sdk`.
 */
export function defineKonSdk(def: DefinicionDeKonSdk): KonDefinition {
  const { rutasLegadas, ...resto } = def;
  return {
    ...resto,
    sdk: VERSION_SDK_DE_KONS,
    operaciones: def.operaciones,
    createRouter: (ctx: KonContext) => {
      const router = routerDeOperaciones(def.id, operacionesDe(def, ctx), ctx);
      if (rutasLegadas) router.route("/", rutasLegadas(ctx));
      return router;
    },
  };
}

// ── Lo montado (lo leen el MCP y la cobertura) ──────────────────────────────

export interface KonDeOperacionesMontado {
  konId: string;
  /** Sin barra final: `/api/blog`. */
  mountPath: string;
  operaciones: OperacionCualquiera[];
  router: Hono;
}

const montados = new Map<string, KonDeOperacionesMontado>();
let version = 0;

/** Lo llama el cargador de kons tras montar un kon del SDK. */
export function registrarOperacionesMontadas(
  konId: string,
  mountPath: string,
  operaciones: OperacionCualquiera[],
  router: Hono
): void {
  montados.set(konId, { konId, mountPath: mountPath.replace(/\/+$/, ""), operaciones, router });
  version++;
}

export function operacionesMontadas(): KonDeOperacionesMontado[] {
  return [...montados.values()];
}

/** Cambia cada vez que se monta un kon del SDK (para reconstruir lo derivado). */
export function versionDeOperacionesMontadas(): number {
  return version;
}

// ── De una petición a su operación (lo usan las puertas y las cuotas) ──────

export interface OperacionDeRuta {
  konId: string;
  mountPath: string;
  op: OperacionCualquiera;
}

let indiceDeRutas: {
  version: number;
  lista: { metodo: string; patron: RegExp; entrada: OperacionDeRuta }[];
} | null = null;

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patronDeRuta(mountPath: string, ruta: string): RegExp {
  const completa = ruta === "/" ? mountPath : `${mountPath}${ruta}`;
  const cuerpo = completa
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "[^/]+" : escaparRegex(seg)))
    .join("/");
  return new RegExp(`^${cuerpo}/?$`);
}

/**
 * ¿Qué operación del SDK atiende `METODO camino`? La primera que casa, en el
 * orden en que se montaron y declararon (el mismo criterio que Hono). `null`
 * si la ruta no es de una operación (rutas legadas, núcleo…).
 */
export function operacionDeRuta(metodo: string, camino: string): OperacionDeRuta | null {
  const version = versionDeOperacionesMontadas();
  if (indiceDeRutas?.version !== version) {
    const lista: { metodo: string; patron: RegExp; entrada: OperacionDeRuta }[] = [];
    for (const { konId, mountPath, operaciones } of operacionesMontadas()) {
      for (const op of operaciones) {
        lista.push({
          metodo: op.metodo,
          patron: patronDeRuta(mountPath, op.ruta),
          entrada: { konId, mountPath, op },
        });
      }
    }
    indiceDeRutas = { version, lista };
  }
  const m = metodo.toUpperCase() === "HEAD" ? "GET" : metodo.toUpperCase();
  const limpio = camino.replace(/\/{2,}/g, "/");
  for (const r of indiceDeRutas.lista) {
    if (r.metodo === m && r.patron.test(limpio)) return r.entrada;
  }
  return null;
}

/** Para pruebas. */
export function olvidarOperacionesMontadas(): void {
  montados.clear();
  version++;
}
