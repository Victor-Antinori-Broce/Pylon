/**
 * Agent Webhook Service
 *
 * Envía notificaciones webhook cuando ocurren eventos de agentes:
 * - Autenticación exitosa/fallida
 * - Rate limiting
 * - Accesos denegados
 * - Actividad sospechosa
 *
 * Configuración via gremius.config.ts:
 *   agentWebhooks: {
 *     url: "https://hooks.slack.com/...",
 *     events: ["auth_failure", "rate_limited"],
 *     secret: "webhook-signing-secret"
 *   }
 */
import type { AuditAction } from "./agent-audit";
export interface AgentWebhookEvent {
    id: string;
    type: AuditAction;
    timestamp: string;
    agent: {
        id: string;
        name: string;
    };
    details: {
        ipAddress?: string;
        userAgent?: string;
        resource?: string;
        errorMessage?: string;
        [key: string]: any;
    };
}
/**
 * Envía un webhook de evento de agente
 */
export declare function sendAgentWebhook(event: AgentWebhookEvent): Promise<void>;
/**
 * Notifica autenticación exitosa
 */
export declare function notifyAuthSuccess(agentId: string, agentName: string, metadata?: {
    ipAddress?: string;
    userAgent?: string;
}): void;
/**
 * Notifica autenticación fallida
 */
export declare function notifyAuthFailure(agentId: string, agentName: string, error: string, metadata?: {
    ipAddress?: string;
    userAgent?: string;
}): void;
/**
 * Notifica rate limiting
 */
export declare function notifyRateLimited(agentId: string, agentName: string, limit: number, metadata?: {
    ipAddress?: string;
}): void;
/**
 * Notifica acceso denegado
 */
export declare function notifyPermissionDenied(agentId: string, agentName: string, resource: string, requiredScope: string, metadata?: {
    ipAddress?: string;
}): void;
/**
 * Notifica actividad sospechosa detectada
 */
export declare function notifySuspiciousActivity(agentId: string, agentName: string, alertType: "auth_failures" | "rate_limits" | "permission_denials", count: number, severity: "low" | "medium" | "high"): void;
/**
 * Hook que se ejecuta cuando se detecta actividad sospechosa
 * Llama a los webhooks configurados
 */
export declare function onSuspiciousActivityDetected(agentId: string, agentName: string, alertType: "auth_failures" | "rate_limits" | "permission_denials", count: number, severity: "low" | "medium" | "high"): Promise<void>;
//# sourceMappingURL=agent-webhooks.d.ts.map