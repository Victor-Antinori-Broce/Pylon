/**
 * SDK de kons — el CONTRATO de una operación (versión 1)
 * ============================================================================
 *
 * Un kon declara sus operaciones UNA vez y el núcleo genera a partir de esa
 * declaración:
 *
 *   - la ruta REST (con validación 422 problem+json, autorización por scope y
 *     por la política del kon, idempotencia y RLS por petición heredadas);
 *   - la operación OpenAPI 3.1 con esquemas reales (zod → JSON Schema);
 *   - la herramienta MCP con los mismos esquemas, que hereda los scopes y la
 *     lista `allowedTools` de la sesión del agente.
 *
 * Aquí vive solo lo que es CONTRATO y es puro (tipos, nombres, la resolución
 * de permisos): lo comparten el motor (que monta las rutas), la API (OpenAPI y
 * MCP), el panel (fase E: qué concede cada scope) y los tests de cobertura. El
 * motor de ejecución vive en `@kitsuden/engine` (`defineKonSdk`).
 *
 * La versión del contrato se publica en `GET /api/version` como
 * `contratos["kon-sdk"]` (ver `contratos.ts`). Añadir un campo OPCIONAL a la
 * declaración es compatible; renombrar uno, cambiar un valor por defecto que
 * cambie el comportamiento (p. ej. `sensible`) o el formato del nombre de una
 * herramienta o de un scope fino NO lo es.
 *
 * Guía pública: docs/kons/README.md.
 */

import type { Context, MiddlewareHandler } from "hono";
import { z, type ZodTypeAny } from "zod";

import { isKitsudenErrorCode, type KitsudenErrorCode } from "./errores";
import type { KonContext } from "./kon-api";
import { denegacionQueCubre, partirScopes, scopeCubre } from "./permisos-de-agente";

export { scopeCubre };

/** Versión del contrato del SDK de kons (entera: sube solo si se rompe algo). */
export const VERSION_SDK_DE_KONS = 1;

export type MetodoDeOperacion = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Quién puede LLEGAR a la operación, antes de la política:
 *
 *   publico   sin credencial (la petición puede traerla y se usa si viene).
 *   opcional  igual que `publico`, pero la operación mira quién es (borradores
 *             para el equipo, por ejemplo). Se documenta así en OpenAPI.
 *   sesion    hace falta una cuenta o un agente verificado: sin ella, 401.
 */
export type AccesoDeOperacion = "publico" | "opcional" | "sesion";

/**
 * Qué hace falta, además de llegar, para ejecutar la operación. Es una UNIÓN:
 * basta con que se cumpla UNA de las vías.
 *
 *   1. El scope fino de la operación: `kon:<kon>:<operación>` (y sus comodines
 *      `kon:<kon>:*`, `kon:*`), o el amplio del kon `<kon>:*`. Solo los traen
 *      los agentes.
 *   2. Uno de `scopes` (amplios, p. ej. `contenido:editar`), con las reglas de
 *      comodín de siempre (`recurso:*`, `*:accion`).
 *   3. `admin` / `admin:*`.
 *   4. La política del kon (`definePolicy`): `can(usuario, accion, recurso,
 *      tipo)`, que además concede el scope `<tipo>:<accion>`.
 *   5. `roles`: el rol de la cuenta está en la lista.
 *
 * Un scope fino nunca QUITA lo que concede uno amplio (todo es unión). Lo
 * único que quita es una DENEGACIÓN explícita del agente (`!kon:<kon>:<op>`,
 * `!<kon>:*`, `!datasets:<slug>:<acción>`…), que gana a todo lo anterior,
 * `admin` y roles incluidos (fase E, docs/agents/permissions.md).
 */
export interface PermisoDeOperacion {
  /** Scopes amplios que también conceden la operación. */
  scopes?: string[];
  /** Política del kon. */
  politica?: {
    recurso: string;
    accion: string;
    /**
     * `true`: la política necesita el recurso (el dataset, la entrada…) y la
     * comprueba el handler con `h.autorizar(recurso)` tras cargarlo. Sin esto,
     * se comprueba ANTES de validar y ejecutar, con un recurso vacío.
     */
    enHandler?: boolean;
  };
  /** Roles de cuenta que la conceden (p. ej. `["admin"]`). */
  roles?: string[];
  /**
   * El scope de RECURSO que también concede la operación (y que una
   * denegación puede quitar): `datasets:<slug>:write`. Se calcula con la
   * entrada y, en las operaciones `politica.enHandler`, con el recurso que el
   * handler pasa a `h.autorizar(recurso)`. Devolver `null` = esta petición no
   * tiene scope de recurso.
   */
  scopeDeRecurso?: (entrada: EntradaValidada, recurso?: unknown) => string | null;
}

