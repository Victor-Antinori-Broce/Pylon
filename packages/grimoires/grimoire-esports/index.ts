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
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";
import { createEsportsRouter } from "./esports.routes";

// Re-export schema for schema-merger
export * from "./esports.schema";

// ═══════════════════════════════════════════════════════════════════════════════
// Tables
// ═══════════════════════════════════════════════════════════════════════════════

const tables = [
  "esports_players",
  "esports_teams",
  "esports_players_to_teams",
  "esports_tournaments",
  "esports_tournament_participants",
  "esports_matches",
];

// ═══════════════════════════════════════════════════════════════════════════════
// Router Factory
// ═══════════════════════════════════════════════════════════════════════════════

export function createGrimoireEsports(ctx: GrimoireContext): Hono {
  return createEsportsRouter(ctx);
}

// Re-export DI wrapper (legacy compatibility)
export { createEsportsRouter };

// ═══════════════════════════════════════════════════════════════════════════════
// Grimoire Definition
// ═══════════════════════════════════════════════════════════════════════════════

export const grimoire: GrimoireDefinition = defineGrimoire({
  id: "grimoire-esports",
  name: "Esports Tournaments",
  version: "1.0.0",
  description: "Complete esports competitive ecosystem with players, teams, tournaments, and matches",
  icon: "Trophy",
  mountPath: "/api/esports",
  createRouter: createGrimoireEsports,

  tables,

  admin: {
    category: "gaming",
    views: [
      { id: "tournaments", type: "grid", title: "Tournaments", table: "esports_tournaments" },
      { id: "players", type: "grid", title: "Players", table: "esports_players" },
      { id: "teams", type: "grid", title: "Teams", table: "esports_teams" },
      { id: "matches", type: "grid", title: "Matches", table: "esports_matches" },
    ],
  },

  dependencies: {
    grimoires: ["grimoire-games", "grimoire-media"], // Needs games for tournament game selection, media for avatars/logos
    core: ["auth"],
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("🏆 Esports grimoire initialized");

      // Verify required tables
      const requiredTables = ["esports_players", "esports_teams", "esports_tournaments", "esports_matches"];
      const missingTables: string[] = [];

      for (const table of requiredTables) {
        const exists = await ctx.db.tableExists(table);
        if (!exists) {
          missingTables.push(table);
        }
      }

      if (missingTables.length > 0) {
        ctx.logger.warn(`⚠️ Esports tables not found: ${missingTables.join(", ")}`);
      } else {
        ctx.logger.info("✅ All esports tables verified");
      }
    },

    onEnable: async (ctx) => {
      ctx.logger.info("🏆 Esports grimoire enabled");
    },

    onDisable: async (ctx) => {
      ctx.logger.info("🏆 Esports grimoire disabled");
    },
  },
});

// Default export
export default grimoire;

// Legacy exports for compatibility
export const esportsModuleRoutes = createGrimoireEsports;
