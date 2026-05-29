/**
 * @gremius/grimoire-crm — CRM & Pipeline Management (Grimoire)
 *
 * Complete CRM system with:
 * - Companies (accounts)
 * - Contacts (people)
 * - Pipelines & Stages
 * - Deals with Kanban view
 * - Activities (calls, emails, meetings, tasks)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a Business Grimoire (Layer 3) that receives all dependencies via
 * injected context. It does NOT import from apps/api/src.
 *
 *   ┌─────────────────────────────────────────┐
 *   │  Grimoire Loader (apps/api/src)         │
 *   │  ├─ Creates GrimoireContext             │
 *   │  ├─ Calls createRouter(ctx)             │
 *   │  └─ Mounts at /api/crm                  │
 *   └─────────────────────────────────────────┘
 *                   │
 *                   ▼ injects
 *   ┌─────────────────────────────────────────┐
 *   │  grimoire-crm (this package)            │
 *   │  ├─ Routes (crm.routes.ts)              │
 *   │  ├─ Schema (crm.schema.ts)              │
 *   │  └─ Uses ctx.db, ctx.auth, ctx.logger   │
 *   └─────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { GrimoireDefinition, GrimoireContext } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";
import { createCRMRouter } from "./crm.routes";
import { sql } from "drizzle-orm";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Re-export schema and types
export * from "./crm.schema";

// Re-export router factory
export { createCRMRouter } from "./crm.routes";

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const adminConfig = {
  views: [
    {
      id: "contacts",
      type: "grid" as const,
      title: "Contacts",
      icon: "Users",
      table: "crm_contacts",
    },
    {
      id: "companies",
      type: "grid" as const,
      title: "Companies",
      icon: "Building2",
      table: "crm_companies",
    },
    {
      id: "deals",
      type: "kanban" as const,
      title: "Deal Pipeline",
      icon: "Kanban",
      table: "crm_deals",
    },
    {
      id: "activities",
      type: "grid" as const,
      title: "Activities",
      icon: "Activity",
      table: "crm_activities",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

const hooks = {
  /**
   * onStartup: Verify tables exist
   */
  onStartup: async (ctx: GrimoireContext) => {
    ctx.logger.info("[CRM] Verifying database tables...");

    try {
      const tables = [
        "crm_companies",
        "crm_contacts",
        "crm_pipelines",
        "crm_pipeline_stages",
        "crm_deals",
        "crm_activities",
      ];

      let allExist = true;
      for (const table of tables) {
        const result = await ctx.db.instance.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = ${table}
          );
        `);

        const exists = result.rows?.[0]?.exists ?? false;
        if (!exists) {
          allExist = false;
          break;
        }
      }

      if (!allExist) {
        ctx.logger.info("[CRM] Tables missing. Running migrations...");
        const migrationsDir = join(process.cwd(), "packages", "grimoires", "grimoire-crm", "migrations");
        try {
          const files = await readdir(migrationsDir);
          const sqlFiles = files.filter(f => f.endsWith(".sql")).sort();
          for (const file of sqlFiles) {
            const filePath = join(migrationsDir, file);
            const content = await Bun.file(filePath).text();
            await ctx.db.instance.execute(sql.raw(content));
            ctx.logger.info(`[CRM] Executed migration: ${file}`);
          }
          ctx.logger.info("[CRM] ✓ Migrations completed");
        } catch (migErr) {
          ctx.logger.error("[CRM] Migration failed", {
            error: migErr instanceof Error ? migErr.message : String(migErr),
          });
        }
      } else {
        ctx.logger.info("[CRM] ✓ All tables verified");
      }
    } catch (err) {
      ctx.logger.error("[CRM] Failed to verify tables", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /**
   * onShutdown: Cleanup
   */
  onShutdown: async (ctx: GrimoireContext) => {
    ctx.logger.info("[CRM] Shutting down...");
  },

  /**
   * onEnable: Setup when enabled
   */
  onEnable: async (ctx: GrimoireContext) => {
    ctx.logger.info("[CRM] Enabled");
  },

  /**
   * onDisable: Cleanup when disabled
   */
  onDisable: async (ctx: GrimoireContext) => {
    ctx.logger.info("[CRM] Disabled - routes will be removed");
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Definición completa del grimoire para registro automático
 * Compatible con el sistema de module-loader v3
 */
export const grimoire: GrimoireDefinition = defineGrimoire({
  // Identity
  id: "grimoire-crm",
  name: "CRM & Pipeline",
  version: "1.0.0",
  description:
    "Complete CRM system with contacts, companies, deal pipelines, and activity management.",

  // Icon
  icon: "Briefcase",

  // Mount point
  mountPath: "/api/crm",

  // Router factory
  createRouter: (ctx: GrimoireContext) => createCRMRouter(ctx),

  // Admin configuration
  admin: {
    category: "system",
    views: adminConfig.views,
  },

  // Tablas que administra
  tables: [
    "crm_companies",
    "crm_contacts",
    "crm_pipelines",
    "crm_pipeline_stages",
    "crm_deals",
    "crm_activities",
    "crm_entity_configs",
    "crm_stage_transitions",
    "crm_documents",
  ],

  // Dependencies
  dependencies: {
    grimoires: [], // Can work standalone or with media for file attachments
    core: ["auth"],
  },

  // Hooks
  hooks,
});

// Default export
export default grimoire;

// Legacy exports for compatibility
export const crmRoutes = createCRMRouter;
