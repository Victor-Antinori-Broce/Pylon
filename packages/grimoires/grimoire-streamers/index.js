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
import { defineGrimoire } from "@gremius/shared";
import { createStreamersRouter } from "./streamers.routes";
// Re-export schema for schema-merger
export * from "./streamers.schema";
// ═══════════════════════════════════════════════════════════════════════════════
// Tables
// ═══════════════════════════════════════════════════════════════════════════════
const tables = [
    "streamers",
    "games_to_streamers",
];
// ═══════════════════════════════════════════════════════════════════════════════
// Router Factory
// ═══════════════════════════════════════════════════════════════════════════════
export function createGrimoireStreamers(ctx) {
    return createStreamersRouter(ctx);
}
// Re-export router creator (legacy compatibility)
export { createStreamersRouter };
// ═══════════════════════════════════════════════════════════════════════════════
// Grimoire Definition
// ═══════════════════════════════════════════════════════════════════════════════
export const grimoire = defineGrimoire({
    id: "grimoire-streamers",
    name: "Streamers",
    version: "1.0.0",
    description: "Streamer management with Twitch/YouTube/Kick sync and game associations",
    icon: "Video",
    mountPath: "/api/streamers",
    createRouter: createGrimoireStreamers,
    tables,
    admin: {
        category: "gaming",
        views: [
            { id: "streamers", type: "grid", title: "Streamers", table: "streamers" },
        ],
    },
    dependencies: {
        grimoires: ["grimoire-games", "grimoire-media"], // Needs games and media
        core: ["auth"],
    },
    hooks: {
        onStartup: async (ctx) => {
            ctx.logger.info("📺 Streamers grimoire initialized");
            // Verify required tables
            const requiredTables = ["streamers", "games_to_streamers"];
            const missingTables = [];
            for (const table of requiredTables) {
                const exists = await ctx.db.tableExists(table);
                if (!exists) {
                    missingTables.push(table);
                }
            }
            if (missingTables.length > 0) {
                ctx.logger.warn(`⚠️ Streamers tables not found: ${missingTables.join(", ")}`);
            }
            else {
                ctx.logger.info("✅ All streamers tables verified");
            }
        },
        onEnable: async (ctx) => {
            ctx.logger.info("📺 Streamers grimoire enabled");
        },
        onDisable: async (ctx) => {
            ctx.logger.info("📺 Streamers grimoire disabled");
        },
    },
});
// Default export
export default grimoire;
// Legacy exports for compatibility
export const streamersModuleRoutes = createGrimoireStreamers;
//# sourceMappingURL=index.js.map