/**
 * Data Connectors — Hono Routes
 *
 * Endpoints:
 *   GET    /connectors              — List all connectors
 *   GET    /connectors/:id          — Get connector config
 *   POST   /connectors              — Create connector
 *   PATCH  /connectors/:id          — Update connector
 *   DELETE /connectors/:id          — Delete connector
 *   POST   /connectors/:id/test     — Test connection
 *   GET    /connectors/:id/data     — Fetch API data or list DB tables
 *   GET    /connectors/:id/data/:table — Browse DB table rows
 */

import { Hono } from "hono";
import {
    listConnectors,
    getConnector,
    createConnector,
    updateConnector,
    deleteConnector,
    testConnection,
    fetchApiData,
    introspectDatabase,
    browseDbTable,
} from "./connectors.service";

export const connectorsRoutes = new Hono();

// ── List all connectors ──
connectorsRoutes.get("/", async (c) => {
    const docs = await listConnectors();
    // Mask sensitive fields in response
    const safe = docs.map((d) => ({
        ...d,
        config: maskSensitive(d.config as Record<string, unknown>, d.type),
    }));
    return c.json({ docs: safe, totalDocs: safe.length });
});

// ── Get single connector ──
connectorsRoutes.get("/:id", async (c) => {
    const id = c.req.param("id");
    // Skip sub-routes
    if (id === "test") return c.notFound();
    const doc = await getConnector(id);
    if (!doc) return c.json({ error: "Connector not found" }, 404);
    return c.json({
        ...doc,
        config: maskSensitive(doc.config as Record<string, unknown>, doc.type),
    });
});

// ── Create connector ──
connectorsRoutes.post("/", async (c) => {
    const body = await c.req.json();

    if (!body.name || !body.type || !body.config) {
        return c.json(
            { error: "Missing required fields: name, type, config" },
            400
        );
    }

    const validTypes = ["api", "database"];
    if (!validTypes.includes(body.type)) {
        return c.json(
            { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
            400
        );
    }

    // Validate config shape
    if (body.type === "api" && !body.config.url) {
        return c.json({ error: "API connector requires config.url" }, 400);
    }
    if (body.type === "database") {
        const { host, user, password, database } = body.config;
        if (!host || !user || !password || !database) {
            return c.json(
                { error: "DB connector requires config: host, user, password, database" },
                400
            );
        }
    }

    const doc = await createConnector({
        name: body.name,
        type: body.type,
        config: body.config,
        enabled: body.enabled,
    });
    return c.json(doc, 201);
});

// ── Update connector ──
connectorsRoutes.patch("/:id", async (c) => {
    const body = await c.req.json();
    const doc = await updateConnector(c.req.param("id"), body);
    if (!doc) return c.json({ error: "Connector not found" }, 404);
    return c.json(doc);
});

// ── Delete connector ──
connectorsRoutes.delete("/:id", async (c) => {
    const doc = await deleteConnector(c.req.param("id"));
    if (!doc) return c.json({ error: "Connector not found" }, 404);
    return c.json({ success: true, id: doc.id });
});

// ── Test connection ──
connectorsRoutes.post("/:id/test", async (c) => {
    const result = await testConnection(c.req.param("id"));
    if (!result) return c.json({ error: "Connector not found" }, 404);
    return c.json(result);
});

// ── Fetch data (API) or list tables (DB) ──
connectorsRoutes.get("/:id/data", async (c) => {
    const connector = await getConnector(c.req.param("id"));
    if (!connector) return c.json({ error: "Connector not found" }, 404);

    try {
        if (connector.type === "api") {
            const result = await fetchApiData(connector.id);
            return c.json(result);
        } else {
            const result = await introspectDatabase(connector.id);
            return c.json(result);
        }
    } catch (err: any) {
        return c.json({ error: err.message }, 502);
    }
});

// ── Browse DB table rows ──
connectorsRoutes.get("/:id/data/:table", async (c) => {
    const tableName = c.req.param("table");
    const limit = Math.min(Number(c.req.query("limit")) || 50, 500);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

    try {
        const result = await browseDbTable(
            c.req.param("id"),
            tableName,
            limit,
            offset
        );
        if (!result) {
            return c.json({ error: "Connector not found or not a database type" }, 404);
        }
        return c.json(result);
    } catch (err: any) {
        return c.json({ error: err.message }, 502);
    }
});

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/**
 * Mask sensitive fields (passwords, auth headers) in connector config
 * for safe API responses.
 */
function maskSensitive(
    config: Record<string, unknown>,
    type: string
): Record<string, unknown> {
    const masked = { ...config };
    if (type === "database" && masked.password) {
        masked.password = "••••••••";
    }
    if (type === "api" && masked.headers) {
        const headers = { ...(masked.headers as Record<string, string>) };
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase().includes("auth") || key.toLowerCase().includes("token")) {
                headers[key] = "••••••••";
            }
        }
        masked.headers = headers;
    }
    return masked;
}