/** Cómo sale la respuesta correcta. */
export interface SalidaDeOperacion {
  /**
   * Estado HTTP de éxito (200 por defecto; 201 al crear, 204 sin cuerpo). Una
   * redirección (301, 302, 303, 307, 308) no lleva cuerpo ni esquema: el
   * handler devuelve la `Response` con su `Location` (`c.redirect`).
   */
  estado?: EstadoDeExito | EstadoDeRedireccion;
  /** Esquema del cuerpo (para JSON). Obligatorio salvo con `tipo` binario, 204 o 3xx. */
  esquema?: ZodTypeAny;
  /** `application/json` por defecto; `image/*`, `text/html`… para lo binario. */
  tipo?: string;
  descripcion?: string;
  /**
   * Otros estados de éxito con el MISMO cuerpo, que el handler devuelve como
   * `Response` hecha: un upsert que responde 201 al crear y 200 al reescribir.
   * Solo se publican (OpenAPI); sin declararlos, Schemathesis da por roto el
   * estado que no figura (kon-tierlist, 2026-10-26). Puede llevar también
   * redirecciones: la lectura que manda un slug viejo al nuevo con 308.
   */
  otrosEstados?: (200 | 201 | 202 | EstadoDeRedireccion)[];
  /**
   * Un FLUJO (kitsuden2.md C5): `manejar` devuelve un `AsyncIterable` (lo
   * normal, un `async function*`) y cada valor que hace `yield` sale como un
   * evento Server-Sent Events ESTÁNDAR (`text/event-stream`), validado contra
   * `esquema`, que aquí es el de UN evento. Al acabar, un evento `end`; si el
   * generador lanza, un evento `error` con el problem+json. En el SDK la
   * operación devuelve un `AsyncIterable` tipado; por MCP, la lista de eventos.
   *
   * Cada paso del generador corre en su propia transacción RLS corta, con
   * quien pregunta: el flujo no retiene una conexión mientras espera.
   */
  flujo?: boolean;
}

export type EstadoDeExito = 200 | 201 | 202 | 204;
/** Redirecciones que una operación puede declarar (no son errores: van sin código del catálogo). */
export type EstadoDeRedireccion = 301 | 302 | 303 | 307 | 308;
export const ESTADOS_DE_REDIRECCION: readonly EstadoDeRedireccion[] = [301, 302, 303, 307, 308];
export function esRedireccion(estado: number | undefined): estado is EstadoDeRedireccion {
  return estado !== undefined && (ESTADOS_DE_REDIRECCION as readonly number[]).includes(estado);
}

/** Lo que entra, por partes. Cada parte es un esquema zod. */
export interface EntradaDeOperacion {
  /** Parámetros del camino (`:id`). Todos texto; usa `z.string()`/`z.coerce`. */
  params?: ZodTypeAny;
  /** Query string. Llega como texto: usa `z.coerce.number()` y similares. */
  query?: ZodTypeAny;
  /** Cuerpo. JSON por defecto. */
  cuerpo?: ZodTypeAny;
  /** `multipart`: formulario con ficheros (no se expone por MCP). */
  formato?: "json" | "multipart";
  /**
   * Compatibilidad: el CUERPO lo valida el handler con este mismo esquema y
   * responde su 400 de siempre (`{ error: "Validation failed", issues }`). El
   * SDK lo publica (OpenAPI, MCP) pero no lo valida, y el handler recibe el
   * cuerpo tal cual llegó. Solo para kons que ya tenían ese contrato publicado;
   * uno nuevo deja validar al SDK (422 problem+json).
   */
  validaElHandler?: boolean;
}

/** Exposición por MCP: sí por defecto; para excluir hay que decir por qué. */
export type McpDeOperacion =
  | true
  | { excluir: string }
  | {
      /** Nombre de la herramienta si el generado no sirve (raro). */
      nombre?: string;
    };

/**
 * Argumentos de una herramienta MCP generada: los parámetros del camino y de
 * la query van PLANOS, el cuerpo entero bajo `body` y la clave de idempotencia
 * en `idempotency_key`. Son contrato (un agente los guarda).
 */
