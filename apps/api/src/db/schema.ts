// @ts-nocheck
/**
 * GremiusCMS - Drizzle Database Schema (Backward Compatibility Layer)
 *
 * ⚠️ DEPRECATED: This file is a compatibility re-export.
 * For new code, import from specific sources:
 *   - Core tables: `./schema-core` or `@/db/schema-core`
 *   - Gaming tables: `packages/grimoires/grimoire-games/games.schema`
 *   - Blog tables: `packages/grimoires/grimoire-blog/src/schema.local`
 *   - Streamer tables: `packages/grimoires/grimoire-streamers/streamers.schema`
 *
 * This file re-exports the domain-agnostic core schema plus gaming domain
 * tables to avoid breaking existing imports during the BaaS pivot.
 * It will be removed in a future major version.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE SCHEMA (Domain-agnostic infrastructure)
// ═══════════════════════════════════════════════════════════════════════════
export * from "./schema-core";

// ═══════════════════════════════════════════════════════════════════════════
// GAMING DOMAIN TABLES (Legacy re-exports from grimoires)
// These are kept here temporarily so existing imports like:
//   import { games, blogPosts } from "../db/schema";
// continue to work while the codebase migrates to grimoire imports.
// ═══════════════════════════════════════════════════════════════════════════

// grimoire-games
export {
  games,
  platforms,
  tags,
  gameCollections,
  gameCollectionEntries,
  gamesToPlatforms,
  gamesToTags,
  gamesRelations,
  platformsRelations,
  tagsRelations,
  gameCollectionsRelations,
  gameCollectionEntriesRelations,
  gamesToPlatformsRelations,
  gamesToTagsRelations,
} from "../../../../packages/grimoires/grimoire-games/games.schema";

// grimoire-streamers
export {
  streamers,
  gamesToStreamers,
  streamersRelations,
  gamesToStreamersRelations,
} from "../../../../packages/grimoires/grimoire-streamers/streamers.schema";

// grimoire-blog
export {
  blogPosts,
  blogPostsToTags,
  blogPostsToGames,
} from "../../../../packages/grimoires/grimoire-blog/src/schema.local";
