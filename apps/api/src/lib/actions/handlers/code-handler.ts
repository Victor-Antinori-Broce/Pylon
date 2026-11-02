/**
 * Code Action Handler
 *
 * Ejecuta el código de una acción en el sandbox aislado (QuickJS en un proceso
 * aparte, ver lib/worker-sandbox.ts). La API de Kitsuden que recibe el código
 * va con la identidad que decide lib/sandbox/identidad.ts.
 */

import { apiDeSandboxPara, identidadDeLaAccion } from "../../sandbox/identidad";
import { executeSandbox } from "../../worker-sandbox";
import type { Action, ActionContext, ActionResult } from "../types";

interface CodeActionConfig {
  code: string;
  timeoutMs?: number;
  memoryLimitMb?: number;
  envVars?: Record<string, string>;
  /** Scopes de la API para el código (ver lib/sandbox/identidad.ts). */
  scopes?: string[];
  /** Hosts a los que `fetch` puede llamar (`api.ejemplo.com`, `*.ejemplo.com`). */
  fetchAllow?: string[];
  /** Máximo de llamadas a fetch + API por ejecución. */
  maxCalls?: number;
}

export async function executeCodeAction(
  action: Action,
  context: ActionContext
): Promise<ActionResult> {
  const startTime = Date.now();

  const config = action.config as CodeActionConfig;

  if (!config.code) {
    return {
      success: false,
      error: "No code configured for this action",
      durationMs: Date.now() - startTime,
    };
  }

  // Build the payload for the sandbox
  const payload: Record<string, unknown> = {
    action: {
      id: context.actionId,
      name: context.actionName,
      type: context.actionType,
    },
    trigger: context.trigger,
    event: context.event,
    request: context.request,
    timestamp: new Date().toISOString(),
  };

  const identidad = await identidadDeLaAccion(action, context.ejecutor);

  // Execute in sandbox
  const sandboxResult = await executeSandbox({
    code: config.code,
    payload,
    envVars: { ...config.envVars, ...context.env },
    timeoutMs: config.timeoutMs || 5000,
    memoryLimitMb: config.memoryLimitMb || 64,
    fetchAllow: Array.isArray(config.fetchAllow) ? config.fetchAllow.filter((h) => typeof h === "string") : [],
    maxCalls: config.maxCalls,
    api: identidad ? apiDeSandboxPara(identidad, action.id) : null,
  });

  return {
    success: sandboxResult.success,
    result: sandboxResult.result,
    logs: sandboxResult.logs || undefined,
    error: sandboxResult.error || undefined,
    durationMs: sandboxResult.durationMs,
    memoryUsedBytes: sandboxResult.memoryUsedBytes,
  };
}
