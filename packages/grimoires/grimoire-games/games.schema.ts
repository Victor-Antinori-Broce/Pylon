/**
 * Gremio CMS — Games Module Schema
 * 
 * Drizzle ORM schema for games, collections, and junction tables.
 * This schema is dynamically merged by schema-merger.ts when Gremio CMS is active.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  real,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Block Type ─────────────────────────────────
interface PageBlock {
  id: string;
  type: string;
  data: Record<string, any>;
  order: number;
}

// ═══════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "published",
  "archived",
]);

export const tagCategoryEnum = pgEnum("tag_category", [
  "genre",
  "feature",
  "topic",
  "series",
]);

// ═══════════════════════════════════════════════
// Reference to Core Tables (imported at runtime)
// ═══════════════════════════════════════════════

// Note: These reference the core schema's media table
// The actual FK is created via the uuid reference

// ═══════════════════════════════════════════════
// Games Table
// ═══════════════════════════════════════════════

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    slug: varchar("slug", { length: 500 }).notNull(),
    subtitle: varchar("subtitle", { length: 500 }),
    description: jsonb("description"), // Lexical rich text JSON
    excerpt: text("excerpt"),
    releaseDate: date("release_date"),
    status: contentStatusEnum("status").default("draft").notNull(),
    developer: varchar("developer", { length: 200 }),
    publisher: varchar("publisher", { length: 200 }),
    metacriticScore: integer("metacritic_score"),
    userRating: real("user_rating"),
    coverArtId: uuid("cover_art_id"), // References media.id
    trailerUrl: text("trailer_url"),
    externalIds: jsonb("external_ids").$type<{
      igdbId?: number;
      steamAppId?: number;
      twitchGameId?: string;
    }>(),
    specs: jsonb("specs").$type<Record<string, unknown>>(),
    screenshots: jsonb("screenshots").$type<
      Array<{ mediaId: string; caption?: string }>
    >(),
    blocks: jsonb("blocks").default([]).$type<PageBlock[]>(),
    isFeaturedOnHome: boolean("is_featured_on_home").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("games_slug_idx").on(t.slug),
    index("games_status_idx").on(t.status),
    index("games_metacritic_idx").on(t.metacriticScore),
    index("games_release_idx").on(t.releaseDate),
  ]
);

// ═══════════════════════════════════════════════
// Platforms Table
// ═══════════════════════════════════════════════

export const platforms = pgTable(
  "platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    shortName: varchar("short_name", { length: 20 }),
    manufacturer: varchar("manufacturer", { length: 100 }),
    iconId: uuid("icon_id"), // References media.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("platforms_slug_idx").on(t.slug)]
);

// ═══════════════════════════════════════════════
// Tags Table
// ═══════════════════════════════════════════════

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    color: varchar("color", { length: 7 }),
    category: tagCategoryEnum("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("tags_slug_idx").on(t.slug)]
);

// ═══════════════════════════════════════════════
// Game Collections (Curated sections)
// ═══════════════════════════════════════════════

export const gameCollections = pgTable(
  "game_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    displayOrder: integer("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("gc_slug_idx").on(t.slug)]
);

export const gameCollectionEntries = pgTable(
  "game_collection_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .references(() => gameCollections.id, { onDelete: "cascade" })
      .notNull(),
    gameId: uuid("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [uniqueIndex("gce_unique").on(t.collectionId, t.gameId)]
);

// ═══════════════════════════════════════════════
// Junction Tables (Many-to-Many)
// ═══════════════════════════════════════════════

export const gamesToPlatforms = pgTable(
  "games_to_platforms",
  {
    gameId: uuid("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
    platformId: uuid("platform_id")
      .references(() => platforms.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [uniqueIndex("gp_unique").on(t.gameId, t.platformId)]
);

export const gamesToTags = pgTable(
  "games_to_tags",
  {
    gameId: uuid("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [uniqueIndex("gt_unique").on(t.gameId, t.tagId)]
);

// ═══════════════════════════════════════════════
// Relations
// ═══════════════════════════════════════════════

export const gamesRelations = relations(games, ({ many }) => ({
  platforms: many(gamesToPlatforms),
  tags: many(gamesToTags),
  collections: many(gameCollectionEntries),
}));

export const platformsRelations = relations(platforms, ({ many }) => ({
  games: many(gamesToPlatforms),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  games: many(gamesToTags),
}));

export const gameCollectionsRelations = relations(gameCollections, ({ many }) => ({
  entries: many(gameCollectionEntries),
}));

export const gameCollectionEntriesRelations = relations(gameCollectionEntries, ({ one }) => ({
  collection: one(gameCollections, { 
    fields: [gameCollectionEntries.collectionId], 
    references: [gameCollections.id] 
  }),
  game: one(games, { 
    fields: [gameCollectionEntries.gameId], 
    references: [games.id] 
  }),
}));

export const gamesToPlatformsRelations = relations(gamesToPlatforms, ({ one }) => ({
  game: one(games, { fields: [gamesToPlatforms.gameId], references: [games.id] }),
  platform: one(platforms, { fields: [gamesToPlatforms.platformId], references: [platforms.id] }),
}));

export const gamesToTagsRelations = relations(gamesToTags, ({ one }) => ({
  game: one(games, { fields: [gamesToTags.gameId], references: [games.id] }),
  tag: one(tags, { fields: [gamesToTags.tagId], references: [tags.id] }),
}));
