/**
 * Quién puede llamar a cada ruta de la API — la tabla, versionada
 * ============================================================================
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 *
 * La auditoría del 2026-10-12 encontró rutas que habían nacido abiertas
 * (`/api/items/authSessions` devolvía tokens de sesión sin login, funciones
 * que ejecutaban código para cualquier cuenta). Ninguna lo decidió nadie: se
 * montaron sin puerta y nada lo notó. Esta tabla le da la vuelta: TODA ruta
 * montada tiene que estar aquí con su nivel, y
 * `scripts/matriz-de-autorizacion.ts` (lo corre
 * `tests/unit/matriz-de-autorizacion.test.ts`) monta la app real, la pide con
 * seis identidades y falla si:
 *
 *   - aparece una ruta que no está en la tabla (alguien tiene que decidir);
 *   - una identidad que no debería entrar entra (401/403 esperado);
 *   - una identidad que debería entrar se queda fuera (la puerta sobra o falta
 *     un rol);
 *   - la tabla lista una ruta que ya no existe (se queda vieja).
 *
 * ── LOS NIVELES ────────────────────────────────────────────────────────────
 *
 *   publica    el anónimo entra. Toda ESCRITURA pública es una decisión
 *              consciente (alta, comentarios con su propia comprobación,
 *              suscripción, webhooks firmados…).
 *   usuario    hace falta sesión; cualquier cuenta (el alta es abierta) entra.
 *              El aislamiento entre usuarios (dueño) es cosa del handler.
 *   staff      `admin` o `editor`.
 *   contenido  `admin`, `editor` o un agente con `contenido:editar` (Inti).
 *   admin      solo `admin` (o un agente con scope `admin`).
 *   restringida ninguna de las seis identidades de la matriz entra: la ruta
 *              pide un rol o scope que no tienen (p. ej. instructor de la
 *              academia, agente con `memory:*`). Se exige que NINGUNA de las
 *              cinco sin privilegios pase; lo que haga admin no se exige.
 *   propia     expectativa a medida, escrita en `EXPECTATIVA_PROPIA` con su
 *              motivo (p. ej. `GET /`: resumen público para el anónimo, y
 *              con credenciales solo admin).
 *   middleware entradas `ALL` que Hono registra para `app.use()`: no son una
 *              ruta, se miden con la ruta concreta que protegen.
 *
 * «Entra» = el estado NO es 401 ni 403 (puede ser 400, 404, 422… con un
 * cuerpo vacío y un id que no existe: lo que se mide es la puerta).
 */

export type Nivel =
  | "publica"
  | "usuario"
  | "staff"
  | "contenido"
  | "admin"
  | "restringida"
  | "propia"
  | "middleware";

type Identidad =
  | "anonimo"
  | "usuario"
  | "editor"
  | "admin"
  | "agente"
  | "agenteContenido"
  | "agenteBlogCrear"
  | "agenteDatasetLectura"
  | "agenteContenidoMenosBloques"
  | "agenteAdmin";

/**
 * Fase F — un agente con `admin`. Entra en casi todo (no se le exige nada
 * fuera de lo suyo), pero en la aprobación humana tiene que quedarse FUERA:
 * un agente no aprueba sus propuestas ni toca la configuración, traiga los
 * scopes que traiga. En `/api/proposals` (su estado) sí entra.
 */
export const SOLO_HUMANOS = [
  "/api/approvals",
  // OAuth para MCP (0055): consentir y gestionar conexiones es cosa de humanos
  "/api/oauth/consent",
  "/api/oauth/grants",
];

/**
 * Fase E — identidades con permisos FINOS (y una con denegación). No tienen
 * columna propia en `EXPECTATIVA`: lo que se les exige sale de las demás.
 *
 *   agenteBlogCrear              solo `kon:blog:crear-entrada`
 *   agenteDatasetLectura         solo `datasets:<slug>:read` de un dataset de
 *                                la matriz (las sondas de `SONDAS_FINAS` lo
 *                                miden contra ese dataset real)
 *   agenteContenidoMenosBloques  `contenido:editar` + `!kon:blocks:*`
 *
 * Reglas (ver `expectativaDe`):
 *   · los dos finos se quedan fuera de TODA ruta donde el agente sin scopes
 *     tiene que quedarse fuera, salvo las de `ENTRAN_CON_SCOPE_FINO`, donde
 *     TIENEN que entrar (y solo esas);
 *   · el de la denegación se comporta como `agenteContenido`, salvo en las
 *     rutas de operaciones de `kon-blocks`: ahí, fuera siempre (también las
 *     públicas: la denegación es de la clave).
 */
export const IDENTIDADES_FINAS = [
  "agenteBlogCrear",
  "agenteDatasetLectura",
  "agenteContenidoMenosBloques",
] as const;

/** Las rutas que un scope fino ABRE (y que la matriz exige abiertas). */
export const ENTRAN_CON_SCOPE_FINO: Partial<Record<Identidad, string[]>> = {
  agenteBlogCrear: ["POST /api/blog"],
  agenteDatasetLectura: [],
};

/** El prefijo de operación que la denegación de `agenteContenidoMenosBloques` cierra. */
export const OPERACIONES_DENEGADAS: Partial<Record<Identidad, string>> = {
  agenteContenidoMenosBloques: "kon:blocks:",
};

/**
 * ¿Debe entrar `id` en una ruta de nivel `nivel`? `undefined` = no se exige.
 * `operacion` es el scope fino de la operación del SDK que atiende la ruta
 * (la mide el script), si la hay.
 */
export function expectativaDe(
  id: Identidad,
  nivel: Exclude<Nivel, "middleware">,
  clave: string,
  operacion?: string | null
): boolean | undefined {
  const base = nivel === "propia" ? EXPECTATIVA_PROPIA[clave] : EXPECTATIVA[nivel];
  if (!base) return undefined;
  if (id === "agenteBlogCrear" || id === "agenteDatasetLectura") {
    if (ENTRAN_CON_SCOPE_FINO[id]?.includes(clave)) return true;
    if (nivel === "propia") return undefined;
    return base.agente === false ? false : undefined;
  }
  if (id === "agenteAdmin") {
    const camino = clave.split(" ")[1] ?? "";
    if (SOLO_HUMANOS.some((p) => camino === p || camino.startsWith(`${p}/`))) return false;
    if (nivel === "propia") return base.agente;
    return undefined;
  }
  if (id === "agenteContenidoMenosBloques") {
    const prefijo = OPERACIONES_DENEGADAS[id];
    if (prefijo && operacion?.startsWith(prefijo)) return false;
    if (nivel === "propia") return undefined;
    return base.agenteContenido;
  }
  return base[id];
}

/**
 * Sondas con un recurso REAL (las rutas de la tabla se piden con ids que no
 * existen, y un 404 «entra»): el script crea un dataset privado y comprueba
 * el estado EXACTO que debe dar cada identidad. `:id` es el id del dataset.
 */
export const SONDAS_FINAS: {
  identidad: Identidad;
  metodo: string;
  camino: string;
  cuerpo?: unknown;
  esperado: number[];
  motivo: string;
}[] = [
  {
    identidad: "agenteDatasetLectura",
    metodo: "GET",
    camino: "/api/datasets/:id/entries",
    esperado: [200],
    motivo: "datasets:<slug>:read abre las entradas de ESE dataset privado",
  },
  {
    identidad: "agenteDatasetLectura",
    metodo: "GET",
    camino: "/api/data-sets/:id/entries",
    esperado: [200],
    motivo: "también por la API lite",
  },
  {
    identidad: "agenteDatasetLectura",
    metodo: "POST",
    camino: "/api/datasets/:id/entries",
    cuerpo: { title: "no", data: {} },
    esperado: [401, 403],
    motivo: "leer no es escribir",
  },
  {
    identidad: "agenteDatasetLectura",
    metodo: "POST",
    camino: "/api/data-sets/:id/entries",
    cuerpo: { title: "no", data: {} },
    esperado: [401, 403],
    // Against a dataset open to sessions: tests/security-audit-2026-10-31.test.ts.
    motivo: "leer no es escribir, tampoco por la API lite",
  },
  {
    identidad: "agente",
    metodo: "GET",
    camino: "/api/datasets/:id/entries",
    // 403 desde la auditoría 2026-10-25: /api/datasets/* pasa por el
    // requireAuth de routes/datasets-query.ts, y una clave sin scope de
    // datasets no actúa como usuario (middleware/agente-como-usuario.ts). El
    // 403 es el mismo para cualquier id: tampoco filtra si el dataset existe.
    esperado: [403, 404],
    motivo: "sin el scope, el dataset privado no existe para él",
  },
  {
    identidad: "agenteBlogCrear",
    metodo: "GET",
    camino: "/api/datasets/:id/entries",
    // 403 desde la auditoría 2026-10-25: /api/datasets/* pasa por el
    // requireAuth de routes/datasets-query.ts, y una clave sin scope de
    // datasets no actúa como usuario (middleware/agente-como-usuario.ts). El
    // 403 es el mismo para cualquier id: tampoco filtra si el dataset existe.
    esperado: [403, 404],
    motivo: "un scope fino de otro kon no abre datasets",
  },
];

/** Quién DEBE entrar y quién DEBE quedarse fuera en cada nivel (`undefined` = no se exige). */
export const EXPECTATIVA: Record<
  Exclude<Nivel, "middleware" | "propia">,
  Partial<Record<Identidad, boolean>>
> = {
  publica: { anonimo: true, usuario: true, admin: true },
  usuario: { anonimo: false, usuario: true, editor: true, admin: true },
  staff: {
    anonimo: false,
    usuario: false,
    agente: false,
    agenteContenido: false,
    editor: true,
    admin: true,
  },
  contenido: {
    anonimo: false,
    usuario: false,
    agente: false,
    editor: true,
    admin: true,
    agenteContenido: true,
  },
  admin: {
    anonimo: false,
    usuario: false,
    editor: false,
    agente: false,
    agenteContenido: false,
    admin: true,
  },
  restringida: {
    anonimo: false,
    usuario: false,
    editor: false,
    agente: false,
    agenteContenido: false,
  },
};

