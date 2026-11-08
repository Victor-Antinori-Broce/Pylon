/**
 * Planes de agente — Plan/Act (2026-11-07)
 * ============================================================================
 *
 * Un agente en modo Plan explora (lee libremente) y luego PROPONE un plan:
 * un objetivo y una lista ordenada de pasos (método, camino, cuerpo). El plan
 * ES una propuesta (`agent_proposals` con método `PLAN`): entra en la misma
 * bandeja, con el diff de cada paso, y un humano lo aprueba o lo rechaza.
 * Aprobado, los pasos se ejecutan SECUENCIALMENTE con la identidad del agente
 * (releída de la base), sin pagar otra vez la puerta: la firma humana cubre el
 * plan entero. Un paso que falla detiene el plan (salvo `continueOnError`).
 *
 * Qué se valida al proponer: forma de cada paso, tope de pasos y tamaño, y
 * que el agente PODRÍA ejecutar cada operación del SDK ahora (si no, 403: la
 * bandeja no se llena de planes imposibles). Las rutas legadas se validan en
 * su ejecución, como cualquier petición.
 */

import { buildProblem } from "@kitsuden/shared";

import { operacionDeRuta } from "../../../../packages/engine/src/operaciones";
import type { AgentAuthContext } from "../services/agent-auth";

import {
  agentePodriaEjecutar,
  calcularDiff,
  crearPropuesta,
  instantaneaDeAprobaciones,
  problemaDePropuesta,
  todoApagado,
  type PasoDePlan,
} from "./aprobaciones";
import { CLAVE_IDEMPOTENCIA_VALIDA, huellaDePeticion } from "./idempotencia";

/** Lo más grande que se acepta de un plan (256 KiB, como un cuerpo retenido). */
const MAX_PLAN_BYTES = 256 * 1024;
/** Lo más largo que se lee un humano en la bandeja. */
export const MAX_PASOS_DE_PLAN = 10;
/** El camino simbólico de la propuesta (no se ejecuta: ejecutan sus pasos). */
export const CAMINO_DE_PLAN = "/api/agent/plans";

export class PlanNoValido extends Error {}

/** Valida y normaliza el plan que manda el agente. Lanza `PlanNoValido`. */
export function validarPlan(crudo: unknown): { goal: string; steps: PasoDePlan[] } {
  const plan = (crudo as { goal?: unknown; steps?: unknown } | null);
  if (!plan || typeof plan !== "object") throw new PlanNoValido("body must be { goal, steps }");
  const goal = String(plan.goal ?? "").trim();
  if (!goal) throw new PlanNoValido("goal is required");
  if (goal.length > 500) throw new PlanNoValido("goal is longer than 500 characters");
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new PlanNoValido("steps must be a non-empty array");
  }
  if (plan.steps.length > MAX_PASOS_DE_PLAN) {
    throw new PlanNoValido(`a plan can have at most ${MAX_PASOS_DE_PLAN} steps`);
  }
  const steps: PasoDePlan[] = plan.steps.map((s, i) => {
    const paso = s as Partial<PasoDePlan> | null;
    const method = String(paso?.method ?? "").toUpperCase();
    const path = String(paso?.path ?? "");
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new PlanNoValido(`step ${i}: method must be GET, POST, PUT, PATCH or DELETE`);
    }
    if (!path.startsWith("/api/")) throw new PlanNoValido(`step ${i}: path must start with /api/`);
    if (path.startsWith("/api/admin")) throw new PlanNoValido(`step ${i}: admin routes cannot be planned`);
    return {
      method: method as PasoDePlan["method"],
      path,
      body: paso?.body,
      comment: typeof paso?.comment === "string" ? paso.comment.slice(0, 500) : undefined,
      continueOnError: paso?.continueOnError === true,
    };
  });
  const bytes = new TextEncoder().encode(JSON.stringify({ goal, steps })).byteLength;
  if (bytes > MAX_PLAN_BYTES) throw new PlanNoValido(`plan is larger than ${MAX_PLAN_BYTES / 1024} KiB`);
  return { goal, steps };
}