export const ARGUMENTO_CUERPO_MCP = "body";
export const ARGUMENTO_IDEMPOTENCIA_MCP = "idempotency_key";

/**
 * Guía de uso para agentes: lo que el esquema NO dice. El esquema dice qué
 * forma tiene la entrada; esto dice cuándo usar la operación, de dónde salen
 * los ids que pide y cómo salir de los errores típicos.
 *
 * Existe porque el harness del agente (Claude, Cursor, el que sea) solo ve lo
 * que el servidor le cuenta: una guía buena aquí mejora a TODOS los harnesses
 * que se conecten, sin tocar ninguno. Se publica en la descripción de la
 * herramienta MCP (lo corto), como recurso MCP `kitsuden://guia/<herramienta>`
 * (todo) y en OpenAPI como `x-kitsuden-guia`.
 *
 * Los ejemplos se VALIDAN contra los esquemas al declarar la operación: un
 * ejemplo que no valida enseña a fallar.
 */
export interface GuiaDeOperacion {
  /** Cuándo usarla, y cuándo NO (qué otra operación toca entonces). */
  cuandoUsar?: string;
  /** Lo que hay que tener antes: de qué operación sale cada id que pide. */
  antes?: string[];
  /**
   * Argumentos de ejemplo, con la forma de la herramienta MCP: parámetros del
   * camino y de la query planos, el cuerpo bajo `body`.
   */
  ejemplos?: { titulo: string; argumentos: Record<string, unknown> }[];
  /** Errores típicos y cómo salir de ellos. */
  trampas?: { si: string; entonces: string }[];
}

/** La entrada ya validada que recibe el handler. */
export interface EntradaValidada<P = unknown, Q = unknown, B = unknown> {
  params: P;
  query: Q;
  cuerpo: B;
}

/** Usuario tal como lo ven las operaciones (cuenta o agente). */
export interface UsuarioDeOperacion {
  id?: string;
  role?: string;
  scopes?: string[];
  [clave: string]: unknown;
}

/** Lo que recibe el handler además de la entrada. */
export interface ContextoDeOperacion {
  /**
   * Contexto Hono de la petición (cabeceras, `c.json`, `c.body`…). Los
   * parámetros validados (y tipados) están en `entrada.params`.
   */
  c: Context;
  /** El contexto del kon (db de la petición, caché, eventos, almacenamiento…). */
  ctx: KonContext;
  /** Quién pregunta (`null` si nadie). */
  usuario: UsuarioDeOperacion | null;
  /**
   * Comprueba el permiso de la operación con el RECURSO ya cargado (para
   * `politica.enHandler`). Lanza 401/403 (AppError) si no se concede.
   */
  autorizar(recurso?: unknown, accion?: string): Promise<void>;
  /** Igual que `autorizar` pero devuelve el resultado en vez de lanzar. */
  puede(recurso?: unknown, accion?: string): Promise<boolean>;
  konId: string;
  operacion: OperacionDeKon;
}

/** Respuesta del handler: los datos (se sirven con `salida.estado`) o una Response hecha. */
export type ResultadoDeOperacion = unknown;

/**
 * La declaración de una operación.
 *
 * Genéricos: los esquemas de entrada, para que el handler reciba los tipos
 * inferidos sin anotarlos a mano.
 */
export interface OperacionDeKon<
  P extends ZodTypeAny = ZodTypeAny,
  Q extends ZodTypeAny = ZodTypeAny,
  B extends ZodTypeAny = ZodTypeAny,
