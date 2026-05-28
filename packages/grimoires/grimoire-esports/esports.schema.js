/**
 * Gremio CMS — Esports Module Schema
 *
 * Consolidated schema for players, teams, tournaments, and matches.
 * All esports competitive features in one grimoire.
 */
import { pgTable, uuid, varchar, text, integer, timestamp, uniqueIndex, pgEnum, } from "drizzle-orm/pg-core";
import { relations, isNotNull } from "drizzle-orm";
// ═══════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════
export const tournamentFormatEnum = pgEnum("esports_tournament_format", ["1v1", "Team"]);
export const tournamentStatusEnum = pgEnum("esports_tournament_status", [
    "Draft",
    "Open",
    "InProgress",
    "Completed"
]);
export const participantStatusEnum = pgEnum("esports_participant_status", [
    "Pending",
    "Approved",
    "Rejected"
]);
export const matchStatusEnum = pgEnum("esports_match_status", [
    "Pending",
    "Ready",
    "InProgress",
    "Completed"
]);
// ═══════════════════════════════════════════════
// Players Table
// ═══════════════════════════════════════════════
export const players = pgTable("esports_players", {
    id: uuid("id").primaryKey().defaultRandom(),
    alias: varchar("alias", { length: 200 }).notNull(),
    avatarId: uuid("avatar_id"),
    bio: text("bio"),
    socialLinks: text("social_links"), // JSON string
    coreUserId: uuid("core_user_id"), // Optional core user link
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("players_alias_idx").on(t.alias)]);
// ═══════════════════════════════════════════════
// Teams Table
// ═══════════════════════════════════════════════
export const teams = pgTable("esports_teams", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    logoId: uuid("logo_id"),
    captainId: uuid("captain_id").references(() => players.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("teams_name_idx").on(t.name)]);
// ═══════════════════════════════════════════════
// Players to Teams Junction Table
// ═══════════════════════════════════════════════
export const playersToTeams = pgTable("esports_players_to_teams", {
    playerId: uuid("player_id")
        .references(() => players.id, { onDelete: "cascade" })
        .notNull(),
    teamId: uuid("team_id")
        .references(() => teams.id, { onDelete: "cascade" })
        .notNull(),
}, (t) => [uniqueIndex("pt_unique").on(t.playerId, t.teamId)]);
// ═══════════════════════════════════════════════
// Tournaments Table
// ═══════════════════════════════════════════════
export const tournaments = pgTable("esports_tournaments", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 200 }).notNull(),
    gameId: uuid("game_id").notNull(), // References games.id from grimoire-games
    format: tournamentFormatEnum("format").default("1v1").notNull(),
    maxParticipants: integer("max_participants").notNull(),
    status: tournamentStatusEnum("status").default("Draft").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════
// Tournament Participants Table
// ═══════════════════════════════════════════════
export const tournamentParticipants = pgTable("esports_tournament_participants", {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
        .references(() => tournaments.id, { onDelete: "cascade" })
        .notNull(),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    status: participantStatusEnum("status").default("Pending").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    // Ensuring a player or team does not register multiple times in the same tournament
    uniqueIndex("tp_player_unique").on(t.tournamentId, t.playerId).where(isNotNull(t.playerId)),
    uniqueIndex("tp_team_unique").on(t.tournamentId, t.teamId).where(isNotNull(t.teamId)),
]);
// ═══════════════════════════════════════════════
// Matches Table
// ═══════════════════════════════════════════════
export const matches = pgTable("esports_matches", {
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
    nextMatchId: uuid("next_match_id"), // Self-referential
    // Results
    participant1Score: integer("participant_1_score").default(0).notNull(),
    participant2Score: integer("participant_2_score").default(0).notNull(),
    winnerId: uuid("winner_id").references(() => tournamentParticipants.id, { onDelete: "set null" }),
    status: matchStatusEnum("status").default("Pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════
// Relations
// ═══════════════════════════════════════════════
export const esportsPlayersRelations = relations(players, ({ many }) => ({
    teams: many(playersToTeams),
}));
export const esportsTeamsRelations = relations(teams, ({ one, many }) => ({
    captain: one(players, { fields: [teams.captainId], references: [players.id] }),
    members: many(playersToTeams),
}));
export const esportsPlayersToTeamsRelations = relations(playersToTeams, ({ one }) => ({
    player: one(players, { fields: [playersToTeams.playerId], references: [players.id] }),
    team: one(teams, { fields: [playersToTeams.teamId], references: [teams.id] }),
}));
export const esportsTournamentsRelations = relations(tournaments, ({ many }) => ({
    participants: many(tournamentParticipants),
    matches: many(matches),
}));
export const esportsTournamentParticipantsRelations = relations(tournamentParticipants, ({ one }) => ({
    tournament: one(tournaments, { fields: [tournamentParticipants.tournamentId], references: [tournaments.id] }),
    player: one(players, { fields: [tournamentParticipants.playerId], references: [players.id] }),
    team: one(teams, { fields: [tournamentParticipants.teamId], references: [teams.id] }),
}));
export const esportsMatchesRelations = relations(matches, ({ one }) => ({
    tournament: one(tournaments, { fields: [matches.tournamentId], references: [tournaments.id] }),
    participant1: one(tournamentParticipants, { fields: [matches.participant1Id], references: [tournamentParticipants.id] }),
    participant2: one(tournamentParticipants, { fields: [matches.participant2Id], references: [tournamentParticipants.id] }),
    winner: one(tournamentParticipants, { fields: [matches.winnerId], references: [tournamentParticipants.id] }),
    nextMatch: one(matches, { fields: [matches.nextMatchId], references: [matches.id] }),
}));
//# sourceMappingURL=esports.schema.js.map