/** Rutas de nivel `propia`: qué se exige a cada identidad y por qué. */
export const EXPECTATIVA_PROPIA: Record<string, Partial<Record<Identidad, boolean>>> = {
  // observability.ts: sin credenciales, «la API está viva»; con cookie o
  // Authorization, los recuentos y la actividad reciente, solo admin.
  "GET /": { anonimo: true, usuario: false, editor: false, admin: true },
  // Fase F (routes/aprobaciones.ts): cada AGENTE consulta sus propuestas (las
  // ajenas son 404 dentro de la ruta); el equipo humano, todas; una cuenta
  // sin rol de equipo, no.
  "GET /api/proposals": {
    anonimo: false,
    usuario: false,
    editor: true,
    admin: true,
    agente: true,
    agenteContenido: true,
  },
  "GET /api/proposals/:id": {
    anonimo: false,
    usuario: false,
    editor: true,
    admin: true,
    agente: true,
    agenteContenido: true,
  },
  // B3 (2026-10-28): lo mismo que el estado, como flujo SSE.
  "GET /api/proposals/:id/events": {
    anonimo: false,
    usuario: false,
    editor: true,
    admin: true,
    agente: true,
    agenteContenido: true,
  },
  // Fase I (routes/promocion.ts): activar una versión. Un admin humano, sí (una
  // versión aprobada que no se pudo activar). Un AGENTE, nunca por sí mismo —
  // tampoco con `admin` (agenteAdmin hereda `agente: false`): solo la ejecución
  // de su propuesta aprobada por un humano trae la marca del proceso.
  "POST /api/promotion/versions/:id/activate": {
    anonimo: false,
    usuario: false,
    editor: false,
    admin: true,
    agente: false,
    agenteContenido: false,
  },
};

/**
 * Escrituras que la matriz NO ejecuta con una identidad que tiene permiso:
 * tocan el disco, el repositorio o el proceso. Para ellas solo se comprueba
 * que quien NO tiene permiso se queda fuera.
 */
export const NO_EJECUTAR_CON_PERMISO: string[] = [
  "POST /api/brain",
  "PUT /api/brain",
  "DELETE /api/brain",
  "POST /api/code-graph",
  "POST /api/modules",
  "PATCH /api/modules",
  "PUT /api/modules",
  "DELETE /api/modules",
  "POST /api/system",
  "PATCH /api/system",
  "PUT /api/system",
  "DELETE /api/system",
  "POST /api/functions",
  "POST /api/actions",
  "POST /api/sync",
  "POST /api/search/init",
  "POST /api/search/index",
  "POST /api/admin/vault",
  "POST /api/media",
  "DELETE /api/media",
  "POST /api/mail/test",
];

/** Valor de relleno de cada `:param` (mismo criterio que `scripts/humo-rutas.ts`). */
const RELLENO: Record<string, string> = {
  id: "00000000-0000-0000-0000-000000000000",
  konId: "kon-blog",
  kon: "kon-blog",
  key: "kon-blog",
  table: "media",
  tableName: "media",
  collection: "media",
  slug: "no-existe",
  channel: "general",
};

