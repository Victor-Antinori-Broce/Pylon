/**
 * Grimoire Blog — Local Database Schema
 *
 * Schema definitions for blog tables.
 * These mirror the tables defined in migrations/0000_initial.sql
 */
import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, pgEnum, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
// Blog status enum values
export const blogStatusValues = ["draft", "published", "scheduled", "archived"];
// Blog status enum
export const blogStatusEnum = pgEnum("blog_status", blogStatusValues);
/**
 * Blog posts table - SEO & GEO Optimized
 *
 * Fields for Generative Engine Optimization (GEO):
 * - blufText: Bottom Line Up Front for AI snippets
 * - faqData: Structured FAQ data for rich snippets
 * - datasetUrl: Source data reference
 */
export const blogPosts = pgTable("blog_posts", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    slug: varchar("slug", { length: 500 }).notNull().unique(),
    content: jsonb("content"), // Lexical rich text JSON (block-based editor)
    excerpt: text("excerpt"),
    // ═══════════════════════════════════════════════════════════════════════════
    // GEO (Generative Engine Optimization) Fields
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Bottom Line Up Front (BLUF) - AI-optimized summary
     * Max 50 words, designed for AI snippet extraction
     */
    blufText: text("bluf_text"),
    /**
     * FAQ data as JSONB array
     * Format: [{ "q": "Question", "a": "Answer", "order": 1 }]
     * Used for FAQPage Schema.org markup
     */
    faqData: jsonb("faq_data"),
    /**
     * URL to source dataset or raw data
     * For articles based on data/research
     */
    datasetUrl: text("dataset_url"),
    // ═══════════════════════════════════════════════════════════════════════════
    // SEO Fields (explicit for validation/indexing)
    // ═══════════════════════════════════════════════════════════════════════════
    /** Meta title - max 60 chars (overrides auto-generated) */
    metaTitle: varchar("meta_title", { length: 70 }),
    /** Meta description - max 160 chars */
    metaDescription: varchar("meta_description", { length: 170 }),
    /**
     * OG Image ID - reference to media item for social sharing
     * Uses grimoire-media transform endpoints for optimized OG images
     */
    ogImageId: uuid("og_image_id"),
    /**
     * Featured image focal point for smart cropping
     * Format: { x: 0.5, y: 0.5 } (0-1 normalized coordinates)
     * Used with transform endpoints for optimal cropping
     */
    featuredImageFocalPoint: jsonb("featured_image_focal_point"),
    // ═══════════════════════════════════════════════════════════════════════════
    // Standard Fields
    // ═══════════════════════════════════════════════════════════════════════════
    status: blogStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: text("author_id").notNull(),
    featuredImageId: uuid("featured_image_id"),
    readingTime: integer("reading_time"),
    /** Legacy SEO overrides (JSONB for flexibility) */
    seoOverrides: jsonb("seo_overrides"),
    /** Content blocks (for block-based editor) */
    blocks: jsonb("blocks"),
    /** Source data reference (for promoted content) */
    source: jsonb("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
/**
 * Blog posts to tags junction table
 */
export const blogPostsToTags = pgTable("blog_posts_to_tags", {
    postId: uuid("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull(),
}, (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
]);
/**
 * Blog posts to games junction table
 */
export const blogPostsToGames = pgTable("blog_posts_to_games", {
    postId: uuid("post_id").notNull().references(() => blogPosts.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").notNull(),
}, (t) => [
    primaryKey({ columns: [t.postId, t.gameId] }),
]);
// ═══════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════
export const blogPostsRelations = relations(blogPosts, ({ many }) => ({
    tags: many(blogPostsToTags),
    games: many(blogPostsToGames),
}));
export const blogPostsToTagsRelations = relations(blogPostsToTags, ({ one }) => ({
    post: one(blogPosts, {
        fields: [blogPostsToTags.postId],
        references: [blogPosts.id],
    }),
}));
export const blogPostsToGamesRelations = relations(blogPostsToGames, ({ one }) => ({
    post: one(blogPosts, {
        fields: [blogPostsToGames.postId],
        references: [blogPosts.id],
    }),
}));
//# sourceMappingURL=schema.local.js.map