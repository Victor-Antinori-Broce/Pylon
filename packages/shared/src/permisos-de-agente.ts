/**
 * Permisos de agente — UNA sola lectura de los scopes (fase E)
 * ============================================================================
 *
 * Un agente lleva una lista de scopes. Hasta la fase E había tres copias de la
 * regla que los lee (la API, el motor y el SDK de kons) y una cuarta en las
 * herramientas MCP. Ahora todas llaman aquí.
 *
 * ── QUÉ PUEDE HABER EN LA LISTA ────────────────────────────────────────────
 *
 *   amplios   `admin`, `mcp:write`, `contenido:editar`, `crm:*`…  (los de antes)
 *   finos     `kon:blog:crear-entrada`        una operación del SDK de kons
 *             `datasets:clientes:read`        un dataset, una acción
 *   comodines `x:*`      todo lo que empieza por `x:` (uno o más segmentos)
 *             `*:y`      todo lo que acaba en `:y`
 *             `a:*:c`    un segmento cualquiera en medio (`datasets:*:read`)
 *   denegar   `!kon:crm:borrar-contacto`, `!datasets:clientes:*`
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 *   1. Lo concedido es la UNIÓN: basta con que un scope cubra lo pedido. Un
 *      scope fino nunca quita nada a uno amplio.
 *   2. Una denegación (`!patrón`) GANA a cualquier concesión, `admin`
 *      incluido. Es la única forma de quitar: «todo el CRM menos borrar».
 *   3. `admin` / `admin:*` lo cubren todo (salvo lo denegado).
 *
 * Los comodines solo AMPLÍAN dentro de lo que ya cubrían antes: `*:*`, `*` y
 * cualquier patrón hecho solo de comodines no cubren nada (antes tampoco).
 *
 * Guía pública: docs/agents/permissions.md.
 */

/** Prefijo de una denegación. */
export const PREFIJO_DENEGACION = "!";

export function esDenegacion(scope: string): boolean {
  return scope.startsWith(PREFIJO_DENEGACION);
}

/** Separa concesiones y denegaciones (estas, sin el `!`). */
export function partirScopes(scopes: readonly string[] | undefined): {
  concesiones: string[];
  denegaciones: string[];
} {
  const concesiones: string[] = [];
  const denegaciones: string[] = [];
  for (const s of scopes ?? []) {
    if (typeof s !== "string" || !s) continue;
    if (esDenegacion(s)) denegaciones.push(s.slice(PREFIJO_DENEGACION.length));
    else concesiones.push(s);
  }
  return { concesiones, denegaciones };
}

/**
 * ¿Cubre el PATRÓN el scope requerido? Sin el atajo de `admin` (eso es de
 * `scopeCubre`). Es lo que usan las denegaciones.
 *
 *   exacto                    `blog:read` cubre `blog:read`
 *   primer segmento `*`       sufijo: `*:read` cubre `x:read` y `x:y:read`
 *   último segmento `*`       prefijo: `crm:*` cubre `crm:a` y `crm:a:b`
 *   `*` en medio              un segmento: `datasets:*:read` cubre
 *                             `datasets:clientes:read`
 */
export function patronCubre(patron: string, requerido: string): boolean {
  if (!patron || !requerido) return false;
  if (patron === requerido) return true;
  const partes = patron.split(":");
  if (partes.length < 2 || partes.every((p) => p === "*")) return false;
  // Comodín al principio: la regla de siempre (sufijo literal).
  if (partes[0] === "*") return requerido.endsWith(patron.slice(1));
  const req = requerido.split(":");
  const ultimoEsComodin = partes[partes.length - 1] === "*";
  const fijos = ultimoEsComodin ? partes.slice(0, -1) : partes;
  if (ultimoEsComodin ? req.length <= fijos.length : req.length !== fijos.length) return false;
  for (let i = 0; i < fijos.length; i++) {
    if (fijos[i] === "*") {
      if (!req[i]) return false;
      continue;
    }
    if (fijos[i] !== req[i]) return false;
  }
  return true;
}

/** ¿Concede `concedido` el scope `requerido`? `admin` lo cubre todo. Sin denegaciones. */
export function scopeCubre(concedido: string, requerido: string): boolean {
  if (esDenegacion(concedido)) return false;
  if (concedido === "admin" || concedido === "admin:*") return true;
  return patronCubre(concedido, requerido);
}

/** La denegación de la lista que cubre alguno de `requeridos`, o `null`. */
export function denegacionQueCubre(
  scopes: readonly string[] | undefined,
  requeridos: readonly (string | null | undefined)[]
): string | null {
  const { denegaciones } = partirScopes(scopes);
  if (denegaciones.length === 0) return null;
  for (const d of denegaciones) {
    for (const r of requeridos) {
      if (r && patronCubre(d, r)) return `${PREFIJO_DENEGACION}${d}`;
    }
  }
  return null;
}

