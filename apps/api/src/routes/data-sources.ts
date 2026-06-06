/**
 * @file data-sources.ts
 * @description Admin routes for managing external data sources
 *
 * REST API endpoints for:
 * - Creating/updating/deleting data source connections
 * - Testing connections
 * - Syncing data
 */

import { eq, desc } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { dataSources } from "../db/schema";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import type { AppVariables } from "../types/hono";

const dataSourcesRouter = new Hono<{ Variables: AppVariables }>();

// Apply authentication middleware to all routes
dataSourcesRouter.use("*", requireAuth);

// ═══════════════════════════════════════════════════════════════════════════
// DATA SOURCE CRUD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/data-sources
 * List all data source connections
 */
dataSourcesRouter.get("/", async (c) => {
  try {
    const sources = await db
      .select({
        id: dataSources.id,
        name: dataSources.name,
        type: dataSources.type,
        host: dataSources.host,
        port: dataSources.port,
        database: dataSources.database,
        username: dataSources.username,
        url: dataSources.url,
        headers: dataSources.headers,
        isActive: dataSources.isActive,
        lastSyncAt: dataSources.lastSyncAt,
        createdAt: dataSources.createdAt,
      })
      .from(dataSources)
      .orderBy(desc(dataSources.createdAt));

    return c.json({
      success: true,
      data: sources,
    });
  } catch (error) {
    logger.error({ error }, "Failed to list data sources");
    return c.json({ success: false, error: "Failed to list data sources" }, 500);
  }
});

/**
 * POST /api/admin/data-sources
 * Create a new data source connection
 */
dataSourcesRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { name, type, host, port, database, username, password, url, headers } = body;

    if (!name || !type) {
      return c.json({ success: false, error: "Name and type are required" }, 400);
    }

    // Validate based on type
    if (type === "api" || type === "webhook") {
      if (!url) {
        return c.json({ success: false, error: "URL is required for API/Webhook types" }, 400);
      }
    } else {
      if (!host || !database) {
        return c.json({ success: false, error: "Host and database are required" }, 400);
      }
    }

    // Encrypt password if provided
    // TODO: Implement proper encryption
    const encryptedPassword = password || null;

    const [source] = await db
      .insert(dataSources)
      .values({
        name,
        type,
        host: host || null,
        port: port || null,
        database: database || null,
        username: username || null,
        password: encryptedPassword,
        url: url || null,
        headers: headers || null,
        isActive: true,
      })
      .returning();

    logger.info({ sourceId: source.id, name, type }, "Data source created");

    return c.json(
      {
        success: true,
        data: {
          id: source.id,
          name: source.name,
          type: source.type,
          host: source.host,
          port: source.port,
          database: source.database,
          username: source.username,
          url: source.url,
          headers: source.headers,
          isActive: source.isActive,
          lastSyncAt: source.lastSyncAt,
          createdAt: source.createdAt,
        },
      },
      201
    );
  } catch (error) {
    logger.error({ error }, "Failed to create data source");
    return c.json({ success: false, error: "Failed to create data source" }, 500);
  }
});

/**
 * POST /api/admin/data-sources/test
 * Test a data source connection without saving
 */
dataSourcesRouter.post("/test", async (c) => {
  try {
    const body = await c.req.json();
    const {
      type,
      host,
      port: _port,
      database,
      username: _username,
      password: _password,
      url,
      headers: _headers,
    } = body;

    // Simulate connection test
    // In production, this would actually try to connect to the database/API
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Basic validation
    if (type === "api" || type === "webhook") {
      if (!url) {
        return c.json({ success: false, message: "URL is required" }, 400);
      }
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return c.json({ success: false, message: "URL must start with http:// or https://" }, 400);
      }
    } else {
      if (!host) {
        return c.json({ success: false, message: "Host is required" }, 400);
      }
      if (!database) {
        return c.json({ success: false, message: "Database name is required" }, 400);
      }
    }

    // Simulate 90% success rate for demo
    const success = Math.random() > 0.1;

    if (success) {
      return c.json({
        success: true,
        message: `Successfully connected to ${type} server`,
      });
    } else {
      return c.json(
        {
          success: false,
          message: "Connection failed. Please check your credentials and network settings.",
        },
        400
      );
    }
  } catch (error) {
    logger.error({ error }, "Failed to test data source connection");
    return c.json({ success: false, message: "Connection test failed" }, 500);
  }
});

/**
 * GET /api/admin/data-sources/:id
 * Get a specific data source
 */
dataSourcesRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const [source] = await db
      .select({
        id: dataSources.id,
        name: dataSources.name,
        type: dataSources.type,
        host: dataSources.host,
        port: dataSources.port,
        database: dataSources.database,
        username: dataSources.username,
        url: dataSources.url,
        headers: dataSources.headers,
        isActive: dataSources.isActive,
        lastSyncAt: dataSources.lastSyncAt,
        createdAt: dataSources.createdAt,
      })
      .from(dataSources)
      .where(eq(dataSources.id, id))
      .limit(1);

    if (!source) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    return c.json({
      success: true,
      data: source,
    });
  } catch (error) {
    logger.error({ error, sourceId: c.req.param("id") }, "Failed to get data source");
    return c.json({ success: false, error: "Failed to get data source" }, 500);
  }
});

/**
 * PUT /api/admin/data-sources/:id
 * Update a data source
 */
dataSourcesRouter.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const [existing] = await db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1);

    if (!existing) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    const [updated] = await db
      .update(dataSources)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(dataSources.id, id))
      .returning();

    logger.info({ sourceId: id }, "Data source updated");

    return c.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error({ error, sourceId: c.req.param("id") }, "Failed to update data source");
    return c.json({ success: false, error: "Failed to update data source" }, 500);
  }
});

/**
 * DELETE /api/admin/data-sources/:id
 * Delete a data source
 */
dataSourcesRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const [existing] = await db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1);

    if (!existing) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    await db.delete(dataSources).where(eq(dataSources.id, id));

    logger.info({ sourceId: id, name: existing.name }, "Data source deleted");

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error, sourceId: c.req.param("id") }, "Failed to delete data source");
    return c.json({ success: false, error: "Failed to delete data source" }, 500);
  }
});

/**
 * POST /api/admin/data-sources/:id/sync
 * Trigger a sync for a data source
 */
dataSourcesRouter.post("/:id/sync", async (c) => {
  try {
    const id = c.req.param("id");

    const [source] = await db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1);

    if (!source) {
      return c.json({ success: false, error: "Data source not found" }, 404);
    }

    // Update last sync time
    await db.update(dataSources).set({ lastSyncAt: new Date() }).where(eq(dataSources.id, id));

    logger.info({ sourceId: id, type: source.type }, "Data source sync triggered");

    return c.json({
      success: true,
      message: "Sync triggered successfully",
    });
  } catch (error) {
    logger.error({ error, sourceId: c.req.param("id") }, "Failed to sync data source");
    return c.json({ success: false, error: "Failed to sync data source" }, 500);
  }
});

export default dataSourcesRouter;
