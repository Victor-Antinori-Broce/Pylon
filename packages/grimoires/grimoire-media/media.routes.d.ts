/**
 * Media Library Routes
 *
 * REST API endpoints for file uploads and media management.
 *
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 * Example: `/folders` must come before `/:id`
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Create Media router with DI
 */
export declare function createMediaRouter(ctx: GrimoireContext): Hono;
//# sourceMappingURL=media.routes.d.ts.map