/** El scope concedido que cubre `requerido` (sin mirar denegaciones), o `null`. */
export function concesionQueCubre(scopes: readonly string[] | undefined, requerido: string): string | null {
  for (const s of scopes ?? []) {
    if (typeof s === "string" && scopeCubre(s, requerido)) return s;
  }
  return null;
}

/**
 * LA pregunta: ¿pueden estos scopes `requerido`? Unión de concesiones, y una
 * denegación que lo cubra gana siempre.
 */
export function concedeScope(scopes: readonly string[] | undefined, requerido: string): boolean {
  if (!scopes || scopes.length === 0) return false;
  if (denegacionQueCubre(scopes, [requerido])) return false;
  return concesionQueCubre(scopes, requerido) !== null;
}

// ── Validar lo que se guarda ────────────────────────────────────────────────

const SEGMENTO = /^(?:\*|[a-z0-9_][a-z0-9_.-]*)$/;

/** Máximo de scopes por agente: un agente con 500 permisos no lo revisa nadie. */
export const MAX_SCOPES_POR_AGENTE = 200;

/**
 * `null` si el scope se puede guardar; si no, el motivo (en inglés: lo lee
 * quien llama a la API). Minúsculas, dígitos, `_`, `-`, `.`, `*`; segmentos
 * con `:`; como mucho 5 segmentos y 200 caracteres.
 */
export function motivoDeScopeInvalido(scope: unknown): string | null {
  if (typeof scope !== "string" || !scope.trim()) return "must be a non-empty string";
  if (scope.length > 200) return "is longer than 200 characters";
  const deny = esDenegacion(scope);
  const cuerpo = deny ? scope.slice(1) : scope;
  const partes = cuerpo.split(":");
  if (partes.length > 5) return "has more than 5 segments";
  if (partes.some((p) => !SEGMENTO.test(p))) {
    return "segments may only contain a-z, 0-9, '_', '-', '.' or be '*'";
  }
  if (partes.every((p) => p === "*")) return "a pattern made only of '*' grants nothing";
  if (deny && (cuerpo === "admin" || cuerpo === "admin:*")) {
    return "'!admin' is not allowed: remove 'admin' instead";
  }
  if (deny && partes.length < 2) return "a deny needs at least two segments (e.g. '!kon:crm:*')";
  return null;
}

/** Normaliza y valida una lista: sin repetidos, en orden. Lanza con el primer motivo. */
export function normalizarScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) throw new Error("scopes must be an array of strings");
  const salida: string[] = [];
  for (const crudo of scopes) {
    const s = typeof crudo === "string" ? crudo.trim() : crudo;
    const motivo = motivoDeScopeInvalido(s);
    if (motivo) throw new Error(`Invalid scope '${String(s)}': ${motivo}`);
    const limpio = s as string;
    if (!salida.includes(limpio)) salida.push(limpio);
  }
  if (salida.length > MAX_SCOPES_POR_AGENTE) {
    throw new Error(`An agent can have at most ${MAX_SCOPES_POR_AGENTE} scopes`);
  }
  return salida;
}

// ── Datasets ────────────────────────────────────────────────────────────────

export type AccionDeDataset = "read" | "write" | "delete";
export const ACCIONES_DE_DATASET: readonly AccionDeDataset[] = ["read", "write", "delete"];

/** `datasets:<slug>:<acción>`. */
export function scopeDeDataset(slug: string, accion: AccionDeDataset): string {
  return `datasets:${slug}:${accion}`;
}

/**
 * Lo que dicen los SCOPES de un dataset concreto:
 *
 *   "denegado"   una denegación lo cubre: ni la política del dataset lo abre
 *                para esta clave;
 *   "concedido"  un scope lo cubre (`datasets:<slug>:read`, `datasets:*:read`,
 *                `datasets:*`, `admin`…);
 *   null         los scopes no dicen nada: decide la política (`policyJson`).
 *
 * Lo que se ve DENTRO del dataset lo siguen filtrando `policyJson.rlsRules` y
 * la RLS de Postgres: el scope abre la puerta del dataset, no las filas.
 */
export function accesoADataset(
  scopes: readonly string[] | undefined,
  slug: string | null | undefined,
  accion: AccionDeDataset
): "denegado" | "concedido" | null {
  if (!scopes || scopes.length === 0 || !slug) return null;
  const requerido = scopeDeDataset(slug, accion);
  if (denegacionQueCubre(scopes, [requerido])) return "denegado";
  return concesionQueCubre(scopes, requerido) ? "concedido" : null;
}

/**
 * Can an agent whose scopes say nothing about THIS dataset write in it because
 * of the dataset's policy? A session passes `writeAccess: "authenticated"`, but
 * an agent key is not a session: a `datasets:*:read` key must not write. Same
 * rule as `kitsuden_agente_abre_por_politica(id, 'write')` (rls-policies.sql)
 * and as the MCP tools: `mcp:write`, a policy that lets a session read (or
 * `dataset:view`), and one that lets a session write (or `dataset-entry:create`).
 * Call it after `accesoADataset`, which settles grants and denies.
 */
