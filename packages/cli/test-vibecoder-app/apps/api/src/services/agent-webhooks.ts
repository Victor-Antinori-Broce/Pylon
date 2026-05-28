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

import { logger } from "../lib/logger";
import type { AuditAction } from "./agent-audit";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

interface WebhookConfig {
  url: string;
  events: string[]; // AuditAction[] or ["all"]
  secret?: string; // Para firmar payloads
  headers?: Record<string, string>;
}

// Leer configuración del config
function getWebhookConfig(): WebhookConfig | null {
  try {
    // Esto podría venir de la DB o del archivo de config
    const config = process.env.AGENT_WEBHOOK_URL
      ? {
          url: process.env.AGENT_WEBHOOK_URL,
          events: (process.env.AGENT_WEBHOOK_EVENTS?.split(",") as AuditAction[]) || ["all"],
          secret: process.env.AGENT_WEBHOOK_SECRET,
        }
      : null;
    return config;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE EVENTOS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// ENVÍO DE WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envía un webhook de evento de agente
 */
export async function sendAgentWebhook(event: AgentWebhookEvent): Promise<void> {
  const config = getWebhookConfig();
  if (!config) return; // Webhooks no configurados

  // Verificar si este evento debe ser enviado
  const shouldSend =
    config.events.includes("all") || config.events.includes(event.type);
  if (!shouldSend) return;

  // Construir payload
  const payload = {
    ...event,
    gremius: {
      version: "0.7.0-beta",
      source: "agent-webhook",
    },
  };

  // Enviar en background (no bloquear)
  Promise.resolve().then(async () => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Gremius-Event": event.type,
        "X-Gremius-Timestamp": event.timestamp,
        ...config.headers,
      };

      // Firmar payload si hay secret
      if (config.secret) {
        const { createHmac } = await import("crypto");
        const signature = createHmac("sha256", config.secret)
          .update(JSON.stringify(payload))
          .digest("hex");
        headers["X-Gremius-Signature"] = `sha256=${signature}`;
      }

      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.warn(
          {
            event: event.type,
            agentId: event.agent.id,
            status: response.status,
          },
          "Agent webhook delivery failed"
        );
      } else {
        logger.debug(
          {
            event: event.type,
            agentId: event.agent.id,
          },
          "Agent webhook delivered"
        );
      }
    } catch (error) {
      logger.error(
        {
          error,
          event: event.type,
          agentId: event.agent.id,
        },
        "Agent webhook delivery error"
      );
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS PARA EVENTOS ESPECÍFICOS
// ═══════════════════════════════════════════════════════════════════════════

let eventCounter = 0;
function generateEventId(): string {
  eventCounter = (eventCounter + 1) % 1000000;
  return `evt_${Date.now()}_${eventCounter.toString(36).padStart(6, "0")}`;
}

/**
 * Notifica autenticación exitosa
 */
export function notifyAuthSuccess(
  agentId: string,
  agentName: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): void {
  sendAgentWebhook({
    id: generateEventId(),
    type: "auth_success",
    timestamp: new Date().toISOString(),
    agent: { id: agentId, name: agentName },
    details: {
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    },
  });
}

/**
 * Notifica autenticación fallida
 */
export function notifyAuthFailure(
  agentId: string,
  agentName: string,
  error: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): void {
  sendAgentWebhook({
    id: generateEventId(),
    type: "auth_failure",
    timestamp: new Date().toISOString(),
    agent: { id: agentId, name: agentName },
    details: {
      errorMessage: error,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    },
  });
}

/**
 * Notifica rate limiting
 */
export function notifyRateLimited(
  agentId: string,
  agentName: string,
  limit: number,
  metadata?: { ipAddress?: string }
): void {
  sendAgentWebhook({
    id: generateEventId(),
    type: "rate_limited",
    timestamp: new Date().toISOString(),
    agent: { id: agentId, name: agentName },
    details: {
      limit,
      window: "1m",
      ipAddress: metadata?.ipAddress,
    },
  });
}

/**
 * Notifica acceso denegado
 */
export function notifyPermissionDenied(
  agentId: string,
  agentName: string,
  resource: string,
  requiredScope: string,
  metadata?: { ipAddress?: string }
): void {
  sendAgentWebhook({
    id: generateEventId(),
    type: "permission_denied",
    timestamp: new Date().toISOString(),
    agent: { id: agentId, name: agentName },
    details: {
      resource,
      requiredScope,
      ipAddress: metadata?.ipAddress,
    },
  });
}

/**
 * Notifica actividad sospechosa detectada
 */
export function notifySuspiciousActivity(
  agentId: string,
  agentName: string,
  alertType: "auth_failures" | "rate_limits" | "permission_denials",
  count: number,
  severity: "low" | "medium" | "high"
): void {
  sendAgentWebhook({
    id: generateEventId(),
    type: "auth_failure", // Reusamos, pero con flag de sospechoso
    timestamp: new Date().toISOString(),
    agent: { id: agentId, name: agentName },
    details: {
      alertType,
      count,
      severity,
      message: `Suspicious activity detected: ${count} ${alertType} in the last 24h`,
      actionRequired: severity === "high",
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN CON AUDIT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook que se ejecuta cuando se detecta actividad sospechosa
 * Llama a los webhooks configurados
 */
export async function onSuspiciousActivityDetected(
  agentId: string,
  agentName: string,
  alertType: "auth_failures" | "rate_limits" | "permission_denials",
  count: number,
  severity: "low" | "medium" | "high"
): Promise<void> {
  // Solo notificar si es medium o high
  if (severity === "low") return;

  notifySuspiciousActivity(agentId, agentName, alertType, count, severity);
}
