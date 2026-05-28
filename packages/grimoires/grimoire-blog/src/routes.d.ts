/**
 * Grimoire Blog — API Routes
 *
 * Router Hono autocontenido que recibe dependencias vía contexto inyectado.
 *
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 * Example: `/source/:postId` must come before `/:id`
 */
import type { GrimoireRouterFactory } from "@gremius/shared";
/**
 * Factory que crea el router de blog con contexto inyectado
 */
export declare const createBlogRouter: GrimoireRouterFactory;
//# sourceMappingURL=routes.d.ts.map