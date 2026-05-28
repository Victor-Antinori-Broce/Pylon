/**
 * Agent Audit Service
 *
 * Registro detallado de todas las acciones de agentes NHI
 *
 * Características:
 * - Logging asíncrono (no bloquea respuestas)
 * - Retención configurable
 * - Queries analíticas
 * - Alertas de seguridad
 */
export type AuditAction = "auth_success" | "auth_failure" | "mcp_connect" | "mcp_disconnect" | "tool_call" | "data_read" | "data_write" | "data_delete" | "permission_denied" | "rate_limited";
export interface AuditLogEntry {
    agentId: string;
    keyId?: string;
    action: AuditAction;
    resource?: string;
    resourceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    durationMs?: number;
    success: boolean;
    errorMessage?: string;
}
export interface AuditQueryFilters {
    agentId?: string;
    action?: AuditAction;
    resource?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}
/**
 * Registra una acción de agente en el audit log
 * Ejecuta asíncronamente para no bloquear la respuesta
 */
export declare function logAgentAction(entry: AuditLogEntry): void;
/**
 * Helper para loguear autenticación exitosa
 */
export declare function logAuthSuccess(agentId: string, keyId: string, ipAddress?: string, userAgent?: string): void;
/**
 * Helper para loguear fallo de autenticación
 */
export declare function logAuthFailure(agentId: string, errorMessage: string, ipAddress?: string, userAgent?: string): void;
/**
 * Helper para loguear llamada a tool
 */
export declare function logToolCall(agentId: string, keyId: string, toolName: string, params: any, durationMs: number, success: boolean, error?: string): void;
/**
 * Helper para loguear acceso denegado
 */
export declare function logPermissionDenied(agentId: string, keyId: string, resource: string, requiredScope: string, ipAddress?: string): void;
/**
 * Helper para loguear rate limit
 */
export declare function logRateLimited(agentId: string, limit: number, ipAddress?: string): void;
/**
 * Obtiene logs de auditoría con filtros
 */
export declare function queryAuditLogs(filters?: AuditQueryFilters): Promise<{
    logs: {
        agentName: string | null;
        id: string;
        agentId: string;
        keyId: string | null;
        action: string;
        resource: string | null;
        resourceId: string | null;
        details: unknown;
        ipAddress: string | null;
        userAgent: string | null;
        durationMs: number | null;
        success: boolean;
        errorMessage: string | null;
        createdAt: Date;
    }[];
    total: number;
    limit: number;
    offset: number;
}>;
/**
 * Obtiene estadísticas de uso de un agente
 */
export declare function getAgentStats(agentId: string, days?: number): Promise<{
    period: string;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    successRate: string;
    actionsByType: Record<string, {
        count: number;
        success: number;
        failed: number;
    }>;
}>;
/**
 * Detecta actividad sospechosa
 */
export declare function detectSuspiciousActivity(hours?: number): Promise<{
    authFailures: {
        agentId: string;
        count: number;
        severity: string;
    }[];
    rateLimits: {
        agentId: string;
        count: number;
        severity: string;
    }[];
    permissionDenials: {
        agentId: string;
        count: number;
        severity: string;
    }[];
}>;
/**
 * Limpia logs antiguos (ejecutar periódicamente)
 */
export declare function cleanupOldLogs(retentionDays?: number): Promise<number>;
//# sourceMappingURL=agent-audit.d.ts.map