/**
 * @gremius/grimoire-streamers — Streamer Management (Modern)
 *
 * Streamer management with Twitch/YouTube/Kick sync:
 * - Streamers (profiles, platform integration)
 * - Game associations (what they play)
 * - Live status tracking
 *
 * Layer: Grimoire Core (Nivel 3 — loaded via module-loader)
 * Mount: /api/streamers
 *
 * @version 1.0.0
 */
import type { GrimoireDefinition, GrimoireContext } from "@gremius/shared";
import { Hono } from "hono";
import { createStreamersRouter } from "./streamers.routes";
export * from "./streamers.schema";
export declare function createGrimoireStreamers(ctx: GrimoireContext): Hono;
export { createStreamersRouter };
export declare const grimoire: GrimoireDefinition;
export default grimoire;
export declare const streamersModuleRoutes: typeof createGrimoireStreamers;
//# sourceMappingURL=index.d.ts.map