> {
  /** Estable, en kebab-case, único en el kon: `crear-pagina`. Es contrato. */
  id: string;
  metodo: MetodoDeOperacion;
  /** Relativa al montaje del kon, con `:param`: `/pages/:id`. */
  ruta: string;
  /** Una línea para humanos (OpenAPI `summary`). */
  resumen: string;
  /** Para humanos y agentes: qué hace, cuándo usarla, qué devuelve. */
  descripcion: string;
  etiquetas?: string[];
  entrada?: {
    params?: P;
    query?: Q;
    cuerpo?: B;
    formato?: EntradaDeOperacion["formato"];
    validaElHandler?: boolean;
  };
  salida: SalidaDeOperacion;
  acceso: AccesoDeOperacion;
  /** Sin `permiso`, basta con `acceso`. */
  permiso?: PermisoDeOperacion;
  /**
   * Fase F: una operación sensible, pedida por un agente, podrá quedar como
   * PROPUESTA a la espera de un humano. Por defecto: `true` en DELETE,
   * `false` en lo demás. Hoy solo se publica (OpenAPI y MCP).
   */
  sensible?: boolean;
  /**
   * Un POST que no cambia nada (validar, previsualizar, comparar, calcular):
   * la retención SELECTIVA de los agentes en `propose` no lo retiene, y MCP lo
   * anuncia con `readOnlyHint`. Solo vale en POST (un GET ya lo es; PUT, PATCH
   * y DELETE escriben por definición). Por defecto: `false`.
   */
  soloLectura?: boolean;
  /**
   * ¿Repetir la misma petición deja el mismo estado? Por defecto, la semántica
   * HTTP: GET/PUT/DELETE sí, POST/PATCH no. Las no idempotentes aceptan
   * `Idempotency-Key` (REST) / `idempotency_key` (MCP).
   */
  idempotente?: boolean;
  /**
   * Errores que la operación PUEDE devolver además de los automáticos
   * (validación, autenticación, permiso, interno). Códigos del catálogo.
   */
  errores?: KitsudenErrorCode[];
  /** Exposición por MCP (por defecto, sí). */
  mcp?: McpDeOperacion;
  /** Guía de uso para agentes (ver `GuiaDeOperacion`). Opcional. */
  guia?: GuiaDeOperacion;
  /**
   * Lo que cuesta del presupuesto diario del agente (`budget_units_per_day`).
   * 1 por defecto; una operación cara (exportar, reindexar, generar) declara
   * más. Entero ≥ 0.
   */
  coste?: number;
  /**
   * Middleware que corre tras la autenticación y ANTES del permiso, la
   * validación y el handler (p. ej. `bodyLimit` en una subida: tiene que
   * cortar antes de que se lea el cuerpo). Escotilla: lo normal es no usarla.
   */
  antes?: MiddlewareHandler[];
  manejar(
    entrada: EntradaValidada<
      P extends ZodTypeAny ? z.output<P> : undefined,
      Q extends ZodTypeAny ? z.output<Q> : undefined,
      B extends ZodTypeAny ? z.output<B> : undefined
    >,
    h: ContextoDeOperacion
  ): Promise<ResultadoDeOperacion> | ResultadoDeOperacion;
}

// ── Valores por defecto (son contrato) ──────────────────────────────────────

export function esSensible(op: Pick<OperacionDeKon, "metodo" | "sensible">): boolean {
  return op.sensible ?? op.metodo === "DELETE";
}

/** ¿No cambia nada? Los GET, y los POST que lo declaran. */
export function esSoloLectura(op: Pick<OperacionDeKon, "metodo" | "soloLectura">): boolean {
  return op.metodo === "GET" || (op.metodo === "POST" && op.soloLectura === true);
}

/** Unidades de presupuesto que consume (1 por defecto). */
export function costeDeOperacion(op: Pick<OperacionDeKon, "coste"> | null | undefined): number {
  const c = op?.coste;
  return typeof c === "number" && Number.isInteger(c) && c >= 0 ? c : 1;
}

export function esIdempotente(op: Pick<OperacionDeKon, "metodo" | "idempotente">): boolean {
  return op.idempotente ?? (op.metodo === "GET" || op.metodo === "PUT" || op.metodo === "DELETE");
}

/** Motivo de exclusión de MCP, o `null` si se expone. */
export function exclusionMcp(op: Pick<OperacionDeKon, "mcp" | "entrada">): string | null {
  if (op.mcp && typeof op.mcp === "object" && "excluir" in op.mcp) return op.mcp.excluir;
  return null;
}

