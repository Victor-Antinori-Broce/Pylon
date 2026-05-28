// @ts-nocheck
/**
 * Inline Relations API
 *
 * Provides endpoints for Django-style inline relations:
 * - GET /relations/:tableName - Get all relations for a table
 * - GET /inlines/:tableName/:parentId - Get inline data
 * - POST /inlines/:tableName/:parentId - Save inline records
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { detectRelations, generateInlineConfigs, fetchInlineData, saveInlineRecords } from "../services/inline-relations";
export const inlineRelationsRoutes = new Hono();
inlineRelationsRoutes.use("/*", requireAuth);
/**
 * GET /api/relations/:tableName
 * Get all relations for a table (FKs, has_many, many_to_many)
 */
inlineRelationsRoutes.get("/:tableName", async (c) => {
    const tableName = c.req.param("tableName");
    try {
        const relations = await detectRelations(tableName);
        return c.json({
            success: true,
            table: tableName,
            relations,
            count: relations.length
        });
    }
    catch (err) {
        console.error(`[InlineRelationsAPI] Failed to get relations for ${tableName}:`, err);
        return c.json({
            success: false,
            error: "Failed to detect relations"
        }, 500);
    }
});
/**
 * GET /api/relations/:tableName/inlines/config
 * Get inline configurations for a table
 */
inlineRelationsRoutes.get("/:tableName/inlines/config", async (c) => {
    const tableName = c.req.param("tableName");
    try {
        const configs = await generateInlineConfigs(tableName);
        return c.json({
            success: true,
            table: tableName,
            inlines: configs,
            count: configs.length
        });
    }
    catch (err) {
        console.error(`[InlineRelationsAPI] Failed to get inline configs for ${tableName}:`, err);
        return c.json({
            success: false,
            error: "Failed to generate inline configs"
        }, 500);
    }
});
/**
 * GET /api/relations/:tableName/inlines/:parentId
 * Get inline data for a parent record
 */
inlineRelationsRoutes.get("/:tableName/inlines/:parentId", async (c) => {
    const { tableName, parentId } = c.req.param();
    const inlineName = c.req.query("inline");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "10");
    try {
        const configs = await generateInlineConfigs(tableName);
        // Filter by inline name if provided
        const targetConfigs = inlineName
            ? configs.filter(c => c.name === inlineName)
            : configs;
        if (targetConfigs.length === 0) {
            return c.json({
                success: false,
                error: inlineName
                    ? `Inline '${inlineName}' not found for table '${tableName}'`
                    : `No inlines available for table '${tableName}'`
            }, 404);
        }
        // Fetch data for each inline
        const results = await Promise.all(targetConfigs.map(config => fetchInlineData(config, parentId, { page, limit })));
        return c.json({
            success: true,
            parentId,
            inlines: results
        });
    }
    catch (err) {
        console.error(`[InlineRelationsAPI] Failed to get inline data:`, err);
        return c.json({
            success: false,
            error: "Failed to fetch inline data"
        }, 500);
    }
});
/**
 * POST /api/relations/:tableName/inlines/:parentId
 * Save inline records (create/update/delete)
 */
inlineRelationsRoutes.post("/:tableName/inlines/:parentId", async (c) => {
    const { tableName, parentId } = c.req.param();
    const inlineName = c.req.query("inline");
    if (!inlineName) {
        return c.json({
            success: false,
            error: "Query parameter 'inline' is required"
        }, 400);
    }
    try {
        const body = await c.req.json();
        const { records, deletedIds } = body;
        // Get the inline config to find FK column
        const configs = await generateInlineConfigs(tableName);
        const config = configs.find(c => c.name === inlineName);
        if (!config) {
            return c.json({
                success: false,
                error: `Inline '${inlineName}' not found`
            }, 404);
        }
        if (!config.editable) {
            return c.json({
                success: false,
                error: `Inline '${inlineName}' is read-only`
            }, 403);
        }
        const result = await saveInlineRecords(config.table, config.fkColumn, parentId, records || [], deletedIds || []);
        if (result.success) {
            return c.json({
                success: true,
                message: "Inline records saved successfully"
            });
        }
        else {
            return c.json({
                success: false,
                error: result.error
            }, 400);
        }
    }
    catch (err) {
        console.error(`[InlineRelationsAPI] Failed to save inline records:`, err);
        return c.json({
            success: false,
            error: "Failed to save inline records"
        }, 500);
    }
});
//# sourceMappingURL=inline-relations.js.map