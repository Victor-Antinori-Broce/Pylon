import {
  abreKonEntero,
  concedePorScopes,
  denegacionDeOperacion,
  denegacionQueCubre,
  nombreCortoDeKon,
} from "@kitsuden/shared";
import { createMiddleware } from "hono/factory";

import { operacionDeRuta } from "../../../../packages/engine/src/operaciones";
import { auth } from "../lib/auth";
import { konDeCamino } from "../lib/rutas-de-kons";

import { agentePuedeActuarComoUsuario, MENSAJE_AGENTE_SIN_CUENTA } from "./agente-como-usuario";

/**
 * Protect Route Middleware
 *
 * Supports both:
 * 1. Human authentication (Better-Auth cookies)
 * 2. Agent authentication (kitsuden_agent_ API keys)
 *
 * Priority: Agent > Human (for API routes that support both)
 */

export const protectRoute = createMiddleware(async (c, next) => {
  // 1. Check if already authenticated as agent (from main auth middleware)
  const agent = c.get("agent");
  if (agent) {
    // Autenticado en el middleware global; pero una clave no es una cuenta
    // por serlo (ver middleware/agente-como-usuario.ts)
    if (!agentePuedeActuarComoUsuario(c)) {
      return c.json({ error: "Forbidden", message: MENSAJE_AGENTE_SIN_CUENTA }, 403);
    }
    await next();
    return;
  }

  // 2. Check if already authenticated as user (from main auth middleware)
  const user = c.get("user");
  if (user) {
    // User is already authenticated
    await next();
    return;
  }

  // 3. Try Better-Auth session
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session) {
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
    return;
  }

  // 4. No authentication found
  return c.json(
    {
      error: "Unauthorized",
      message: "Valid session or agent API key required",
    },
    401
  );
});

/**
 * Require Admin Middleware
 * Checks for admin role (users) or appropriate scopes (agents)
 */
export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user");
  const agent = c.get("agent");

  // Human admin
  if (user && (user.role as string) === "admin") {
    await next();
    return;
  }

  // Agent with admin scope
  if (agent && agent.scopes.includes("admin")) {
    await next();
    return;
  }

  return c.json(
    {
      error: "Forbidden",
      message: "Admin access required",
    },
    403
  );
});

/**
 * Require Scope Middleware (for agent-specific routes)
 */
export const requireScope = (scope: string) =>
  createMiddleware(async (c, next) => {
    const agent = c.get("agent");

    if (!agent) {
      return c.json(
        {
          error: "Forbidden",
          message: "Agent authentication required",
        },
        403
      );
    }

    if (!agent.scopes.includes(scope) && !agent.scopes.includes("admin")) {
      return c.json(
        {
          error: "Forbidden",
          message: `Scope '${scope}' required`,
          granted: agent.scopes,
        },
        403
      );
    }

    await next();
  });

/**
 * Exige uno de estos roles, valga donde valga el middleware.
 *
 * `requireAdmin` mira `c.get("user")`, que pone el middleware global de
 * `index.ts`. Las rutas montadas ANTES de ese middleware (observabilidad en
 * `/`, `/api/admin/rate-limits`, `/api/search`, `/api/system`) nunca lo
 * tienen, así que allí `requireAdmin` denegaría siempre y `requireAuth` solo
 * pedía sesión — de cualquiera, y el alta es abierta. Esto resuelve la sesión
 * por su cuenta si hace falta.
 *
 * Un agente pasa solo con el scope `admin` (igual que `requireAdmin`).
 */
/**
 * Rol FRESCO de la sesión, sin la caché en cookie de better-auth.
 *
 * `session.cookieCache` (5 min) guarda el usuario —con su rol— firmado en una
 * cookie, y `getSession` lo devuelve sin mirar la base. Así, a quien se le
 * quitaba el rol de admin (o se le cerraban las sesiones) seguía entrando al
 * panel hasta 5 minutos (auditoría 2026-10-15). En las rutas con puerta de rol
 * se relee la sesión de la base: una consulta indexada, solo en rutas del
 * panel. Inyectable para las pruebas.
 */
type RefrescoDeSesion = (headers: Headers) => Promise<{ role?: string } | null>;

let refrescoDeSesion: RefrescoDeSesion = async (headers) => {
  const fresca = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  return (fresca?.user as { role?: string } | undefined) ?? null;
};

