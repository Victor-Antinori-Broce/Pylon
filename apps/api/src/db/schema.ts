/**
 * GremiusCMS - Drizzle Database Schema
 *
 * Complete relational schema for the gaming CMS.
 * Pure Drizzle + PostgreSQL schema for the gaming CMS.
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

// ─── Block Type (shared with admin + web) ─────────────────────
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

export const blogStatusEnum = pgEnum("blog_status", [
  "draft",
  "published",
  "scheduled",
]);

export const tagCategoryEnum = pgEnum("tag_category", [
  "genre",
  "feature",
  "topic",
  "series",
]);

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "editor",
  "user",
]);

// ═══════════════════════════════════════════════
// Auth Tables (Better-Auth compatible)
// ═══════════════════════════════════════════════

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccounts = pgTable("auth_accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authVerifications = pgTable("auth_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const streamerPlatformEnum = pgEnum("streamer_platform", [
  "twitch",
  "youtube",
  "kick",
]);

// ═══════════════════════════════════════════════
// API Keys (Machine Auth)
// ═══════════════════════════════════════════════

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  keyHash: text("key_hash").notNull(),
  hint: varchar("hint", { length: 20 }).notNull(), // e.g. "gremius_sk_...xyz1"
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdById: text("created_by_id").references(() => authUsers.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});




// ═══════════════════════════════════════════════
// Core Tables
// ═══════════════════════════════════════════════

// ── Media (S3/MinIO) ──
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filename: varchar("filename", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    s3Key: varchar("s3_key", { length: 1000 }).notNull(),
    url: text("url").notNull(),
    alt: varchar("alt", { length: 500 }).default(""),
    caption: text("caption"),
    width: integer("width"),
    height: integer("height"),
    size: integer("size"), // bytes
    uploadedById: text("uploaded_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("media_s3key_idx").on(t.s3Key)]
);

// ── Platforms ──
export const platforms = pgTable(
  "platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    shortName: varchar("short_name", { length: 20 }),
    manufacturer: varchar("manufacturer", { length: 100 }),
    iconId: uuid("icon_id").references(() => media.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("platforms_slug_idx").on(t.slug)]
);

// ── Tags ──
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

// ── Games ──
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
    coverArtId: uuid("cover_art_id").references(() => media.id, { onDelete: "set null" }),
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

// ── Blog Posts ──
export const blogPosts = pgTable(
  "blog_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    slug: varchar("slug", { length: 500 }).notNull(),
    content: jsonb("content"), // Lexical rich text JSON
    excerpt: text("excerpt"),
    status: blogStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: text("author_id")
      .references(() => authUsers.id, { onDelete: "set null" })
      .notNull(),
    featuredImageId: uuid("featured_image_id").references(() => media.id, {
      onDelete: "set null",
    }),
    readingTime: integer("reading_time"),
    seoOverrides: jsonb("seo_overrides").$type<{
      canonicalUrl?: string;
      noIndex?: boolean;
      structuredDataType?: string;
    }>(),
    blocks: jsonb("blocks").default([]).$type<PageBlock[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("blog_slug_idx").on(t.slug),
    index("blog_status_idx").on(t.status),
    index("blog_published_idx").on(t.publishedAt),
  ]
);

// ── Data Sets ──
export const dataSets = pgTable(
  "data_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    icon: varchar("icon", { length: 10 }), // Emoji
    schema: jsonb("schema")
      .notNull()
      .$type<
        Array<{
          fieldName: string;
          fieldType: string;
          required?: boolean;
          options?: string;
          defaultValue?: string;
        }>
      >(),
    displayConfig: jsonb("display_config").$type<{
      titleField?: string;
      sortField?: string;
      sortDirection?: "asc" | "desc";
    }>(),
    // ── Enterprise (nullable = opt-in) ──
    policyJson: jsonb("policy_json").$type<{
      readAccess: "admin" | "public" | "authenticated";
      writeAccess: "admin" | "authenticated";
      enableRLS: boolean;
      rlsRules?: { field: string; operator: string; value: string }[];
    }>(),
    workflowJson: jsonb("workflow_json").$type<{
      requireApproval: boolean;
      approverUserIds?: string[];
    }>(),
    // ── Content Promotion (Hybrid BaaS/CMS) ──
    contentConfig: jsonb("content_config").$type<{
      promoted: boolean;
      promotedAt: string;
      slugPrefix: string;
      defaultSeoTemplate?: {
        titleSuffix?: string;
        descriptionField?: string;
      };
    } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("datasets_slug_idx").on(t.slug)]
);

// ── Data Entries ──
export const dataEntries = pgTable(
  "data_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    dataSetId: uuid("data_set_id")
      .references(() => dataSets.id, { onDelete: "cascade" })
      .notNull(),
    // ═══ FASE AI-READY: Campo ownerId para RLS Nativo (Nivel 2) ═══
    // Aunque owner_id puede estar en 'data', tenerlo como columna real
    // permite índices y políticas RLS nativas de PostgreSQL eficientes
    ownerId: text("owner_id").references(() => authUsers.id, { onDelete: "set null" }),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    thumbnailId: uuid("thumbnail_id").references(() => media.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").default(0),
    status: contentStatusEnum("status").default("published").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("entries_dataset_idx").on(t.dataSetId),
    index("entries_sort_idx").on(t.sortOrder),
    // ═══ Índice para RLS Nativo - Optimiza consultas por owner ═══
    index("entries_owner_idx").on(t.ownerId),
  ]
);

// ── Streamers ──
export const streamers = pgTable(
  "streamers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    platform: streamerPlatformEnum("platform").notNull(),
    channelId: varchar("channel_id", { length: 200 }).notNull(),
    channelUrl: text("channel_url"),
    isLive: boolean("is_live").default(false),
    currentStreamTitle: text("current_stream_title"),
    viewerCount: integer("viewer_count").default(0),
    followerCount: integer("follower_count").default(0),
    avatarId: uuid("avatar_id").references(() => media.id, { onDelete: "set null" }),
    thumbnailUrl: text("thumbnail_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("streamers_slug_idx").on(t.slug),
    index("streamers_platform_idx").on(t.platform),
  ]
);

// ── Site Settings (singleton) ──
export const siteSettings = pgTable("site_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteName: varchar("site_name", { length: 200 }).default("GremiusCMS").notNull(),
  siteDescription: text("site_description"),
  siteUrl: text("site_url").default("http://localhost:4321").notNull(),
  branding: jsonb("branding").$type<{
    logoId?: string;
    faviconId?: string;
    ogImageId?: string;
    primaryColor?: string;
    accentColor?: string;
  }>(),
  mainNav: jsonb("main_nav").$type<
    Array<{ label: string; url: string; openInNewTab?: boolean }>
  >(),
  social: jsonb("social").$type<{
    twitter?: string;
    discord?: string;
    youtube?: string;
    twitch?: string;
    github?: string;
  }>(),
  analytics: jsonb("analytics").$type<{
    googleAnalyticsId?: string;
    plausibleDomain?: string;
  }>(),
  activeTheme: varchar("active_theme", { length: 100 }),
  footerText: text("footer_text"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Formulas (KPI) ──
export const formulas = pgTable("formulas", {
  id: uuid("id").primaryKey().defaultRandom(),
  kpiName: varchar("kpi_name", { length: 200 }).notNull(),
  formulaType: varchar("formula_type", { length: 50 }).notNull().default("custom"),
  expression: text("expression").notNull(),
  threshold: real("threshold").default(95.0),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Game Collections (Curated sections) ──
export const gameCollections = pgTable(
  "game_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("gc_slug_idx").on(t.slug)]
);

// ═══════════════════════════════════════════════
// Grimoires & Realms (Module Registry)
// ═══════════════════════════════════════════════

// ── Modules (Plugin/Grimoire Registry) ──
export const modules = pgTable("modules", {
  key: varchar("key", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  category: varchar("category", { length: 100 }),
  enabled: boolean("enabled").default(false).notNull(),
  // Realm ID - null for standalone grimoires, set for realm-specific modules
  realmId: varchar("realm_id", { length: 100 }),
  settings: jsonb("settings").default({}).$type<Record<string, any>>(),
  sidebarPath: varchar("sidebar_path", { length: 200 }),
  sidebarIcon: varchar("sidebar_icon", { length: 50 }),
  sidebarBadge: varchar("sidebar_badge", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════
// Gremius Workers (Cloud Functions / Serverless)
// ═══════════════════════════════════════════════

export const functionTriggerEnum = pgEnum("function_trigger", [
  "on_entry_created",
  "on_entry_updated",
  "on_entry_deleted",
  "on_post_published",
  "cron",
  "manual",
  "webhook_incoming",
]);

export const functionStatusEnum = pgEnum("function_status", [
  "active",
  "inactive",
  "error",
]);

export const executionStatusEnum = pgEnum("execution_status", [
  "pending",
  "running",
  "success",
  "error",
  "timeout",
  "killed",
]);

export const gremiusFunctions = pgTable(
  "gremius_functions", // Legacy table name preserved for migration compat
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    /** The user's JS/TS source code */
    code: text("code").notNull(),
    /** Trigger type */
    trigger: functionTriggerEnum("trigger").notNull(),
    // Cron expression (only for trigger=cron), e.g. "0 */5 * * *" 
    cronExpression: varchar("cron_expression", { length: 100 }),
    /** Dataset ID to watch (only for on_entry_* triggers) */
    watchDatasetId: uuid("watch_dataset_id").references(() => dataSets.id, { onDelete: "set null" }),
    /** Max execution time in ms (default 5000) */
    timeoutMs: integer("timeout_ms").default(5000).notNull(),
    /** Max memory in MB (default 64) */
    memoryLimitMb: integer("memory_limit_mb").default(64).notNull(),
    /** Whether this function is active */
    status: functionStatusEnum("status").default("active").notNull(),
    /** Environment variables available to the function (encrypted at rest) */
    envVars: jsonb("env_vars").default({}).$type<Record<string, string>>(),
    /** Runtime metadata */
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }),
    lastError: text("last_error"),
    executionCount: integer("execution_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    /** Who created it */
    createdById: text("created_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("pf_slug_idx").on(t.slug),
    index("pf_trigger_idx").on(t.trigger),
    index("pf_status_idx").on(t.status),
    index("pf_dataset_idx").on(t.watchDatasetId),
  ]
);

