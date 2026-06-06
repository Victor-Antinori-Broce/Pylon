/**
 * Grimoire: Page Builder (Core)
 *
 * Lego-style block system for dynamic page layouts with drag & drop.
 * Toggleable Core Grimoire.
 *
 * @version 1.0.0
 */

import type { GrimoireDefinition, GrimoireContext } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";

// GrimoireHooks removed from @gremius/shared — inline the type
type GrimoireHooks = Record<string, (...args: any[]) => void | Promise<void>>;
import { createBlocksRouter } from "./blocks.routes";

// Tables array for grimoire definition
const tables = ["block_pages", "block_contents", "block_templates"];
import { sql } from "drizzle-orm";

// Export schema types
export { pages, blocks, blockTemplates } from "./blocks.schema";

export type {
  Page,
  NewPage,
  Block,
  NewBlock,
  BlockTemplate,
  NewBlockTemplate,
  BlockContent,
  HeroBlockContent,
  TextBlockContent,
  ImageBlockContent,
  VideoBlockContent,
  GridBlockContent,
  CardsBlockContent,
  QuoteBlockContent,
  CtaBlockContent,
  EmbedBlockContent,
  DividerBlockContent,
  SpacerBlockContent,
  CustomBlockContent,
} from "./blocks.schema";

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const adminConfig = {
  views: [
    {
      label: "Pages",
      slug: "pages",
      icon: "FileText",
      defaultView: true,
      component: "Blocks",
    },
    {
      label: "Templates",
      slug: "templates",
      icon: "Layout",
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
    ctx.logger.info("[PageBuilder] Verifying database tables...");

    try {
      // Check if pages table exists
      const result = await ctx.db.instance.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'block_pages'
        );
      `);

      const exists = result.rows?.[0]?.exists ?? false;

      if (!exists) {
        ctx.logger.warn("[PageBuilder] Tables not found. Run migrations:");
        ctx.logger.warn("  cd apps/api && bun run db:migrate");
      } else {
        ctx.logger.info("[PageBuilder] ✓ Tables verified");
      }
    } catch (err) {
      ctx.logger.error("[PageBuilder] Failed to verify tables:", err as Record<string, unknown>);
    }
  },

  /**
   * onShutdown: Cleanup
   */
  onShutdown: async (ctx: GrimoireContext) => {
    ctx.logger.info("[PageBuilder] Shutting down...");
  },

  /**
   * onEnable: Setup when enabled
   */
  onEnable: async (ctx: GrimoireContext) => {
    ctx.logger.info("[PageBuilder] Enabled");
  },

  /**
   * onDisable: Cleanup when disabled
   */
  onDisable: async (ctx: GrimoireContext) => {
    ctx.logger.info("[PageBuilder] Disabled - routes will be removed");
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

export const grimoire: GrimoireDefinition = defineGrimoire({
  // Identity
  id: "grimoire-blocks",
  name: "Page Builder",
  version: "1.0.0",
  description:
    "Lego-style block system for dynamic page layouts with drag & drop. Includes Hero, Text, Image, Video, Grid, Cards, Quote, CTA, Embed, Divider, and Spacer blocks.",

  // Icon
  icon: "Layout",

  // Type
  mountPath: "/api/page-builder",

  // Router factory
  createRouter: (ctx: GrimoireContext) => createBlocksRouter(ctx),

  // Tables
  tables,

  // Admin configuration
  admin: {
    category: "core",
    views: adminConfig.views.map((v) => ({
      id: v.slug,
      type: "custom" as const,
      title: v.label,
    })),
  },

  // Dependencies
  dependencies: {
    grimoires: ["grimoire-media"], // Needs media for images
    core: ["auth"],
  },

  // Hooks
  hooks,
});

// Default export for dynamic imports
export default grimoire;

// Legacy exports for compatibility
export const pageBuilderRoutes = createBlocksRouter;
