/**
 * Agent Action Handler
 *
 * Ejecuta workflows de agentes de IA a través del Agent Engine.
 */

import { messageOf } from "@kitsuden/engine";

import { runAgent } from "@/services/agent-engine";

import type { Action, ActionContext, ActionResult } from "../types";

interface AgentActionConfig {
  agentId?: string;
  promptTemplate?: string;
  model?: string;
  systemPrompt?: string;
  enableMemory?: boolean;
  enableBrainSearch?: boolean;
}

export async function executeAgentAction(
  action: Action,
  context: ActionContext
): Promise<ActionResult> {
  const startTime = Date.now();

  const config = action.config as AgentActionConfig;

  if (!config.agentId) {
    return {
      success: false,
      error: "No agent configured for this action",
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Renderizar template con variables del contexto
    const message = renderPromptTemplate(
      config.promptTemplate || "Execute the configured task.",
      context
    );

    const result = await runAgent({
      agentId: config.agentId,
      message,
      enableMemory: config.enableMemory !== false,
      enableBrainSearch: config.enableBrainSearch !== false,
    });

    return {
      success: true,
      result: {
        response: result.response,
        provider: result.provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        traceId: result.traceId,
        sessionId: result.sessionId,
      },
      durationMs: Date.now() - startTime,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: messageOf(error) || "Agent execution failed",
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Claves que no se recorren al resolver `{{a.b.c}}`.
 *
 * Misma convención que `kon-formulas`: no es un riesgo de EJECUCIÓN —aquí solo
 * se lee y se convierte a texto— pero `objeto["__proto__"]` devuelve
 * `Object.prototype` en vez de `undefined`, así que una plantilla podría
 * atravesar la cadena de prototipos y acabar imprimiendo cosas del motor en un
 * prompt. Se corta en la lectura, que es donde importa.
 */
const CLAVES_PROHIBIDAS = new Set(["__proto__", "constructor", "prototype"]);

/** Recorre `a.b.c` sobre un objeto, sin salirse de sus propias claves. */
function leerRuta(datos: unknown, ruta: string): unknown {
  let actual: unknown = datos;

  for (const clave of ruta.split(".")) {
    if (CLAVES_PROHIBIDAS.has(clave)) return undefined;
    if (actual === null || typeof actual !== "object") return undefined;
    // `hasOwn` y no `in`: heredar una propiedad no cuenta como tenerla.
    if (!Object.hasOwn(actual, clave)) return undefined;
    actual = (actual as Record<string, unknown>)[clave];
  }

  return actual;
}

/** Exportada para poder probar el recorrido de rutas, que es donde estaba el riesgo. */
export function renderPromptTemplate(template: string, context: ActionContext): string {
  let result = template;

  // Reemplazar variables simples: {{event.field}} o {{request.body.field}}
  const data = context.event?.data || context.request?.body || {};
  result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = leerRuta(data, path);
    return value !== undefined && value !== null ? String(value) : "";
  });

  return result;
}
