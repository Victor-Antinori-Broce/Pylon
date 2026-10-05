/**
 * Actions API Routes
 *
 * Unified API for managing and executing actions.
 * Replaces /functions and /webhooks endpoints.
 */

import { messageOf, eqEnum } from "@kitsuden/engine";
import { eq, desc, and, count } from "drizzle-orm";
import type { Context } from "hono";
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

export async function listActionsHandler(c: Context) {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const type = c.req.query("type") as any;
  const trigger = c.req.query("trigger") as any;
  const status = c.req.query("status") as any;

  const docs = await listActions({ type, trigger, status, limit });

  return c.json({ docs, totalDocs: docs.length });
}
actionsRoutes.get("/", listActionsHandler);

// ═══════════════════════════════════════════════════════════════════════════
// Create Action
// ═══════════════════════════════════════════════════════════════════════════

export async function createActionHandler(c: Context) {
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
  } catch (err: unknown) {
    return c.json({ error: messageOf(err) || "Failed to create action" }, 500);
  }
}
actionsRoutes.post("/", createActionHandler);

// ═══════════════════════════════════════════════════════════════════════════
// Get Single Action
// ═══════════════════════════════════════════════════════════════════════════

export async function getActionHandler(c: Context) {
  const action = await getAction(c.req.param("id"));

  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  return c.json(action);
}
actionsRoutes.get("/:id", getActionHandler);

// ═══════════════════════════════════════════════════════════════════════════
// Update Action
// ═══════════════════════════════════════════════════════════════════════════

export async function updateActionHandler(c: Context) {
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
  } catch (err: unknown) {
    return c.json({ error: messageOf(err) || "Failed to update action" }, 500);
  }
}
actionsRoutes.patch("/:id", updateActionHandler);

// ═══════════════════════════════════════════════════════════════════════════
// Delete Action
// ═══════════════════════════════════════════════════════════════════════════

export async function deleteActionHandler(c: Context) {
  const deleted = await deleteAction(c.req.param("id"));

  if (!deleted) {
    return c.json({ error: "Action not found" }, 404);
  }

  return c.json({ success: true });
}
actionsRoutes.delete("/:id", deleteActionHandler);

// ═══════════════════════════════════════════════════════════════════════════
// Execute Action
// ═══════════════════════════════════════════════════════════════════════════

export async function executeActionHandler(c: Context) {
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
}
actionsRoutes.post("/:id/execute", executeActionHandler);

// ═══════════════════════════════════════════════════════════════════════════
// Get Action Executions
// ═══════════════════════════════════════════════════════════════════════════

export async function listActionExecutionsHandler(c: Context) {
  const actionId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit")) || 25, 100);
  const status = c.req.query("status");

  // Verify action exists
  const action = await getAction(actionId);
  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  const conditions = [eq(actionExecutions.actionId, actionId)];
  // `eqEnum` devuelve undefined si el valor no pertenece al enum.
  const filtro228 = eqEnum(actionExecutions.status, status);
  if (filtro228) conditions.push(filtro228);

  const docs = await db
    .select()
    .from(actionExecutions)
    .where(and(...conditions))
    .orderBy(desc(actionExecutions.createdAt))
    .limit(limit);

  return c.json({ docs, totalDocs: docs.length });
}
actionsRoutes.get("/:id/executions", listActionExecutionsHandler);

// ═══════════════════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════════════════

export async function getActionStatsHandler(c: Context) {
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
}
actionsRoutes.get("/stats/overview", getActionStatsHandler);