/** Los errores que puede devolver, automáticos incluidos, sin repetir. */
export function erroresDeOperacion(
  op: Pick<OperacionDeKon, "acceso" | "permiso" | "entrada" | "errores"> & {
    metodo?: MetodoDeOperacion;
  }
): KitsudenErrorCode[] {
  const lista: KitsudenErrorCode[] = [];
  if (op.entrada?.params || op.entrada?.query || op.entrada?.cuerpo) {
    lista.push("KITSUDEN_E_VALIDATION");
  }
  // 400: un cuerpo que no es JSON, o un valor que Postgres no admite (uuid mal
  // formado, número fuera de rango) en params, query o cuerpo — `toErrorEnvelope`
  // lo traduce del SQLSTATE (Schemathesis, 2026-10-26).
  if (op.entrada?.params || op.entrada?.query || op.entrada?.cuerpo)
    lista.push("KITSUDEN_E_BAD_REQUEST");
  if (op.acceso === "sesion" || op.permiso) lista.push("KITSUDEN_E_UNAUTHENTICATED");
  if (op.permiso) lista.push("KITSUDEN_E_FORBIDDEN");
  // Toda operación que no es GET anuncia `Idempotency-Key`; reutilizar una
  // clave con otro cuerpo responde 422 (middleware de idempotencia).
  if (op.metodo && op.metodo !== "GET") lista.push("KITSUDEN_E_IDEMPOTENCY_KEY_REUSED");
  lista.push(...(op.errores ?? []));
  // El limitador global (`/api/*`) responde 429 a cualquier operación: sin
  // declararlo, un agente no sabe que debe esperar `retry_after` y reintentar
  // (lo encontró Schemathesis, 2026-10-25).
  lista.push("KITSUDEN_E_RATE_LIMITED");
  lista.push("KITSUDEN_E_INTERNAL");
  return [...new Set(lista)];
}

// ── Nombres (son contrato: un agente guarda el nombre de su herramienta) ────

/** `kon-blog` → `blog`. */
export function nombreCortoDeKon(konId: string): string {
  return konId.replace(/^kon-/, "");
}

/** El scope fino de una operación: `kon:blog:crear-entrada`. */
export function scopeFinoDeOperacion(konId: string, operacionId: string): string {
  return `kon:${nombreCortoDeKon(konId)}:${operacionId}`;
}

/**
 * Nombre de la herramienta MCP: `blog__crear-entrada`. Solo `[a-z0-9_-]`, como
 * piden los clientes MCP, y como mucho 64 caracteres.
 */
export function nombreDeHerramienta(konId: string, op: Pick<OperacionDeKon, "id" | "mcp">): string {
  if (op.mcp && typeof op.mcp === "object" && "nombre" in op.mcp && op.mcp.nombre) {
    return op.mcp.nombre;
  }
  return `${nombreCortoDeKon(konId)}__${op.id}`.slice(0, 64);
}

/** El `operationId` de OpenAPI: `blog.crear-entrada`. */
export function operationIdDe(konId: string, operacionId: string): string {
  return `${nombreCortoDeKon(konId)}.${operacionId}`;
}

// ── Permisos: la resolución (preparada para la fase E) ─────────────────────

/**
 * Todos los scopes que, por sí solos, conceden la operación (lo que el panel
 * de la fase E enseñará como «esto lo conceden: …»). La política no está aquí:
 * se decide con el usuario y el recurso, no con una lista.
 */
export function scopesQueConceden(
  konId: string,
  op: Pick<OperacionDeKon, "id" | "permiso">
): string[] {
  const corto = nombreCortoDeKon(konId);
  const lista = [scopeFinoDeOperacion(konId, op.id), `${corto}:*`, ...(op.permiso?.scopes ?? [])];
  if (op.permiso?.politica) {
    lista.push(`${op.permiso.politica.recurso}:${op.permiso.politica.accion}`);
  }
  lista.push("admin");
  return [...new Set(lista)];
}

export interface ConcesionPorScope {
  concedido: boolean;
  /** El scope concedido que la abrió (para auditar). */
  por?: string;
  /** La denegación que la cerró, si fue una. */
  denegadoPor?: string;
}

/**
 * Lo que identifica a la operación ante una DENEGACIÓN: su scope fino, el
 * alias por kon (`blog:crear-entrada`, para que `!blog:*` también cierre) y
 * el scope de recurso si lo hay.
 */
export function identidadesDeOperacion(
  konId: string,
  op: Pick<OperacionDeKon, "id" | "permiso">,
  entrada?: EntradaValidada,
  recurso?: unknown
): string[] {
  const lista = [scopeFinoDeOperacion(konId, op.id), `${nombreCortoDeKon(konId)}:${op.id}`];
  const deRecurso = entrada ? op.permiso?.scopeDeRecurso?.(entrada, recurso) : null;
  if (deRecurso) lista.push(deRecurso);
  return lista;
}

/** La denegación del agente que cierra esta operación, o `null`. */
export function denegacionDeOperacion(
  concedidos: readonly string[] | undefined,
  konId: string,
  op: Pick<OperacionDeKon, "id" | "permiso">,
  entrada?: EntradaValidada,
  recurso?: unknown
): string | null {
  return denegacionQueCubre(concedidos, identidadesDeOperacion(konId, op, entrada, recurso));
}