export function concretar(patron: string): string {
  return patron
    .split("/")
    .map((seg) => {
      if (seg === "*") return "x";
      if (!seg.startsWith(":")) return seg;
      const nombre = seg.slice(1).replace(/[?{].*$/, "");
      if (/\{[^}]*\\d/.test(seg) || /\{\[0-9\]/.test(seg)) return "1";
      return RELLENO[nombre] ?? "00000000-0000-0000-0000-000000000000";
    })
    .join("/");
}

/**
 * Las claves `MÉTODO /patrón` de la tabla de Hono, sin duplicados. Los
 * `app.use()` que cuelgan de todo (`/*`, `/api/*`) se quedan fuera: no son de
 * nadie. El resto de `ALL` se listan y se clasifican como `middleware`.
 */
export function clavesDeRutas(rutas: { method: string; path: string }[]): string[] {
  return [
    ...new Set(
      rutas
        .filter((r) => !(r.method === "ALL" && (r.path === "/*" || r.path === "/api/*")))
        .map((r) => `${r.method} ${r.path}`)
    ),
  ].sort();
}

const DENEGADO = new Set([401, 403]);

export function compararConMatriz(
  medidas: { clave: string; estados: Partial<Record<Identidad, number>>; operacion?: string | null }[],
  matriz: Record<string, Nivel> = MATRIZ
): string[] {
  const fallos: string[] = [];
  const vistas = new Set<string>();
  for (const { clave, estados, operacion } of medidas) {
    vistas.add(clave);
    const nivel = matriz[clave];
    if (!nivel) {
      fallos.push(`${clave}: ruta SIN CLASIFICAR (añádela a MATRIZ con su nivel)`);
      continue;
    }
    if (nivel === "middleware") {
      if (!clave.startsWith("ALL ")) fallos.push(`${clave}: solo un ALL puede ser 'middleware'`);
      continue;
    }
    const esperado = nivel === "propia" ? EXPECTATIVA_PROPIA[clave] : EXPECTATIVA[nivel];
    if (!esperado) {
      fallos.push(`${clave}: nivel 'propia' sin entrada en EXPECTATIVA_PROPIA`);
      continue;
    }
    const identidades = [
      ...(Object.keys(esperado) as Identidad[]),
      ...IDENTIDADES_FINAS.filter((f) => !(f in esperado)),
      ...(["agenteAdmin"] as const).filter((f) => !(f in esperado)),
    ];
    for (const id of identidades) {
      const debeEntrar = expectativaDe(id, nivel, clave, operacion);
      if (debeEntrar === undefined) continue;
      const estado = estados[id];
      if (estado === undefined) continue; // no se ejecutó (NO_EJECUTAR_CON_PERMISO)
      const entro = !DENEGADO.has(estado);
      if (entro !== debeEntrar) {
        fallos.push(
          `${clave} [${nivel}]: ${id} → ${estado} (${debeEntrar ? "debía entrar" : "debía quedarse fuera"})`
        );
      }
    }
  }
  for (const clave of Object.keys(matriz)) {
    if (!vistas.has(clave)) fallos.push(`${clave}: está en MATRIZ pero ya no se monta (bórrala)`);
  }
  return fallos;
}

// ════════════════════════════════════════════════════════════════════════════
// LA TABLA
// ════════════════════════════════════════════════════════════════════════════

export const MATRIZ: Record<string, Nivel> = {
  // ── propia — ver EXPECTATIVA_PROPIA
  "GET /": "propia",
  "GET /api/proposals": "propia",
  "GET /api/proposals/:id": "propia",
  "GET /api/proposals/:id/events": "propia",
  // ── OAuth 2.1 para MCP (routes/oauth.ts, docs/agents/oauth.md) ──
  // Públicas por la especificación (MCP 2026-07-28): metadatos, registro
  // dinámico (limitado por IP, falla cerrado), autorización (solo redirige
  // al panel), token y revocación (autentican al CLIENTE, no a la sesión).
  "GET /.well-known/oauth-protected-resource": "publica",
  "GET /.well-known/oauth-protected-resource/api/mcp": "publica",
  "GET /.well-known/oauth-authorization-server": "publica",
  "POST /api/oauth/register": "publica",
  "GET /api/oauth/authorize": "publica",
  "POST /api/oauth/token": "publica",
  "POST /api/oauth/revoke": "publica",
  // Consentimiento y conexiones: humanos admin/editor (rol fresco); ningún
  // agente (SOLO_HUMANOS). Un editor solo ve y revoca lo suyo (404 lo ajeno).
  "GET /api/oauth/consent/:id": "staff",
  "POST /api/oauth/consent/:id": "staff",
  "GET /api/oauth/grants": "staff",
  "DELETE /api/oauth/grants/:id": "staff",
  // `WWW-Authenticate` en los 401/403 de /api/mcp, y el apagado de OAuth
  "ALL /api/mcp": "middleware",
  "ALL /api/oauth/*": "middleware",
  "ALL /.well-known/oauth-protected-resource": "middleware",
  "ALL /.well-known/oauth-protected-resource/*": "middleware",
  "ALL /.well-known/oauth-authorization-server": "middleware",
  // ── publica (185) — Pública (anónimo entra). Las ESCRITURAS de aquí se revisaron una a una.
  "GET /api/analytics/subject/:type/:id": "publica",
  "GET /api/analytics/top": "publica",
  "GET /api/auth/*": "publica",
  "GET /api/autobattler/comps/:slug": "publica",
  "GET /api/autobattler/sets": "publica",
  "GET /api/autobattler/sets/:slug": "publica",
  "GET /api/autobattler/sets/:slug/:kind": "publica",
  "GET /api/autobattler/sets/:slug/comps": "publica",
  "GET /api/autobattler/sets/:slug/items/:id/components": "publica",
  "GET /api/blog": "publica",
  "GET /api/blog/:id": "publica",
  "GET /api/blog/categories": "publica",
  "GET /api/blog/geo/:slug": "publica",
  "GET /api/blog/seo/:slug": "publica",
  "GET /api/blog/slug/:slug": "publica",
  "GET /api/broadcast/champions": "publica",
  "GET /api/broadcast/clasificaciones": "publica",
  "GET /api/broadcast/live/overlay/:gameId": "publica",
  "GET /api/broadcast/overlay/:id": "publica",
  "GET /api/broadcast/sections": "publica",
  "GET /api/builder/builds": "publica",
  "GET /api/builder/builds/:id": "publica",
  "GET /api/builder/decode/:code": "publica",
  "GET /api/builder/definitions": "publica",
  "GET /api/builder/definitions/:slug": "publica",
  "GET /api/cardsim/games": "publica",
  "GET /api/cardsim/games/:slug": "publica",
  "GET /api/cardsim/games/:slug/cards": "publica",
  "GET /api/cardsim/matches/:id": "publica",
  "GET /api/cardsim/presets": "publica",
  "GET /api/cardsim/ratings/:slug": "publica",
  "GET /api/cardsim/rooms/:code": "publica",
  "GET /api/cardsim/sessions": "publica",
  "GET /api/cardsim/sessions/:id": "publica",
  "GET /api/cardsim/sessions/:id/replay": "publica",
  "GET /api/comments/:subjectType/:subjectId": "publica",
  "GET /api/data-sets": "publica",
  "GET /api/data-sets/:id": "publica",
  "GET /api/data-sets/:id/entries": "publica",
  "GET /api/data-sets/:id/entries/:entryId": "publica",
  "GET /api/data-sets/slug/:slug": "publica",
  "GET /api/deckshow/entries": "publica",
  "GET /api/deckshow/entries/:slug": "publica",
  "GET /api/deckshow/games": "publica",
  "GET /api/deckshow/games/:slug/cards": "publica",
  "GET /api/doc": "publica",
  "GET /api/docs": "publica",
  "GET /api/docs-legacy": "publica",
  "GET /api/docs-legacy/modern": "publica",
  "GET /api/docs-legacy/openapi.json": "publica",
  "GET /api/docs-legacy/postman.json": "publica",
  "GET /api/docs-legacy/sdk": "publica",
  "GET /api/docs-legacy/swagger": "publica",
  "GET /api/docs/:kon/openapi.json": "publica",
  "GET /api/docs/kons": "publica",
  "GET /api/docs/modern": "publica",
  "GET /api/docs/openapi.json": "publica",
  "GET /api/docs/operations": "publica",
  "GET /api/docs/postman.json": "publica",
  "GET /api/docs/sdk": "publica",
  "GET /api/esports/import/public/tournament/:id/prize-pool": "publica",
  "GET /api/esports/import/sources": "publica",
  "GET /api/esports/invites/:token": "publica",
  "GET /api/esports/leaderboard": "publica",
  "GET /api/esports/match/:matchId/report": "publica",
  "GET /api/esports/matches": "publica",
  "GET /api/esports/matches/:id": "publica",
  "GET /api/esports/matches/tournament/:tournamentId": "publica",
  "GET /api/esports/matches/tournament/:tournamentId/bracket": "publica",
  "GET /api/esports/matches/tournament/:tournamentId/standings": "publica",
  "GET /api/esports/phase/:phaseId/results": "publica",
  "GET /api/esports/players": "publica",
  "GET /api/esports/players/:id": "publica",
  "GET /api/esports/pro-matches": "publica",
  "GET /api/esports/public/teams/:id/roster": "publica",
  "GET /api/esports/public/tournament/:id": "publica",
  "GET /api/esports/public/tournament/:id/streams": "publica",
  "GET /api/esports/teams": "publica",
  "GET /api/esports/teams/:id": "publica",
  "GET /api/esports/tournament/:id/check-in": "publica",
  "GET /api/esports/tournament/:id/phases": "publica",
  "GET /api/esports/tournament/:id/swiss": "publica",
  "GET /api/esports/tournament/:id/swiss/cut": "publica",
  "GET /api/esports/tournaments": "publica",
  "GET /api/esports/tournaments/:id": "publica",
  "GET /api/formulas/systems": "publica",
  "GET /api/formulas/systems/:slug": "publica",
  "GET /api/games": "publica",
  "GET /api/games/:id": "publica",
  "GET /api/games/collections": "publica",
  "GET /api/games/collections/:id": "publica",
  "GET /api/games/platforms": "publica",
  "GET /api/games/slug/:slug": "publica",
  "GET /api/games/tags": "publica",
  "GET /api/handlab/datasets": "publica",
  "GET /api/handlab/datasets/:slug": "publica",
  "GET /api/handlab/datasets/:slug/cards": "publica",
  "GET /api/health": "publica",
  "GET /api/health/pgtrgm": "publica",
  "GET /api/health/pgvector": "publica",
  "GET /api/kons/:konId/admin-asset/*": "publica",
  "GET /api/kons/:konId/graphics/*": "publica",
  "GET /api/llms.txt": "publica",
  "GET /api/maps/maps/:slug": "publica",
  "GET /api/media/focal-point/:id": "publica",
  "GET /api/media/preset/:id/:preset": "publica",
  "GET /api/media/transform/:id": "publica",
  "GET /api/members/me": "publica",
  "GET /api/members/tiers": "publica",
  "GET /api/newsletter/confirm": "publica",
  "GET /api/newsletter/portal": "publica",
  "GET /api/newsletter/portal.js": "publica",
  "GET /api/newsletter/t/c/:token": "publica",
  "GET /api/newsletter/t/o/:token": "publica",
  "GET /api/newsletter/unsubscribe": "publica",
  "GET /api/page-builder/block-types": "publica",
  "GET /api/page-builder/pages": "publica",
  "GET /api/page-builder/pages/:id": "publica",
  "GET /api/page-builder/render/:slug": "publica",
  "GET /api/page-builder/templates": "publica",
  "GET /api/payments/providers": "publica",
  "GET /api/search/suggestions": "publica",
  "GET /api/settings": "publica",
  "GET /api/settings/social-live": "publica",
  "GET /api/shop/products": "publica",
  "GET /api/shop/products/:slug": "publica",
  "GET /api/streamers": "publica",
  "GET /api/streamers/:id": "publica",
  "GET /api/streamers/live": "publica",
  "GET /api/streamers/slug/:slug": "publica",
  "GET /api/swagger": "publica",
  "GET /api/system/active-theme-config": "publica",
  "GET /api/system/auth-providers": "publica",
  "GET /api/system/grimoires": "publica",
  "GET /api/system/grimoires/:id": "publica",
  "GET /api/system/init-check": "publica",
  "GET /api/system/theme-css/:themeId": "publica",
  "GET /api/system/themes": "publica",
  // Versión y contratos de la API (routes/version.ts), montada tras la medición
  "GET /api/version": "publica",
  "GET /api/tierlist/decode/:code": "publica",
  "GET /api/tierlist/templates": "publica",
  "GET /api/tierlist/templates/:slug": "publica",
  "GET /api/tierlist/templates/:slug/diff/:otherId": "publica",
  "GET /api/wiki/wikis": "publica",
  "GET /api/wiki/wikis/:wiki": "publica",
  "GET /api/wiki/wikis/:wiki/pages": "publica",
  "GET /api/wiki/wikis/:wiki/pages/:slug": "publica",
  "GET /api/wiki/wikis/:wiki/pages/:slug/diff/:from/:to": "publica",
  "GET /api/wiki/wikis/:wiki/pages/:slug/history": "publica",
  "GET /api/wiki/wikis/:wiki/wanted": "publica",
  "GET /api/wiki/wikis/sugerencia": "publica",
  "GET /health": "publica",
  "GET /live": "publica",
  "GET /llms.txt": "publica",
  "GET /media/*": "publica",
  "GET /ready": "publica",
  "GET /slo": "publica",
  "POST /api/analytics/hit": "publica",
  "POST /api/auth/*": "publica",
  "POST /api/autobattler/analyse": "publica",
  "POST /api/autobattler/craft": "publica",
  "POST /api/autobattler/suggest": "publica",
  "POST /api/autobattler/trait-plan": "publica",
  "POST /api/broadcast/games/:id/ingest/push": "publica",
  "POST /api/builder/definitions/:slug/compute": "publica",
  "POST /api/cardsim/goldfish": "publica",
  "POST /api/deckshow/goldfish": "publica",
  "POST /api/deckshow/hands": "publica",
  "POST /api/deckshow/validate": "publica",
  "POST /api/esports/match/:matchId/report": "publica",
  "POST /api/esports/public/tournament/:id/register-guest": "publica",
  "POST /api/handlab/datasets/:slug/random-deck": "publica",
  "POST /api/handlab/goldfish": "publica",
  "POST /api/handlab/hands": "publica",
  "POST /api/handlab/validate": "publica",
  "POST /api/members/gate": "publica",
  "POST /api/members/signin": "publica",
  "POST /api/members/signin/verify": "publica",
  "POST /api/members/signout": "publica",
  "POST /api/newsletter/subscribe": "publica",
  "POST /api/newsletter/unsubscribe": "publica",
  "POST /api/newsletter/webhook/:provider": "publica",
  "POST /api/payments/webhook/:provider": "publica",
  "POST /api/search": "publica",
  "POST /api/shop/orders": "publica",
  // ── usuario (158) — Cualquier cuenta. El aislamiento entre usuarios lo hace el handler (dueño).
  "DELETE /api/autobattler/comps/:id": "usuario",
  "DELETE /api/broadcast/matches/:id": "usuario",
  "DELETE /api/builder/builds/:id": "usuario",
  "DELETE /api/cardsim/decks/:id": "usuario",
  "DELETE /api/cardsim/queue": "usuario",
  "DELETE /api/cardsim/sessions/:id/undo": "usuario",
  "DELETE /api/collection/:datasetId": "usuario",
  "DELETE /api/comments/:id": "usuario",
  "DELETE /api/datasets/:id/calculated-fields/:fieldId": "usuario",
  "DELETE /api/datasets/:id/entries/:entryId": "usuario",
  "DELETE /api/deckshow/entries/:id": "usuario",
  "DELETE /api/deckshow/entries/:id/like": "usuario",
  "DELETE /api/esports/public/tournament/:id/register": "usuario",
  "DELETE /api/handlab/datasets/:slug": "usuario",
  "DELETE /api/shop/admin/products/:id": "usuario",
  "DELETE /api/tierlist/templates/:slug/items/:itemId": "usuario",
  "GET /api/academy/certificados/:cursoId": "usuario",
  "GET /api/academy/certificados/:cursoId/pdf": "usuario",
  // Pública a propósito: quien recibe un certificado comprueba su código sin
  // cuenta (fase D; antes la cubría el requireAuth de todo el router).
  "GET /api/academy/certificados/verificar/:codigo": "publica",
  "GET /api/academy/cursos": "usuario",
  "GET /api/academy/cursos/:id": "usuario",
  "GET /api/academy/cursos/:id/modulos": "usuario",
  "GET /api/academy/dashboard/mi-progreso": "usuario",
  "GET /api/academy/grupos": "usuario",
  "GET /api/academy/grupos/:id": "usuario",
  "GET /api/academy/learning-paths": "usuario",
  "GET /api/academy/learning-paths/:id": "usuario",
  "GET /api/academy/learning-paths/mis-paths": "usuario",
  "GET /api/academy/modulos/:id": "usuario",
  "GET /api/academy/quizzes/:id": "usuario",
  "GET /api/academy/temas/:id": "usuario",
  "GET /api/broadcast/games/:id": "usuario",
  "GET /api/broadcast/games/:id/fearless": "usuario",
  "GET /api/broadcast/live/adapters": "usuario",
  "GET /api/broadcast/matches": "usuario",
  "GET /api/broadcast/matches/:id": "usuario",
  "GET /api/broadcast/matches/:id/games": "usuario",
  "GET /api/builder/builds/mias": "usuario",
  "GET /api/cardsim/decks": "usuario",
  "GET /api/cardsim/decks/:id": "usuario",
  "GET /api/cardsim/decks/:id/export": "usuario",
  "GET /api/collection/:datasetId": "usuario",
  "GET /api/datasets": "usuario",
  "GET /api/datasets/:id": "usuario",
  "GET /api/datasets/:id/calculated-fields": "usuario",
  "GET /api/datasets/:id/calculated-fields/:fieldId": "usuario",
  "GET /api/datasets/:id/entries": "usuario",
  "GET /api/datasets/:id/entries/:entryId": "usuario",
  "GET /api/datasets/:id/entries/:entryId/snapshot": "usuario",
  "GET /api/datasets/:id/entries/:entryId/snapshots": "usuario",
  "GET /api/datasets/:id/relations": "usuario",
  "GET /api/datasets/:id/search": "usuario",
  "GET /api/datasets/slug/:slug": "usuario",
  "GET /api/esports/match/:matchId/where": "usuario",
  "GET /api/esports/public/tournament/:id/me": "usuario",
  "GET /api/graph": "usuario",
  "GET /api/graph/:table": "usuario",
  "GET /api/graph/:table/:id": "usuario",
  "GET /api/graph/:table/:id/:relation": "usuario",
  "GET /api/handlab/decks": "usuario",
  "GET /api/members/admin/members/:id": "usuario",
  "GET /api/payments/subscription": "usuario",
  "GET /api/shop/admin/orders/:id": "usuario",
  "GET /api/system/themes/:id/check": "usuario",
  "PATCH /api/broadcast/matches/:id": "usuario",
  "PATCH /api/builder/builds/:id": "usuario",
  "PATCH /api/comments/:id": "usuario",
  "PATCH /api/data-sets/:id": "usuario",
  "PATCH /api/datasets/:id": "usuario",
  "PATCH /api/datasets/:id/calculated-fields/:fieldId": "usuario",
  "PATCH /api/datasets/:id/entries/:entryId": "usuario",
  "PATCH /api/shop/admin/products/:id": "usuario",
  "PATCH /api/shop/admin/variants/:id": "usuario",
  "POST /api/academy/encuestas": "usuario",
  "POST /api/academy/feedback": "usuario",
  "POST /api/academy/media/normalizar-video": "usuario",
  "POST /api/academy/media/validar": "usuario",
  "POST /api/academy/media/youtube-info": "usuario",
  "POST /api/academy/quizzes/:id/responder": "usuario",
  "POST /api/academy/temas/:id/completar": "usuario",
  "POST /api/autobattler/comps": "usuario",
  "POST /api/autobattler/comps/:id/rank": "usuario",
  "POST /api/broadcast/champions": "usuario",
  "POST /api/broadcast/games/:id/draft": "usuario",
  "POST /api/broadcast/games/:id/draft/undo": "usuario",
  "POST /api/broadcast/games/:id/finish": "usuario",
  "POST /api/broadcast/games/:id/ingest/push-token": "usuario",
  "POST /api/broadcast/games/:id/ingest/start": "usuario",
  "POST /api/broadcast/games/:id/ingest/stop": "usuario",
  "POST /api/broadcast/matches/:id/bind": "usuario",
  "POST /api/broadcast/matches/:id/games": "usuario",
  "POST /api/broadcast/matches/:id/report": "usuario",
  "POST /api/broadcast/matches/:id/score": "usuario",
  "POST /api/broadcast/matches/:id/screens": "usuario",
  "POST /api/broadcast/matches/:id/swap": "usuario",
  "POST /api/broadcast/matches/:id/ticker": "usuario",
  "POST /api/broadcast/matches/from-set": "usuario",
  "POST /api/builder/builds": "usuario",
  "POST /api/builder/builds/:id/voto": "usuario",
  "POST /api/builder/definitions/validate": "usuario",
  "POST /api/cardsim/decks": "usuario",
  "POST /api/cardsim/decks/import": "usuario",
  "POST /api/cardsim/games/:slug/sealed": "usuario",
  "POST /api/cardsim/queue": "usuario",
  "POST /api/cardsim/sessions": "usuario",
  "POST /api/cardsim/sessions/:id/action": "usuario",
  "POST /api/cardsim/sessions/:id/join": "usuario",
  "POST /api/cardsim/sessions/:id/rematch": "usuario",
  "POST /api/cardsim/sessions/:id/undo": "usuario",
  "POST /api/collection/:datasetId/varias": "usuario",
  "POST /api/comments": "usuario",
  "POST /api/comments/:id/moderate": "usuario",
  "POST /api/comments/:id/vote": "usuario",
  "POST /api/comments/moderation/bulk": "usuario",
  "POST /api/data-sets/:id/entries": "usuario",
  "POST /api/datasets/:id/calculated-fields": "usuario",
  "POST /api/datasets/:id/compare": "usuario",
  "POST /api/datasets/:id/entries": "usuario",
  "POST /api/datasets/:id/entries/:entryId/compare": "usuario",
  "POST /api/datasets/:id/entries/:entryId/restore": "usuario",
  "POST /api/datasets/:id/entries/:entryId/snapshots": "usuario",
  "POST /api/datasets/:id/query": "usuario",
  "POST /api/deckshow/decks": "usuario",
  "POST /api/deckshow/entries": "usuario",
  "POST /api/deckshow/entries/:id/like": "usuario",
  "POST /api/deckshow/entries/:id/moderate": "usuario",
  "POST /api/esports/invites/:token/accept": "usuario",
  "POST /api/esports/invites/:token/decline": "usuario",
  "POST /api/esports/participant/:participantId/check-in": "usuario",
  "POST /api/esports/public/teams": "usuario",
  "POST /api/esports/public/teams/:id/invites": "usuario",
  "POST /api/esports/public/tournament/:id/register": "usuario",
  "POST /api/esports/public/tournament/:id/register-team": "usuario",
  "POST /api/formulas/systems/:slug/evaluate": "usuario",
  "POST /api/handlab/datasets": "usuario",
  "POST /api/handlab/datasets/:slug/cards": "usuario",
  "POST /api/handlab/datasets/import": "usuario",
  "POST /api/handlab/decks": "usuario",
  // kon-ingesta (D4): los dos modelos son `dueno` — cualquier cuenta, cada una
  // con lo suyo (RLS); un agente necesita además `document:*` / `chunk:*`.
  "DELETE /api/ingesta/chunks/:id": "usuario",
  "DELETE /api/ingesta/documents/:id": "usuario",
  "GET /api/ingesta/chunks": "usuario",
  "GET /api/ingesta/chunks/_model": "usuario",
  "GET /api/ingesta/chunks/:id": "usuario",
  "GET /api/ingesta/chunks/search": "usuario",
  "GET /api/ingesta/documents": "usuario",
  "GET /api/ingesta/documents/_model": "usuario",
  "GET /api/ingesta/documents/:id": "usuario",
  "PATCH /api/ingesta/chunks/:id": "usuario",
  "PATCH /api/ingesta/documents/:id": "usuario",
  "POST /api/ingesta/chunks": "usuario",
  "POST /api/ingesta/documents": "usuario",
  "POST /api/ingesta/documents/ingest": "usuario",
  "POST /api/maps/maps/:slug/markers": "usuario",
  "POST /api/members/admin/access/comp": "usuario",
  "POST /api/members/admin/tiers": "usuario",
  "POST /api/payments/cancel": "usuario",
  "POST /api/payments/checkout": "usuario",
  "POST /api/shop/admin/orders/:id/status": "usuario",
  "POST /api/shop/admin/products/:id/variants": "usuario",
  "POST /api/tierlist/mine/:id/place": "usuario",
  "POST /api/tierlist/templates/:slug/fork": "usuario",
  "POST /api/tierlist/templates/:slug/items": "usuario",
  "POST /api/tierlist/templates/:slug/place": "usuario",
  "POST /api/tierlist/templates/:slug/sync": "usuario",
  "POST /api/wiki/wikis": "usuario",
  "POST /api/wiki/wikis/:wiki/pages/:slug/revert/:number": "usuario",
  "PUT /api/cardsim/decks/:id": "usuario",
  "PUT /api/collection/:datasetId": "usuario",
  "PUT /api/deckshow/entries/:id": "usuario",
  "PUT /api/formulas/systems": "usuario",
  "PUT /api/tierlist/templates": "usuario",
  "PUT /api/wiki/wikis/:wiki/pages/:slug": "usuario",
  // ── staff (94) — Equipo: admin o editor.
  // Fase F: la bandeja de aprobación. Solo HUMANOS (ningún agente, ni con
  // admin: soloHumanos en routes/aprobaciones.ts); configurar, solo admin.
  "GET /api/approvals/proposals": "staff",
  // Fase H3: descriptores de los modelos (defineModelo) para el panel.
  "GET /api/models": "staff",
  "GET /api/approvals/proposals/count": "staff",
  "GET /api/approvals/proposals/:id": "staff",
  "GET /api/approvals/proposals/:id/files/:fileId": "staff",
  "POST /api/approvals/proposals/:id/approve": "staff",
  "POST /api/approvals/proposals/:id/reject": "staff",
  "GET /api/approvals/settings": "staff",
  "GET /api/approvals/audit": "staff",
  "PUT /api/approvals/settings": "admin",
  "PUT /api/approvals/agents/:id/mode": "admin",
  // Fase I: el panel de la promoción de código. Solo admin HUMANO (soloHumanos
  // + exigirAdmin en routes/promocion.ts; agenteAdmin fuera por SOLO_HUMANOS).
  "GET /api/approvals/promotion/settings": "admin",
  "PUT /api/approvals/promotion/settings": "admin",
  "PUT /api/approvals/promotion/agents/:id/mode": "admin",
  "GET /api/approvals/promotion/versions": "admin",
  "GET /api/approvals/promotion/versions/:id": "admin",
  "POST /api/approvals/promotion/versions/:id/approve": "admin",
  "POST /api/approvals/promotion/versions/:id/reject": "admin",
  "POST /api/approvals/promotion/versions/:id/rollback": "admin",
  "POST /api/approvals/promotion/versions/:id/activate": "admin",
  // Fase I: lo del agente. Proponer exige `promotion:propose` (ninguna
  // identidad de la matriz lo tiene salvo agenteAdmin, por `admin`): ni un admin
  // humano propone (edita la acción). Leer: el agente lo suyo, el admin todo.
  "POST /api/promotion/drafts": "restringida",
  "GET /api/promotion/drafts": "admin",
  "GET /api/promotion/drafts/:id": "admin",
  "POST /api/promotion/versions/:id/activate": "propia",
  "DELETE /api/blog/:id": "staff",
  "DELETE /api/blog/categories/:id": "staff",
  "DELETE /api/esports/matches/:id": "staff",
  "DELETE /api/esports/participant/:participantId/check-in": "staff",
  "DELETE /api/esports/players/:id": "staff",
  "DELETE /api/esports/pro-matches/:id": "staff",
  "DELETE /api/esports/teams/:id": "staff",
  "DELETE /api/esports/tournaments/:id": "staff",
  "DELETE /api/games/:id": "admin",
  "DELETE /api/games/collections/:id": "staff",
  "DELETE /api/media/:id": "staff",
  "DELETE /api/media/cache/:id": "staff",
  "DELETE /api/streamers/:id": "staff",
  "GET /api/blog/posts/count": "staff",
  "GET /api/blog/source/:postId": "staff",
  "GET /api/comments/moderation/queue": "staff",
  "GET /api/datasets/:id/indexes/suggest": "staff",
  "GET /api/datasets/count": "staff",
  "GET /api/esports/notifications/pending": "staff",
  "GET /api/esports/tournament/:id/pending-reports": "staff",
  "GET /api/esports/tournament/:id/stations": "staff",
  "GET /api/esports/tournament/:id/stream-queue": "staff",
  "GET /api/media": "staff",
  "GET /api/media/:id": "staff",
  "GET /api/media/count": "staff",
  "GET /api/media/folders": "staff",
  "GET /api/members/admin/members": "staff",
  "GET /api/shop/admin/orders": "staff",
  "GET /api/shop/admin/products": "staff",
  "GET /api/users/count": "staff",
  "PATCH /api/blog/:id": "staff",
  "PATCH /api/blog/categories/:id": "staff",
  "PATCH /api/esports/players/:id": "staff",
  "PATCH /api/esports/pro-matches/:id": "staff",
  "PATCH /api/esports/teams/:id": "staff",
  "PATCH /api/esports/tournaments/:id": "staff",
  "PATCH /api/games/:id": "staff",
  "PATCH /api/games/collections/:id": "staff",
  "PATCH /api/media/:id": "staff",
  "PATCH /api/streamers/:id": "staff",
  "POST /api/autobattler/sets/import": "staff",
  "POST /api/blog": "staff",
  "POST /api/blog/:id/publish": "staff",
  "POST /api/blog/:slug/refresh-og-cache": "staff",
  "POST /api/blog/categories": "staff",
  "POST /api/blog/promote-from-source": "staff",
  "POST /api/blog/validate-image": "staff",
  "POST /api/blog/validate-seo": "staff",
  "POST /api/broadcast/matches": "staff",
  "POST /api/cardsim/games/:slug/cards": "staff",
  "POST /api/cardsim/games/:slug/sync-catalog": "staff",
  "POST /api/data-sets": "staff",
  "POST /api/datasets": "staff",
  "POST /api/datasets/export": "staff",
  "POST /api/esports/import/tournament/:id/import": "staff",
  "POST /api/esports/import/tournament/:id/prize-pool/sync": "staff",
  "POST /api/esports/match/:matchId/resolve": "staff",
  "POST /api/esports/match/:matchId/station": "staff",
  "POST /api/esports/match/:matchId/stream-queue": "staff",
  "POST /api/esports/matches/tournament/:tournamentId/generate": "staff",
  "POST /api/esports/matches/tournament/:tournamentId/report": "staff",
  "POST /api/esports/notifications/ack": "staff",
  "POST /api/esports/notifications/fail": "staff",
  "POST /api/esports/participant/:participantId/drop": "staff",
  "POST /api/esports/phase/:phaseId/advance": "staff",
  "POST /api/esports/phase/:phaseId/start": "staff",
  "POST /api/esports/players": "staff",
  "POST /api/esports/pro-matches": "staff",
  "POST /api/esports/teams": "staff",
  "POST /api/esports/tournament/:id/check-in/resolve": "staff",
  "POST /api/esports/tournament/:id/check-in/window": "staff",
  "POST /api/esports/tournament/:id/phases": "staff",
  "POST /api/esports/tournament/:id/stations": "staff",
  "POST /api/esports/tournament/:id/streams": "staff",
  "POST /api/esports/tournament/:id/swiss/next-round": "staff",
  "POST /api/esports/tournaments": "staff",
  "POST /api/esports/tournaments/:id/register": "staff",
  "POST /api/games": "staff",
  "POST /api/games/collections": "staff",
  "POST /api/games/platforms": "staff",
  "POST /api/games/tags": "staff",
  "POST /api/media/config": "staff",
  "POST /api/media/config/test-storage": "staff",
  "POST /api/media/focal-point/:id": "staff",
  "POST /api/media/folders": "staff",
  "POST /api/media/upload": "staff",
  "POST /api/members/admin/access/revoke": "staff",
  "POST /api/shop/admin/products": "staff",
  "POST /api/streamers": "staff",
  "POST /api/streamers/sync/status": "staff",
  "PUT /api/builder/definitions": "staff",
  "PUT /api/cardsim/games": "staff",
  "PUT /api/esports/matches/:id": "staff",
  "PUT /api/maps/maps": "staff",
  // ── contenido (14) — Equipo o agente con `contenido:editar` (Inti).
  "DELETE /api/page-builder/blocks/:id": "contenido",
  "DELETE /api/page-builder/pages/:id": "contenido",
  "PATCH /api/games/:id/bloques/:bloqueId/editorial": "contenido",
  "PATCH /api/page-builder/blocks/:id": "contenido",
  "PATCH /api/page-builder/pages/:id": "contenido",
  "POST /api/page-builder/blocks/:id/duplicate": "contenido",
  "POST /api/page-builder/pages": "contenido",
  "POST /api/page-builder/pages/:id/clone": "contenido",
  "POST /api/page-builder/pages/:pageId/blocks": "contenido",
  "POST /api/page-builder/pages/:pageId/blocks/reorder": "contenido",
  "POST /api/page-builder/pages/from-block": "contenido",
  "POST /api/page-builder/templates": "contenido",
  "POST /api/page-builder/templates/:id/use": "contenido",
  "PUT /api/games/:id/bloques/orden": "contenido",
  // ── admin (487) — Solo admin.
  "DELETE /api/academy/archivos/:id": "admin",
  "DELETE /api/academy/asignaciones/:id": "admin",
  "DELETE /api/academy/cursos/:id": "admin",
  "DELETE /api/academy/grupos/:id": "admin",
  "DELETE /api/academy/grupos/:id/miembros/:userId": "admin",
  "DELETE /api/academy/grupos/:id/supervisores/:supervisorId": "admin",
  "DELETE /api/academy/learning-paths/:id": "admin",
  "DELETE /api/academy/learning-paths/:id/cursos/:cursoId": "admin",
  "DELETE /api/academy/modulos/:id": "admin",
  "DELETE /api/academy/opciones/:id": "admin",
  "DELETE /api/academy/preguntas/:id": "admin",
  "DELETE /api/academy/quizzes/:id": "admin",
  "DELETE /api/academy/temas/:id": "admin",
  "DELETE /api/actions/:id": "admin",
  "DELETE /api/admin/agents/:id": "admin",
  "DELETE /api/admin/agents/:id/keys/:keyId": "admin",
  "DELETE /api/admin/data-sources/:id": "admin",
  "DELETE /api/admin/queue/:id": "admin",
  "DELETE /api/admin/rate-limits/:key": "admin",
  "DELETE /api/admin/secrets/:key": "admin",
  "DELETE /api/admin/vault/:collection": "admin",
  "DELETE /api/admin/vault/:collection/columns/:column": "admin",
  "DELETE /api/admin/vault/:collection/rows/:id": "admin",
  "DELETE /api/agile/projects/:id/members/:userId": "usuario",
  "DELETE /api/booking/blackout/:blackoutId": "staff",
  "DELETE /api/booking/rooms/:id": "admin",
  "DELETE /api/brain/notes/:id": "admin",
  "DELETE /api/conta/accounts/:id": "admin",
  "DELETE /api/conta/counterparties/:id": "admin",
  "DELETE /api/conta/disbursements/:id": "admin",
  "DELETE /api/conta/journals/:id": "admin",
  "DELETE /api/conta/matters/:id": "admin",
  "DELETE /api/conta/permisos/:userId": "admin",
  "DELETE /api/conta/templates/:id": "admin",
  "DELETE /api/crm/activities/:id": "staff",
  "DELETE /api/crm/companies/:id": "admin",
  "DELETE /api/crm/contacts/:id": "admin",
  "DELETE /api/crm/deals/:id": "admin",
  "DELETE /api/crm/documents/:id": "staff",
  "DELETE /api/crm/pipelines/:id": "admin",
  "DELETE /api/crm/stages/:id": "admin",
  "DELETE /api/datasets/:id": "admin",
  "DELETE /api/directory/employees/:id": "admin",
  "DELETE /api/dms/comments/:commentId": "usuario",
  "DELETE /api/dms/diagrams/:diagramId": "usuario",
  "DELETE /api/dms/documents/:id": "usuario",
  "DELETE /api/explorer/:collection/:id": "admin",
  "DELETE /api/explorer/:collection/views/:viewId": "admin",
  "DELETE /api/functions/:id": "admin",
  "DELETE /api/items/:collection/:id": "admin",
  "DELETE /api/keys/:id": "admin",
  "DELETE /api/modules/:key": "admin",
  "DELETE /api/newsletter/suppressions/:email": "admin",
  "DELETE /api/system/active-theme": "admin",
  "DELETE /api/system/grimoires/:id": "admin",
  "DELETE /api/v1/agents/:id": "admin",
  "DELETE /api/v1/identities/:id": "admin",
  "GET /admin/activity": "admin",
  "GET /admin/logs": "admin",
  "GET /admin/metrics": "admin",
  "GET /admin/metrics/prometheus": "admin",
  "GET /admin/realtime": "admin",
  "GET /admin/slo": "admin",
  "GET /admin/stats": "admin",
  "GET /admin/telemetry/tools": "admin",
  "GET /admin/traces": "admin",
  "GET /admin/traces/:id": "admin",
  "GET /admin/traces/:id/steps": "admin",
  "GET /api/academy/asignaciones": "admin",
  "GET /api/academy/asignaciones/:id": "admin",
  "GET /api/academy/cursos/:id/estadisticas": "admin",
  "GET /api/academy/dashboard": "admin",
  "GET /api/academy/encuestas": "admin",
  "GET /api/academy/encuestas/:id": "admin",
  "GET /api/academy/encuestas/estadisticas": "admin",
  "GET /api/academy/exportar/asignaciones": "admin",
  "GET /api/academy/exportar/encuestas": "admin",
  "GET /api/academy/exportar/progreso": "admin",
  "GET /api/academy/learning-paths/:id/estadisticas": "admin",
  "GET /api/academy/perfiles": "admin",
  "GET /api/academy/reportes/cursos": "admin",
  "GET /api/academy/reportes/progreso": "admin",
  "GET /api/academy/reportes/usuarios/:id": "admin",
  "GET /api/academy/sync/mapeo-roles": "admin",
  "GET /api/actions": "admin",
  "GET /api/actions/:id": "admin",
  "GET /api/actions/:id/executions": "admin",
  "GET /api/actions/stats/overview": "admin",
  "GET /api/admin/agents": "admin",
  "GET /api/admin/agents/:id": "admin",
  "GET /api/admin/agents/:id/chat/history": "admin",
  "GET /api/admin/agents/:id/logs": "admin",
  "GET /api/admin/agents/:id/notify": "admin",
  "GET /api/admin/agents/:id/stats": "admin",
  "GET /api/admin/agents/:id/traces": "admin",
  "GET /api/admin/agents/logs": "admin",
  "GET /api/admin/agents/traces/:traceId/steps": "admin",
  "GET /api/admin/data-sources": "admin",
  "GET /api/admin/data-sources/:id": "admin",
  "GET /api/admin/queue": "admin",
  "GET /api/admin/rate-limits": "admin",
  "GET /api/admin/requests": "admin",
  "GET /api/admin/requests/summary": "admin",
  "GET /api/admin/registry": "admin",
  "GET /api/admin/registry/:konId": "admin",
  "GET /api/admin/registry/:konId/schema/:table": "admin",
  "GET /api/admin/secrets": "admin",
  "GET /api/admin/vault": "admin",
  "GET /api/agile/:projectId/cycles": "usuario",
  "GET /api/agile/:projectId/intakes": "usuario",
  "GET /api/agile/:projectId/issues": "usuario",
  "GET /api/agile/:projectId/modules": "usuario",
  "GET /api/agile/issues/:key": "usuario",
  "GET /api/agile/issues/:key/comments": "usuario",
  "GET /api/agile/projects": "usuario",
  "GET /api/agile/projects/:id": "usuario",
  "GET /api/agile/projects/:id/members": "usuario",
  "GET /api/agile/projects/:projectId/board": "usuario",
  "GET /api/booking/amenities": "usuario",
  "GET /api/booking/availability": "usuario",
  "GET /api/booking/bookings": "usuario",
  "GET /api/booking/bookings/:id": "usuario",
  "GET /api/booking/my-bookings": "usuario",
  "GET /api/booking/rooms": "usuario",
  "GET /api/booking/rooms/:id": "usuario",
  "GET /api/booking/rooms/:id/blackout": "usuario",
  "GET /api/booking/rooms/:id/slots": "usuario",
  "GET /api/brain/graph": "admin",
  "GET /api/brain/graph/:id/neighborhood": "admin",
  "GET /api/brain/lint": "admin",
  "GET /api/brain/llms.txt": "admin",
  "GET /api/brain/notes": "admin",
  "GET /api/brain/notes/:id": "admin",
  "GET /api/brain/notes/:id/similar": "admin",
  "GET /api/brain/schema": "admin",
  "GET /api/brain/sources": "admin",
  "GET /api/brain/sources/:id": "admin",
  "GET /api/brain/status": "admin",
  "GET /api/brain/wiki": "admin",
  // Memoria de agentes (2026-10-28): el equipo; un agente, con brain:read /
  // brain:write (o admin). Quién ve qué nota lo decide la RLS por dueño.
  "GET /api/brain/memory/search": "staff",
  "GET /api/brain/memory/notes": "staff",
  "PUT /api/brain/memory/notes": "staff",
  "GET /api/brain/memory/notes/:id": "staff",
  "DELETE /api/brain/memory/notes/:id": "staff",
  "GET /api/brain/memory/notes/:id/connections": "staff",
  "POST /api/brain/memory/connections": "staff",
  "GET /api/brain/memory/claims": "staff",
  "POST /api/brain/memory/claims": "staff",
  "POST /api/brain/memory/claims/:id/verify": "staff",
  "POST /api/brain/memory/lint": "staff",
  "GET /api/brain/memory/export/okf": "staff",
  "POST /api/brain/memory/import/graphify": "staff",
  "GET /api/code-graph": "admin",
  "GET /api/code-graph/commit/:sha": "admin",
  "GET /api/code-graph/history": "admin",
  "GET /api/code-graph/outline": "admin",
  "GET /api/code-graph/path": "admin",
  "GET /api/code-graph/search": "admin",
  "GET /api/code-graph/semantic": "admin",
  "GET /api/code-graph/symbol/:name": "admin",
  "GET /api/code-graph/visualize": "admin",
  "GET /api/conta": "publica",
  "GET /api/conta/accounts": "admin",
  "GET /api/conta/accounts/:id": "admin",
  "GET /api/conta/counterparties": "admin",
  "GET /api/conta/counterparties/:id": "admin",
  "GET /api/conta/currencies": "admin",
  "GET /api/conta/disbursements": "admin",
  "GET /api/conta/disbursements/:id": "admin",
  "GET /api/conta/journals": "admin",
  "GET /api/conta/journals/:id": "admin",
  "GET /api/conta/matters": "admin",
  "GET /api/conta/matters/:id": "admin",
  "GET /api/conta/me": "admin",
  "GET /api/conta/permisos": "admin",
  "GET /api/conta/reports/balance-sheet": "admin",
  "GET /api/conta/reports/profit-loss": "admin",
  "GET /api/conta/reports/trial-balance": "admin",
  "GET /api/conta/t-account/:accountId": "admin",
  "GET /api/conta/templates": "admin",
  "GET /api/conta/templates/:id": "admin",
  "GET /api/conta/trust-balances": "admin",
  "GET /api/crm/activities": "staff",
  "GET /api/crm/activities/:id": "staff",
  "GET /api/crm/analytics/cycle-time": "staff",
  "GET /api/crm/companies": "staff",
  "GET /api/crm/companies/:id": "staff",
  "GET /api/crm/contacts": "staff",
  "GET /api/crm/contacts/:id": "staff",
  "GET /api/crm/deals": "staff",
  "GET /api/crm/deals/:id": "staff",
  "GET /api/crm/deals/:id/documents": "staff",
  "GET /api/crm/deals/:id/timeline": "staff",
  "GET /api/crm/entity-configs": "staff",
  "GET /api/crm/pipelines": "staff",
  "GET /api/crm/pipelines/:id": "staff",
  "GET /api/crm/pipelines/:id/kanban": "staff",
  "GET /api/crm/stats": "staff",
  "GET /api/datasets/indexes/stats": "admin",
  "GET /api/directory/departments": "usuario",
  "GET /api/directory/departments/:id": "usuario",
  "GET /api/directory/employees": "usuario",
  "GET /api/directory/employees/:id": "usuario",
  "GET /api/directory/employees/:id/documents": "usuario",
  "GET /api/directory/employees/:id/reporting-chain": "usuario",
  "GET /api/directory/org-chart": "usuario",
  "GET /api/directory/organizations": "usuario",
  "GET /api/directory/organizations/:id": "usuario",
  "GET /api/directory/positions": "usuario",
  "GET /api/directory/search": "usuario",
  "GET /api/directory/stats": "usuario",
  "GET /api/dms/audit-log": "admin",
  "GET /api/dms/categories": "usuario",
  "GET /api/dms/categories/:id/export/zip": "usuario",
  "GET /api/dms/categories/tree": "usuario",
  "GET /api/dms/documents": "usuario",
  "GET /api/dms/documents/:id": "usuario",
  "GET /api/dms/documents/:id/acknowledgments": "usuario",
  "GET /api/dms/documents/:id/backlinks": "usuario",
  "GET /api/dms/documents/:id/comments": "usuario",
  "GET /api/dms/documents/:id/versions": "usuario",
  "GET /api/dms/files/:fileId/download": "admin",
  "GET /api/dms/notifications": "usuario",
  "GET /api/dms/render/:slug": "usuario",
  "GET /api/dms/render/code/:code": "usuario",
  "GET /api/dms/search": "usuario",
  "GET /api/dms/stats": "usuario",
  "GET /api/dms/versions/:versionId": "usuario",
  "GET /api/dms/versions/:versionId/diagrams": "usuario",
  "GET /api/dms/versions/:versionId/export/html": "usuario",
  "GET /api/dms/versions/:versionId/export/md": "usuario",
  "GET /api/explorer/:collection": "admin",
  "GET /api/explorer/:collection/options": "admin",
  "GET /api/explorer/:collection/views": "admin",
  "GET /api/explorer/discover/:konId": "admin",
  "GET /api/explorer/schema/:kon": "admin",
  "GET /api/explorer/schema/:kon/:table": "admin",
  "GET /api/explorer/schema/json/:table": "admin",
  "GET /api/explorer/tables": "admin",
  "GET /api/functions": "admin",
  "GET /api/functions/:id": "admin",
  "GET /api/functions/:id/executions": "admin",
  "GET /api/functions/cron/status": "admin",
  "GET /api/generate-code/:collection": "admin",
  "GET /api/generate-code/collections": "admin",
  "GET /api/graphql": "admin",
  "GET /api/graphql/schema": "admin",
  "GET /api/items/:collection": "admin",
  "GET /api/items/:collection/:id": "admin",
  "GET /api/keys": "admin",
  "GET /api/mail": "admin",
  "GET /api/map": "admin",
  "GET /api/media/config": "admin",
  "GET /api/modules": "admin",
  "GET /api/modules/:key": "admin",
  "GET /api/modules/:key/check": "admin",
  "GET /api/newsletter/campaigns": "admin",
  "GET /api/newsletter/campaigns/:id/preview": "admin",
  "GET /api/newsletter/campaigns/:id/stats": "admin",
  "GET /api/newsletter/members": "admin",
  "GET /api/newsletter/newsletters": "admin",
  "GET /api/newsletter/segments": "admin",
  "GET /api/newsletter/suppressions": "admin",
  "GET /api/ocr-training/health": "publica",
  "GET /api/ocr-training/overview": "admin",
  "GET /api/ocr-training/vision-config": "admin",
  "GET /api/ocr/documents": "staff",
  "GET /api/ocr/documents/:jobId": "usuario",
  "GET /api/ocr/health": "publica",
  "GET /api/relations/:tableName": "admin",
  "GET /api/relations/:tableName/inlines/:parentId": "admin",
  "GET /api/relations/:tableName/inlines/config": "admin",
  "GET /api/runs": "admin",
  "GET /api/runs/:id": "admin",
  "GET /api/runs/stats": "admin",
  "GET /api/schema/search": "admin",
  "GET /api/schema/tables": "admin",
  "GET /api/schema/tables/:tableName": "admin",
  "GET /api/schema/tables/:tableName/admin-config": "admin",
  "GET /api/schema/tables/:tableName/related": "admin",
  "GET /api/search/stats": "admin",
  "GET /api/sistema/estado": "admin",
  "GET /api/sistema/usuarios": "admin",
  "GET /api/v1/agents": "admin",
  "GET /api/v1/agents/:id": "admin",
  "GET /api/v1/agents/:id/access": "admin",
  "GET /api/v1/agents/:id/keys": "admin",
  "GET /api/v1/agents/:id/quotas": "admin",
  "GET /api/v1/agents/:id/mcp-settings": "admin",
  "GET /api/v1/agents/:id/sponsor": "admin",
  "GET /api/v1/agent-access/catalog": "admin",
  "GET /api/v1/agent-friction": "admin",
  "GET /api/v1/identities": "admin",
  "GET /api/v1/identities/:id": "admin",
  "GET /api/v1/traces": "admin",
  "GET /api/v1/traces/:id": "admin",
  "GET /api/v1/traces/:id/steps": "admin",
  "GET /metrics": "admin",
  "PATCH /api/actions/:id": "admin",
  "PATCH /api/admin/vault/:collection/rows/:id": "admin",
  "PATCH /api/agile/issues/:key": "usuario",
  "PATCH /api/booking/bookings/:id": "usuario",
  "PATCH /api/booking/rooms/:id": "staff",
  "PATCH /api/conta/accounts/:id": "admin",
  "PATCH /api/conta/counterparties/:id": "admin",
  "PATCH /api/conta/journals/:id": "admin",
  "PATCH /api/conta/matters/:id": "admin",
  "PATCH /api/conta/templates/:id": "admin",
  "PATCH /api/crm/activities/:id": "staff",
  "PATCH /api/crm/companies/:id": "staff",
  "PATCH /api/crm/contacts/:id": "staff",
  "PATCH /api/crm/deals/:id": "staff",
  "PATCH /api/crm/entity-configs/:id": "admin",
  "PATCH /api/crm/pipeline-stages/:id/config": "admin",
  "PATCH /api/crm/pipelines/:id": "admin",
  "PATCH /api/crm/stages/:id": "admin",
  "PATCH /api/directory/employees/:id": "usuario",
  "PATCH /api/dms/comments/:commentId": "usuario",
  "PATCH /api/dms/diagrams/:diagramId": "usuario",
  "PATCH /api/dms/documents/:id": "usuario",
  "PATCH /api/dms/versions/:versionId": "usuario",
  "PATCH /api/explorer/:collection/:id": "admin",
  "PATCH /api/functions/:id": "admin",
  "PATCH /api/items/:collection/:id": "admin",
  "PATCH /api/modules/:key": "admin",
  "PATCH /api/ocr/documents/:jobId": "usuario",
  "PATCH /api/settings": "admin",
  "PATCH /api/sistema/usuarios/:id/rol": "admin",
  "PATCH /api/system/active-theme": "admin",
  "PATCH /api/v1/agents/:id": "admin",
  "PATCH /api/v1/identities/:id": "admin",
  "POST /api/academy/asignaciones": "admin",
  "POST /api/academy/asignaciones/multiple": "admin",
  "POST /api/academy/cursos": "admin",
  "POST /api/academy/grupos": "admin",
  "POST /api/academy/grupos/:id/miembros": "admin",
  "POST /api/academy/grupos/:id/supervisores": "admin",
  "POST /api/academy/learning-paths": "admin",
  "POST /api/academy/learning-paths/:id/asignar": "admin",
  "POST /api/academy/learning-paths/:id/cursos": "admin",
  "POST /api/academy/modulos": "admin",
  "POST /api/academy/modulos/reordenar": "admin",
  "POST /api/academy/perfiles": "admin",
  "POST /api/academy/preguntas/:id/opciones": "admin",
  "POST /api/academy/quizzes": "admin",
  "POST /api/academy/quizzes/:id/preguntas": "admin",
  "POST /api/academy/sync/usuarios": "admin",
  "POST /api/academy/sync/usuarios/csv": "admin",
  "POST /api/academy/temas": "admin",
  "POST /api/academy/temas/:id/archivos": "admin",
  "POST /api/academy/temas/reordenar": "admin",
  "POST /api/actions": "admin",
  "POST /api/actions/:id/execute": "admin",
  "POST /api/admin/agents": "admin",
  "POST /api/admin/agents/:id/chat": "admin",
  "POST /api/admin/agents/:id/keys": "admin",
  "POST /api/admin/agents/:id/notify/rotate": "admin",
  "POST /api/admin/queue/:id/retry": "admin",
  "POST /api/admin/data-sources": "admin",
  "POST /api/admin/data-sources/:id/sync": "admin",
  "POST /api/admin/data-sources/test": "admin",
  "POST /api/admin/registry/refresh": "admin",
  "POST /api/admin/secrets": "admin",
  "POST /api/admin/secrets/:key/inject": "admin",
  "POST /api/admin/secrets/reload": "admin",
  "POST /api/admin/vault": "admin",
  "POST /api/admin/vault/:collection/columns": "admin",
  "POST /api/admin/vault/:collection/rows": "admin",
  "POST /api/agile/:projectId/cycles": "usuario",
  "POST /api/agile/:projectId/intakes": "usuario",
  "POST /api/agile/:projectId/issues": "usuario",
  "POST /api/agile/:projectId/modules": "usuario",
  "POST /api/agile/agile_intakes/:id/approve": "usuario",
  "POST /api/agile/agile_intakes/:id/convert": "usuario",
  "POST /api/agile/agile_intakes/:id/decline": "usuario",
  "POST /api/agile/intakes/:intakeId/approve": "usuario",
  "POST /api/agile/intakes/:intakeId/decline": "usuario",
  "POST /api/agile/intakes/:intakeId/duplicate": "usuario",
  "POST /api/agile/issues/:key/comments": "usuario",
  "POST /api/agile/projects": "usuario",
  "POST /api/agile/projects/:id/members": "usuario",
  "POST /api/booking/amenities": "staff",
  "POST /api/booking/bookings": "usuario",
  "POST /api/booking/bookings/:id/cancel": "usuario",
  "POST /api/booking/bookings/:id/check-in": "usuario",
  "POST /api/booking/bookings/:id/check-out": "usuario",
  "POST /api/booking/bookings/:id/notes": "usuario",
  "POST /api/booking/rooms": "staff",
  "POST /api/booking/rooms/:id/blackout": "staff",
  "POST /api/brain/capture": "admin",
  "POST /api/brain/connections": "admin",
  "POST /api/brain/digest": "admin",
  "POST /api/brain/notes": "admin",
  "POST /api/brain/scan": "admin",
  "POST /api/brain/sources": "admin",
  "POST /api/brain/sync": "admin",
  "POST /api/brain/tree": "admin",
  "POST /api/brain/tree/retrieve": "admin",
  "POST /api/code-graph/edit/:op": "admin",
  "POST /api/conta/accounts": "admin",
  "POST /api/conta/counterparties": "admin",
  "POST /api/conta/currencies": "admin",
  "POST /api/conta/disbursements": "admin",
  "POST /api/conta/disbursements/:id/bill": "admin",
  "POST /api/conta/disbursements/:id/pay": "admin",
  "POST /api/conta/journals": "admin",
  "POST /api/conta/journals/:id/post": "admin",
  "POST /api/conta/journals/:id/reverse": "admin",
  "POST /api/conta/journals/validate": "admin",
  "POST /api/conta/matters": "admin",
  "POST /api/conta/seed": "admin",
  "POST /api/conta/templates": "admin",
  "POST /api/conta/templates/:id/apply": "admin",
  "POST /api/crm/activities": "staff",
  "POST /api/crm/activities/:id/complete": "staff",
  "POST /api/crm/companies": "staff",
  "POST /api/crm/contacts": "staff",
  "POST /api/crm/deals": "staff",
  "POST /api/crm/deals/:id/move": "staff",
  "POST /api/crm/deals/:id/validate-move": "staff",
  "POST /api/crm/deals/reorder": "staff",
  "POST /api/crm/documents": "staff",
  "POST /api/crm/entity-configs": "admin",
  "POST /api/crm/pipelines": "admin",
  "POST /api/crm/pipelines/:id/stages": "admin",
  "POST /api/datasets/:id/indexes/apply": "admin",
  "POST /api/datasets/batch": "admin",
  "POST /api/datasets/import": "admin",
  "POST /api/datasets/import/package": "admin",
  "POST /api/datasets/indexes/auto": "admin",
  "POST /api/datasets/indexes/report": "admin",
  "POST /api/datasets/query-debug/:tableName": "admin",
  "POST /api/datasets/query/:tableName": "admin",
  "POST /api/datasets/validate-query/:tableName": "admin",
  "POST /api/directory/departments": "admin",
  "POST /api/directory/employees": "admin",
  "POST /api/directory/employees/:id/documents": "admin",
  "POST /api/directory/organizations": "admin",
  "POST /api/directory/positions": "admin",
  "POST /api/dms/categories": "usuario",
  "POST /api/dms/comments/:commentId/resolve": "usuario",
  "POST /api/dms/documents": "usuario",
  "POST /api/dms/documents/:id/acknowledge": "usuario",
  "POST /api/dms/documents/:id/comments": "usuario",
  "POST /api/dms/documents/:id/relations": "usuario",
  "POST /api/dms/documents/:id/versions": "usuario",
  "POST /api/dms/documents/from-template/:templateId": "staff",
  "POST /api/dms/import": "usuario",
  "POST /api/dms/notifications/:id/read": "usuario",
  "POST /api/dms/notifications/read-all": "usuario",
  "POST /api/dms/versions/:versionId/diagrams": "usuario",
  "POST /api/dms/versions/:versionId/files": "admin",
  "POST /api/dms/versions/:versionId/publish": "usuario",
  "POST /api/dms/versions/:versionId/review": "usuario",
  "POST /api/dms/versions/:versionId/submit": "usuario",
  "POST /api/explorer/:collection": "admin",
  "POST /api/explorer/:collection/views": "admin",
  "POST /api/functions": "admin",
  "POST /api/functions/:id/execute": "admin",
  "POST /api/generate-code": "admin",
  "POST /api/graph/refresh": "admin",
  "POST /api/graphql": "admin",
  "POST /api/graphql/invalidate": "admin",
  "POST /api/items/:collection": "admin",
  "POST /api/items/:collection/query": "admin",
  "POST /api/keys": "admin",
  "POST /api/mail/preview": "admin",
  "POST /api/mail/test": "admin",
  "POST /api/modules/:key/recover": "admin",
  "POST /api/modules/:key/uninstall": "admin",
  "POST /api/newsletter/campaigns": "admin",
  "POST /api/newsletter/campaigns/:id/prepare": "admin",
  "POST /api/newsletter/campaigns/:id/send": "admin",
  "POST /api/newsletter/segments/preview": "admin",
  "POST /api/newsletter/suppressions": "admin",
  "POST /api/ocr-training/vision-config/test": "admin",
  "POST /api/ocr-training/vision-reprocess/:jobId": "admin",
  "POST /api/payments/portal": "usuario",
  "POST /api/relations/:tableName/inlines/:parentId": "admin",
  "POST /api/schema/refresh": "admin",
  "POST /api/search/index": "admin",
  "POST /api/search/init": "admin",
  "POST /api/sync/igdb/import/:igdbId": "admin",
  "POST /api/sync/igdb/search": "admin",
  "POST /api/sync/twitch/status": "admin",
  "POST /api/system/grimoire-state": "admin",
  "POST /api/system/setup": "restringida", // pública, pero con usuarios ya creados responde 403
  "POST /api/v1/agents": "admin",
  "POST /api/v1/agents/:id/playground": "admin",
  "POST /api/v1/agents/:id/token": "admin",
  "POST /api/v1/agents/:id/keys": "admin",
  "POST /api/v1/agents/:id/keys/:keyId/revoke": "admin",
  "POST /api/v1/agents/:id/keys/:keyId/rotate": "admin",
  "POST /api/v1/identities": "admin",
  "PUT /api/academy/asignaciones/:id": "admin",
  "PUT /api/academy/cursos/:id": "admin",
  "PUT /api/academy/grupos/:id": "admin",
  "PUT /api/academy/learning-paths/:id": "admin",
  "PUT /api/academy/learning-paths/:id/cursos/:cursoId": "admin",
  "PUT /api/academy/modulos/:id": "admin",
  "PUT /api/academy/opciones/:id": "admin",
  "PUT /api/academy/perfiles/:id/rol": "admin",
  "PUT /api/academy/preguntas/:id": "admin",
  "PUT /api/academy/quizzes/:id": "admin",
  "PUT /api/academy/temas/:id": "admin",
  "PUT /api/admin/agents/:id": "admin",
  "PUT /api/admin/agents/:id/notify": "admin",
  "PUT /api/admin/data-sources/:id": "admin",
  "PUT /api/conta/permisos/:userId": "admin",
  "PUT /api/ocr-training/vision-config": "admin",
  "PUT /api/v1/agents/:id/quotas": "admin",
  "PUT /api/v1/agents/:id/mcp-settings": "admin",
  "PUT /api/v1/agents/:id/sponsor": "admin",
  "PUT /api/v1/agents/:id/scopes": "admin",
  // ── restringida (15) — Ninguna de las seis identidades: rol o scope propio (instructor, agente con memory:*, token de invitado…).
  "DELETE /api/agent/memory/:id": "restringida",
  "DELETE /api/esports/public/tournament/:id/guest": "restringida",
  "GET /api/agent/memory": "restringida",
  "GET /api/agent/memory/:id": "restringida",
  "GET /api/agent/memory/key/:key": "restringida",
  "GET /api/agent/memory/stats": "restringida",
  "GET /api/esports/public/tournament/:id/guest": "restringida",
  "GET /api/mcp": "restringida",
  "GET /api/mcp/logs": "restringida",
  "POST /api/agent/memory": "restringida",
  "POST /api/agent/memory/cleanup": "restringida",
  "POST /api/agent/memory/search": "restringida",
  "POST /api/esports/public/tournament/:id/guest/check-in": "restringida",
  "POST /api/mcp": "restringida",
  "PUT /api/agent/memory/:id": "restringida",
  // ── middleware (52) — la transacción RLS que module-loader monta delante de
  // cada kon (`montarRlsDeKon`, 2026-10-23): `app.use(base)` y `app.use(base/*)`.
  // No autoriza nada; quién pasa lo deciden las rutas concretas, que se miden.
  "ALL /api/academy": "middleware",
  "ALL /api/agile": "middleware",
  "ALL /api/analytics": "middleware",
  "ALL /api/analytics/*": "middleware",
  "ALL /api/autobattler": "middleware",
  "ALL /api/blog": "middleware",
  // Transacción RLS de la memoria de agentes (montarRlsDeKon, index.ts)
  "ALL /api/brain/memory": "middleware",
  "ALL /api/brain/memory/*": "middleware",
  // Transacción RLS de la promoción de código (montarRlsDeKon, index.ts)
  "ALL /api/promotion": "middleware",
  "ALL /api/promotion/*": "middleware",
  "ALL /api/blog/*": "middleware",
  "ALL /api/booking": "middleware",
  "ALL /api/broadcast": "middleware",
  "ALL /api/broadcast/*": "middleware",
  "ALL /api/builder": "middleware",
  "ALL /api/builder/*": "middleware",
  "ALL /api/cardsim": "middleware",
  "ALL /api/cardsim/*": "middleware",
  "ALL /api/collection": "middleware",
  "ALL /api/comments": "middleware",
  "ALL /api/conta": "middleware",
  "ALL /api/crm": "middleware",
  "ALL /api/datasets": "middleware",
  "ALL /api/deckshow": "middleware",
  "ALL /api/directory": "middleware",
  "ALL /api/dms": "middleware",
  "ALL /api/esports": "middleware",
  "ALL /api/esports/*": "middleware",
  "ALL /api/formulas": "middleware",
  "ALL /api/formulas/*": "middleware",
  "ALL /api/games": "middleware",
  "ALL /api/games/*": "middleware",
  "ALL /api/handlab": "middleware",
  "ALL /api/ingesta": "middleware",
  "ALL /api/ingesta/*": "middleware",
  "ALL /api/maps": "middleware",
  "ALL /api/maps/*": "middleware",
  "ALL /api/media": "middleware",
  "ALL /api/media/*": "middleware",
  "ALL /api/members": "middleware",
  "ALL /api/members/*": "middleware",
  "ALL /api/newsletter": "middleware",
  "ALL /api/ocr": "middleware",
  "ALL /api/ocr-training": "middleware",
  "ALL /api/ocr-training/*": "middleware",
  "ALL /api/ocr/*": "middleware",
  "ALL /api/page-builder": "middleware",
  "ALL /api/page-builder/*": "middleware",
  "ALL /api/payments": "middleware",
  "ALL /api/payments/*": "middleware",
  "ALL /api/shop": "middleware",
  "ALL /api/shop/*": "middleware",
  "ALL /api/streamers": "middleware",
  "ALL /api/streamers/*": "middleware",
  "ALL /api/tierlist": "middleware",
  "ALL /api/tierlist/*": "middleware",
  "ALL /api/wiki": "middleware",
  "ALL /api/wiki/*": "middleware",
  // ── middleware (77) — app.use() registrados por prefijo: se miden con sus rutas concretas.
  "ALL /api/academy/*": "middleware",
  "ALL /api/actions/*": "middleware",
  "ALL /api/admin/*": "middleware",
  "ALL /api/admin/agents/*": "middleware",
  "ALL /api/admin/data-sources/*": "middleware",
  "ALL /api/admin/registry/*": "middleware",
  "ALL /api/admin/vault/*": "middleware",
  "ALL /api/agent/memory/*": "middleware",
  "ALL /api/agile/*": "middleware",
  "ALL /api/analytics/hit": "middleware",
  "ALL /api/autobattler/*": "middleware",
  "ALL /api/booking/*": "middleware",
  // Límite de intentos de la contraseña de sala (rateLimits del kon, fail-closed)
  "ALL /api/cardsim/sessions/:id/join": "middleware",
  "ALL /api/collection/*": "middleware",
  "ALL /api/comments/*": "middleware",
  "ALL /api/conta/*": "middleware",
  "ALL /api/crm/*": "middleware",
  "ALL /api/data-sets/:id/entries": "middleware",
  "ALL /api/data-sets/:slug/entries": "middleware",
  "ALL /api/datasets/*": "middleware",
  "ALL /api/datasets/:id/entries": "middleware",
  "ALL /api/datasets/:slug/entries": "middleware",
  "ALL /api/deckshow/*": "middleware",
  "ALL /api/directory/*": "middleware",
  "ALL /api/dms/*": "middleware",
  // Límites de peticiones de kon-esports (rateLimits del kon, auditoría
  // 2026-10-25): cuentan; quién entra lo decide la ruta concreta.
  "ALL /api/esports/match/:matchId/report": "middleware",
  "ALL /api/esports/public/teams": "middleware",
  "ALL /api/esports/public/teams/:id/invites": "middleware",
  "ALL /api/esports/public/tournament/:id/register": "middleware",
  "ALL /api/esports/public/tournament/:id/register-guest": "middleware",
  "ALL /api/esports/public/tournament/:id/register-team": "middleware",
  "ALL /api/explorer/*": "middleware",
  "ALL /api/functions/*": "middleware",
  "ALL /api/graph/*": "middleware",
  "ALL /api/handlab/*": "middleware",
  "ALL /api/handlab/datasets/:slug/random-deck": "middleware",
  "ALL /api/handlab/goldfish": "middleware",
  "ALL /api/handlab/hands": "middleware",
  "ALL /api/items/*": "middleware",
  // `exigirAdmin` sobre la ruta base (auditoría 2026-10-25: rol fresco)
  "ALL /api/keys": "middleware",
  "ALL /api/keys/*": "middleware",
  "ALL /api/mail/*": "middleware",
  "ALL /api/mcp/*": "middleware",
  // Límite de transformaciones de kon-media (auditoría 2026-10-25)
  "ALL /api/media/transform/:id": "middleware",
  "ALL /api/newsletter/*": "middleware",
  "ALL /api/newsletter/confirm": "middleware",
  "ALL /api/newsletter/subscribe": "middleware",
  "ALL /api/newsletter/unsubscribe": "middleware",
  "ALL /api/ocr-training/yomi/*": "middleware",
  "ALL /api/ocr/gateway/*": "middleware",
  "ALL /api/relations/*": "middleware",
  "ALL /api/runs/*": "middleware",
  "ALL /api/schema/*": "middleware",
  "ALL /api/shop/orders": "middleware",
  // `exigirAdmin` sobre la ruta base (auditoría 2026-10-25: rol fresco)
  "ALL /api/sistema": "middleware",
  "ALL /api/sistema/*": "middleware",
  "ALL /api/v1/*": "middleware",
};
