/**
 * @gremius/core — Page Builder
 *
 * Core infrastructure piece: Lego-style block system for dynamic
 * page layouts (Hero, Grid, Filter, etc.) with JSON Drag & Drop.
 *
 * Layer: Core (toggleable via gremius.config.ts)
 * Mount: /api/page-builder
 *
 * TODO: Implement block CRUD, block types registry, and page
 * composition engine. Currently a scaffold placeholder.
 */

import { Hono } from "hono";

const app = new Hono();

// ── Placeholder routes ──────────────────────────────────────
app.get("/", (c) =>
    c.json({
        message: "Page Builder — coming soon",
        version: "0.0.1",
        status: "scaffold",
    })
);

app.get("/blocks", (c) =>
    c.json({
        blocks: [],
        message: "No block types registered yet",
    })
);

export const pageBuilderRoutes = app;
