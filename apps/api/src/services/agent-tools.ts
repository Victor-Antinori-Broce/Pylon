/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Agent Tools — Kitsuden Agents Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Combina herramientas MCP dinámicas (definidas por kons vía @kitsuden/engine)
 * con herramientas MCP hardcodeadas de Kitsuden para exponerlas al LLM.
 *
 * Usado por Agent Engine para tool calling.
 */

// Deep import del submódulo (NO la fachada @kitsuden/engine): la fachada
// re-exporta módulos de apps/api y este archivo participa del grafo de
// agentes — importarla cerraba el mega-ciclo agent-handler → agent-engine →
// agent-tools → engine-index → ... → agent-handler.
import { executeMCPTool, listMCPTools } from "../../../../packages/engine/src/actions";
import { messageOf } from "../../../../packages/engine/src/errors";

import { logToolCall } from "./agent-audit";
import type { LLMTool, LLMToolParameter } from "./llm/types";
import {
  listHardcodedMCPTools,
  executeHardcodedTool,
  assertToolScope,
  assertDynamicToolScope,
} from "./mcp-tools";

export interface AgentToolContext {
  agentId: string;
  agentName: string;
  scopes?: string[];
  traceId?: string;
  keyId?: string;
  /** La lista `allowedTools` del agente (vacía = sin lista: decide el scope). */
  allowedTools?: string[];
  /** Retener toda escritura para aprobación humana (ver `AgenteMcp.retenerEscrituras`, F9). */
  retenerEscrituras?: boolean;
}

/**
 * Devuelve todas las herramientas disponibles para un agente.
 * Si se proporciona allowedTools, filtra solo esas.
 */
export function getAgentTools(allowedTools?: string[]): LLMTool[] {
  const dynamicTools: LLMTool[] = listMCPTools().map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || `Tool: ${t.name}`,
      parameters: (t.inputSchema as LLMToolParameter) || { type: "object", properties: {} },
    },
  }));

  const hardcodedTools = listHardcodedMCPTools();
  const allTools = [...dynamicTools, ...hardcodedTools];

  if (!allowedTools || allowedTools.length === 0) {
    return allTools;
  }

  return allTools.filter((tool) => allowedTools.includes(tool.function.name));
}

/**
 * Ejecuta una herramienta por nombre.
 * Primero busca en tools dinámicas, luego en hardcodeadas.
 */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<string> {
  // ── Las mismas puertas que /api/mcp (auditoría 2026-10-25) ──
  // `getAgentTools(allowedTools)` solo filtraba lo que se ENSEÑA al modelo; lo
  // que el modelo pidiera (p. ej. tras una inyección de prompt) se ejecutaba
  // igual, y sin pasar por la aprobación humana.
  const permitidas = context.allowedTools ?? [];
  if (permitidas.length > 0 && !permitidas.includes(name)) {
    throw new Error(`Tool '${name}' is not in this agent's allowed tools.`);
  }
  // Import diferido: aprobaciones-mcp tira de la fachada del motor, y este
  // fichero no puede importarla arriba (ver el comentario de los imports).
  const { retenerHerramientaSiHaceFalta } = await import("../lib/aprobaciones-mcp");
  const retenida = await retenerHerramientaSiHaceFalta(name, args, {
    agentId: context.agentId,
    agentName: context.agentName,
    apiKeyId: context.keyId ?? "",
    scopes: context.scopes ?? [],
    allowedTools: permitidas,
    retenerEscrituras: context.retenerEscrituras,
  });
  if (retenida) return JSON.stringify(retenida.structuredContent ?? retenida);

  const dynamicTools = listMCPTools();
  const isDynamic = dynamicTools.find((t) => t.name === name);

  if (isDynamic) {
    // Las tools dinámicas exigen `mcp:write` (no se sabe si escriben) y luego
    // los `requiredScopes` que la acción declare.
    assertDynamicToolScope(name, context.scopes);
    const toolStart = Date.now();
    let success = true;
    let error: string | undefined;
    try {
      const result = await executeMCPTool(name, args, {
        agentId: context.agentId,
        agentName: context.agentName,
        scopes: context.scopes || [],
        preferToon: false,
        traceId: context.traceId,
      });
      return JSON.stringify(result);
    } catch (err: unknown) {
      success = false;
      error = messageOf(err, String(err));
      throw err;
    } finally {
      // Los NOMBRES de los argumentos, nunca sus valores (pueden llevar datos
      // personales o secretos): auditoría 2026-10-25.
      logToolCall(
        context.agentId,
        context.keyId || "unknown",
        name,
        Object.keys(args ?? {}).sort(),
        Date.now() - toolStart,
        success,
        error
      );
    }
  }

  assertToolScope(name, context.scopes);
  return executeHardcodedTool(name, args, {
    agentId: context.agentId,
    agentName: context.agentName,
    scopes: context.scopes || [],
    apiKeyId: context.keyId,
  });
}
