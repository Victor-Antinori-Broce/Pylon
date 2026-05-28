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
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";
import { createGamesRouter } from "./games.routes";
// Re-export schema for schema-merger
export * from "./games.schema";
// ═══════════════════════════════════════════════════════════════════════════════
// Tables
// ═══════════════════════════════════════════════════════════════════════════════
const tables = [
    "games",
    "platforms",
    "tags",
    "game_collections",
    "game_collection_entries",
    "games_to_platforms",
    "games_to_tags",
];
// ═══════════════════════════════════════════════════════════════════════════════
// Router Factory
// ═══════════════════════════════════════════════════════════════════════════════
export function createGrimoireGames(ctx) {
    const app = new Hono();
    // Mount all routes with DI
    app.route("/", createGamesRouter(ctx));
    return app;
}
// Re-export router creator (legacy compatibility)
export { createGamesRouter };
// ═══════════════════════════════════════════════════════════════════════════════
// Grimoire Definition
// ═══════════════════════════════════════════════════════════════════════════════
export const grimoire = defineGrimoire({
    id: "grimoire-games",
    name: "Game Library",
    version: "2.1.0",
    description: "Game library with IGDB integration, collections, screenshots, and trailers. Enhanced with grimoire-media support for cover art transforms, focal points, and optimized image delivery.",
    icon: "Gamepad2",
    mountPath: "/api/games",
    createRouter: createGrimoireGames,
    tables,
    admin: {
        category: "gaming",
        views: [
            { id: "games", type: "grid", title: "Games", table: "games" },
            { id: "platforms", type: "grid", title: "Platforms", table: "platforms" },
            { id: "tags", type: "grid", title: "Tags", table: "tags" },
            { id: "collections", type: "grid", title: "Collections", table: "game_collections" },
        ],
    },
    dependencies: {
        grimoires: ["grimoire-media"], // Needs media for cover art, screenshots
        core: ["auth"],
    },
    hooks: {
        onStartup: async (ctx) => {
            ctx.logger.info("🎮 Games grimoire initialized");
            // Verify required tables
            const requiredTables = ["games", "platforms", "tags"];
            const missingTables = [];
            for (const table of requiredTables) {
                const exists = await ctx.db.tableExists(table);
                if (!exists) {
                    missingTables.push(table);
                }
            }
            if (missingTables.length > 0) {
                ctx.logger.warn(`⚠️ Games tables not found: ${missingTables.join(", ")}`);
            }
            else {
                ctx.logger.info("✅ All games tables verified");
            }
        },
        onEnable: async (ctx) => {
            ctx.logger.info("🎮 Games grimoire enabled");
        },
        onDisable: async (ctx) => {
            ctx.logger.info("🎮 Games grimoire disabled");
        },
    },
});
// Default export
export default grimoire;
// Legacy exports for compatibility
export const gamesModuleRoutes = createGrimoireGames;
//# sourceMappingURL=index.js.map