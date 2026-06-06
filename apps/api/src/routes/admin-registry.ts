/**
 * Admin Registry API
 *
 * Exposes auto-discovered grimoire admin configurations
 * for the frontend to consume without hardcoding.
 *
 * GET /api/admin/registry — Get all grimoire admin configs
 * GET /api/admin/registry/:grimoireId — Get specific grimoire config
 * POST /api/admin/registry/refresh — Clear cache and rebuild
 */

import { Hono } from "hono";

import { requireAuth } from "../middleware/auth";
import {
  buildAdminRegistry,
  getGrimoireAdminConfig,
  clearAdminRegistryCache,
} from "../services/admin-registry";

export const adminRegistryRoutes = new Hono();

// All routes require authentication
adminRegistryRoutes.use("/*", requireAuth);

/**
 * GET /api/admin/registry
 * Returns admin configuration for all enabled grimoires
 */
adminRegistryRoutes.get("/", async (c) => {
  try {
    const registry = await buildAdminRegistry();
    return c.json({
      success: true,
      grimoires: registry,
      total: registry.length,
      withCustomViews: registry.filter((g) => g.hasCustomView).length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[AdminRegistry] Failed to build registry:", err);
    return c.json(
      {
        success: false,
        error: "Failed to build admin registry",
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

/**
 * GET /api/admin/registry/:grimoireId
 * Returns admin config for a specific grimoire
 */
adminRegistryRoutes.get("/:grimoireId", async (c) => {
  const grimoireId = c.req.param("grimoireId");

  try {
    const config = await getGrimoireAdminConfig(grimoireId);

    if (!config) {
      return c.json(
        {
          success: false,
          error: `Grimoire '${grimoireId}' not found or has no admin configuration`,
        },
        404
      );
    }

    return c.json({
      success: true,
      grimoire: config,
    });
  } catch (err) {
    console.error(`[AdminRegistry] Failed to get config for ${grimoireId}:`, err);
    return c.json(
      {
        success: false,
        error: "Failed to get grimoire config",
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

/**
 * POST /api/admin/registry/refresh
 * Clears cache and rebuilds registry (useful after grimoire changes)
 */
adminRegistryRoutes.post("/refresh", async (c) => {
  try {
    clearAdminRegistryCache();
    const registry = await buildAdminRegistry();

    return c.json({
      success: true,
      message: "Admin registry refreshed",
      grimoires: registry,
      total: registry.length,
    });
  } catch (err) {
    console.error("[AdminRegistry] Failed to refresh registry:", err);
    return c.json(
      {
        success: false,
        error: "Failed to refresh registry",
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

/**
 * GET /api/admin/registry/:grimoireId/schema/:table
 * Returns schema for a specific table (columns, types, etc.)
 */
adminRegistryRoutes.get("/:grimoireId/schema/:table", async (c) => {
  const { grimoireId: _grimoireId, table: _table } = c.req.param();

  // Delegate to existing data-explorer endpoint
  // This maintains backward compatibility
  return c.json({
    success: true,
    message: "Use /api/explorer/schema/:table for table schema",
  });
});
