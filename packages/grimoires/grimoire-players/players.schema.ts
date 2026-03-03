/**
 * Gremio CMS — Players Module Schema
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    jsonb,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { playersToTeams } from "../grimoire-teams/teams.schema";

export const players = pgTable(
    "players",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        alias: varchar("alias", { length: 200 }).notNull(),
        avatarUrl: text("avatar_url"),
        bio: text("bio"),
        socialLinks: jsonb("social_links").$type<Record<string, string>>(),
        coreUserId: uuid("core_user_id"), // Optional core user link
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [uniqueIndex("players_alias_idx").on(t.alias)]
);

export const playersRelations = relations(players, ({ many }) => ({
    teams: many(playersToTeams),
}));
