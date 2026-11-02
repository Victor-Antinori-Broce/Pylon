/**
 * Run Inspector — observabilidad de ejecuciones (estilo Workbench)
 * ============================================================================
 *
 * La tabla `action_executions` ya captura todo lo interesante de cada corrida
 * (estado, trigger, payload, logs, resultado, error, duración, memoria), pero
 * hasta ahora solo se podía consultar POR ACCIÓN. Un inspector necesita el
 * feed GLOBAL: "qué está pasando en mi backend ahora mismo".
 *
 *   GET  /api/runs                → feed global con filtros y paginación
 *   GET  /api/runs/stats          → tarjetas del dashboard (24h)
 *   GET  /api/runs/:id            → detalle completo de una ejecución
 *
 * Requiere admin: las ejecuciones incluyen payloads y logs de todo el sistema,
 * que pueden contener datos de cualquier usuario.
 */

import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { actions, actionExecutions } from "../db/schema";
import { protectRoute, requireAdmin } from "../middleware/auth-guard";

export const runsRoutes = new Hono();

runsRoutes.use("/*", protectRoute, requireAdmin);

/** Ventana temporal → timestamp de corte. */
function sinceOf(window: string | undefined): Date | null {
  const map: Record<string, number> = {
    "1h": 3_600_000,
    "24h": 86_400_000,
    "7d": 604_800_000,
    "30d": 2_592_000_000,
  };
  const ms = map[window ?? ""] ?? null;
  return ms ? new Date(Date.now() - ms) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

runsRoutes.get("/", async (c) => {
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(Number.parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
  const status = c.req.query("status");
  const actionId = c.req.query("actionId");
  const since = sinceOf(c.req.query("window"));

  const conditions = [];
  if (status) conditions.push(eq(actionExecutions.status, status as never));
  if (actionId) conditions.push(eq(actionExecutions.actionId, actionId));
  if (since) conditions.push(gte(actionExecutions.createdAt, since));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // JOIN con actions para mostrar el nombre y el trigger sin una segunda query.
  const rows = await db
    .select({
      id: actionExecutions.id,
      actionId: actionExecutions.actionId,
      actionName: actions.name,
      actionType: actions.type,
      status: actionExecutions.status,
      triggerType: actionExecutions.triggerType,
      triggerEvent: actionExecutions.triggerEvent,
      durationMs: actionExecutions.durationMs,
      memoryUsedBytes: actionExecutions.memoryUsedBytes,
      errorMessage: actionExecutions.errorMessage,
      startedAt: actionExecutions.startedAt,
      finishedAt: actionExecutions.finishedAt,
      createdAt: actionExecutions.createdAt,
    })
    .from(actionExecutions)
    .leftJoin(actions, eq(actions.id, actionExecutions.actionId))
    .where(where)
    .orderBy(desc(actionExecutions.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db.select({ value: count() }).from(actionExecutions).where(where);

  return c.json({
    docs: rows,
    totalDocs: total?.value ?? 0,
    limit,
    offset,
    hasMore: offset + rows.length < (total?.value ?? 0),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STATS — tarjetas del dashboard
// ═══════════════════════════════════════════════════════════════════════════

runsRoutes.get("/stats", async (c) => {
  const since = sinceOf(c.req.query("window") ?? "24h")!;
  const inWindow = gte(actionExecutions.createdAt, since);

  const [byStatus, timing, topFailing] = await Promise.all([
    db
      .select({ status: actionExecutions.status, value: count() })
      .from(actionExecutions)
      .where(inWindow)
      .groupBy(actionExecutions.status),

    // p50/p95 en SQL: percentile_cont es exacto y evita traer filas a memoria.
    db
      .select({
        avgMs: sql<number>`coalesce(avg(${actionExecutions.durationMs}), 0)::int`,
        p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${actionExecutions.durationMs}), 0)::int`,
        p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${actionExecutions.durationMs}), 0)::int`,
        maxMs: sql<number>`coalesce(max(${actionExecutions.durationMs}), 0)::int`,
      })
      .from(actionExecutions)
      .where(inWindow),

    db
      .select({
        actionId: actionExecutions.actionId,
        actionName: actions.name,
        failures: count(),
      })
      .from(actionExecutions)
      .leftJoin(actions, eq(actions.id, actionExecutions.actionId))
      .where(and(inWindow, eq(actionExecutions.status, "failed" as never)))
      .groupBy(actionExecutions.actionId, actions.name)
      .orderBy(desc(count()))
      .limit(5),
  ]);

  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.value]));
  const total = byStatus.reduce((n, r) => n + r.value, 0);
  const failed = counts.failed ?? 0;

  return c.json({
    window: c.req.query("window") ?? "24h",
    total,
    byStatus: counts,
    // Tasa de éxito sobre las que terminaron (las pending/running no cuentan).
    successRate: total > 0 ? Number((((total - failed) / total) * 100).toFixed(2)) : 100,
    duration: timing[0] ?? { avgMs: 0, p50: 0, p95: 0, maxMs: 0 },
    topFailing,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DETALLE — payload, resultado y logs completos
// ═══════════════════════════════════════════════════════════════════════════

runsRoutes.get("/:id", async (c) => {
  const [run] = await db
    .select({
      execution: actionExecutions,
      actionName: actions.name,
      actionType: actions.type,
      actionTrigger: actions.trigger,
    })
    .from(actionExecutions)
    .leftJoin(actions, eq(actions.id, actionExecutions.actionId))
    .where(eq(actionExecutions.id, c.req.param("id")))
    .limit(1);

  if (!run) {
    return c.json({ error: { code: "NOT_FOUND", message: "Ejecución no encontrada" } }, 404);
  }

  return c.json({
    ...run.execution,
    action: {
      name: run.actionName,
      type: run.actionType,
      trigger: run.actionTrigger,
    },
    // Los logs se guardan como texto plano; se devuelven ya partidos en líneas
    // para que la UI no tenga que hacerlo.
    logLines: run.execution.logs ? run.execution.logs.split("\n") : [],
  });
});
