/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Agent Telemetry Service (Paso 2: Observabilidad)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implementa TelemetryProvider para el engine, usando Drizzle ORM
 * con sintaxis correcta para agentTraceSteps.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { agentTraceSteps } from "../db/schema";
import { setTelemetryProvider } from "@gremius/engine"; // Ruta relativa al workspace
/**
 * Drizzle-based telemetry provider
 * Implementa la interfaz TelemetryProvider del engine
 */
export const drizzleTelemetryProvider = {
    /**
     * Insert a new telemetry step
     */
    async insertStep(step) {
        await db.insert(agentTraceSteps).values({
            id: step.id,
            traceId: step.traceId,
            stepOrder: step.stepOrder,
            stepType: step.stepType, // Cast from string to enum
            toolName: step.toolName,
            toolInput: step.toolInput,
            toolOutput: undefined, // Se actualiza después
            durationMs: undefined,
            errorMessage: undefined,
            metadata: {},
            createdAt: step.createdAt,
        });
    },
    /**
     * Update an existing telemetry step
     */
    async updateStep(stepId, data) {
        const updateData = {};
        if (data.toolOutput !== undefined) {
            updateData.toolOutput = data.toolOutput;
        }
        if (data.durationMs !== undefined) {
            updateData.durationMs = data.durationMs;
        }
        if (data.errorMessage !== undefined) {
            updateData.errorMessage = data.errorMessage;
        }
        await db.update(agentTraceSteps)
            .set(updateData)
            .where(eq(agentTraceSteps.id, stepId));
    },
};
/**
 * Initialize telemetry provider
 * Llama a esto durante el startup de la aplicación
 */
export function initAgentTelemetry() {
    setTelemetryProvider(drizzleTelemetryProvider);
    console.log("📊 Agent telemetry provider initialized");
}
/**
 * Helper para crear un nuevo trace
 * Retorna el traceId para usar en las acciones
 */
export async function createTrace(params) {
    const { agentId, sessionId, name, input } = params;
    // Import dinámico para evitar circular dependencies
    const { agentTraces } = await import("../db/schema");
    const [trace] = await db.insert(agentTraces).values({
        agentId,
        sessionId: sessionId || null,
        name: name || null,
        input: input || {},
        status: "running",
        startedAt: new Date(),
    }).returning({ id: agentTraces.id });
    return trace.id;
}
/**
 * Finaliza un trace con el resultado
 */
export async function completeTrace(traceId, result) {
    const { agentTraces } = await import("../db/schema");
    const durationMs = undefined; // Se calcularía desde startedAt
    await db.update(agentTraces)
        .set({
        output: result.output || {},
        errorMessage: result.errorMessage || null,
        status: result.errorMessage ? "error" : "success",
        tokensIn: result.tokensIn || null,
        tokensOut: result.tokensOut || null,
        estimatedCost: result.estimatedCost || null,
        totalDurationMs: durationMs,
        completedAt: new Date(),
    })
        .where(eq(agentTraces.id, traceId));
}
//# sourceMappingURL=agent-telemetry.js.map