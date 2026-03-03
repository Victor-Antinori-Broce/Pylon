/**
 * Gremio CMS — Streamers Module Schema
 * 
 * Drizzle ORM schema for streamers and game associations.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { games } from "../grimoire-games/games.schema";

// ═══════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════

export const streamerPlatformEnum = pgEnum("streamer_platform", [
  "twitch",
  "youtube",
  "kick",
]);

// ═══════════════════════════════════════════════
// Streamers Table
// ═══════════════════════════════════════════════

export const streamers = pgTable(
  "streamers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    platform: streamerPlatformEnum("platform").notNull(),
    channelId: varchar("channel_id", { length: 200 }).notNull(),
    channelUrl: text("channel_url"),
    bio: text("bio"),
    isLive: boolean("is_live").default(false),
    currentStreamTitle: text("current_stream_title"),
    currentGameId: uuid("current_game_id").references(() => games.id, { onDelete: "set null" }),
    viewerCount: integer("viewer_count").default(0),
    followerCount: integer("follower_count").default(0),
    avatarId: uuid("avatar_id"), // References media.id
    thumbnailUrl: text("thumbnail_url"),
    socialLinks: text("social_links"), // JSON string
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("streamers_slug_idx").on(t.slug),
    uniqueIndex("streamers_channel_idx").on(t.platform, t.channelId),
    index("streamers_platform_idx").on(t.platform),
    index("streamers_live_idx").on(t.isLive),
  ]
);

// ═══════════════════════════════════════════════
// Junction Table: Streamers ↔ Games
// ═══════════════════════════════════════════════

export const gamesToStreamers = pgTable(
  "games_to_streamers",
  {
    gameId: uuid("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
    streamerId: uuid("streamer_id")
      .references(() => streamers.id, { onDelete: "cascade" })
      .notNull(),
    isPrimary: boolean("is_primary").default(false), // Main game for this streamer
  },
  (t) => [uniqueIndex("gs_unique").on(t.gameId, t.streamerId)]
);

// ═══════════════════════════════════════════════
// Relations
// ═══════════════════════════════════════════════

export const streamersRelations = relations(streamers, ({ one, many }) => ({
  currentGame: one(games, { 
    fields: [streamers.currentGameId], 
    references: [games.id] 
  }),
  games: many(gamesToStreamers),
}));

export const gamesToStreamersRelations = relations(gamesToStreamers, ({ one }) => ({
  game: one(games, { fields: [gamesToStreamers.gameId], references: [games.id] }),
  streamer: one(streamers, { fields: [gamesToStreamers.streamerId], references: [streamers.id] }),
}));