export type ResultadoDePropuestaDePlan =
  | { ok: true; cuerpo: unknown; estado: number }
  | { ok: false; cuerpo: unknown; estado: number };

/**
 * Propone el plan: valida, comprueba que el agente podría ejecutar cada paso
 * del SDK, calcula el diff por paso y guarda la propuesta. Devuelve lo que se
 * responde al agente (202 con la propuesta, como la puerta de aprobación).
 */
export async function proponerPlan(
  agente: AgentAuthContext,
  crudo: unknown,
  claveDeIdempotencia: string | null
): Promise<ResultadoDePropuestaDePlan> {
  const i = await instantaneaDeAprobaciones();
  if (todoApagado(i)) {
    return {
      ok: false,
      estado: 403,
      cuerpo: buildProblem({
        code: "KITSUDEN_E_APPROVALS_DISABLED",
        status: 403,
        detail: "Plans require the human approvals flow, which is currently disabled. Ask an admin to enable it in Approvals settings.",
        instance: CAMINO_DE_PLAN,
      }),
    };
  }

  let plan: { goal: string; steps: PasoDePlan[] };
  try {
    plan = validarPlan(crudo);
  } catch (err) {
    return {
      ok: false,
      estado: 400,
      cuerpo: buildProblem({
        code: "KITSUDEN_E_PLAN_INVALID",
        status: 400,
        detail: `Invalid plan: ${err instanceof Error ? err.message : "bad request"}.`,
        instance: CAMINO_DE_PLAN,
      }),
    };
  }

  // ¿Podría ejecutar cada paso? Solo se sabe para operaciones del SDK; el resto
  // se valida al ejecutar (igual que una petición directa).
  const usuario = { id: agente.agentId, role: "agent", scopes: agente.scopes ?? [] };
  for (let n = 0; n < plan.steps.length; n++) {
    const paso = plan.steps[n]!;
    const deRuta = operacionDeRuta(paso.method, paso.path.split("?")[0]!);
    if (deRuta && !(await agentePodriaEjecutar(deRuta, usuario))) {
      return {
        ok: false,
        estado: 403,
        cuerpo: buildProblem({
          code: "KITSUDEN_E_FORBIDDEN",
          status: 403,
          detail: `Step ${n} (${paso.method} ${paso.path}) exceeds this agent's current scopes. The plan was not stored.`,
          instance: CAMINO_DE_PLAN,
        }),
      };
    }
  }

  // Lo que ve el humano en la bandeja: el plan y, por paso de escritura, su diff.
  const diffs: Record<string, unknown>[] = [];
  for (let n = 0; n < plan.steps.length; n++) {
    const paso = plan.steps[n]!;
    const diff =
      paso.method === "GET"
        ? null
        : await calcularDiff(agente, paso.method, paso.path, paso.body).catch(() => null);
    diffs.push({ index: n, method: paso.method, path: paso.path, comment: paso.comment ?? null, diff });
  }

  const bytes = new TextEncoder().encode(JSON.stringify({ goal: plan.goal, steps: plan.steps }));
  const { propuesta } = await crearPropuesta({
    agente,
    canal: "rest",
    metodo: "PLAN",
    camino: CAMINO_DE_PLAN,
    cuerpo: { plan: { goal: plan.goal, steps: plan.steps } },
    tipo: "application/json",
    huella: huellaDePeticion({
      metodo: "PLAN",
      camino: CAMINO_DE_PLAN,
      query: "",
      tipo: "application/json",
      cuerpo: bytes,
    }),
    idempotencyKey: claveDeIdempotencia && CLAVE_IDEMPOTENCIA_VALIDA.test(claveDeIdempotencia)
      ? claveDeIdempotencia
      : null,
    motivo: "propose_only",
    diff: { kind: "plan", goal: plan.goal, steps: diffs },
  });

  return { ok: true, estado: 202, cuerpo: problemaDePropuesta(propuesta, CAMINO_DE_PLAN) };
}
