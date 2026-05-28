/**
 * Gremio CMS — Page Builder Routes (DI Version)
 *
 * REST API for dynamic page layouts with block-based content.
 * Full CRUD for pages, blocks, and templates with render endpoint.
 *
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * - db → ctx.dbInstance.instance
 * - cachedQuery/invalidateCache → ctx.cache
 * - requireAuth → ctx.auth.requireAuth
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Factory function that creates Blocks/Page Builder routes with dependency injection
 */
export declare function createBlocksRouter(ctx: GrimoireContext): Hono;
export declare const blocksRoutes: typeof createBlocksRouter;
//# sourceMappingURL=blocks.routes.d.ts.map