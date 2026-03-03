/**
 * Gremio CMS — Matches Module Schema
 */

import {
    pgTable,
    uuid,
    integer,
    timestamp,
    pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { tournaments, tournamentParticipants } from "../grimoire-tournaments/tournaments.schema";

export const matchStatusEnum = pgEnum("match_status", [
    "Pending", // Waiting for previous matches to finish
    "Ready",   // Both participants are known and can play
    "InProgress",
    "Completed"
]);

export const matches = pgTable("matches", {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
        .references(() => tournaments.id, { onDelete: "cascade" })
        .notNull(),

    // Bracket positioning
    round: integer("round").notNull(), // 1, 2, 3...
    matchOrder: integer("match_order").notNull(), // Position within the round (1, 2, 3...)

    // Participants
    participant1Id: uuid("participant_1_id").references(() => tournamentParticipants.id, { onDelete: "set null" }),
    participant2Id: uuid("participant_2_id").references(() => tournamentParticipants.id, { onDelete: "set null" }),

    // Link to the NEXT match they will advance to
    nextMatchId: uuid("next_match_id"), // Self-referential, implemented via relations below

    // Results
    participant1Score: integer("participant_1_score").default(0).notNull(),
    participant2Score: integer("participant_2_score").default(0).notNull(),
    winnerId: uuid("winner_id").references(() => tournamentParticipants.id, { onDelete: "set null" }),

    status: matchStatusEnum("status").default("Pending").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matchesRelations = relations(matches, ({ one }) => ({
    tournament: one(tournaments, { fields: [matches.tournamentId], references: [tournaments.id] }),
    participant1: one(tournamentParticipants, { fields: [matches.participant1Id], references: [tournamentParticipants.id] }),
    participant2: one(tournamentParticipants, { fields: [matches.participant2Id], references: [tournamentParticipants.id] }),
    winner: one(tournamentParticipants, { fields: [matches.winnerId], references: [tournamentParticipants.id] }),
    nextMatch: one(matches, { fields: [matches.nextMatchId], references: [matches.id] }),
}));