export const functionExecutions = pgTable(
  "function_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    functionId: uuid("function_id")
      .references(() => gremiusFunctions.id, { onDelete: "cascade" })
      .notNull(),
    status: executionStatusEnum("status").default("pending").notNull(),
    /** Trigger event that caused the execution */
    triggerEvent: varchar("trigger_event", { length: 100 }),
    /** Payload that was passed to the function */
    triggerPayload: jsonb("trigger_payload").$type<Record<string, unknown>>(),
    /** Captured console.log output */
    logs: text("logs"),
    /** Return value from the function */
    result: jsonb("result").$type<unknown>(),
    /** Error message if failed */
    errorMessage: text("error_message"),
    /** Execution duration in ms */
    durationMs: integer("duration_ms"),
    /** Memory used in bytes */
    memoryUsedBytes: integer("memory_used_bytes"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("fe_function_idx").on(t.functionId),
    index("fe_status_idx").on(t.status),
    index("fe_created_idx").on(t.createdAt),
  ]
);

// Relations
export const gremiusFunctionsRelations = relations(gremiusFunctions, ({ one, many }) => ({
  createdBy: one(authUsers, { fields: [gremiusFunctions.createdById], references: [authUsers.id] }),
  watchDataset: one(dataSets, { fields: [gremiusFunctions.watchDatasetId], references: [dataSets.id] }),
  executions: many(functionExecutions),
}));

