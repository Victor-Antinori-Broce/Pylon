/**
 * Webhooks Engine — Hono Routes
 *
 * REST API for managing webhook configurations and viewing delivery logs.
 *
 * Endpoints:
 *   GET    /                   — List all webhook configs (optional ?datasetId filter)
 *   GET    /failed-jobs        — List failed jobs from BullMQ queue
 *   GET    /:id                — Get single webhook config
 *   POST   /                   — Create webhook config
 *   PATCH  /:id                — Update webhook config
 *   DELETE /:id                — Delete webhook config
 *   GET    /:id/logs           — View delivery logs
 *   POST   /:id/test           — Send test ping
 */

import { Hono } from "hono";
import {
    listWebhooks,
    getWebhook,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    getWebhookLogs,
    sendTestPing,
    getFailedJobs,
    retryFailedJob,
} from "./webhooks.service";

export const webhooksRoutes = new Hono();

// ── List all webhook configs ──
webhooksRoutes.get("/", async (c) => {
    const datasetId = c.req.query("datasetId");
    const docs = await listWebhooks(datasetId);
    return c.json({ docs, totalDocs: docs.length });
});

// ── List failed jobs from BullMQ ──
webhooksRoutes.get("/failed-jobs", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
    const jobs = await getFailedJobs(limit);
    return c.json({ jobs, total: jobs.length });
});

// ── Retry a failed job ──
webhooksRoutes.post("/failed-jobs/:jobId/retry", async (c) => {
    const jobId = c.req.param("jobId");
    const result = await retryFailedJob(jobId);
    if (!result.success) {
        return c.json({ error: result.error }, 400);
    }
    return c.json({ success: true, jobId });
});

// ── Get single webhook config ──
webhooksRoutes.get("/:id", async (c) => {
    const id = c.req.param("id");
    // Skip if it looks like a sub-route
    if (id === "test") return c.notFound();
    const doc = await getWebhook(id);
    if (!doc) return c.json({ error: "Webhook not found" }, 404);
    return c.json(doc);
});

// ── Create webhook config ──
webhooksRoutes.post("/", async (c) => {
    const body = await c.req.json();

    if (!body.name || !body.datasetId || !body.event || !body.targetUrl) {
        return c.json(
            { error: "Missing required fields: name, datasetId, event, targetUrl" },
            400
        );
    }

    const validEvents = ["on_create", "on_update", "on_delete"];
    if (!validEvents.includes(body.event)) {
        return c.json(
            { error: `Invalid event. Must be one of: ${validEvents.join(", ")}` },
            400
        );
    }

    const doc = await createWebhook({
        name: body.name,
        datasetId: body.datasetId,
        event: body.event,
        targetUrl: body.targetUrl,
        secret: body.secret,
        enabled: body.enabled,
    });
    return c.json(doc, 201);
});

// ── Update webhook config ──
webhooksRoutes.patch("/:id", async (c) => {
    const body = await c.req.json();
    const doc = await updateWebhook(c.req.param("id"), body);
    if (!doc) return c.json({ error: "Webhook not found" }, 404);
    return c.json(doc);
});

// ── Delete webhook config ──
webhooksRoutes.delete("/:id", async (c) => {
    const doc = await deleteWebhook(c.req.param("id"));
    if (!doc) return c.json({ error: "Webhook not found" }, 404);
    return c.json({ success: true, id: doc.id });
});

// ── Get delivery logs ──
webhooksRoutes.get("/:id/logs", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const docs = await getWebhookLogs(c.req.param("id"), limit);
    return c.json({ docs, totalDocs: docs.length });
});

// ── Send test ping ──
webhooksRoutes.post("/:id/test", async (c) => {
    const result = await sendTestPing(c.req.param("id"));
    if (!result) return c.json({ error: "Webhook not found" }, 404);
    return c.json(result);
});
