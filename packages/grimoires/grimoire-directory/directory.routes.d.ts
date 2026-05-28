/**
 * Gremio CMS — Employee Directory Routes
 *
 * REST API for employee profiles, departments, positions,
 * and organizational hierarchy.
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Factory function that creates Directory routes with dependency injection
 */
export declare function createDirectoryRouter(ctx: GrimoireContext): Hono;
export { createDirectoryRouter as directoryRoutes };
//# sourceMappingURL=directory.routes.d.ts.map