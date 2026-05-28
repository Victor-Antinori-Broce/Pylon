// @ts-nocheck
/**
 * Gremius Core Grimoire - DataSets
 *
 * Dynamic data collections with automatic API generation.
 * This is a CORE grimoire - enabled by default but can be disabled.
 *
 * Provides:
 * - Dynamic schema definition
 * - Auto-generated REST API
 * - RLS (Row Level Security)
 * - Validation with Zod
 * - Relations between datasets
 */
import { defineGrimoire } from "@gremius/shared";
import { createDatasetsRouter } from "./datasets.routes";
import { adminConfig } from "./datasets.admin";
// Re-export schema for schema-merger
export * from "./datasets.schema";
export * from "./datasets.calculated.schema";
export { adminConfig };
// Export new features
export * from "./datasets.import-export";
export * from "./datasets.snapshots";
export * from "./datasets.indexes";
/**
 * Grimoire definition for DataSets
 */
export const grimoire = defineGrimoire({
    id: "grimoire-datasets",
    name: "DataSets",
    version: "1.0.0",
    description: "Dynamic data collections with automatic REST API",
    icon: "Database",
    // Mount path for routes
    mountPath: "/api/datasets",
    // Create router with dependency injection
    createRouter: (ctx) => {
        return createDatasetsRouter(ctx);
    },
    // Admin configuration
    admin: {
        category: "core",
        order: 0, // First in sidebar
        icon: "Database",
        views: adminConfig.views,
    },
    // Hooks
    hooks: {
        onStartup: async (ctx) => {
            ctx.logger.info("📊 DataSets grimoire initialized");
            // Verify tables exist
            const hasDataSets = await ctx.db.tableExists("data_sets");
            const hasDataEntries = await ctx.db.tableExists("data_entries");
            const hasCalculatedFields = await ctx.db.tableExists("data_set_calculated_fields");
            if (!hasDataSets || !hasDataEntries) {
                ctx.logger.error("❌ DataSets tables not found. Run migrations!");
                throw new Error("DataSets tables missing");
            }
            if (!hasCalculatedFields) {
                ctx.logger.warn("⚠️ Calculated fields table not found. Run migration: 0001_calculated_fields.sql");
            }
            ctx.logger.info("✅ DataSets tables verified");
        },
        onEnable: async (ctx) => {
            ctx.logger.info("📊 DataSets enabled");
        },
        onDisable: async (ctx) => {
            ctx.logger.info("📊 DataSets disabled - API routes will not be available");
        }
    },
    // Dependencies
    dependencies: {
        grimoires: [], // No dependencies on other grimoires
        core: ["auth"] // Requires auth system
    }
});
// Export router creator for compatibility
export { createDatasetsRouter };
export { FORMULA_FUNCTIONS, FORMULA_OPERATORS, } from "./calculated-fields";
// Default export
export default grimoire;
//# sourceMappingURL=index.js.map