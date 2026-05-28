/**
 * @gremius/grimoire-games — Game Library & IGDB Integration (Modern)
 *
 * Game library management with:
 * - Games (IGDB integration, metadata)
 * - Platforms (PC, Console, Mobile)
 * - Tags (genre, feature, topic)
 * - Collections (curated sections)
 *
 * Layer: Grimoire Core (Nivel 3 — loaded via module-loader)
 * Mount: /api/games
 *
 * @version 1.0.0
 */
import type { GrimoireDefinition, GrimoireContext } from "@gremius/shared";
import { Hono } from "hono";
import { createGamesRouter } from "./games.routes";
export * from "./games.schema";
export declare function createGrimoireGames(ctx: GrimoireContext): Hono;
export { createGamesRouter };
export declare const grimoire: GrimoireDefinition;
export default grimoire;
export declare const gamesModuleRoutes: typeof createGrimoireGames;
//# sourceMappingURL=index.d.ts.map