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
import {
  cambiaElCodigo,
  problemaDeCodigoFueraDePromocion,
  responderProblema,
  traeCodigo,
} from "../lib/codigo-de-acciones";
import { creadorDePeticion, ejecutorDePeticion } from "../lib/sandbox/identidad";
import { protectRoute } from "../middleware/auth-guard";

/**
 * La versión `manual` de una edición humana (lib/promocion.ts). Import diferido:
 * la promoción arrastra el motor de acciones entero, y este fichero se prueba
 * con el motor simulado (tests-unit/actions-handlers.test.ts).
 */
async function registrarEdicionManual(...args: Parameters<typeof import("../lib/promocion").registrarEdicionManual>) {
  const { registrarEdicionManual: registrar } = await import("../lib/promocion");
  return registrar(...args);
}

function requestIdDe(c: Context): string | null {
  return ((c.get as (k: string) => unknown)("requestId") as string | undefined) ?? null;
}

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

  // Fase I (decisión 2): un agente no crea código por aquí, solo por la promoción.
  const ejecutor = ejecutorDePeticion(c);
  if (ejecutor?.tipo === "agente" && (body.type === "code" || traeCodigo(body.config))) {
    return responderProblema(c as never, problemaDeCodigoFueraDePromocion(c.req.path, requestIdDe(c)));
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
      // De la sesión: responde de la acción cuando salta por cron o evento.
      createdById: creadorDePeticion(c),
    });

    // Una persona: su código queda como primera versión `manual` (lib/promocion.ts).
    if (action.type === "code" && traeCodigo(action.config)) {
      await registrarEdicionManual(null, action, ejecutor?.tipo === "humano" ? ejecutor.userId : null);
    }
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
  const action = await getAction(c.req.param("id")!);

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

  // Fase I (decisión 2): el código (y lo que declara) solo cambia por la
  // promoción si quien pide es un agente; lo demás (nombre, estado…), igual que antes.
  const antes = body.config !== undefined ? await getAction(c.req.param("id")!) : null;
  const tocaCodigo = !!antes && antes.type === "code" && cambiaElCodigo(antes.config, body.config);
  const ejecutor = ejecutorDePeticion(c);
  if (tocaCodigo && ejecutor?.tipo !== "humano") {
    return responderProblema(c as never, problemaDeCodigoFueraDePromocion(c.req.path, requestIdDe(c)));
  }

  try {
    const updated = await updateAction(c.req.param("id")!, {
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

    if (tocaCodigo && ejecutor?.tipo === "humano") {
      await registrarEdicionManual(antes, updated, ejecutor.userId);
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
  const deleted = await deleteAction(c.req.param("id")!);

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
  const actionId = c.req.param("id")!;

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
    ejecutor: ejecutorDePeticion(c),
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
  const actionId = c.req.param("id")!;
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
