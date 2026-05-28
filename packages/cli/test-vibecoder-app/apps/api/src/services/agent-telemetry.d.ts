/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Agent Telemetry Service (Paso 2: Observabilidad)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implementa TelemetryProvider para el engine, usando Drizzle ORM
 * con sintaxis correcta para agentTraceSteps.
 */
import { type TelemetryStepData } from "@gremius/engine";
/**
 * Drizzle-based telemetry provider
 * Implementa la interfaz TelemetryProvider del engine
 */
export declare const drizzleTelemetryProvider: {
    /**
     * Insert a new telemetry step
     */
    insertStep(step: TelemetryStepData): Promise<void>;
    /**
     * Update an existing telemetry step
     */
    updateStep(stepId: string, data: Partial<TelemetryStepData>): Promise<void>;
};
/**
 * Initialize telemetry provider
 * Llama a esto durante el startup de la aplicación
 */
export declare function initAgentTelemetry(): void;
/**
 * Helper para crear un nuevo trace
 * Retorna el traceId para usar en las acciones
 */
export declare function createTrace(params: {
    agentId: string;
    sessionId?: string;
    name?: string;
    input?: Record<string, unknown>;
}): Promise<string>;
/**
 * Finaliza un trace con el resultado
 */
export declare function completeTrace(traceId: string, result: {
    output?: Record<string, unknown>;
    errorMessage?: string;
    tokensIn?: number;
    tokensOut?: number;
    estimatedCost?: number;
}): Promise<void>;
//# sourceMappingURL=agent-telemetry.d.ts.map