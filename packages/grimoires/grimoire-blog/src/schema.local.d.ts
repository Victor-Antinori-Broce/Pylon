/**
 * Grimoire Blog — Local Database Schema
 *
 * Schema definitions for blog tables.
 * These mirror the tables defined in migrations/0000_initial.sql
 */
export declare const blogStatusValues: readonly ["draft", "published", "scheduled", "archived"];
export type BlogPostStatus = (typeof blogStatusValues)[number];
export declare const blogStatusEnum: import("drizzle-orm/pg-core").PgEnum<["draft", "published", "scheduled", "archived"]>;
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
export declare const blogPosts: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "blog_posts";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        title: import("drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: 500;
        }>;
        slug: import("drizzle-orm/pg-core").PgColumn<{
            name: "slug";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: 500;
        }>;
        content: import("drizzle-orm/pg-core").PgColumn<{
            name: "content";
            tableName: "blog_posts";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        excerpt: import("drizzle-orm/pg-core").PgColumn<{
            name: "excerpt";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        blufText: import("drizzle-orm/pg-core").PgColumn<{
            name: "bluf_text";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        faqData: import("drizzle-orm/pg-core").PgColumn<{
            name: "faq_data";
            tableName: "blog_posts";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        datasetUrl: import("drizzle-orm/pg-core").PgColumn<{
            name: "dataset_url";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        metaTitle: import("drizzle-orm/pg-core").PgColumn<{
            name: "meta_title";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: 70;
        }>;
        metaDescription: import("drizzle-orm/pg-core").PgColumn<{
            name: "meta_description";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            length: 170;
        }>;
        ogImageId: import("drizzle-orm/pg-core").PgColumn<{
            name: "og_image_id";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        featuredImageFocalPoint: import("drizzle-orm/pg-core").PgColumn<{
            name: "featured_image_focal_point";
            tableName: "blog_posts";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "draft" | "published" | "archived" | "scheduled";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["draft", "published", "scheduled", "archived"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        publishedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "published_at";
            tableName: "blog_posts";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        authorId: import("drizzle-orm/pg-core").PgColumn<{
            name: "author_id";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        featuredImageId: import("drizzle-orm/pg-core").PgColumn<{
            name: "featured_image_id";
            tableName: "blog_posts";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        readingTime: import("drizzle-orm/pg-core").PgColumn<{
            name: "reading_time";
            tableName: "blog_posts";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        seoOverrides: import("drizzle-orm/pg-core").PgColumn<{
            name: "seo_overrides";
            tableName: "blog_posts";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        blocks: import("drizzle-orm/pg-core").PgColumn<{
            name: "blocks";
            tableName: "blog_posts";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        source: import("drizzle-orm/pg-core").PgColumn<{
            name: "source";
            tableName: "blog_posts";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "blog_posts";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "blog_posts";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Blog posts to tags junction table
 */
export declare const blogPostsToTags: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "blog_posts_to_tags";
    schema: undefined;
    columns: {
        postId: import("drizzle-orm/pg-core").PgColumn<{
            name: "post_id";
            tableName: "blog_posts_to_tags";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        tagId: import("drizzle-orm/pg-core").PgColumn<{
            name: "tag_id";
            tableName: "blog_posts_to_tags";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Blog posts to games junction table
 */
export declare const blogPostsToGames: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "blog_posts_to_games";
    schema: undefined;
    columns: {
        postId: import("drizzle-orm/pg-core").PgColumn<{
            name: "post_id";
            tableName: "blog_posts_to_games";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        gameId: import("drizzle-orm/pg-core").PgColumn<{
            name: "game_id";
            tableName: "blog_posts_to_games";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const blogPostsRelations: import("drizzle-orm").Relations<"blog_posts", {
    tags: import("drizzle-orm").Many<"blog_posts_to_tags">;
    games: import("drizzle-orm").Many<"blog_posts_to_games">;
}>;
export declare const blogPostsToTagsRelations: import("drizzle-orm").Relations<"blog_posts_to_tags", {
    post: import("drizzle-orm").One<"blog_posts", true>;
}>;
export declare const blogPostsToGamesRelations: import("drizzle-orm").Relations<"blog_posts_to_games", {
    post: import("drizzle-orm").One<"blog_posts", true>;
}>;
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
export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
export type BlogPostToTag = typeof blogPostsToTags.$inferSelect;
export type BlogPostToGame = typeof blogPostsToGames.$inferSelect;
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
    blufText?: string | null;
    faqData?: FAQItem[];
    datasetUrl?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
    ogImageId?: string | null;
    featuredImageFocalPoint?: {
        x: number;
        y: number;
    } | null;
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
        featuredImageFocalPoint?: {
            x: number;
            y: number;
        };
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
//# sourceMappingURL=schema.local.d.ts.map