/**
 * ¿Abren los scopes del agente esta operación? UNIÓN: basta uno.
 *
 *   · `admin`, `admin:*`
 *   · el fino `kon:<kon>:<op>` y sus comodines (`kon:<kon>:*`, `kon:*`)
 *   · el amplio del kon `<kon>:*`
 *   · los amplios declarados en `permiso.scopes` (con comodines)
 *   · el de recurso que devuelva `permiso.scopeDeRecurso(entrada, recurso)`
 *
 * …salvo que una DENEGACIÓN del agente cubra la operación (su fino, su alias
 * `<kon>:<op>` o su scope de recurso): entonces no, aunque traiga `admin`.
 *
 * El scope de la POLÍTICA (`<tipo>:<accion>`) lo concede `can()` en el motor,
 * no esto: así se evalúa una sola vez y con el recurso.
 */
export function concedePorScopes(
  concedidos: readonly string[] | undefined,
  konId: string,
  op: Pick<OperacionDeKon, "id" | "permiso">,
  entrada?: EntradaValidada,
  recurso?: unknown
): ConcesionPorScope {
  if (!concedidos || concedidos.length === 0) return { concedido: false };
  const denegadoPor = denegacionDeOperacion(concedidos, konId, op, entrada, recurso);
  if (denegadoPor) return { concedido: false, denegadoPor };
  const requeridos = [scopeFinoDeOperacion(konId, op.id), ...(op.permiso?.scopes ?? [])];
  const deRecurso = entrada && op.permiso?.scopeDeRecurso?.(entrada, recurso);
  if (deRecurso) requeridos.push(deRecurso);
  const { concesiones } = partirScopes(concedidos);
  for (const concedido of concesiones) {
    if (concedido === "admin" || concedido === "admin:*")
      return { concedido: true, por: concedido };
    // `crm:*` concede todo el kon CRM (el «amplio por kon»).
    if (concedido === `${nombreCortoDeKon(konId)}:*`) return { concedido: true, por: concedido };
    if (requeridos.some((r) => scopeCubre(concedido, r)))
      return { concedido: true, por: concedido };
  }
  return { concedido: false };
}

/** El scope (sin denegaciones) que abriría la operación, para enseñarlo. */
export function porQueSeConcede(
  concedidos: readonly string[] | undefined,
  konId: string,
  op: Pick<OperacionDeKon, "id" | "permiso">
): string | null {
  const r = concedePorScopes(concedidos, konId, op);
  return r.concedido ? (r.por ?? null) : null;
}

// ── Declarar ────────────────────────────────────────────────────────────────

const ID_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Declara una operación. Comprueba al definirla lo que luego sería un fallo
 * silencioso: id con forma, ruta relativa, errores del catálogo, exclusión de
 * MCP con motivo, salida JSON con esquema.
 */
export function defineOperacion<
  P extends ZodTypeAny = ZodTypeAny,
  Q extends ZodTypeAny = ZodTypeAny,
  B extends ZodTypeAny = ZodTypeAny,
