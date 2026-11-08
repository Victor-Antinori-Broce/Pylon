/**
 * Agent Playground API
 *
 * Endpoint para chatear con agentes desde el Admin UI.
 * Conecta con el Agent Engine y LLMs reales.
 */

import { messageOf } from "@kitsuden/engine";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "@/db";
import { agentIdentities } from "@/db/schema";
import { logger } from "@/lib/logger";
import { runAgent } from "@/services/agent-engine";

import { requireAuth } from "../middleware/auth";
import { sinAgentesEnGestionDeAgentes } from "../middleware/auth-guard";
import type { AppVariables } from "../types/hono";

const playgroundRouter = new Hono<{ Variables: AppVariables }>();

// Requiere sesión de administrador (usado desde el Admin UI)
playgroundRouter.use("*", requireAuth);
// Un agente no hace hablar a otro agente (con los scopes de ESE): solo personas (F5).
playgroundRouter.use("*", sinAgentesEnGestionDeAgentes);

/**
 * POST /api/admin/agents/:id/chat
 * Enviar mensaje a un agente y obtener respuesta
 */
playgroundRouter.post("/:id/chat", async (c) => {
  try {
    const agentId = c.req.param("id");
    const {
      message,
      sessionId = crypto.randomUUID(),
      history = [],
      enableMemory = true,
      enableBrainSearch = true,
    } = await c.req.json();

    if (!message || typeof message !== "string") {
      return c.json({ success: false, error: "Message is required" }, 400);
    }

    // Verificar que el agente existe
    const [agent] = await db
      .select()
      .from(agentIdentities)
      .where(eq(agentIdentities.id, agentId))
      .limit(1);

    if (!agent) {
      return c.json({ success: false, error: "Agent not found" }, 404);
    }

    if (!agent.isActive) {
      return c.json({ success: false, error: "Agent is inactive" }, 400);
    }

    // Ejecutar a través del Agent Engine
    const result = await runAgent({
      agentId,
      message,
      sessionId,
      history,
      enableMemory,
      enableBrainSearch,
    });

    logger.info(
      {
        agentId,
        traceId: result.traceId,
        sessionId: result.sessionId,
        provider: result.provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: result.durationMs,
        cached: result.cached,
      },
      "Agent playground chat completed"
    );

    return c.json({
      success: true,
      response: result.response,
      traceId: result.traceId,
      sessionId: result.sessionId,
      provider: result.provider,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs: result.durationMs,
      cached: result.cached,
    });
  } catch (error: unknown) {
    const agentId = c.req.param("id");
    logger.error({ error, agentId }, "Agent playground chat failed");

    // Mensajes de error amigables
    if (messageOf(error)?.includes("No LLM provider configured")) {
      return c.json(
        {
          success: false,
          error:
            "No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, or OLLAMA_BASE_URL in your .env file.",
          code: "LLM_NOT_CONFIGURED",
        },
        503
      );
    }

    return c.json(
      {
        success: false,
        error: messageOf(error) || "Failed to process agent message",
        code: "AGENT_ENGINE_ERROR",
      },
      500
    );
  }
});

/**
 * GET /api/admin/agents/:id/chat/history
 * Obtener historial de chat de una sesión
 */
playgroundRouter.get("/:id/chat/history", async (c) => {
  try {
    void c.req.param("id"); // agentId extraído para validación futura
    const sessionId = c.req.query("sessionId");

    if (!sessionId) {
      return c.json({ success: false, error: "sessionId required" }, 400);
    }

    // Obtener traces de esta sesión
    const { agentTraces, agentTraceSteps } = await import("@/db/schema");

    const traces = await db
      .select()
      .from(agentTraces)
      .where(eq(agentTraces.sessionId, sessionId))
      .orderBy(agentTraces.createdAt);

    // Para cada trace, obtener sus steps
    const history = [];
    for (const trace of traces) {
      const steps = await db
        .select()
        .from(agentTraceSteps)
        .where(eq(agentTraceSteps.traceId, trace.id))
        .orderBy(agentTraceSteps.stepOrder);

      for (const step of steps) {
        if (step.stepType === "user_input") {
          history.push({
            role: "user",
            content: step.content,
            timestamp: step.createdAt,
          });
        } else if (step.stepType === "llm_call" && step.content) {
          history.push({
            role: "assistant",
            content: step.content,
            timestamp: step.createdAt,
            traceId: trace.id,
          });
        }
      }
    }

    return c.json({
      success: true,
      history,
      sessionId,
    });
  } catch (error: unknown) {
    logger.error({ error }, "Failed to get chat history");
    return c.json(
      {
        success: false,
        error: messageOf(error),
        code: "HISTORY_ERROR",
      },
      500
    );
  }
});

export default playgroundRouter;