export function setRefrescoDeSesion(fn: RefrescoDeSesion): void {
  refrescoDeSesion = fn;
}

export function exigirRol(roles: readonly string[], scopeDeAgente?: string) {
  return createMiddleware(async (c, next) => {
    const agent = c.get("agent") as { scopes?: string[] } | undefined;
    if (agent?.scopes?.includes("admin")) {
      await next();
      return;
    }
    // Coincidencia EXACTA: ni comodines (`contenido:*`) ni el scope de otra regla.
    if (scopeDeAgente && agent?.scopes?.includes(scopeDeAgente)) {
      await next();
      return;
    }

    let user = c.get("user") as { role?: string } | null | undefined;
    if (!user) {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (session) {
        c.set("user", session.user);
        c.set("session", session.session);
        user = session.user as { role?: string };
      }
    }

    if (!user) return c.json({ error: "Unauthorized", message: "Session required" }, 401);

    // Un usuario de sesión humana (no agente, que se autentica en cada
    // petición contra la base): su rol, de la base y no de la caché en cookie.
    if (!agent && c.get("session")) {
      const fresco = await refrescoDeSesion(c.req.raw.headers);
      if (!fresco) return c.json({ error: "Unauthorized", message: "Session required" }, 401);
      user = { ...user, role: fresco.role };
    }

    if (!roles.includes(user.role ?? "")) {
      return c.json({ error: "Forbidden", message: "Insufficient role" }, 403);
    }
    await next();
  });
}

/** Solo `admin`. */
export const exigirAdmin = exigirRol(["admin"]);
/** Quien edita contenido del sitio: `admin` o `editor` (los mismos que las políticas de los kons). */
export const exigirStaff = exigirRol(["admin", "editor"]);

export interface ReglaDePuerta {
  /** `/api/items` cubre `/api/items` y `/api/items/...`, no `/api/itemsx`. */
  prefijo: string;
  /** Vacío = todos los métodos. */
  metodos?: string[];
  /** Si está, además del prefijo el camino tiene que casar con esto. */
  patron?: RegExp;
  /**
   * Por defecto `admin`. `sesion`: cualquier cuenta con sesión (o un agente
   * que pueda actuar como usuario aquí, ver `agente-como-usuario.ts`); para los
   * kons que se autorizan solos con sus políticas y su RLS.
   */
  rol?: "admin" | "staff" | "sesion";
  /**
   * Un agente con ESTE scope pasa además de los del rol (y de `admin`). Solo lo
   * llevan las reglas que lo necesitan: ver `SCOPE_CONTENIDO`.
   */
  scopeDeAgente?: string;
  /**
   * `true`: el scope de TODO el kon (`<kon>:*`) no abre esta regla. Para las
   * rutas de un kon que leen fuera del kon (`/api/blog/source` devuelve una
   * fila de CUALQUIER tabla): `blog:*` es todo el blog, no toda la base.
   */
  sinScopeDeKon?: boolean;
}

/**
 * El scope de agente que edita contenido del sitio SIN ser admin: la capa
 * editorial de los bloques de juego y las páginas del constructor. Es lo que
 * usa Inti (`INTI_KITSUDEN_TOKEN`) para escribir. No abre NADA más: solo lo
 * aceptan las reglas de `RUTAS_SOLO_ADMIN` que llevan `scopeDeAgente`.
 */
export const SCOPE_CONTENIDO = "contenido:editar";

const ESCRITURA = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Lo que es del PANEL y de nadie más.
 *
 * Todo esto se montaba con `requireAuth`/`protectRoute` (cualquier cuenta: el
 * alta es abierta) o sin nada. Auditoría del 2026-10-12, comprobado contra
 * producción: `GET /api/items/authSessions` devolvía SIN SESIÓN los tokens de
 * sesión, `authAccounts` los hashes de contraseña, `PATCH /api/settings` y
 * `/api/modules` (incluido `DELETE ?purge=true`, que hace DROP TABLE) no
 * pedían nada, `/api/functions`/`/api/actions` ejecutaban código en el
 * servidor para cualquier usuario, y cualquier cuenta podía reescribir, borrar
 * o publicar entradas del blog, páginas, juegos o streamers. Ni el sitio
 * público ni el SDK usan estas rutas para escribir; el panel entra como admin.
 */