>(op: OperacionDeKon<P, Q, B>): OperacionDeKon<P, Q, B> {
  const donde = `operación '${op.id}'`;
  if (!ID_VALIDO.test(op.id)) throw new Error(`${donde}: el id va en kebab-case ([a-z0-9-])`);
  if (!op.ruta.startsWith("/")) throw new Error(`${donde}: la ruta empieza por '/'`);
  if (!op.resumen?.trim() || !op.descripcion?.trim()) {
    throw new Error(`${donde}: hace falta resumen y descripción (los leen humanos y agentes)`);
  }
  for (const codigo of op.errores ?? []) {
    if (!isKitsudenErrorCode(codigo))
      throw new Error(`${donde}: '${codigo}' no está en el catálogo`);
  }
  const motivo = exclusionMcp(op);
  if (motivo !== null && !motivo.trim()) {
    throw new Error(`${donde}: excluir de MCP exige un motivo`);
  }
  if (op.coste !== undefined && !(Number.isInteger(op.coste) && op.coste >= 0)) {
    throw new Error(`${donde}: el coste es un entero ≥ 0`);
  }
  if (op.soloLectura !== undefined && op.metodo !== "POST") {
    throw new Error(
      `${donde}: soloLectura solo vale en POST (un GET ya lo es; ${op.metodo} escribe)`
    );
  }
  if (op.soloLectura && (op.sensible || op.entrada?.formato === "multipart")) {
    throw new Error(
      `${donde}: una operación soloLectura no puede ser sensible ni recibir ficheros`
    );
  }
  if (op.salida.flujo) {
    if (!op.salida.esquema) throw new Error(`${donde}: un flujo necesita el esquema de cada evento`);
    if ((op.salida.estado ?? 200) !== 200 || op.salida.otrosEstados?.length) {
      throw new Error(`${donde}: un flujo responde 200 (los eventos van dentro)`);
    }
    if (op.salida.tipo && op.salida.tipo !== "text/event-stream") {
      throw new Error(`${donde}: un flujo se sirve como text/event-stream`);
    }
    if (op.metodo !== "GET" && op.metodo !== "POST") {
      throw new Error(`${donde}: un flujo es GET o POST`);
    }
  }
  const tipo = op.salida.tipo ?? "application/json";
  const redirige = esRedireccion(op.salida.estado);
  if (redirige && op.salida.esquema) {
    throw new Error(`${donde}: una redirección no lleva cuerpo; quita salida.esquema`);
  }
  if (tipo.includes("json") && op.salida.estado !== 204 && !redirige && !op.salida.esquema) {
    throw new Error(`${donde}: una salida JSON necesita su esquema`);
  }
  for (const otro of op.salida.otrosEstados ?? []) {
    if (
      (![200, 201, 202].includes(otro) && !esRedireccion(otro)) ||
      otro === (op.salida.estado ?? 200)
    ) {
      throw new Error(
        `${donde}: otrosEstados lleva estados de éxito con cuerpo (200, 201, 202) o redirecciones (3xx) distintos de salida.estado`
      );
    }
    if (op.salida.estado === 204 && !esRedireccion(otro)) {
      throw new Error(`${donde}: otrosEstados comparten el cuerpo de salida; con 204 no lo hay`);
    }
  }
  if (op.entrada?.formato === "multipart" && motivo === null) {
    throw new Error(
      `${donde}: un cuerpo multipart no se puede pedir por MCP; exclúyela con motivo`
    );
  }
  comprobarGuia(op, donde);
  return op;
}

/** Los `:param` de una ruta, en orden. */
export function parametrosDeRuta(ruta: string): string[] {
  return [...ruta.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!);
}

function primerFallo(esquema: ZodTypeAny, valor: unknown): string | null {
  const r = esquema.safeParse(valor);
  if (r.success) return null;
  const i = r.error.issues[0];
  return i ? `${i.path.join(".") || "(raíz)"}: ${i.message}` : "no valida";
}

/**
 * La guía tiene que decir la verdad: textos no vacíos y cada ejemplo válido
 * contra los esquemas de la operación (camino, query y cuerpo por separado).
 */
function comprobarGuia(
  op: Pick<OperacionDeKon, "guia" | "ruta" | "entrada" | "metodo" | "idempotente">,
  donde: string
): void {
  const g = op.guia;
  if (!g) return;
  if (g.cuandoUsar !== undefined && !g.cuandoUsar.trim()) {
    throw new Error(`${donde}: guia.cuandoUsar vacío`);
  }
  for (const t of g.trampas ?? []) {
    if (!t.si.trim() || !t.entonces.trim())
      throw new Error(`${donde}: una trampa de la guía está vacía`);
  }
  const delCamino = parametrosDeRuta(op.ruta);
  for (const ej of g.ejemplos ?? []) {
    const de = `${donde}: ejemplo «${ej.titulo}»`;
    const params: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(ej.argumentos)) {
      if (clave === ARGUMENTO_CUERPO_MCP || clave === ARGUMENTO_IDEMPOTENCIA_MCP) continue;
      if (delCamino.includes(clave)) params[clave] = valor;
      else query[clave] = valor;
    }
    for (const p of delCamino) {
      if (params[p] === undefined) throw new Error(`${de}: falta '${p}' (parámetro del camino)`);
    }
    if (Object.keys(query).length > 0 && !op.entrada?.query) {
      throw new Error(
        `${de}: la operación no tiene query y el ejemplo trae ${Object.keys(query).join(", ")}`
      );
    }
    if (ARGUMENTO_CUERPO_MCP in ej.argumentos && !op.entrada?.cuerpo) {
      throw new Error(`${de}: la operación no tiene cuerpo`);
    }
    if (ARGUMENTO_IDEMPOTENCIA_MCP in ej.argumentos && esIdempotente(op)) {
      throw new Error(`${de}: la operación ya es idempotente; sobra ${ARGUMENTO_IDEMPOTENCIA_MCP}`);
    }
    const fallos = [
      op.entrada?.params ? primerFallo(op.entrada.params, params) : null,
      op.entrada?.query ? primerFallo(op.entrada.query, query) : null,
      op.entrada?.cuerpo && ARGUMENTO_CUERPO_MCP in ej.argumentos
        ? primerFallo(op.entrada.cuerpo, ej.argumentos[ARGUMENTO_CUERPO_MCP])
        : null,
    ].filter(Boolean);
    if (fallos.length > 0) throw new Error(`${de} no valida: ${fallos.join("; ")}`);
  }
}

