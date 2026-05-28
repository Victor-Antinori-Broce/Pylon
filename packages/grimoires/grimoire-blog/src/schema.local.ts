/**
 * Grimoire Blog — Local Database Schema
 * 
 * Schema definitions for blog tables.
 * These mirror the tables defined in migrations/0000_initial.sql
 */

import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, pgEnum, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Blog status enum values
export const blogStatusValues = ["draft", "published", "scheduled", "archived"] as const;
export type BlogPostStatus = (typeof blogStatusValues)[number];

// Blog status enum
export const blogStatusEnum = pgEnum("blog_status", blogStatusValues);

/**
 * FAQ item structure
 * Format: [{ "q": "Question", "a": "Answer", "order": 1 }]
 */
export interface FAQItem {
  /** Question text */
  q: string;
  /** Answer text (can include limited HTML) */
  a: string;
  /** Optional order for sorting */
  order?: number;
}

/**
 * JSON-LD Schema.org FAQPage structure
 */
export interface FAQPageSchema {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: {
      "@type": "Answer";
      text: string;
    };
  }>;
}

/**
 * Article/BlogPosting schema with BLUF
 */
export interface ArticleSchema {
  "@context": "https://schema.org";
  "@type": "BlogPosting" | "Article" | "NewsArticle";
  headline: string;
  description: string;
  url?: string;
  image?: string | {
    "@type": "ImageObject";
    url: string;
    width?: number;
    height?: number;
  };
  datePublished: string;
  dateModified?: string;
  author?: {
    "@type": "Person";
    name: string;
    url?: string;
  };
  publisher?: {
    "@type": "Organization";
    name: string;
    logo?: {
      "@type": "ImageObject";
      url: string;
    };
  };
  articleBody?: string;
  wordCount?: number;
  /** AI-optimized abstract (BLUF) */
  abstract?: string;
}

/**
 * TOC Item extracted from headings
 */
export interface TOCItem {
  level: number;
  text: string;
  id: string;
}

/**
 * Validation result for content
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    wordCount: number;
    charCount: number;
    readingTime: number;
  };
}

/**
 * Focal point for smart image cropping
 * Coordinates are normalized (0-1)
 * Default center: { x: 0.5, y: 0.5 }
 */
export interface FocalPoint {
  x: number;
  y: number;
}

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

// ═══════════════════════════════════════════════════════════════════════════
// SEO TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** SEO overrides structure for blog posts */
export interface BlogPostSEOOverrides {
  /** Custom meta title (max 60 chars) */
  metaTitle?: string;
  /** Custom meta description (max 160 chars) */
  metaDescription?: string;
  /** Canonical URL override */
  canonicalUrl?: string;
  /** Robots meta directive */
  robots?: string;
  /** Focus keyword for analysis */
  focusKeyword?: string;
  /** Prevent indexing */
  noindex?: boolean;
  /** Prevent following links */
  nofollow?: boolean;
  /** Keywords meta tag (comma-separated) */
  keywords?: string;
  /** Open Graph overrides */
  og?: {
    title?: string;
    description?: string;
    image?: string;
    imageAlt?: string;
    type?: string;
  };
  /** Twitter Card overrides */
  twitter?: {
    title?: string;
    description?: string;
    image?: string;
    card?: "summary" | "summary_large_image" | "app" | "player";
  };
  /** Schema.org configuration */
  schema?: {
    type?: "BlogPosting" | "Article" | "NewsArticle" | "TechArticle";
    articleSection?: string;
  };
  /** Hreflang alternatives */
  hreflang?: Array<{
    lang: string;
    url: string;
  }>;
}

// Types
export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
export type BlogPostToTag = typeof blogPostsToTags.$inferSelect;
export type BlogPostToGame = typeof blogPostsToGames.$inferSelect;

// Additional types
export interface BlogPostSource {
  type: 'dataset' | 'grimoire';
  datasetId?: string;
  entryId?: string;
  grimoireId?: string;
  table?: string;
  recordId?: string;
  snapshot: {
    title: string;
    rawData: Record<string, any>;
    capturedAt: string;
  };
}

/**
 * Blog post with full GEO/SEO metadata for API responses
 */
export interface BlogPostWithRelations {
  id: string;
  title: string;
  slug: string;
  content?: any;
  excerpt?: string | null;
  
  // GEO Fields
  blufText?: string | null;
  faqData?: FAQItem[];
  datasetUrl?: string | null;
  
  // SEO Fields
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImageId?: string | null;
  featuredImageFocalPoint?: { x: number; y: number } | null;
  
  status: string;
  publishedAt?: Date | null;
  authorId: string;
  featuredImageId?: string | null;
  readingTime?: number | null;
  seoOverrides?: BlogPostSEOOverrides;
  source?: BlogPostSource | null;
  blocks?: any[];
  viewCount?: number;
  createdAt: Date;
  updatedAt: Date;
  author?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  featuredImage?: {
    id: string;
    url: string;
    alt?: string;
    width?: number;
    height?: number;
    fileSize?: number;
  } | null;
  tags?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  relatedGames?: Array<{
    id: string;
    title: string;
    slug: string;
    coverImage?: string;
  }>;
}

/**
 * API Payload structure for optimal frontend consumption
 * Organized by concern: seo, geo_ai, content
 */
export interface BlogPostAPIPayload {
  id: string;
  slug: string;
  status: string;
  publishedAt?: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string;
    image?: string;
  };
  
  /** SEO metadata - for <head> tags */
  seo: {
    title: string;
    description: string;
    canonicalUrl: string;
    ogImageId?: string;
    featuredImageFocalPoint?: { x: number; y: number };
    ogImageWidth?: number;
    ogImageHeight?: number;
    ogImageAlt?: string;
    keywords?: string;
    robots?: string;
  };
  
  /** GEO/AI metadata - for AI snippets and rich results */
  geo_ai: {
    /** Bottom Line Up Front - max 50 words */
    bluf: string;
    /** FAQ schema ready for JSON-LD injection */
    schema_faq?: {
      "@context": string;
      "@type": string;
      mainEntity: Array<{
        "@type": string;
        name: string;
        acceptedAnswer: {
          "@type": string;
          text: string;
        };
      }>;
    };
    /** Source dataset reference */
    dataset_url?: string;
    /** Estimated reading time */
    reading_time?: number;
    /** Word count */
    word_count?: number;
  };
  
  /** Content - structured blocks */
  content: {
    /** Main content body (Lexical JSON or HTML) */
    body: any;
    /** Excerpt/summary */
    excerpt?: string;
    /** Table of contents extracted from headings */
    toc?: Array<{
      level: number;
      text: string;
      id: string;
    }>;
  };
}
