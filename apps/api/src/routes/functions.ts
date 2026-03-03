/**
 * GremiusCMS — Gremius Workers API Routes
 *
 * CRUD for cloud functions + manual execution + execution logs.
 *
 * Endpoints:
 *   GET    /api/functions           — List all functions
 *   POST   /api/functions           — Create function
 *   GET    /api/functions/:id       — Get function detail
 *   PATCH  /api/functions/:id       — Update function
 *   DELETE /api/functions/:id       — Delete function
 *   POST   /api/functions/:id/execute — Execute manually
 *   GET    /api/functions/:id/executions — Get execution logs
 *   GET    /api/functions/cron/status — Get cron job status
 */

import { Hono } from "hono";
import { eq, desc, and, count } from "drizzle-orm";
import { db } from "../db";
import { gremiusFunctions, functionExecutions, dataSets } from "../db/schema";
import { executeManually } from "../lib/function-dispatcher";
import { refreshCronJob, removeCronJob, getCronJobStatus } from "../lib/cron-scheduler";
import { protectRoute } from "../middleware/auth-guard";

export const functionsRoutes = new Hono();

// ── All routes require auth ──
functionsRoutes.use("/*", protectRoute);

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

// ── List functions ──
functionsRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const trigger = c.req.query("trigger");
  const status = c.req.query("status");

  let query = db.select().from(gremiusFunctions).orderBy(desc(gremiusFunctions.updatedAt)).limit(limit);

  // Drizzle doesn't allow dynamic chaining well, so build conditions
  const conditions = [];
  if (trigger) conditions.push(eq(gremiusFunctions.trigger, trigger as any));
  if (status) conditions.push(eq(gremiusFunctions.status, status as any));

  const docs = conditions.length > 0
    ? await db.select().from(gremiusFunctions).where(and(...conditions)).orderBy(desc(gremiusFunctions.updatedAt)).limit(limit)
    : await db.select().from(gremiusFunctions).orderBy(desc(gremiusFunctions.updatedAt)).limit(limit);

  return c.json({ docs, totalDocs: docs.length });
});

// ── Get single function ──
functionsRoutes.get("/cron/status", async (c) => {
  return c.json({ jobs: getCronJobStatus() });
});

functionsRoutes.get("/:id", async (c) => {
  const [fn] = await db.select().from(gremiusFunctions)
    .where(eq(gremiusFunctions.id, c.req.param("id")))
    .limit(1);

  if (!fn) return c.json({ error: "Function not found" }, 404);

  // Also fetch dataset name if watching one
  let watchDataset = null;
  if (fn.watchDatasetId) {
    const [ds] = await db.select({ id: dataSets.id, name: dataSets.name, slug: dataSets.slug })
      .from(dataSets)
      .where(eq(dataSets.id, fn.watchDatasetId))
      .limit(1);
    watchDataset = ds || null;
  }

  return c.json({ ...fn, watchDataset });
});

// ── Create function ──
functionsRoutes.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.name || !body.code || !body.trigger) {
    return c.json({ error: "name, code, and trigger are required" }, 400);
  }

  const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // Validate cron expression if trigger is cron
  if (body.trigger === "cron" && !body.cronExpression) {
    return c.json({ error: "cronExpression required for cron trigger" }, 400);
  }

  const [fn] = await db.insert(gremiusFunctions).values({
    name: body.name,
    slug,
    description: body.description || null,
    code: body.code,
    trigger: body.trigger,
    cronExpression: body.cronExpression || null,
    watchDatasetId: body.watchDatasetId || null,
    timeoutMs: body.timeoutMs || 5000,
    memoryLimitMb: body.memoryLimitMb || 64,
    status: body.status || "active",
    envVars: body.envVars || {},
    createdById: body.createdById || null,
  } as any).returning();

  // If cron, schedule it
  refreshCronJob(fn);

  return c.json(fn, 201);
});

// ── Update function ──
functionsRoutes.patch("/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, any> = { updatedAt: new Date() };

  const allowedFields = [
    "name", "slug", "description", "code", "trigger", "cronExpression",
    "watchDatasetId", "timeoutMs", "memoryLimitMb", "status", "envVars",
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Validate cron
  if (updates.trigger === "cron" && !updates.cronExpression && !body.cronExpression) {
    return c.json({ error: "cronExpression required for cron trigger" }, 400);
  }

  const [updated] = await db.update(gremiusFunctions)
    .set(updates)
    .where(eq(gremiusFunctions.id, c.req.param("id")))
    .returning();

  if (!updated) return c.json({ error: "Function not found" }, 404);

  // Refresh cron schedule
  refreshCronJob(updated);

  return c.json(updated);
});

// ── Delete function ──
functionsRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Remove cron job first
  removeCronJob(id);

  const [deleted] = await db.delete(gremiusFunctions)
    .where(eq(gremiusFunctions.id, id))
    .returning({ id: gremiusFunctions.id, name: gremiusFunctions.name });

  if (!deleted) return c.json({ error: "Function not found" }, 404);

  return c.json({ success: true, id: deleted.id, name: deleted.name });
});

// ═══════════════════════════════════════════════════════════════
// Execution
// ═══════════════════════════════════════════════════════════════

// ── Manual Execute ──
functionsRoutes.post("/:id/execute", async (c) => {
  const body = await c.req.json().catch(() => ({}));

  try {
    const result = await executeManually(c.req.param("id"), body.payload);
    return c.json({
      success: result.success,
      result: result.result,
      logs: result.logs,
      error: result.error,
      durationMs: result.durationMs,
      exitReason: result.exitReason,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
});

// ── Execution Logs ──
functionsRoutes.get("/:id/executions", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 25, 100);
  const status = c.req.query("status");

  const conditions = [eq(functionExecutions.functionId, c.req.param("id"))];
  if (status) conditions.push(eq(functionExecutions.status, status as any));

  const docs = await db.select().from(functionExecutions)
    .where(and(...conditions))
    .orderBy(desc(functionExecutions.createdAt))
    .limit(limit);

  return c.json({ docs, totalDocs: docs.length });
});