export const functionExecutionsRelations = relations(functionExecutions, ({ one }) => ({
  function: one(gremiusFunctions, { fields: [functionExecutions.functionId], references: [gremiusFunctions.id] }),
}));

// ═══════════════════════════════════════════════
// Game Collections
// ═══════════════════════════════════════════════

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

export const gamesToStreamers = pgTable(
  "games_to_streamers",
  {
    gameId: uuid("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
    streamerId: uuid("streamer_id")
      .references(() => streamers.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [uniqueIndex("gs_unique").on(t.gameId, t.streamerId)]
);

export const blogPostsToTags = pgTable(
  "blog_posts_to_tags",
  {
    postId: uuid("post_id")
      .references(() => blogPosts.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [uniqueIndex("bt_unique").on(t.postId, t.tagId)]
);

export const blogPostsToGames = pgTable(
  "blog_posts_to_games",
  {
    postId: uuid("post_id")
      .references(() => blogPosts.id, { onDelete: "cascade" })
      .notNull(),
    gameId: uuid("game_id")
      .references(() => games.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [uniqueIndex("bg_unique").on(t.postId, t.gameId)]
);

// ═══════════════════════════════════════════════
// Relations (Drizzle ORM)
// ═══════════════════════════════════════════════

export const gamesRelations = relations(games, ({ one, many }) => ({
  coverArt: one(media, { fields: [games.coverArtId], references: [media.id] }),
  platforms: many(gamesToPlatforms),
  tags: many(gamesToTags),
  streamers: many(gamesToStreamers),
  dataSets: many(dataSets),
}));

export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  author: one(authUsers, { fields: [blogPosts.authorId], references: [authUsers.id] }),
  featuredImage: one(media, { fields: [blogPosts.featuredImageId], references: [media.id] }),
  tags: many(blogPostsToTags),
  relatedGames: many(blogPostsToGames),
}));

export const dataSetsRelations = relations(dataSets, ({ one, many }) => ({
  game: one(games, { fields: [dataSets.gameId], references: [games.id] }),
  entries: many(dataEntries),
}));

export const dataEntriesRelations = relations(dataEntries, ({ one }) => ({
  dataSet: one(dataSets, { fields: [dataEntries.dataSetId], references: [dataSets.id] }),
  thumbnail: one(media, { fields: [dataEntries.thumbnailId], references: [media.id] }),
}));

export const streamersRelations = relations(streamers, ({ one, many }) => ({
  avatar: one(media, { fields: [streamers.avatarId], references: [media.id] }),
  games: many(gamesToStreamers),
}));

// Junction relations
export const gamesToPlatformsRelations = relations(gamesToPlatforms, ({ one }) => ({
  game: one(games, { fields: [gamesToPlatforms.gameId], references: [games.id] }),
  platform: one(platforms, { fields: [gamesToPlatforms.platformId], references: [platforms.id] }),
}));

export const gamesToTagsRelations = relations(gamesToTags, ({ one }) => ({
  game: one(games, { fields: [gamesToTags.gameId], references: [games.id] }),
  tag: one(tags, { fields: [gamesToTags.tagId], references: [tags.id] }),
}));

export const gamesToStreamersRelations = relations(gamesToStreamers, ({ one }) => ({
  game: one(games, { fields: [gamesToStreamers.gameId], references: [games.id] }),
  streamer: one(streamers, { fields: [gamesToStreamers.streamerId], references: [streamers.id] }),
}));

export const blogPostsToTagsRelations = relations(blogPostsToTags, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostsToTags.postId], references: [blogPosts.id] }),
  tag: one(tags, { fields: [blogPostsToTags.tagId], references: [tags.id] }),
}));

export const blogPostsToGamesRelations = relations(blogPostsToGames, ({ one }) => ({
  post: one(blogPosts, { fields: [blogPostsToGames.postId], references: [blogPosts.id] }),
  game: one(games, { fields: [blogPostsToGames.gameId], references: [games.id] }),
}));
