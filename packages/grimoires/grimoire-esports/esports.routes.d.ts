/**
 * Esports Module — Dependency Injection Wrapper
 *
 * All routes refactored to use GrimoireContext for DI
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Create Esports router with dependency injection
 */
export declare function createEsportsRouter(ctx: GrimoireContext): Hono;
export declare const playersRoutes: any;
export declare const teamsRoutes: any;
export declare const tournamentsRoutes: any;
export declare const matchesRoutes: any;
//# sourceMappingURL=esports.routes.d.ts.map