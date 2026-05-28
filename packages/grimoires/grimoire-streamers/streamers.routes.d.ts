/**
 * Gremio CMS — Streamers Module Routes (DI Version)
 *
 * REST API for streamer management with Twitch/YouTube/Kick sync.
 *
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 *
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Factory function that creates Streamers routes with dependency injection
 */
export declare function createStreamersRouter(ctx: GrimoireContext): Hono;
export { createStreamersRouter as streamersRoutes };
//# sourceMappingURL=streamers.routes.d.ts.map