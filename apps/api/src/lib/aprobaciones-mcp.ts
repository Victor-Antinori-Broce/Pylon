/**
 * Aprobación humana en MCP (fase F)
 * ============================================================================
 *
 * La misma regla que REST (`lib/aprobaciones.ts`), aplicada a `tools/call`
 * ANTES de ejecutar la herramienta:
 *
 *   · herramienta del SDK de kons → se decide con su operación (método,
 *     camino, sensibilidad declarada o la del admin), exactamente como la
 *     ruta REST equivalente;
 *   · herramienta del núcleo (`kitsuden_*`) o de una acción → clave
 *     `mcp:<nombre>`; escribe si su scope es de escritura (o es una acción);
 *     sensibles de fábrica, las de borrar.
 *
 * Si hay que retenerla: no se ejecuta, se guarda la propuesta (canal `mcp`,
 * la herramienta y sus argumentos sin secretos) y la herramienta devuelve un
 * resultado NO erróneo con `structuredContent.code =
 * "KITSUDEN_E_APPROVAL_REQUIRED"` y la propuesta. El agente consulta el
 * estado con `kitsuden_proposal_status`.
 */

import { buildProblem } from "@kitsuden/shared";
import { createHash } from "node:crypto";
import { listMCPTools } from "@kitsuden/engine";

import { herramientaQueEscribe, puedeIntentarHerramienta } from "../services/mcp-tools";
import type { AgentAuthContext } from "../services/agent-auth";

import {
  ClaveDeIdempotenciaReutilizada,
  PropuestaNoAdmitida,
  agentePodriaEjecutar,
  calcularDiff,
  crearPropuesta,
  evaluarHerramientaDelNucleo,
  evaluarPeticion,
  instantaneaDeAprobaciones,
  todoApagado,
  urlDeEstado,
  vistaParaAgente,
  type Propuesta,
} from "./aprobaciones";
import { CLAVE_IDEMPOTENCIA_VALIDA, contieneSecreto } from "./idempotencia";
import { peticionDeHerramienta } from "./operaciones-mcp";
import { ARG_IDEMPOTENCIA } from "./operaciones-openapi";
import { resultadoDeError } from "./problemas-mcp";

/** La herramienta con la que un agente consulta sus propuestas. */
export const HERRAMIENTA_DE_ESTADO = "kitsuden_proposal_status";

