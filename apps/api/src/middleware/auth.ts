/**
 * Authentication Middleware
 *
 * Provides route protection and role-based access control for API routes.
 */

/**
 * Desde el módulo, NO desde el índice de `@kitsuden/engine`.
 *
 * El índice del engine reexporta piezas de la API —entre ellas el cargador de
 * kons, que importa este fichero—. Importar de ahí crea un ciclo: este módulo
 * se evalúa mientras el engine aún se está cargando, y `withRouteMeta` vale
 * `undefined` en la línea que lo llama. `route-meta` no importa nada en
 * ejecución, así que desde aquí no hay ciclo posible.
 */
import { withRouteMeta } from "@kitsuden/engine/src/route-meta";
import { createMiddleware } from "hono/factory";

import { auth } from "../lib/auth";

import { agentePuedeActuarComoUsuario, MENSAJE_AGENTE_SIN_CUENTA } from "./agente-como-usuario";
// @ts-ignore - Type import used for JSDoc/context typing

/**
 * Middleware to require authentication
 * Injects user and session into context
 */
export const requireAuth = withRouteMeta(
  createMiddleware(async (c, next) => {
    /**
     * ── UN AGENTE YA AUTENTICADO NO NECESITA COOKIE ───────────────────────
     *
     * El middleware global de `index.ts` verifica `Bearer kitsuden_agent_*`
     * (hash argon2, agente activo, límite de peticiones) y deja `agent` y
     * `user` en el contexto. Pero esto solo miraba la sesión por cookie, así
     * que CUALQUIER ruta de kon respondía 401 a un agente con token válido.
     *
     * Se reconoce solo cuando está `agent`, que únicamente pone esa
     * verificación. Las claves legacy `kitsuden_sk_*` no dejan `agent`, así que
     * no ganan acceso a nada que no tuvieran — ya pasaron su fecha de retirada.
     */
    const agente = (c as unknown as { get(clave: string): unknown }).get("agent");
    const usuario = (c as unknown as { get(clave: string): unknown }).get("user");
    if (agente && usuario) {
      // No cualquier clave: ver middleware/agente-como-usuario.ts
      if (!agentePuedeActuarComoUsuario(c)) {
        return c.json({ error: MENSAJE_AGENTE_SIN_CUENTA }, 403);
      }
      await next();
      return;
    }

    /**
     * ── UNA SESIÓN HUMANA YA RESUELTA NO SE PISA ──────────────────────────
     *
     * El middleware global de `index.ts` ya resolvió la sesión por cookie y,
     * para admin y editor, releyó el rol de la base (`disableCookieCache`).
     * Volver a llamar aquí a `getSession` (con la caché en cookie de 5 min) y
     * sobrescribir `user` devolvía el rol VIEJO: un admin degradado seguía
     * siéndolo en `/api/graph` (Graphify) hasta 5 minutos (F74). Si hay
     * `user` Y `session` (solo los pone una sesión humana), se respeta.
     */
    const sesionPrevia = (c as unknown as { get(clave: string): unknown }).get("session");
    if (usuario && sesionPrevia) {
      await next();
      return;
    }

    let session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized - Authentication required" }, 401);
    }

    // Rutas montadas ANTES del middleware global: el rol privilegiado se relee
    // de la base, no de la caché en cookie (la misma regla que index.ts).
    if (esRolPrivilegiado((session.user as { role?: unknown } | undefined)?.role)) {
      session = await auth.api.getSession({
        headers: c.req.raw.headers,
        query: { disableCookieCache: true },
      });
      if (!session) {
        return c.json({ error: "Unauthorized - Authentication required" }, 401);
      }
    }

    // Inject user/session into context
    c.set("user", session.user);
    c.set("session", session.session);

    await next();
  }),
  { auth: "required" }
);

/** Los roles que abren algo más que lo propio: su valor nunca sale de la caché en cookie. */
function esRolPrivilegiado(rol: unknown): boolean {
  return rol === "admin" || rol === "editor";
}

/**
 * Middleware factory to require specific roles
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export const requireRole = (allowedRoles: string[]) =>
  createMiddleware(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized - Authentication required" }, 401);
    }

    const user = session.user;
    const userRole = (user?.role as string) || "user";

    if (!allowedRoles.includes(userRole)) {
      return c.json(
        {
          error: "Forbidden - Insufficient permissions",
          required: allowedRoles,
          current: userRole,
        },
        403
      ) as unknown as Response;
    }

    // Inject user/session into context
    c.set("user", user);
    c.set("session", session.session);

    await next();
  });

/**
 * Optional auth middleware - sets user if available but doesn't reject
 */
export const optionalAuth = withRouteMeta(
  createMiddleware(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (session) {
      c.set("user", session.user);
      c.set("session", session.session);
    }

    await next();
  }),
  { auth: "optional" }
);
