/**
 * Gremio CMS — Games Module Routes (DI Version)
 *
 * REST API for game library management with IGDB sync support.
 *
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * ENHANCED: Now includes grimoire-media transform URLs for cover art and screenshots
 *
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Factory function that creates Games routes with dependency injection
 */
export declare function createGamesRouter(ctx: GrimoireContext): Hono;
export { createGamesRouter as gamesRoutes };
//# sourceMappingURL=games.routes.d.ts.map