/**
 * Actions API Routes
 *
 * Unified API for managing and executing actions.
 * Replaces /functions and /webhooks endpoints.
 */

import { eq, desc, and, count } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { actions, actionExecutions } from "../db/schema";
import {
  listActions,
  getAction,
  createAction,
  updateAction,
  deleteAction,
  executeActionById,
} from "../lib/actions";
import { protectRoute } from "../middleware/auth-guard";

export const actionsRoutes = new Hono();

// All routes require auth
actionsRoutes.use("/*", protectRoute);

// ═══════════════════════════════════════════════════════════════════════════
// List Actions
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const type = c.req.query("type") as any;
  const trigger = c.req.query("trigger") as any;
  const status = c.req.query("status") as any;

  const docs = await listActions({ type, trigger, status, limit });

  return c.json({ docs, totalDocs: docs.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// Create Action
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.post("/", async (c) => {
  const body = await c.req.json();

  // Validate required fields
  if (!body.name || !body.type || !body.trigger) {
    return c.json(
      {
        error: "name, type, and trigger are required",
        details: {
          name: body.name ? "provided" : "missing",
          type: body.type ? "provided" : "missing",
          trigger: body.trigger ? "provided" : "missing",
        },
      },
      400
    );
  }

  // Validate type
  const validTypes = ["code", "webhook_out", "webhook_in", "agent"];
  if (!validTypes.includes(body.type)) {
    return c.json(
      {
        error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      },
      400
    );
  }

  // Validate trigger
  const validTriggers = ["manual", "cron", "event", "http"];
  if (!validTriggers.includes(body.trigger)) {
    return c.json(
      {
        error: `Invalid trigger. Must be one of: ${validTriggers.join(", ")}`,
      },
      400
    );
  }

  // Validate trigger config
  if (body.trigger === "cron" && !body.triggerConfig?.cronExpression) {
    return c.json({ error: "triggerConfig.cronExpression required for cron trigger" }, 400);
  }

  try {
    const action = await createAction({
      name: body.name,
      slug: body.slug,
      description: body.description,
      type: body.type,
      trigger: body.trigger,
      triggerConfig: body.triggerConfig,
      config: body.config,
      status: body.status || "active",
    });

    return c.json(action, 201);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to create action" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Get Single Action
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.get("/:id", async (c) => {
  const action = await getAction(c.req.param("id"));

  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  return c.json(action);
});

// ═══════════════════════════════════════════════════════════════════════════
// Update Action
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.patch("/:id", async (c) => {
  const body = await c.req.json();

  try {
    const updated = await updateAction(c.req.param("id"), {
      name: body.name,
      slug: body.slug,
      description: body.description,
      trigger: body.trigger,
      triggerConfig: body.triggerConfig,
      config: body.config,
      status: body.status,
    });

    if (!updated) {
      return c.json({ error: "Action not found" }, 404);
    }

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to update action" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Delete Action
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.delete("/:id", async (c) => {
  const deleted = await deleteAction(c.req.param("id"));

  if (!deleted) {
    return c.json({ error: "Action not found" }, 404);
  }

  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Execute Action
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.post("/:id/execute", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const actionId = c.req.param("id");

  // Check if action exists
  const action = await getAction(actionId);
  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  // Execute
  const result = await executeActionById(actionId, {
    trigger: body.trigger || "manual",
    triggerEvent: body.event,
    event: body.event
      ? {
          name: body.event,
          data: body.payload || {},
          timestamp: new Date().toISOString(),
        }
      : undefined,
    request: body.request,
    env: body.env,
  });

  return c.json({
    success: result.success,
    result: result.result,
    logs: result.logs,
    error: result.error,
    durationMs: result.durationMs,
    httpResponse: result.httpResponse,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Get Action Executions
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.get("/:id/executions", async (c) => {
  const actionId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit")) || 25, 100);
  const status = c.req.query("status");

  // Verify action exists
  const action = await getAction(actionId);
  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  const conditions = [eq(actionExecutions.actionId, actionId)];
  if (status) conditions.push(eq(actionExecutions.status, status as any));

  const docs = await db
    .select()
    .from(actionExecutions)
    .where(and(...conditions))
    .orderBy(desc(actionExecutions.createdAt))
    .limit(limit);

  return c.json({ docs, totalDocs: docs.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════════════

actionsRoutes.get("/stats/overview", async (c) => {
  const [totalResult] = await db.select({ count: count() }).from(actions);

  const [activeResult] = await db
    .select({ count: count() })
    .from(actions)
    .where(eq(actions.status, "active"));

  const typeCounts = await db
    .select({
      type: actions.type,
      count: count(),
    })
    .from(actions)
    .groupBy(actions.type);

  return c.json({
    total: totalResult.count,
    active: activeResult.count,
    byType: typeCounts.reduce(
      (acc, { type, count }) => {
        acc[type] = count;
        return acc;
      },
      {} as Record<string, number>
    ),
  });
});