export const RUTAS_SOLO_ADMIN: ReglaDePuerta[] = [
  // ── Núcleo ──
  { prefijo: "/api/items" },
  { prefijo: "/api/modules" },
  { prefijo: "/api/functions" },
  { prefijo: "/api/actions" },
  { prefijo: "/api/relations" },
  { prefijo: "/api/v1" },
  { prefijo: "/api/explorer" },
  { prefijo: "/api/generate-code" },
  { prefijo: "/api/schema" },
  { prefijo: "/api/map" },
  { prefijo: "/api/code-graph" },
  // Memoria de agentes (2026-10-28): operaciones del SDK con dueño y RLS. El
  // EQUIPO (admin, editor) entra; un agente, solo con los scopes de cada
  // operación (brain:read / brain:write / kon:brain:<op>). ANTES de la general:
  // gana la primera que casa. Lo demás de /api/brain sigue siendo solo admin.
  { prefijo: "/api/brain/memory", rol: "staff" },
  { prefijo: "/api/brain" },
  { prefijo: "/api/sync" },
  { prefijo: "/api/graphql" },
  { prefijo: "/api/datasets/batch" },
  { prefijo: "/api/settings", metodos: ESCRITURA },
  // Fase F: bandeja y configuración de la aprobación humana. El equipo; la
  // configuración, solo admin, y NINGÚN agente (ni con `admin`): lo cierran
  // las propias rutas (`soloHumanos`, routes/aprobaciones.ts).
  { prefijo: "/api/approvals", rol: "staff" },
  // Fase H3: descriptores de los modelos (defineModelo) para el panel. Las
  // rutas de CADA modelo viven bajo su kon y deciden por su permiso.
  { prefijo: "/api/models", rol: "staff" },
  // Fase I: promoción de código. Solo admin humano; un agente, solo con los
  // scopes de cada operación (promotion:propose / kon:promotion:<op>). La
  // ACTIVACIÓN, además, solo desde una propuesta aprobada (routes/promocion.ts).
  { prefijo: "/api/promotion" },

  // ── Contenido del sitio (kons activos): lo escribe el equipo ──
  { prefijo: "/api/blog", metodos: ESCRITURA, rol: "staff" },
  {
    prefijo: "/api/page-builder",
    metodos: ESCRITURA,
    rol: "staff",
    scopeDeAgente: SCOPE_CONTENIDO,
  },
  { prefijo: "/api/media", metodos: ESCRITURA, rol: "staff" },
  // La capa editorial de los bloques de un juego (Inti). ANTES de la regla
  // general de `/api/games`: gana la primera que casa, y la general no admite
  // el scope de contenido (con él no se cambia el slug ni se borra un juego).
  {
    prefijo: "/api/games",
    metodos: ["PATCH"],
    patron: /^\/api\/games\/[^/]+\/bloques\/[^/]+\/editorial\/?$/,
    rol: "staff",
    scopeDeAgente: SCOPE_CONTENIDO,
  },
  {
    prefijo: "/api/games",
    metodos: ["PUT"],
    patron: /^\/api\/games\/[^/]+\/bloques\/orden\/?$/,
    rol: "staff",
    scopeDeAgente: SCOPE_CONTENIDO,
  },
  { prefijo: "/api/games", metodos: ESCRITURA, rol: "staff" },
  { prefijo: "/api/streamers", metodos: ESCRITURA, rol: "staff" },
  { prefijo: "/api/esports/pro-matches", metodos: ESCRITURA, rol: "staff" },
  // Definiciones de juego y catálogo del simulador (los mazos y partidas de cada
  // usuario, no): PUT /games, POST /games/:slug/cards y /sync-catalog.
  {
    prefijo: "/api/cardsim/games",
    metodos: ESCRITURA,
    patron: /^\/api\/cardsim\/games(\/[^/]+\/(cards|sync-catalog))?\/?$/,
    rol: "staff",
  },
  { prefijo: "/api/autobattler/sets/import", rol: "staff" },
  // El blog guarda la fila de origen entera (cualquier tabla) y la devuelve aquí.
  { prefijo: "/api/blog/source", rol: "staff", sinScopeDeKon: true },

  // ── Kons internos (CRM, RR. HH., reservas…) ──
  // Sus rutas trataban "tener cuenta" como "ser del equipo" (y algunas leían
  // datos personales sin sesión). Revisados en la tanda de seguridad del
  // 2026-10-15 y medidos con `scripts/matriz-de-autorizacion.ts --sin-parches`:
  //   - conta, agile, dms, ocr-training, ocr y payments/portal se autorizan
  //     solos (policies + RLS propia) y ya no están aquí;
  //   - el CRM no tiene aislamiento por organización: es del equipo entero;
  //   - los ficheros del DMS van al almacén PÚBLICO de /media con URL
  //     permanente: solo admin hasta que el núcleo tenga almacén privado.
  //   - reservas y directorio (decisión del propietario, arreglos de la fase
  //     D, 2026-10-25): abiertos a quien tenga SESIÓN, y deciden sus políticas
  //     y su RLS. En booking cada usuario reserva y ve SUS reservas, y el equipo
  //     (admin + editor, decisión del 2026-10-26) gestiona salas y todas las
  //     reservas (solo el admin borra salas); en el directorio cada empleado edita
  //     los campos PERSONALES de SU ficha (no puesto, departamento, jefe…:
  //     kon-directory/directory.routes.ts `CamposPersonales` y el disparador
  //     de la migración 0002) y el admin gestiona el resto. Un anónimo, 401:
  //     antes de esto no llegaba a ninguno de los dos.
  //   En todas estas, un agente con el scope de TODO el kon (`crm:*`,
  //   `kon:crm:*`) pasa la puerta de SU kon: `konAbiertoPorScope`.
  { prefijo: "/api/crm", rol: "staff" },
  { prefijo: "/api/directory", rol: "sesion" },
  { prefijo: "/api/booking", rol: "sesion" },
  {
    prefijo: "/api/dms",
    patron: /^\/api\/dms\/(versions\/[^/]+\/files|files\/[^/]+\/download)\/?$/,
  },
];

