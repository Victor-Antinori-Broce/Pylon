/**
 * Modules API Routes
 *
 * Returns modules organized by category:
 *   - core: Official Gremius BaaS features (toggleable)
 *   - optional: Enterprise/vertical features (toggleable)
 *   - realm: Bundled with active realm (auto-loaded) — DYNAMIC
 *   - uninstalled: Grimoires with preserved data (can recover or purge)
 *
 * GET    /api/modules              — list all modules with categories
 * GET    /api/modules/:key         — get a single module by key
 * GET    /api/modules/:key/check   — can this module be disabled?
 * PATCH  /api/modules/:key         — toggle enabled / update settings
 * POST   /api/modules/:key/uninstall — uninstall but preserve data
 * POST   /api/modules/:key/recover   — recover uninstalled grimoire
 * DELETE /api/modules/:key         — delete grimoire and its data
 */
import { Hono } from "hono";
export declare const modulesRoutes: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=modules.d.ts.map