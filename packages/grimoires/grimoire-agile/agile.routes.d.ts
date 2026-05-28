/**
 * Grimoire Agile — API Routes (DI Version)
 *
 * REST API for agile project management with Dependency Injection.
 *
 * IMPORTANT: Route order matters! Specific routes must come before parameterized ones.
 * Correct order:
 *   1. /projects/* (all project routes)
 *   2. /issues/:key, /intakes/:id/* (specific entity routes)
 *   3. /:projectId/* (parameterized project routes)
 *
 * @version 1.1.1
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Create Agile Router with Dependency Injection
 */
export declare function createAgileRouter(ctx: GrimoireContext): Hono;
//# sourceMappingURL=agile.routes.d.ts.map