/**
 * Lo corto de la guía, para la DESCRIPCIÓN de la herramienta MCP: es lo único
 * que todos los harnesses enseñan seguro al modelo. Los ejemplos y las
 * trampas van en el recurso (no inflan `tools/list`).
 */
export function guiaCorta(op: Pick<OperacionDeKon, "guia">): string | null {
  const g = op.guia;
  if (!g) return null;
  const partes = [
    g.cuandoUsar ? `When to use: ${g.cuandoUsar}` : null,
    g.antes?.length ? `Before: ${g.antes.join("; ")}` : null,
    g.ejemplos?.length || g.trampas?.length
      ? "Examples and common mistakes: read the guide resource."
      : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join("\n") : null;
}

/**
 * ¿Atiende `antes` todo lo que atendería `despues`? Hono resuelve por orden de
 * registro: `GET /:id` registrada antes que `GET /categories` se queda con
 * «categories» como id y la segunda no se ejecuta nunca, sin error.
 */
function ensombrece(
  antes: Pick<OperacionDeKon, "metodo" | "ruta">,
  despues: Pick<OperacionDeKon, "metodo" | "ruta">
): boolean {
  if (antes.metodo !== despues.metodo) return false;
  const a = antes.ruta.split("/").filter(Boolean);
  const b = despues.ruta.split("/").filter(Boolean);
  if (a.length !== b.length || antes.ruta === despues.ruta) return false;
  let masLaxa = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i]!.startsWith(":") && !b[i]!.startsWith(":")) {
      masLaxa = true;
      continue;
    }
    return false;
  }
  return masLaxa;
}

/**
 * Comprueba la lista de operaciones de un kon: ids y rutas sin repetir, y
 * ninguna ruta tapada por otra anterior (ver `ensombrece`). Lanza al montar el
 * kon, que es cuando todavía se puede arreglar.
 */
export function comprobarOperaciones(konId: string, ops: readonly OperacionDeKon[]): void {
  const ids = new Set<string>();
  const rutas = new Set<string>();
  ops.forEach((op, i) => {
    const tapa = ops.slice(0, i).find((anterior) => ensombrece(anterior, op));
    if (tapa) {
      throw new Error(
        `${konId}: ${op.metodo} ${op.ruta} es inalcanzable: ${tapa.ruta} se declaró antes. Declara primero lo literal.`
      );
    }
  });
  for (const op of ops) {
    if (ids.has(op.id)) throw new Error(`${konId}: operación '${op.id}' repetida`);
    ids.add(op.id);
    const clave = `${op.metodo} ${op.ruta.replace(/:[^/]+/g, ":p")}`;
    if (rutas.has(clave)) throw new Error(`${konId}: dos operaciones en ${op.metodo} ${op.ruta}`);
    rutas.add(clave);
  }
}

// ── Esquemas de ayuda ───────────────────────────────────────────────────────

/**
 * Una fecha en la ENTRADA: texto ISO 8601 (lo que manda JSON) o `Date`, y el
 * handler recibe siempre un `Date`. Existe porque un texto que llegaba tal
 * cual a una columna `timestamp` de Drizzle reventaba con
 * `value.toISOString is not a function` (PATCH del blog, 2026-10-23).
 */
export function esquemaFecha() {
  return z
    .union([
      z
        .string()
        .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Fecha no válida (ISO 8601)" }),
      z.date(),
    ])
    .transform((v) => (v instanceof Date ? v : new Date(v)));
}

/** Un `:id` uuid en los parámetros. */
export const esquemaUuid = () => z.guid();
