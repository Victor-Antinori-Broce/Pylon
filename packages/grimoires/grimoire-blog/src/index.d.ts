/**
 * @gremius/grimoire-blog — Blog & Content Publishing (Core Grimoire)
 *
 * Complete publishing platform with:
 * - Rich text editor and content blocks
 * - SEO metadata and slug management
 * - Editorial workflow (draft → scheduled → published → archived)
 * - Featured images and authorship
 * - Content scheduling
 * - Public content API by slug
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a Core Grimoire that receives all dependencies via injected context.
 * It does NOT import from apps/api/src.
 *
 *   ┌─────────────────────────────────────────┐
 *   │  Grimoire Loader (apps/api/src)         │
 *   │  ├─ Creates GrimoireContext             │
 *   │  ├─ Calls createRouter(ctx)             │
 *   │  └─ Mounts at /api/blog                 │
 *   └─────────────────────────────────────────┘
 *                   │
 *                   ▼ injects
 *   ┌─────────────────────────────────────────┐
 *   │  grimoire-blog (this package)           │
 *   │  ├─ Routes (routes.ts)                  │
 *   │  ├─ Schema (schema.ts)                  │
 *   │  └─ Uses ctx.db, ctx.cache, etc.        │
 *   └─────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */
import type { GrimoireDefinition } from "@gremius/shared";
export { blogPosts, blogPostsToTags, blogPostsToGames, blogPostsRelations, blogPostsToTagsRelations, blogPostsToGamesRelations, } from "./schema";
export type { BlogPost, NewBlogPost, BlogPostWithRelations, BlogPostStatus, FocalPoint, } from "./schema";
export type { FocalPoint as ImageFocalPoint } from "./seo-utils";
export { createBlogRouter } from "./routes";
export { generateSEOMetadata, validateSEO, calculateSEOScore, generateTitle, generateMetaDescription, renderSEOHead, renderMetaTagsHTML, renderJsonLdHTML, validateWhatsAppImage, generateOGImage, isWhatsAppCompatibleFormat, isAbsoluteUrl, makeAbsoluteUrl, validateWhatsAppFileSize, validateWhatsAppDimensions, getImageFormat, getFeaturedImageUrl, getOGImageUrl, getTransformUrl, stripHtml, extractTextFromLexical, estimateReadingTime, countWords, truncateToLimit, formatISODate, SEO_LIMITS, SCHEMA_TYPES, ROBOT_DIRECTIVES, WHATSAPP_OG_LIMITS, OG_TYPES, TWITTER_CARD_TYPES, } from "./seo-utils";
export { generateFAQPageSchema, generateArticleSchema, validateBLUF, suggestBLUF, sanitizeHTML, stripHtmlTags, sanitizeFAQText, extractTOC, buildAPIPayload, ALLOWED_HTML_TAGS, ALLOWED_ATTRIBUTES, } from "./geo-utils";
export type { SiteSEOConfig, AuthorInfo, FeaturedImage, OGImage, SEOOverrides, MetaTag, OpenGraphData, TwitterCardData, JsonLdData, SEOMetadata, SEOMetadataOptions, WhatsAppImageValidation, } from "./seo-utils";
export type { FAQItem, FAQPageSchema, ArticleSchema, TOCItem, ValidationResult, BlogPostAPIPayload, BlogPostSEOOverrides, BlogPostSource, } from "./schema.local";
export declare const grimoire: GrimoireDefinition;
export default grimoire;
export declare const blogRoutes: import("@gremius/shared").GrimoireRouterFactory;
//# sourceMappingURL=index.d.ts.map