export const DEFINICION_DE_HERRAMIENTA_DE_ESTADO = {
  name: HERRAMIENTA_DE_ESTADO,
  description:
    "Status of one of YOUR proposals (a request that needed human approval): pending, executing, executed, failed, rejected or expired, the reviewer's comment and, once executed, the real result. Call it with the proposal id returned by a tool whose result had code KITSUDEN_E_APPROVAL_REQUIRED.",
  inputSchema: {
    type: "object",
    properties: { proposal_id: { type: "string", description: "The proposal id (uuid)." } },
    required: ["proposal_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
};

export interface AgenteMcp {
  agentId: string;
  agentName: string;
  apiKeyId: string;
  scopes: string[];
  allowedTools: string[];
  sponsor?: AgentAuthContext["sponsor"];
}

export function contextoDeSesion(a: AgenteMcp): AgentAuthContext {
  return {
    agentId: a.agentId,
    agentName: a.agentName,
    scopes: a.scopes,
    keyId: a.apiKeyId,
    allowedTools: a.allowedTools,
    rateLimit: 0,
    writesPerDay: null,
    budgetUnitsPerDay: null,
    sponsor: a.sponsor ?? null,
  };
}

/** El resultado «pendiente de aprobación» (no es un error). */
export function resultadoPendiente(p: Propuesta) {
  const vista = vistaParaAgente(p);
  const problema = buildProblem({
    code: "KITSUDEN_E_APPROVAL_REQUIRED",
    status: 202,
    detail:
      p.status === "pending"
        ? `Pending human approval: stored as proposal ${p.id}. It has NOT been executed.`
        : `Already stored as proposal ${p.id} (status: ${p.status}).`,
    instance: "/api/mcp",
    extensions: { proposal: vista },
  });
  return {
    content: [
      {
        type: "text" as const,
        text:
          `${problema.detail} Do not call the tool again; check the status with ` +
          `${HERRAMIENTA_DE_ESTADO} { "proposal_id": "${p.id}" } or GET ${urlDeEstado(p.id)}.\n` +
          JSON.stringify({ code: problema.code, status: 202, proposal: { id: p.id, status: p.status, expiresAt: p.expiresAt } }),
      },
    ],
    structuredContent: problema,
    isError: false,
  };
}

function huellaDeHerramienta(nombre: string, args: Record<string, unknown>): string {
  return createHash("sha256").update(`mcp\n${nombre}\n${JSON.stringify(args)}`).digest("hex");
}

function errorDeNoAdmitida(motivo: PropuestaNoAdmitida["motivo"]) {
  return resultadoDeError(
    buildProblem({
      code: "KITSUDEN_E_APPROVAL_UNSUPPORTED",
      detail:
        motivo === "secret"
          ? "This call needs human approval but its arguments carry a secret, and proposals never store secrets."
          : "This call needs human approval but cannot be stored as a proposal.",
      instance: "/api/mcp",
      extensions: { reason: motivo },
    })
  );
}

/**
 * ¿Hay que retener esta llamada? Si sí, guarda la propuesta y devuelve el
 * resultado pendiente; si no, `null` (la herramienta se ejecuta como siempre).
 */
export async function retenerHerramientaSiHaceFalta(
  nombre: string,
  args: unknown,
  agente: AgenteMcp
): Promise<ReturnType<typeof resultadoPendiente> | ReturnType<typeof resultadoDeError> | null> {
  const i = await instantaneaDeAprobaciones();
  if (todoApagado(i)) return null;
  const argumentos = (args && typeof args === "object" && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
  const ctx = contextoDeSesion(agente);
  const usuario = { id: agente.agentId, role: "agent", scopes: agente.scopes };

  try {
    const sdk = peticionDeHerramienta(nombre, argumentos);
    if (sdk) {
      if ("error" in sdk) return null;
      const decision = evaluarPeticion(i, agente.agentId, sdk.metodo, sdk.camino);
      if (!decision) return null;
      if (!(await agentePodriaEjecutar(decision.deRuta, usuario))) return null;
      if (contieneSecreto(argumentos)) return errorDeNoAdmitida("secret");
      if (JSON.stringify(argumentos).length > 256 * 1024) return errorDeNoAdmitida("too_large");
      const clave = argumentos[ARG_IDEMPOTENCIA];
      const { [ARG_IDEMPOTENCIA]: _sinClave, ...guardados } = argumentos;
      const { propuesta } = await crearPropuesta({
        agente: ctx,
        canal: "mcp",
        metodo: sdk.metodo,
        camino: `${sdk.camino}${sdk.query}`,
        cuerpo: guardados,
        tipo: "application/json",
        huella: huellaDeHerramienta(nombre, guardados),
        idempotencyKey: typeof clave === "string" && CLAVE_IDEMPOTENCIA_VALIDA.test(clave) ? clave : null,
        motivo: decision.motivo,
        konId: sdk.konId,
        operacionId: sdk.op.id,
        clave: decision.clave,
        herramienta: nombre,
        diff: await calcularDiff(ctx, sdk.metodo, sdk.camino, sdk.cuerpo),
      });
      return resultadoPendiente(propuesta);
    }

    // Herramientas del núcleo y de acciones
    const esAccion = listMCPTools().some((t) => t.name === nombre);
    const escribe = esAccion || herramientaQueEscribe(nombre);
    const decision = evaluarHerramientaDelNucleo(i, agente.agentId, nombre, escribe);
    if (!decision) return null;
    if (!esAccion && !puedeIntentarHerramienta(nombre, agente.scopes)) return null;
    if (contieneSecreto(argumentos)) return errorDeNoAdmitida("secret");
    if (JSON.stringify(argumentos).length > 256 * 1024) return errorDeNoAdmitida("too_large");
    const { propuesta } = await crearPropuesta({
      agente: ctx,
      canal: "mcp",
      metodo: escribe ? "POST" : "GET",
      camino: `mcp:${nombre}`,
      cuerpo: argumentos,
      tipo: "application/json",
      huella: huellaDeHerramienta(nombre, argumentos),
      idempotencyKey: null,
      motivo: decision.motivo,
      clave: decision.clave,
      herramienta: nombre,
      diff: { kind: "tool", tool: nombre, arguments: argumentos },
    });
    return resultadoPendiente(propuesta);
  } catch (err) {
    if (err instanceof PropuestaNoAdmitida) return errorDeNoAdmitida(err.motivo);
    if (err instanceof ClaveDeIdempotenciaReutilizada) {
      return resultadoDeError(
        buildProblem({
          code: "KITSUDEN_E_IDEMPOTENCY_KEY_REUSED",
          detail: "This idempotency_key already belongs to a different proposal of this agent.",
          instance: "/api/mcp",
        })
      );
    }
    throw err;
  }
}
