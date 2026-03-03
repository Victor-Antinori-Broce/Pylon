/**
 * Gremio CMS — Teams Module Schema
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { players } from "../grimoire-players/players.schema";

export const teams = pgTable(
    "teams",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: varchar("name", { length: 200 }).notNull(),
        logoUrl: text("logo_url"),
        captainId: uuid("captain_id").references(() => players.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [uniqueIndex("teams_name_idx").on(t.name)]
);

export const playersToTeams = pgTable(
    "players_to_teams",
    {
        playerId: uuid("player_id")
            .references(() => players.id, { onDelete: "cascade" })
            .notNull(),
        teamId: uuid("team_id")
            .references(() => teams.id, { onDelete: "cascade" })
            .notNull(),
    },
    (t) => [uniqueIndex("pt_unique").on(t.playerId, t.teamId)]
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
    captain: one(players, { fields: [teams.captainId], references: [players.id] }),
    members: many(playersToTeams),
}));

export const playersToTeamsRelations = relations(playersToTeams, ({ one }) => ({
    player: one(players, { fields: [playersToTeams.playerId], references: [players.id] }),
    team: one(teams, { fields: [playersToTeams.teamId], references: [teams.id] }),
}));
