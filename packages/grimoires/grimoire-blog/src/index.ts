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

import type {
  GrimoireDefinition,
  GrimoireContext,
} from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";

// GrimoireHooks removed from @gremius/shared — inline the type
type GrimoireHooks = Record<string, (...args: any[]) => void | Promise<void>>;

import { createBlogRouter } from "./routes";
import { sql } from "drizzle-orm";

// Re-export schema
export {
  blogPosts,
  blogPostsToTags,
  blogPostsToGames,
  blogPostsRelations,
  blogPostsToTagsRelations,
  blogPostsToGamesRelations,
} from "./schema";

// Tables array for grimoire definition
const tables = [
  "blog_posts",
  "blog_posts_to_tags",
  "blog_posts_to_games",
];

export type {
  BlogPost,
  NewBlogPost,
  BlogPostWithRelations,
  BlogPostStatus,
  FocalPoint,
} from "./schema";

// Re-export FocalPoint type from seo-utils for convenience
export type { FocalPoint as ImageFocalPoint } from "./seo-utils";

// Export router
export { createBlogRouter } from "./routes";

// Export SEO utilities
export {
  generateSEOMetadata,
  validateSEO,
  calculateSEOScore,
  generateTitle,
  generateMetaDescription,
  renderSEOHead,
  renderMetaTagsHTML,
  renderJsonLdHTML,
  // WhatsApp/OG validation
  validateWhatsAppImage,
  generateOGImage,
  isWhatsAppCompatibleFormat,
  isAbsoluteUrl,
  makeAbsoluteUrl,
  validateWhatsAppFileSize,
  validateWhatsAppDimensions,
  getImageFormat,
  // Image transform URL helpers (NEW)
  getFeaturedImageUrl,
  getOGImageUrl,
  getTransformUrl,
  // Utilities
  stripHtml,
  extractTextFromLexical,
  estimateReadingTime,
  countWords,
  truncateToLimit,
  formatISODate,
  // Constants
  SEO_LIMITS,
  SCHEMA_TYPES,
  ROBOT_DIRECTIVES,
  WHATSAPP_OG_LIMITS,
  OG_TYPES,
  TWITTER_CARD_TYPES,
} from "./seo-utils";

// Export GEO utilities
export {
  generateFAQPageSchema,
  generateArticleSchema,
  validateBLUF,
  suggestBLUF,
  sanitizeHTML,
  stripHtmlTags,
  sanitizeFAQText,
  extractTOC,
  buildAPIPayload,
  ALLOWED_HTML_TAGS,
  ALLOWED_ATTRIBUTES,
} from "./geo-utils";

export type {
  SiteSEOConfig,
  AuthorInfo,
  FeaturedImage,
  OGImage,
  SEOOverrides,
  MetaTag,
  OpenGraphData,
  TwitterCardData,
  JsonLdData,
  SEOMetadata,
  SEOMetadataOptions,
  WhatsAppImageValidation,
} from "./seo-utils";

export type {
  FAQItem,
  FAQPageSchema,
  ArticleSchema,
  TOCItem,
  ValidationResult,
  BlogPostAPIPayload,
  BlogPostSEOOverrides,
  BlogPostSource,
} from "./schema.local";

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const adminConfig = {
  views: [
    {
      label: "Posts",
      slug: "posts",
      icon: "FileText",
      defaultView: true,
      component: "Posts",
    },
    {
      label: "Drafts",
      slug: "drafts",
      icon: "Pencil",
      defaultView: false,
    },
    {
      label: "Scheduled",
      slug: "scheduled",
      icon: "Calendar",
      defaultView: false,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

const hooks: GrimoireHooks = {
  /**
   * onStartup: Verify tables exist
   */
  onStartup: async (ctx: GrimoireContext) => {
    ctx.logger.info("[Blog] Verifying database tables...");

    try {
      // Check if blog_posts table exists
      const result = await ctx.db.instance.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'blog_posts'
        );
      `);

      const exists = result.rows?.[0]?.exists ?? false;

      if (!exists) {
        ctx.logger.warn("[Blog] Tables not found. Run migrations:");
        ctx.logger.warn("  cd apps/api && bun run db:migrate");
      } else {
        ctx.logger.info("[Blog] ✓ Tables verified");
      }
    } catch (err) {
      ctx.logger.error("[Blog] Failed to verify tables", { error: err instanceof Error ? err.message : String(err) });
    }
  },

  /**
   * onShutdown: Cleanup
   */
  onShutdown: async (ctx: GrimoireContext) => {
    ctx.logger.info("[Blog] Shutting down...");
  },

  /**
   * onEnable: Setup when enabled
   */
  onEnable: async (ctx: GrimoireContext) => {
    ctx.logger.info("[Blog] Enabled");
  },

  /**
   * onDisable: Cleanup when disabled
   */
  onDisable: async (ctx: GrimoireContext) => {
    ctx.logger.info("[Blog] Disabled - routes will be removed");
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

export const grimoire: GrimoireDefinition = defineGrimoire({
  // Identity
  id: "grimoire-blog",
  name: "Blog Posts",
  version: "2.0.0",
  description:
    "Publishing platform with rich text editor, scheduling, tags, and SEO overrides.",

  // Icon
  icon: "FileText",

  // Type
  mountPath: "/api/blog",

  // Router factory
  createRouter: (ctx: GrimoireContext) => createBlogRouter(ctx),

  // Admin configuration
  admin: {
    category: "core",
    views: adminConfig.views.map(v => ({
      id: v.slug,
      type: "custom" as const,
      title: v.label,
    })),
  },

  // Tables
  tables,

  // Dependencies
  dependencies: {
    grimoires: ["grimoire-media"], // Needs media for featured images
    core: ["auth"],
  },

  // Hooks
  hooks,
});

// Default export
export default grimoire;

// Legacy exports for compatibility
export const blogRoutes = createBlogRouter;
