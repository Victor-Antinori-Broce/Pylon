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

import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";

import { db } from "../db";
import { agentAuditLogs, agentIdentities } from "../db/schema";
import { logger } from "../lib/logger";

import {
  notifyAuthSuccess,
  notifyAuthFailure,
  notifyRateLimited,
  notifyPermissionDenied,
} from "./agent-webhooks";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export type AuditAction = 
  | "auth_success"
  | "auth_failure"
  | "mcp_connect"
  | "mcp_disconnect"
  | "tool_call"
  | "data_read"
  | "data_write"
  | "data_delete"
  | "permission_denied"
  | "rate_limited";

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

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registra una acción de agente en el audit log
 * Ejecuta asíncronamente para no bloquear la respuesta
 */
export function logAgentAction(entry: AuditLogEntry): void {
  // Ejecutar en background
  Promise.resolve().then(async () => {
    try {
      await db.insert(agentAuditLogs).values({
        agentId: entry.agentId,
        keyId: entry.keyId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        details: entry.details || {},
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        durationMs: entry.durationMs,
        success: entry.success,
        errorMessage: entry.errorMessage,
      });
    } catch (error) {
      // Loguear error pero no fallar la operación principal
      logger.error({ error, entry }, "Failed to write agent audit log");
    }
  });
}

/**
 * Helper para loguear autenticación exitosa
 */
export function logAuthSuccess(
  agentId: string,
  keyId: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAgentAction({
    agentId,
    keyId,
    action: "auth_success",
    ipAddress,
    userAgent,
    success: true,
  });

  // Notificar webhook
  notifyAuthSuccess(agentId, "", { ipAddress, userAgent });
}

/**
 * Helper para loguear fallo de autenticación
 */
export function logAuthFailure(
  agentId: string,
  errorMessage: string,
  ipAddress?: string,
  userAgent?: string
): void {
  logAgentAction({
    agentId,
    action: "auth_failure",
    ipAddress,
    userAgent,
    success: false,
    errorMessage,
  });

  // Notificar webhook
  notifyAuthFailure(agentId, "", errorMessage, { ipAddress, userAgent });
}

/**
 * Helper para loguear llamada a tool
 */
export function logToolCall(
  agentId: string,
  keyId: string,
  toolName: string,
  params: any,
  durationMs: number,
  success: boolean,
  error?: string
): void {
  logAgentAction({
    agentId,
    keyId,
    action: "tool_call",
    resource: toolName,
    details: { params },
    durationMs,
    success,
    errorMessage: error,
  });
}

/**
 * Helper para loguear acceso denegado
 */
export function logPermissionDenied(
  agentId: string,
  keyId: string,
  resource: string,
  requiredScope: string,
  ipAddress?: string
): void {
  logAgentAction({
    agentId,
    keyId,
    action: "permission_denied",
    resource,
    details: { requiredScope },
    ipAddress,
    success: false,
    errorMessage: `Missing required scope: ${requiredScope}`,
  });

  // Notificar webhook
  notifyPermissionDenied(agentId, "", resource, requiredScope, { ipAddress });
}

/**
 * Helper para loguear rate limit
 */
