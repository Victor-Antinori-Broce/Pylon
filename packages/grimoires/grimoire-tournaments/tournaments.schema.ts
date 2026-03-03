/**
 * Gremio CMS — Tournaments Module Schema
 */

import {
    pgTable,
    uuid,
    varchar,
    integer,
    timestamp,
    uniqueIndex,
    pgEnum,
} from "drizzle-orm/pg-core";
import { relations, isNotNull } from "drizzle-orm";

import { games } from "../grimoire-games/games.schema";
import { players } from "../grimoire-players/players.schema";
import { teams } from "../grimoire-teams/teams.schema";

export const tournamentFormatEnum = pgEnum("tournament_format", ["1v1", "Team"]);
export const tournamentStatusEnum = pgEnum("tournament_status", [
    "Draft",
    "Open",
    "InProgress",
    "Completed"
]);
export const participantStatusEnum = pgEnum("participant_status", [
    "Pending",
    "Approved",
    "Rejected"
]);

export const tournaments = pgTable(
    "tournaments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        title: varchar("title", { length: 200 }).notNull(),
        gameId: uuid("game_id")
            .references(() => games.id, { onDelete: "restrict" })
            .notNull(),
        format: tournamentFormatEnum("format").default("1v1").notNull(),
        maxParticipants: integer("max_participants").notNull(),
        status: tournamentStatusEnum("status").default("Draft").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    }
);

export const tournamentParticipants = pgTable(
    "tournament_participants",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        tournamentId: uuid("tournament_id")
            .references(() => tournaments.id, { onDelete: "cascade" })
            .notNull(),
        playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
        teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
        status: participantStatusEnum("status").default("Pending").notNull(),
        registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        // Ensuring a player or team does not register multiple times in the same tournament
        uniqueIndex("tp_player_unique").on(t.tournamentId, t.playerId).where(isNotNull(t.playerId)),
        uniqueIndex("tp_team_unique").on(t.tournamentId, t.teamId).where(isNotNull(t.teamId)),
    ]
);

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
    game: one(games, { fields: [tournaments.gameId], references: [games.id] }),
    participants: many(tournamentParticipants),
}));

export const tournamentParticipantsRelations = relations(tournamentParticipants, ({ one }) => ({
    tournament: one(tournaments, { fields: [tournamentParticipants.tournamentId], references: [tournaments.id] }),
    player: one(players, { fields: [tournamentParticipants.playerId], references: [players.id] }),
    team: one(teams, { fields: [tournamentParticipants.teamId], references: [teams.id] }),
}));