/** Las que se montan antes del middleware global de sesión (ver `exigirRol`). */
export const RUTAS_SOLO_ADMIN_TEMPRANAS: ReglaDePuerta[] = [
  { prefijo: "/admin" },
  { prefijo: "/api/admin/rate-limits" },
  { prefijo: "/api/search/index" },
  { prefijo: "/api/search/init" },
  // Menos `POST /api/system/setup`: crea el PRIMER admin y solo funciona con
  // cero usuarios (lo comprueba la ruta). Con la puerta delante, una
  // instalación nueva no podía darse de alta nunca: 401 sin nadie a quien
  // pedir sesión (lo encontró la matriz de autorización, 2026-10-15).
  { prefijo: "/api/system", metodos: ESCRITURA, patron: /^\/api\/system(?!\/setup\/?$)/ },
];

export function cubrePrefijo(prefijo: string, camino: string): boolean {
  return camino === prefijo || camino.startsWith(`${prefijo}/`);
}

/** La regla que toca a esta petición, si alguna. */
export function reglaPara(
  reglas: readonly ReglaDePuerta[],
  metodo: string,
  camino: string
): ReglaDePuerta | null {
  const m = metodo.toUpperCase();
  if (m === "OPTIONS") return null;
  const limpio = camino.replace(/\/{2,}/g, "/");
  return (
    reglas.find(
      (r) =>
        cubrePrefijo(r.prefijo, limpio) &&
        (!r.metodos || r.metodos.includes(m)) &&
        (!r.patron || r.patron.test(limpio))
    ) ?? null
  );
}

/**
 * ¿Abre un scope del AGENTE la operación del SDK que atiende esta petición?
 * (Decisión del propietario, fase E: las puertas por prefijo aceptan permisos
 * finos.) Solo la operación que es: `kon:blog:crear-entrada` abre
 * `POST /api/blog` y nada más del blog. Las rutas legadas (sin operación del
 * SDK) siguen con su regla de siempre.
 */
export function operacionAbiertaPorScopeFino(
  scopes: readonly string[] | undefined,
  metodo: string,
  camino: string
): boolean {
  if (!scopes?.length) return false;
  const deRuta = operacionDeRuta(metodo, camino);
  if (!deRuta) return false;
  return concedePorScopes(scopes, deRuta.konId, deRuta.op).concedido;
}

/**
 * ¿Abren los scopes del AGENTE el kon ENTERO que sirve este camino? (Decisión
 * del propietario, arreglos de la fase D: `<kon>:*` da todo el kon, también
 * sus rutas legadas.) Solo SU kon: `crm:*` abre /api/crm y nada más; una ruta
 * del núcleo (/api/items, /api/v1…) no es de ningún kon y no se abre así.
 * La regla (literales `<kon>:*` / `kon:<kon>:*`, `kon:*` no; una denegación
 * gana) es la de `abreKonEntero` en @kitsuden/shared.
 */