export function logRateLimited(
  agentId: string,
  limit: number,
  ipAddress?: string
): void {
  logAgentAction({
    agentId,
    action: "rate_limited",
    details: { limit, window: "1m" },
    ipAddress,
    success: false,
    errorMessage: `Rate limit exceeded: ${limit} requests per minute`,
  });

  // Notificar webhook
  notifyRateLimited(agentId, "", limit, { ipAddress });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES Y ANÁLISIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene logs de auditoría con filtros
 */
export async function queryAuditLogs(filters: AuditQueryFilters = {}) {
  const {
    agentId,
    action,
    resource,
    success,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = filters;

  // Build where conditions array
  const whereConditions = [];
  
  if (agentId) {
    whereConditions.push(eq(agentAuditLogs.agentId, agentId));
  }
  if (action) {
    whereConditions.push(eq(agentAuditLogs.action, action));
  }
  if (resource) {
    whereConditions.push(eq(agentAuditLogs.resource, resource));
  }
  if (success !== undefined) {
    whereConditions.push(eq(agentAuditLogs.success, success));
  }
  if (startDate) {
    whereConditions.push(gte(agentAuditLogs.createdAt, startDate));
  }
  if (endDate) {
    whereConditions.push(lte(agentAuditLogs.createdAt, endDate));
  }

  // Build base query with conditions
  const baseQuery = db
    .select({
      log: agentAuditLogs,
      agentName: agentIdentities.name,
    })
    .from(agentAuditLogs)
    .leftJoin(agentIdentities, eq(agentAuditLogs.agentId, agentIdentities.id))
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

  // Contar total (with same conditions)
  const countResult = await db
    .select({ count: count() })
    .from(agentAuditLogs)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);
    
  const total = countResult[0]?.count || 0;

  // Obtener resultados paginados
  const results = await baseQuery
    .orderBy(desc(agentAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    logs: results.map(r => ({
      ...r.log,
      agentName: r.agentName,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Obtiene estadísticas de uso de un agente
 */
export async function getAgentStats(agentId: string, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await db
    .select({
      action: agentAuditLogs.action,
      success: agentAuditLogs.success,
      count: count(),
    })
    .from(agentAuditLogs)
    .where(
      and(
        eq(agentAuditLogs.agentId, agentId),
        gte(agentAuditLogs.createdAt, startDate)
      )
    )
    .groupBy(agentAuditLogs.action, agentAuditLogs.success);

  const totalCalls = logs.reduce((sum, log) => sum + Number(log.count), 0);
  const successfulCalls = logs
    .filter(log => log.success)
    .reduce((sum, log) => sum + Number(log.count), 0);
  const failedCalls = totalCalls - successfulCalls;

  // Agrupar por acción
  const actionsByType = logs.reduce((acc, log) => {
    const key = log.action;
    if (!acc[key]) acc[key] = { count: 0, success: 0, failed: 0 };
    acc[key].count += Number(log.count);
    if (log.success) {
      acc[key].success += Number(log.count);
    } else {
      acc[key].failed += Number(log.count);
    }
    return acc;
  }, {} as Record<string, { count: number; success: number; failed: number }>);

  return {
    period: `${days}d`,
    totalCalls,
    successfulCalls,
    failedCalls,
    successRate: totalCalls > 0 ? (successfulCalls / totalCalls * 100).toFixed(2) + '%' : '0%',
    actionsByType,
  };
}

/**
 * Detecta actividad sospechosa
 */
export async function detectSuspiciousActivity(hours = 24) {
  const since = new Date();
  since.setHours(since.getHours() - hours);

  // Múltiples fallos de autenticación
  const authFailures = await db
    .select({
      agentId: agentAuditLogs.agentId,
      count: count(),
    })
    .from(agentAuditLogs)
    .where(
      and(
        eq(agentAuditLogs.action, "auth_failure"),
        gte(agentAuditLogs.createdAt, since)
      )
    )
    .groupBy(agentAuditLogs.agentId)
    .having(sql`count(*) >= 5`);

  // Múltiples rate limits
  const rateLimits = await db
    .select({
      agentId: agentAuditLogs.agentId,
      count: count(),
    })
    .from(agentAuditLogs)
    .where(
      and(
        eq(agentAuditLogs.action, "rate_limited"),
        gte(agentAuditLogs.createdAt, since)
      )
    )
    .groupBy(agentAuditLogs.agentId)
    .having(sql`count(*) >= 3`);

  // Accesos denegados
  const permissionDenials = await db
    .select({
      agentId: agentAuditLogs.agentId,
      count: count(),
    })
    .from(agentAuditLogs)
    .where(
      and(
        eq(agentAuditLogs.action, "permission_denied"),
        gte(agentAuditLogs.createdAt, since)
      )
    )
    .groupBy(agentAuditLogs.agentId)
    .having(sql`count(*) >= 5`);

  return {
    authFailures: authFailures.map(r => ({
      agentId: r.agentId,
      count: Number(r.count),
      severity: Number(r.count) > 10 ? 'high' : 'medium',
    })),
    rateLimits: rateLimits.map(r => ({
      agentId: r.agentId,
      count: Number(r.count),
      severity: Number(r.count) > 5 ? 'high' : 'low',
    })),
    permissionDenials: permissionDenials.map(r => ({
      agentId: r.agentId,
      count: Number(r.count),
      severity: Number(r.count) > 10 ? 'high' : 'medium',
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MANTENIMIENTO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Limpia logs antiguos (ejecutar periódicamente)
 */
export async function cleanupOldLogs(retentionDays = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db
    .delete(agentAuditLogs)
    .where(lte(agentAuditLogs.createdAt, cutoffDate));

  const deleted = result.rowCount || 0;
  logger.info({ deleted, retentionDays }, "Cleaned up old agent audit logs");
  
  return deleted;
}
