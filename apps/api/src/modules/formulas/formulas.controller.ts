/**
 * Formulas KPI — Hono Controller
 *
 * Endpoints:
 *   GET    /formulas        — list all formulas
 *   GET    /formulas/:id    — get one formula
 *   POST   /formulas        — create formula
 *   PATCH  /formulas/:id    — update formula
 *   DELETE /formulas/:id    — delete formula
 */

import { Hono } from "hono";
import { formulasService } from "./formulas.service";
import { protectRoute } from "../../middleware/auth-guard";

export const formulasRoutes = new Hono();

// ── All routes require auth ──
formulasRoutes.use("/*", protectRoute);

// ── GET / — List all formulas ──
formulasRoutes.get("/formulas", async (c) => {
    const docs = await formulasService.list();
    return c.json({ docs, totalDocs: docs.length });
});

// ── GET /:id — Get single formula ──
formulasRoutes.get("/formulas/:id", async (c) => {
    const id = c.req.param("id");
    const doc = await formulasService.getById(id);
    if (!doc) return c.json({ error: "Formula not found" }, 404);
    return c.json(doc);
});

// ── POST / — Create formula ──
formulasRoutes.post("/formulas", async (c) => {
    const body = await c.req.json();

    if (!body.kpiName || !body.expression) {
        return c.json({ error: "kpiName and expression are required" }, 400);
    }

    const doc = await formulasService.create(body);
    return c.json(doc, 201);
});

// ── PATCH /:id — Update formula ──
formulasRoutes.patch("/formulas/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const doc = await formulasService.update(id, body);
    if (!doc) return c.json({ error: "Formula not found" }, 404);
    return c.json(doc);
});

// ── DELETE /:id — Delete formula ──
formulasRoutes.delete("/formulas/:id", async (c) => {
    const id = c.req.param("id");
    const doc = await formulasService.remove(id);
    if (!doc) return c.json({ error: "Formula not found" }, 404);
    return c.json({ success: true, deleted: doc });
});