export function agenteEscribePorPolitica(
  scopes: readonly string[] | undefined,
  politica: { readAccess?: unknown; writeAccess?: unknown } | null | undefined
): boolean {
  if (!concedeScope(scopes, "mcp:write")) return false;
  const lee =
    politica?.readAccess === "public" ||
    politica?.readAccess === "authenticated" ||
    concedeScope(scopes, "dataset:view");
  return lee && (politica?.writeAccess === "authenticated" || concedeScope(scopes, "dataset-entry:create"));
}

// ── Presets del panel ───────────────────────────────────────────────────────

/**
 * Los grupos «amplios» que ofrece el panel. El texto (nombre y qué concede)
 * vive en los diccionarios del panel; aquí solo la lista de scopes, que es lo
 * que se guarda. Elegir un preset REEMPLAZA la lista del agente.
 */
export const PRESETS_DE_AGENTE = [
  { id: "connect-only", scopes: ["mcp:connect"] },
  { id: "read-only", scopes: ["mcp:connect", "mcp:read", "datasets:*:read"] },
  {
    id: "content-editor",
    scopes: ["mcp:connect", "mcp:read", "contenido:editar", "kon:blog:*", "kon:blocks:*", "kon:media:*"],
  },
  {
    id: "data-editor",
    scopes: ["mcp:connect", "mcp:read", "mcp:write", "datasets:*:read", "datasets:*:write"],
  },
  { id: "full-admin", scopes: ["admin"] },
] as const;

export type PresetDeAgente = (typeof PRESETS_DE_AGENTE)[number]["id"];

/**
 * Los scopes amplios conocidos del núcleo (los de cada kon, `<kon>:*`, los
 * añade la API con los kons montados). El panel explica cada uno.
 */
export const SCOPES_AMPLIOS_DEL_NUCLEO = [
  "admin",
  "mcp:connect",
  "mcp:read",
  "mcp:write",
  "mcp:admin",
  "contenido:editar",
  "memory:read",
  "memory:write",
  "brain:read",
  "brain:write",
  "promotion:propose",
  "mail:send",
  "usuario:actuar",
  "kon:*",
  "datasets:*:read",
  "datasets:*:write",
  "datasets:*:delete",
] as const;

/**
 * ── UNA CLAVE DE AGENTE NO ES UNA CUENTA (auditoría 2026-10-25) ────────────
 *
 * Las rutas que solo piden «estar autenticado» (comentar, inscribirse en un
 * torneo, guardar una build…) aceptaban a CUALQUIER agente, aunque su clave
 * solo trajera `datasets:x:read`. Ahora una clave cuenta como usuario con
 * sesión solo con este scope (o `admin`). Las operaciones del SDK con
 * `permiso` siguen decidiendo por su permiso.
 */
export const SCOPE_ACTUAR_COMO_USUARIO = "usuario:actuar";

export function agenteActuaComoUsuario(scopes: readonly string[] | undefined): boolean {
  return concedeScope(scopes, SCOPE_ACTUAR_COMO_USUARIO);
}

/**
 * ── TODO EL KON: `<kon>:*` (arreglos de la fase D, 2026-10-25) ─────────────
 *
 * La guía promete que `<kon>:*` da «todo ese kon» (docs/agents/permissions.md),
 * pero solo lo cumplían las operaciones del SDK: las rutas LEGADAS de un kon
 * pasaban por las puertas por prefijo (`RUTAS_SOLO_ADMIN`), que solo conocían
 * `admin`, y por las políticas y la RLS de cada kon, que preguntaban por el ROL
 * humano. Un agente `crm:*` recibía 403 «Insufficient role» al crear una
 * empresa; uno `admin` veía listas vacías en dms, members y booking.
 *
 * ¿Abren estos scopes el kon `konCorto` (sin `kon-`) ENTERO? Sí con:
 *
 *   · `admin` / `admin:*`;
 *   · `<kon>:*` o `kon:<kon>:*`, LITERALES. `kon:*` NO: es «toda operación del
 *     SDK de cualquier kon» y no se amplía a las rutas legadas de todos.
 *
 * Una denegación que cubra `<kon>:*` o `kon:<kon>:*` (`!crm:*`, `!kon:*`…)
 * gana, `admin` incluido. Lo mismo en SQL: `kitsuden_agente_abre_kon()`
 * (apps/api/src/db/funciones-de-agente.sql); un test compara las dos.
 */
export function abreKonEntero(scopes: readonly string[] | undefined, konCorto: string): boolean {
  if (!scopes || scopes.length === 0 || !konCorto) return false;
  const amplios = [`${konCorto}:*`, `kon:${konCorto}:*`];
  if (denegacionQueCubre(scopes, amplios)) return false;
  return scopes.some(
    (s) => typeof s === "string" && (s === "admin" || s === "admin:*" || amplios.includes(s))
  );
}
