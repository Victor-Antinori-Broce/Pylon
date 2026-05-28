/**
 * Admin Registry API
 *
 * Exposes auto-discovered grimoire admin configurations
 * for the frontend to consume without hardcoding.
 *
 * GET /api/admin/registry — Get all grimoire admin configs
 * GET /api/admin/registry/:grimoireId — Get specific grimoire config
 * POST /api/admin/registry/refresh — Clear cache and rebuild
 */
import { Hono } from "hono";
export declare const adminRegistryRoutes: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=admin-registry.d.ts.map