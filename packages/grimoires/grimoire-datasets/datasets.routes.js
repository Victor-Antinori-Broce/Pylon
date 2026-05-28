// @ts-nocheck
/**
 * DataSets Routes
 *
 * REST API endpoints for dynamic data collections.
 * Provides CRUD operations with RLS and validation.
 */
import { Hono } from "hono";
import { eq, and, asc } from "drizzle-orm";
import { dataSets, dataEntries } from "./datasets.schema";
import { dataSetCalculatedFields } from "./datasets.calculated.schema";
import { evaluateCalculatedField, formatCalculatedValue, } from "./datasets.calculated";
import { createCalculatedFieldsRouter } from "./datasets.calculated.routes";
import { exportDatasets, importToDataset, importPackage, exportConfigSchema, importConfigSchema, } from "./datasets.import-export";
import { getCurrentSnapshot, getSnapshotHistory, createManualSnapshot, restoreToSnapshot, compareSnapshots, detectSnapshotConfig, } from "./datasets.snapshots";
import { suggestIndexesForDataset, getIndexStats, applyAutoIndexes, generateIndexReport, applyIndexConfig, indexConfigSchema, } from "./datasets.indexes";
/**
 * Create DataSets router with DI
 */
export function createDatasetsRouter(ctx) {
    const app = new Hono();
    // ═══════════════════════════════════════════════════════════════════════════
    // DATASETS CRUD
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * GET / - List all datasets
     */
    app.get("/", async (c) => {
        const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
        const docs = await ctx.db.instance
            .select()
            .from(dataSets)
            .orderBy(asc(dataSets.name))
            .limit(limit);
        return c.json({ docs, totalDocs: docs.length });
    });
    /**
     * POST / - Create dataset
     */
    app.post("/", ctx.auth.requireAuth, async (c) => {
        const body = await c.req.json();
        // Validate required fields
        if (!body.name) {
            return c.json({ error: "name is required" }, 400);
        }
        // Generate slug
        const slug = body.slug || body.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        // Check slug uniqueness
        const existing = await ctx.db.instance
            .select({ id: dataSets.id })
            .from(dataSets)
            .where(eq(dataSets.slug, slug))
            .limit(1);
        if (existing.length > 0) {
            return c.json({ error: "Slug already exists" }, 409);
        }
        const [doc] = await ctx.db.instance
            .insert(dataSets)
            .values({
            name: body.name,
            slug,
            description: body.description,
            icon: body.icon,
            schema: body.schema || { fields: [] },
            displayConfig: body.displayConfig,
            policyJson: body.policyJson || { readAccess: "admin", writeAccess: "admin", enableRLS: false },
            workflowJson: body.workflowJson,
            gameId: body.gameId,
        })
            .returning();
        ctx.events.emit("dataset:created", doc);
        return c.json(doc, 201);
    });
    /**
     * GET /:id - Get dataset by ID
     */
    app.get("/:id", async (c) => {
        const id = c.req.param("id");
        const [doc] = await ctx.db.instance
            .select()
            .from(dataSets)
            .where(eq(dataSets.id, id))
            .limit(1);
        if (!doc) {
            return c.json({ error: "Dataset not found" }, 404);
        }
        return c.json(doc);
    });
    /**
     * GET /slug/:slug - Get dataset by slug
     */
    app.get("/slug/:slug", async (c) => {
        const slug = c.req.param("slug");
        const [doc] = await ctx.db.instance
            .select()
            .from(dataSets)
            .where(eq(dataSets.slug, slug))
            .limit(1);
        if (!doc) {
            return c.json({ error: "Dataset not found" }, 404);
        }
        return c.json(doc);
    });
    /**
     * PATCH /:id - Update dataset
     */
    app.patch("/:id", ctx.auth.requireAuth, async (c) => {
        const id = c.req.param("id");
        const body = await c.req.json();
        const [existing] = await ctx.db.instance
            .select()
            .from(dataSets)
            .where(eq(dataSets.id, id))
            .limit(1);
        if (!existing) {
            return c.json({ error: "Dataset not found" }, 404);
        }
        // Check slug uniqueness if changing
        if (body.slug && body.slug !== existing.slug) {
            const conflict = await ctx.db.instance
                .select({ id: dataSets.id })
                .from(dataSets)
                .where(eq(dataSets.slug, body.slug))
                .limit(1);
            if (conflict.length > 0) {
                return c.json({ error: "Slug already exists" }, 409);
            }
        }
        const [updated] = await ctx.db.instance
            .update(dataSets)
            .set({
            ...body,
            updatedAt: new Date(),
        })
            .where(eq(dataSets.id, id))
            .returning();
        ctx.events.emit("dataset:updated", updated);
        return c.json(updated);
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // CALCULATED FIELDS
    // ═══════════════════════════════════════════════════════════════════════════
    // Mount calculated fields router at /:id/calculated-fields
    app.route("/:id/calculated-fields", createCalculatedFieldsRouter(ctx));
    /**
     * DELETE /:id - Delete dataset
     */
    app.delete("/:id", ctx.auth.requireRole(["admin"]), async (c) => {
        const id = c.req.param("id");
        const [existing] = await ctx.db.instance
            .select({ id: dataSets.id })
            .from(dataSets)
            .where(eq(dataSets.id, id))
            .limit(1);
        if (!existing) {
            return c.json({ error: "Dataset not found" }, 404);
        }
        await ctx.db.instance
            .delete(dataSets)
            .where(eq(dataSets.id, id));
        ctx.events.emit("dataset:deleted", { id });
        return c.json({ success: true });
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // ENTRIES CRUD
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * GET /:id/entries - List entries
     *
     * Query params:
     *   - includeCalculated: "true" para incluir campos calculados
     *   - calculatedFields: lista de campos específicos (ej: "total,subtotal")
     *   - includeThumbnailUrl: "true" para incluir URL transformada de thumbnails
     */
    app.get("/:id/entries", async (c) => {
        const dataSetId = c.req.param("id");
        const limit = Math.min(Number(c.req.query("limit")) || 500, 1000);
        const status = c.req.query("status");
        const includeCalculated = c.req.query("includeCalculated") === "true";
        const includeThumbnailUrl = c.req.query("includeThumbnailUrl") === "true";
        const calculatedFieldsParam = c.req.query("calculatedFields");
        // Verify dataset exists
        const [dataset] = await ctx.db.instance
            .select()
            .from(dataSets)
            .where(eq(dataSets.id, dataSetId))
            .limit(1);
        if (!dataset) {
            return c.json({ error: "Dataset not found" }, 404);
        }
        let query = ctx.db.instance
            .select()
            .from(dataEntries)
            .where(eq(dataEntries.dataSetId, dataSetId));
        if (status) {
            query = query.where(eq(dataEntries.status, status));
        }
        const docs = await query
            .orderBy(asc(dataEntries.sortOrder))
            .limit(limit);
        // Calcular campos calculados si se solicita
        let calculatedFields = [];
        let docsWithCalculated = docs;
        if (includeCalculated) {
            // Cargar campos calculados activos del dataset
            let cfQuery = ctx.db.instance
                .select()
                .from(dataSetCalculatedFields)
                .where(and(eq(dataSetCalculatedFields.dataSetId, dataSetId), eq(dataSetCalculatedFields.isActive, true)));
            // Filtrar campos específicos si se proporcionan
            if (calculatedFieldsParam) {
                const fieldNames = calculatedFieldsParam.split(",");
                calculatedFields = await cfQuery;
                calculatedFields = calculatedFields.filter(f => fieldNames.includes(f.name));
            }
            else {
                calculatedFields = await cfQuery;
            }
            // Evaluar campos calculados para cada entry
            docsWithCalculated = docs.map(doc => {
                const calculated = {};
                // Merge data con el entry para evaluación
                const row = {
                    ...doc.data,
                    id: doc.id,
                    title: doc.title,
                    status: doc.status,
                    createdAt: doc.createdAt,
                    updatedAt: doc.updatedAt,
                };
                const evalContext = {
                    row,
                    now: new Date(),
                };
                for (const field of calculatedFields) {
                    try {
                        const value = evaluateCalculatedField(field, evalContext);
                        calculated[field.name] = formatCalculatedValue(value, field.format || undefined);
                    }
                    catch (err) {
                        ctx.logger.warn(`Error evaluating calculated field "${field.name}":`, err);
                        calculated[field.name] = null;
                    }
                }
                return {
                    ...doc,
                    _calculated: calculated,
                };
            });
        }
        // Agregar URLs de thumbnails si se solicitan
        let docsWithThumbnails = docsWithCalculated;
        if (includeThumbnailUrl) {
            docsWithThumbnails = docsWithCalculated.map(doc => {
                if (doc.thumbnailId) {
                    return {
                        ...doc,
                        thumbnailUrl: `/api/media/preset/${doc.thumbnailId}/thumbnail`,
                    };
                }
                return doc;
            });
        }
        return c.json({
            docs: docsWithThumbnails,
            totalDocs: docs.length,
            calculatedFields: includeCalculated ? calculatedFields.map(f => ({
                id: f.id,
                name: f.name,
                label: f.label,
                type: f.type,
                format: f.format,
            })) : undefined,
            dataset: {
                id: dataset.id,
                name: dataset.name,
                slug: dataset.slug,
            }
        });
    });
    /**
     * POST /:id/entries - Create entry
     */
    app.post("/:id/entries", ctx.auth.requireAuth, async (c) => {
        const dataSetId = c.req.param("id");
        const body = await c.req.json();
        // Verify dataset exists
        const [dataset] = await ctx.db.instance
            .select()
            .from(dataSets)
            .where(eq(dataSets.id, dataSetId))
            .limit(1);
        if (!dataset) {
            return c.json({ error: "Dataset not found" }, 404);
        }
        // Support bulk creation
        const entries = Array.isArray(body) ? body : [body];
        const rows = await ctx.db.instance
            .insert(dataEntries)
            .values(entries.map((e) => ({
            title: e.title || "Untitled",
            dataSetId,
            data: e.data || {},
            status: e.status || "published",
            sortOrder: e.sortOrder || 0,
            thumbnailId: e.thumbnailId,
        })))
            .returning();
        ctx.events.emit("entry:created", { datasetId: dataSetId, entries: rows });
        return c.json(Array.isArray(body) ? rows : rows[0], 201);
    });
    /**
     * GET /:id/entries/:entryId - Get single entry
     *
     * Query params:
     *   - includeThumbnailUrl: "true" para incluir URL transformada del thumbnail
     */
    app.get("/:id/entries/:entryId", async (c) => {
        const entryId = c.req.param("entryId");
        const includeThumbnailUrl = c.req.query("includeThumbnailUrl") === "true";
        const [doc] = await ctx.db.instance
            .select()
            .from(dataEntries)
            .where(eq(dataEntries.id, entryId))
            .limit(1);
        if (!doc) {
            return c.json({ error: "Entry not found" }, 404);
        }
        // Agregar URL de thumbnail si se solicita
        if (includeThumbnailUrl && doc.thumbnailId) {
            return c.json({
                ...doc,
                thumbnailUrl: `/api/media/preset/${doc.thumbnailId}/thumbnail`,
            });
        }
        return c.json(doc);
    });
    /**
     * PATCH /:id/entries/:entryId - Update entry
     */
    app.patch("/:id/entries/:entryId", ctx.auth.requireAuth, async (c) => {
        const entryId = c.req.param("entryId");
        const body = await c.req.json();
        const [existing] = await ctx.db.instance
            .select()
            .from(dataEntries)
            .where(eq(dataEntries.id, entryId))
            .limit(1);
        if (!existing) {
            return c.json({ error: "Entry not found" }, 404);
        }
        const [updated] = await ctx.db.instance
            .update(dataEntries)
            .set({
            ...body,
            updatedAt: new Date(),
        })
            .where(eq(dataEntries.id, entryId))
            .returning();
        ctx.events.emit("entry:updated", updated);
        return c.json(updated);
    });
    /**
     * DELETE /:id/entries/:entryId - Delete entry
     */
    app.delete("/:id/entries/:entryId", ctx.auth.requireAuth, async (c) => {
        const entryId = c.req.param("entryId");
        const [existing] = await ctx.db.instance
            .select({ id: dataEntries.id })
            .from(dataEntries)
            .where(eq(dataEntries.id, entryId))
            .limit(1);
        if (!existing) {
            return c.json({ error: "Entry not found" }, 404);
        }
        await ctx.db.instance
            .delete(dataEntries)
            .where(eq(dataEntries.id, entryId));
        ctx.events.emit("entry:deleted", { id: entryId });
        return c.json({ success: true });
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // IMPORT / EXPORT
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * POST /export - Export datasets
     */
    app.post("/export", ctx.auth.requireAuth, async (c) => {
        try {
            const body = await c.req.json();
            const config = exportConfigSchema.parse(body);
            const exportPackage = await exportDatasets(ctx, config);
            return c.json(exportPackage);
        }
        catch (error) {
            ctx.logger.error("Export failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * POST /import - Import data to datasets
     */
    app.post("/import", ctx.auth.requireRole(["admin"]), async (c) => {
        try {
            const body = await c.req.json();
            const { datasetId, data, config: importConfig } = body;
            if (!datasetId || !Array.isArray(data)) {
                return c.json({ error: "datasetId and data array are required" }, 400);
            }
            const config = importConfigSchema.parse(importConfig || {});
            const result = await importToDataset(ctx, datasetId, data, config);
            return c.json(result);
        }
        catch (error) {
            ctx.logger.error("Import failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * POST /import/package - Import complete package
     */
    app.post("/import/package", ctx.auth.requireRole(["admin"]), async (c) => {
        try {
            const body = await c.req.json();
            const { package: packageData, config } = body;
            if (!packageData || !packageData.datasets) {
                return c.json({ error: "Valid package is required" }, 400);
            }
            const result = await importPackage(ctx, packageData, config || { strategy: "upsert" });
            return c.json(result);
        }
        catch (error) {
            ctx.logger.error("Package import failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // SNAPSHOTS
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * GET /:id/entries/:entryId/snapshot - Get current snapshot
     */
    app.get("/:id/entries/:entryId/snapshot", async (c) => {
        const entryId = c.req.param("entryId");
        const snapshot = await getCurrentSnapshot(ctx, entryId);
        if (!snapshot) {
            return c.json({ error: "No snapshot found" }, 404);
        }
        return c.json(snapshot);
    });
    /**
     * GET /:id/entries/:entryId/snapshots - Get snapshot history
     */
    app.get("/:id/entries/:entryId/snapshots", async (c) => {
        const entryId = c.req.param("entryId");
        const history = await getSnapshotHistory(ctx, entryId);
        return c.json({ snapshots: history, total: history.length });
    });
    /**
     * POST /:id/entries/:entryId/snapshots - Create manual snapshot
     */
    app.post("/:id/entries/:entryId/snapshots", ctx.auth.requireAuth, async (c) => {
        const entryId = c.req.param("entryId");
        const dataSetId = c.req.param("id");
        const body = await c.req.json();
        try {
            // Get dataset config
            const [dataset] = await ctx.db.instance
                .select()
                .from(dataSets)
                .where(eq(dataSets.id, dataSetId))
                .limit(1);
            if (!dataset) {
                return c.json({ error: "Dataset not found" }, 404);
            }
            const config = detectSnapshotConfig(dataset) || {
                enabled: true,
                on: ["manual"],
                fields: [],
            };
            const snapshot = await createManualSnapshot(ctx, entryId, config, {
                reason: body.reason,
                calculatedValues: body.calculatedValues,
            });
            return c.json(snapshot, 201);
        }
        catch (error) {
            ctx.logger.error("Snapshot creation failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * POST /:id/entries/:entryId/restore - Restore to snapshot
     */
    app.post("/:id/entries/:entryId/restore", ctx.auth.requireAuth, async (c) => {
        const entryId = c.req.param("entryId");
        const body = await c.req.json();
        if (!body.timestamp) {
            return c.json({ error: "timestamp is required" }, 400);
        }
        try {
            await restoreToSnapshot(ctx, entryId, body.timestamp);
            return c.json({ success: true, restored: true });
        }
        catch (error) {
            ctx.logger.error("Restore failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * POST /:id/entries/:entryId/compare - Compare snapshots
     */
    app.post("/:id/entries/:entryId/compare", async (c) => {
        const body = await c.req.json();
        if (!body.snapshot1 || !body.snapshot2) {
            return c.json({ error: "Both snapshot1 and snapshot2 are required" }, 400);
        }
        const comparison = compareSnapshots(body.snapshot1, body.snapshot2);
        return c.json({ comparison });
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // INDEXES
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * GET /:id/indexes/suggest - Get index suggestions
     */
    app.get("/:id/indexes/suggest", ctx.auth.requireAuth, async (c) => {
        const dataSetId = c.req.param("id");
        try {
            const [dataset] = await ctx.db.instance
                .select()
                .from(dataSets)
                .where(eq(dataSets.id, dataSetId))
                .limit(1);
            if (!dataset) {
                return c.json({ error: "Dataset not found" }, 404);
            }
            const schema = dataset.schema;
            const suggestions = schema?.fields
                ? suggestIndexesForDataset(dataset.slug, schema)
                : [];
            return c.json({ suggestions });
        }
        catch (error) {
            ctx.logger.error("Index suggestion failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * GET /indexes/stats - Get index statistics
     */
    app.get("/indexes/stats", ctx.auth.requireAuth, async (c) => {
        try {
            const stats = await getIndexStats(ctx);
            return c.json({ stats });
        }
        catch (error) {
            ctx.logger.error("Index stats failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * POST /indexes/report - Generate index report
     */
    app.post("/indexes/report", ctx.auth.requireAuth, async (c) => {
        try {
            const report = await generateIndexReport(ctx);
            return c.json(report);
        }
        catch (error) {
            ctx.logger.error("Index report failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * POST /:id/indexes/apply - Apply index configuration
     */
    app.post("/:id/indexes/apply", ctx.auth.requireRole(["admin"]), async (c) => {
        const dataSetId = c.req.param("id");
        const body = await c.req.json();
        try {
            const config = indexConfigSchema.parse(body.config);
            const result = await applyIndexConfig(ctx, dataSetId, config);
            return c.json(result);
        }
        catch (error) {
            ctx.logger.error("Apply indexes failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    /**
     * POST /indexes/auto - Apply auto indexes
     */
    app.post("/indexes/auto", ctx.auth.requireRole(["admin"]), async (c) => {
        const body = await c.req.json();
        try {
            // Get all suggestions
            const { dataSets: dsTable } = await import("./datasets.schema");
            const datasets = await ctx.db.instance.select().from(dsTable);
            const allSuggestions = [];
            for (const dataset of datasets) {
                const schema = dataset.schema;
                if (schema?.fields) {
                    const suggestions = suggestIndexesForDataset(dataset.slug, schema);
                    allSuggestions.push(...suggestions);
                }
            }
            const result = await applyAutoIndexes(ctx, allSuggestions, body.minConfidence || "high");
            return c.json(result);
        }
        catch (error) {
            ctx.logger.error("Auto indexes failed:", error);
            return c.json({ error: error.message }, 500);
        }
    });
    return app;
}
//# sourceMappingURL=datasets.routes.js.map