export function konAbiertoPorScope(scopes: readonly string[] | undefined, camino: string): boolean {
  if (!scopes?.length) return false;
  const kon = konDeCamino(camino.replace(/\/{2,}/g, "/"));
  return kon !== null && abreKonEntero(scopes, nombreCortoDeKon(kon));
}

/**
 * `rol: "sesion"`: una cuenta con sesión, o un agente que pueda actuar como
 * usuario en ESTA ruta (la regla de `agente-como-usuario.ts`: `usuario:actuar`,
 * `admin` o un scope del kon). Lo demás lo deciden las políticas del kon.
 */
export const exigirSesion = createMiddleware(async (c, next) => {
  if (c.get("agent")) {
    if (!agentePuedeActuarComoUsuario(c)) {
      return c.json({ error: "Forbidden", message: MENSAJE_AGENTE_SIN_CUENTA }, 403);
    }
    await next();
    return;
  }
  if (!c.get("user")) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized", message: "Session required" }, 401);
    c.set("user", session.user);
    c.set("session", session.session);
  }
  await next();
});

/** Aplica la puerta que corresponda (admin, staff o sesión) y deja pasar el resto. */
export function puertaDeAdmin(reglas: readonly ReglaDePuerta[]) {
  return createMiddleware(async (c, next) => {
    const regla = reglaPara(reglas, c.req.method, c.req.path);
    if (!regla) return next();
    const agente = c.get("agent") as { scopes?: string[] } | undefined;
    if (agente && operacionAbiertaPorScopeFino(agente.scopes, c.req.method, c.req.path)) {
      c.set("agenteAbiertoPorPuerta" as never, true as never);
      return next();
    }
    if (agente && !regla.sinScopeDeKon && konAbiertoPorScope(agente.scopes, c.req.path)) {
      c.set("agenteAbiertoPorPuerta" as never, true as never);
      return next();
    }
    if (regla.rol === "sesion") return exigirSesion(c, next);
    if (regla.scopeDeAgente) {
      const roles = regla.rol === "staff" ? ["admin", "editor"] : ["admin"];
      if (agente?.scopes?.includes(regla.scopeDeAgente)) {
        c.set("agenteAbiertoPorPuerta" as never, true as never);
      }
      return exigirRol(roles, regla.scopeDeAgente)(c, next);
    }
    return (regla.rol === "staff" ? exigirStaff : exigirAdmin)(c, next);
  });
}

/**
 * Las DENEGACIONES del agente (`!patrón`) en las rutas que no las miran por sí
 * mismas. Va tras la autenticación y ANTES de las puertas:
 *
 *   · una operación del SDK denegada (`!kon:blog:borrar-entrada`,
 *     `!kon:blog:*`, `!blog:*`) → 403, aunque sea pública o el agente traiga
 *     `admin` (la operación lo comprueba también; esto corta antes de leer el
 *     cuerpo y cubre las rutas a las que la operación no llega);
 *   · una ruta LEGADA de un kon cuyo kon entero está denegado (`!kon:crm:*`,
 *     `!crm:*`) → 403. Una denegación de UNA operación no puede cerrar una
 *     ruta legada: no se sabe a qué operación corresponde.
 *
 * Lo demás (datasets, herramientas MCP) lo deciden sus propios puntos de
 * control con la misma regla de shared.
 */
export const denegacionesDeAgente = createMiddleware(async (c, next) => {
  const agente = c.get("agent") as { scopes?: string[] } | undefined;
  const scopes = agente?.scopes;
  if (!scopes?.some((s) => s.startsWith("!"))) return next();
  const deRuta = operacionDeRuta(c.req.method, c.req.path);
  let motivo: string | null = null;
  if (deRuta) {
    motivo = denegacionDeOperacion(scopes, deRuta.konId, deRuta.op);
  } else {
    const kon = konDeCamino(c.req.path);
    if (kon) {
      const corto = nombreCortoDeKon(kon);
      // El comodín de operación «*» solo lo cubre una denegación de TODO el kon.
      motivo = denegacionQueCubre(scopes, [`kon:${corto}:*`, `${corto}:*`]);
    }
  }
  if (!motivo) return next();
  return c.json(
    { error: "Forbidden", message: `Denied for this agent key by '${motivo}'`, code: "FORBIDDEN" },
    403
  );
});
