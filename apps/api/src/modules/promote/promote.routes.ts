/**
 * Promote to Content — Hono Routes
 *
 * Endpoints:
 *   POST   /promote/:datasetId        — Promote dataset to CMS content
 *   DELETE /promote/:datasetId        — Demote back to raw data
 *   GET    /promote/:datasetId/status — Check promotion status
 *   GET    /content/:datasetId/entries — List entries with CMS metadata
 *   PATCH  /content/entry/:entryId    — Update CMS metadata
 *   GET    /content/slug/:slug        — Public content lookup by slug
 */

import { Hono } from "hono";
import {
    promoteDataset,
    demoteDataset,
    getPromotionStatus,
    getContentEntries,
    getContentBySlug,
    updateContentMeta,
} from "./promote.service";

export const promoteRoutes = new Hono();

// ═══════════════════════════════════════════════
// Promote / Demote Actions
// ═══════════════════════════════════════════════

// ── Promote a dataset to content ──
promoteRoutes.post("/promote/:datasetId", async (c) => {
    const body = await c.req.json();
    const datasetId = c.req.param("datasetId");

    if (!body.slugPrefix) {
        return c.json(
            { error: "Missing required field: slugPrefix" },
            400
        );
    }

    const result = await promoteDataset(datasetId, {
        slugPrefix: body.slugPrefix,
        defaultSeoTemplate: body.defaultSeoTemplate,
    });

    if (!result) {
        return c.json({ error: "Dataset not found" }, 404);
    }

    if ("alreadyPromoted" in result) {
        return c.json(
            { error: "Dataset is already promoted", datasetId },
            409
        );
    }

    return c.json(result, 201);
});

// ── Demote a dataset ──
promoteRoutes.delete("/promote/:datasetId", async (c) => {
    const result = await demoteDataset(c.req.param("datasetId"));
    if (!result) {
        return c.json({ error: "Dataset not found" }, 404);
    }
    return c.json(result);
});

// ── Check promotion status ──
promoteRoutes.get("/promote/:datasetId/status", async (c) => {
    const result = await getPromotionStatus(c.req.param("datasetId"));
    if (!result) {
        return c.json({ error: "Dataset not found" }, 404);
    }
    return c.json(result);
});

// ═══════════════════════════════════════════════
// Content Queries
// ═══════════════════════════════════════════════

// ── List content entries ──
promoteRoutes.get("/content/:datasetId/entries", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
    const entries = await getContentEntries(c.req.param("datasetId"), limit);
    return c.json({ docs: entries, totalDocs: entries.length });
});

// ── Update CMS metadata for an entry ──
promoteRoutes.patch("/content/entry/:entryId", async (c) => {
    const body = await c.req.json();
    const updated = await updateContentMeta(c.req.param("entryId"), body);
    if (!updated) {
        return c.json({ error: "Content metadata not found (entry may not be promoted)" }, 404);
    }
    return c.json(updated);
});

// ── Public slug lookup ──
promoteRoutes.get("/content/slug/:slug", async (c) => {
    const content = await getContentBySlug(c.req.param("slug"));
    if (!content) {
        return c.json({ error: "Content not found" }, 404);
    }
    return c.json(content);
});
