/**
 * @gremius/grimoire-esports — Esports Tournament System (Modern)
 *
 * Complete esports competitive ecosystem with:
 * - Players (profiles, management)
 * - Teams (rosters, organization)
 * - Tournaments (bracket generation)
 * - Matches (tracking, results)
 *
 * Layer: Grimoire Core (Nivel 3 — loaded via module-loader)
 * Mount: /api/esports
 *
 * @version 1.0.0
 */
import type { GrimoireDefinition, GrimoireContext } from "@gremius/shared";
import { Hono } from "hono";
import { createEsportsRouter } from "./esports.routes";
export * from "./esports.schema";
export declare function createGrimoireEsports(ctx: GrimoireContext): Hono;
export { createEsportsRouter };
export declare const grimoire: GrimoireDefinition;
export default grimoire;
export declare const esportsModuleRoutes: typeof createGrimoireEsports;
//# sourceMappingURL=index.d.ts.map