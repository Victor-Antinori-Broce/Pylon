/**
 * Agent Playground API
 *
 * Endpoint para chatear con agentes desde el Admin UI.
 * Conecta con el MCP server para procesar mensajes.
 */
import { Hono } from "hono";
// @ts-ignore - Path alias @/ not resolved by tsc
import { db } from "@/db";
// @ts-ignore - Path alias @/ not resolved by tsc
import { agentIdentities, agentTraces, agentTraceSteps } from "@/db/schema";
import { eq } from "drizzle-orm";
// @ts-ignore - Path alias @/ not resolved by tsc
import { logger } from "@/lib/logger";
const playgroundRouter = new Hono();
/**
 * POST /api/admin/agents/:id/chat
 * Enviar mensaje a un agente y obtener respuesta
 */
playgroundRouter.post("/:id/chat", async (c) => {
    try {
        const agentId = c.req.param("id");
        const { message, sessionId = crypto.randomUUID(), history: _history = [] } = await c.req.json();
        // Verificar que el agente existe
        const [agent] = await db
            .select()
            .from(agentIdentities)
            .where(eq(agentIdentities.id, agentId))
            .limit(1);
        if (!agent) {
            return c.json({ error: "Agent not found" }, 404);
        }
        if (!agent.isActive) {
            return c.json({ error: "Agent is inactive" }, 400);
        }
        // Crear trace para esta conversación
        const [trace] = await db
            .insert(agentTraces)
            .values({
            agentId,
            sessionId,
            name: `Playground: ${message.slice(0, 50)}...`,
            input: { message, history: _history },
            status: "running",
            startedAt: new Date(),
        })
            .returning({ id: agentTraces.id });
        // trace.id is used below
        // Agregar step de user_input
        await db.insert(agentTraceSteps).values({
            traceId: trace.id,
            stepOrder: 0,
            stepType: "user_input",
            content: message,
            createdAt: new Date(),
        });
        // Procesar con el agente (simulado por ahora, luego se conecta a MCP/LLM)
        const startTime = Date.now();
        // TODO: Integrar con LLM real (OpenAI, Claude, etc.)
        // Por ahora simulamos una respuesta
        const response = await processWithAgent(agent, message, _history, trace.id);
        const durationMs = Date.now() - startTime;
        // Agregar step de respuesta
        await db.insert(agentTraceSteps).values({
            traceId: trace.id,
            stepOrder: 1,
            stepType: "llm_call",
            content: response,
            durationMs,
            createdAt: new Date(),
        });
        // Completar trace
        await db
            .update(agentTraces)
            .set({
            output: { response },
            status: "success",
            totalDurationMs: durationMs,
            completedAt: new Date(),
        })
            .where(eq(agentTraces.id, trace.id));
        logger.info({ agentId, traceId: trace.id, durationMs }, "Agent playground chat completed");
        return c.json({
            success: true,
            response,
            traceId: trace.id,
            sessionId,
        });
    }
    catch (error) {
        const _agentId = c.req.param("id");
        logger.error({ error, agentId: _agentId }, "Agent playground chat failed");
        return c.json({ error: error.message }, 500);
    }
});
/**
 * Procesa un mensaje con el agente
 *
 * Por ahora es una simulación. En producción esto debería:
 * 1. Llamar a la API de OpenAI/Claude con el system prompt del agente
 * 2. Ejecutar tools si el LLM las solicita
 * 3. Retornar la respuesta final
 */
async function processWithAgent(agent, message, _history, _traceId) {
    // Simulación de respuesta
    // En producción, esto llamaría a OpenAI/Claude
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes("hola") || lowerMsg.includes("hi") || lowerMsg.includes("hello")) {
        return `¡Hola! Soy ${agent.name}, tu asistente virtual. ${agent.description || "Estoy aquí para ayudarte."}`;
    }
    if (lowerMsg.includes("ayuda") || lowerMsg.includes("help")) {
        return `Puedo ayudarte con diversas tareas. ${agent.systemPrompt || "Soy un agente de propósito general."}`;
    }
    if (lowerMsg.includes("capacidades") || lowerMsg.includes("qué puedes hacer")) {
        const capabilities = agent.capabilities;
        const caps = capabilities?.length
            ? `Mis capacidades incluyen: ${capabilities.join(", ")}.`
            : "Tengo capacidades generales de asistencia.";
        return caps;
    }
    // Respuesta genérica
    return `Entiendo: "${message}". Como ${agent.name}, estoy procesando tu solicitud. En una implementación completa, esto se conectaría con un LLM como GPT-4 o Claude para darte una respuesta inteligente.`;
}
/**
 * GET /api/admin/agents/:id/chat/history
 * Obtener historial de chat de una sesión
 */
playgroundRouter.get("/:id/chat/history", async (c) => {
    try {
        void c.req.param("id"); // agentId extracted for validation
        const sessionId = c.req.query("sessionId");
        if (!sessionId) {
            return c.json({ error: "sessionId required" }, 400);
        }
        // Obtener traces de esta sesión
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
                }
                else if (step.stepType === "llm_call" && step.content) {
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
    }
    catch (error) {
        logger.error({ error }, "Failed to get chat history");
        return c.json({ error: error.message }, 500);
    }
});
export default playgroundRouter;
//# sourceMappingURL=agent-playground.js.map