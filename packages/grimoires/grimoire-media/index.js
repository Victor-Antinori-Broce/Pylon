/**
 * Grimoire: Media Library (Core)
 *
 * Media file management with pluggable storage (MinIO, S3, Local, R2).
 * Toggleable Core Grimoire - can be disabled but storage service remains.
 */
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";
import { createMediaRouter } from "./media.routes";
import { createTransformRouter } from "./transform.routes";
import { adminConfig } from "./admin";
// Tables array for grimoire definition
const tables = ["media", "media_folders"];
import { sql } from "drizzle-orm";
export { defaultMediaConfig, validateMediaConfig, storageProviders } from "./config.schema";
export { createStorageAdapter, testStorageConnection } from "./storage.adapter";
// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════
const hooks = {
    /**
     * onStartup: Verify media tables exist
     */
    onStartup: async (ctx) => {
        ctx.logger.info("[Media] Verifying database tables...");
        try {
            // Check if media table exists
            const result = await ctx.db.instance.execute(sql `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'media'
        );
      `);
            const exists = result.rows?.[0]?.exists ?? false;
            if (!exists) {
                ctx.logger.warn("[Media] Tables not found. Run migrations:");
                ctx.logger.warn("  cd apps/api && bun run db:migrate");
            }
            else {
                ctx.logger.info("[Media] ✓ Tables verified");
            }
        }
        catch (err) {
            ctx.logger.error("[Media] Failed to verify tables:", err);
        }
    },
    /**
     * onShutdown: Cleanup
     */
    onShutdown: async (ctx) => {
        ctx.logger.info("[Media] Shutting down...");
    },
    /**
     * onEnable: Setup when enabled
     */
    onEnable: async (ctx) => {
        ctx.logger.info("[Media] Enabled");
    },
    /**
     * onDisable: Cleanup when disabled
     */
    onDisable: async (ctx) => {
        ctx.logger.info("[Media] Disabled - routes will be removed");
    },
};
// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════
export const grimoire = defineGrimoire({
    // Identity
    id: "grimoire-media",
    name: "Media Library",
    version: "1.0.0",
    description: "Media file management with S3/MinIO storage",
    // Icon
    icon: "Image",
    // Type
    mountPath: "/api/media",
    // Router factory - combines media and transform routers
    createRouter: (ctx) => {
        const app = new Hono();
        // Mount media routes
        app.route("/", createMediaRouter(ctx));
        // Mount transform routes
        app.route("/", createTransformRouter(ctx));
        return app;
    },
    // Tables
    tables,
    // Admin configuration
    admin: {
        category: "core",
        views: (adminConfig.views || []).map(v => ({
            id: v.slug,
            type: "custom",
            title: v.label,
        })),
    },
    // Dependencies
    dependencies: {
        grimoires: [],
        core: ["auth"],
    },
    // Hooks
    hooks,
});
// Default export for dynamic imports
export default grimoire;
//# sourceMappingURL=index.js.map