/**
 * @file agent-plans.ts
 * @description Planes de agente — Plan/Act (K1)
 *
 *   POST /api/agent/plans      — el agente propone un plan (objetivo + pasos);
 *                                la respuesta es 202 con la propuesta, como la
 *                                puerta de aprobación: NO se ejecuta nada.
 *   GET  /api/agent/plans/:id  — estado del plan/propuesta (solo el suyo).
 *
 * Aprobado en la bandeja, los pasos corren secuencialmente con la identidad
 * del agente (ver `lib/aprobaciones.ts`, `ejecutarPlanAprobado`).
 */

import { Hono } from "hono";

import { propuestaPorId, vistaParaAgente } from "@/lib/aprobaciones";
import { logger } from "@/lib/logger";
import { proponerPlan } from "@/lib/planes-de-agente";
import { agentAuthWithRBAC } from "@/middleware/agent-rbac";
import type { AppVariables } from "@/types/hono";

const planes = new Hono<{ Variables: AppVariables }>();

// Proponer un plan no ejecuta nada: basta con una identidad de agente válida.
planes.use("*", agentAuthWithRBAC({ scopes: [] }));

planes.post("/", async (c) => {
  const agente = c.get("agent");
  if (!agente) return c.json({ error: "Unauthorized" }, 401);
  let crudo: unknown;
  try {
    crudo = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const resultado = await proponerPlan(
    agente,
    crudo,
    c.req.header("idempotency-key") ?? null
  );
  if (!resultado.ok) {
    logger.info(
      { agentId: agente.agentId, status: resultado.estado },
      "[planes] plan no aceptado"
    );
  }
  return c.body(JSON.stringify(resultado.cuerpo), resultado.estado as never, {
    "Content-Type": "application/problem+json",
  });
});

planes.get("/:id", async (c) => {
  const agente = c.get("agent");
  if (!agente) return c.json({ error: "Unauthorized" }, 401);
  const p = await propuestaPorId(c.req.param("id"));
  if (!p || p.agentId !== agente.agentId) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(vistaParaAgente(p));
});

export default planes;
