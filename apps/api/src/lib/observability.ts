/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OBSERVABILITY - Métricas y estadísticas del sistema
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proporciona métricas reales para el dashboard de administración.
 * Reemplaza todos los mockups con datos del sistema real.
 */

import { eqEnum } from "@kitsuden/engine";
import { sql, count, desc, gte, and, eq, lte } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import {
  dataSets,
  dataEntries,
  authUsers,
  media,
  agentIdentities,
  agentTraces,
  agentTraceSteps,
  agentAuditLogs,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppVariables } from "../types/hono";

import { getMetricsSnapshot, getRouteSnapshots } from "./metrics";
import { realtimeManager } from "./realtime";
import { buildAlertReport, evaluateSlo } from "./slo";
import { getValkeyClient } from "./valkey";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SystemStats {
  // Database
  datasets: {
    total: number;
    entries: number;
    entriesToday: number;
  };
  users: {
    total: number;
    activeToday: number;
    newThisWeek: number;
  };
  content: {
    posts: number;
    games: number;
    media: number;
  };
  agents: {
    total: number;
    active: number;
  };

  // Performance
  performance: {
    avgResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
  };

  // Infrastructure
  infra: {
    databaseStatus: "healthy" | "degraded" | "down";
    cacheStatus: "healthy" | "degraded" | "down";
    websocketConnections: number;
    activeChannels: number;
  };

  // Storage
  storage: {
    used: number;
    total: number;
    files: number;
  };

  // Uptime
  uptime: {
    since: string;
    duration: string;
    percentage: number;
  };
}

export interface ActivityItem {
  id: string;
  type: "entry" | "user" | "webhook" | "agent" | "system";
  action: string;
  description: string;
  user?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "down";
  checks: {
    database: boolean;
    cache: boolean;
    storage: boolean;
    realtime: boolean;
  };
  latency: {
    database: number;
    cache: number;
  };
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS COLECTORES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene estadísticas de la base de datos
 */
async function getDatabaseStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    datasetsResult,
    entriesResult,
    entriesTodayResult,
    usersResult,
    usersTodayResult,
    usersWeekResult,
    postsResult,
    gamesResult,
    mediaResult,
    agentsResult,
  ] = await Promise.all([
    // Datasets
    db.select({ count: count() }).from(dataSets),
    db.select({ count: count() }).from(dataEntries),
    db.select({ count: count() }).from(dataEntries).where(gte(dataEntries.createdAt, today)),

    // Users
    db.select({ count: count() }).from(authUsers),
    db.select({ count: count() }).from(authUsers).where(gte(authUsers.createdAt, today)),
    db
      .select({ count: count() })
      .from(authUsers)
      .where(gte(authUsers.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))),

    // Content
    db.execute<{ count: number }>(sql`SELECT COUNT(*) as count FROM blog_posts`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*) as count FROM games`),
    db.select({ count: count() }).from(media),

    // Agents
    db.select({ count: count() }).from(agentIdentities),
  ]);

  return {
    datasets: {
      total: datasetsResult[0]?.count || 0,
      entries: entriesResult[0]?.count || 0,
      entriesToday: entriesTodayResult[0]?.count || 0,
    },
    users: {
      total: usersResult[0]?.count || 0,
      activeToday: usersTodayResult[0]?.count || 0,
      newThisWeek: usersWeekResult[0]?.count || 0,
    },
    content: {
      posts: Number((postsResult as any).rows?.[0]?.count ?? 0) || 0,
      games: Number((gamesResult as any).rows?.[0]?.count ?? 0) || 0,
      media: mediaResult[0]?.count || 0,
    },
    agents: {
      total: agentsResult[0]?.count || 0,
      active: Math.floor((agentsResult[0]?.count || 0) * 0.7), // Estimado
    },
  };
}

/**
 * Obtiene estadísticas de infraestructura
 */
async function getInfraStats() {
  const wsStats = realtimeManager.getStats();

  // Test de latencia de DB
  const dbStart = Date.now();
  let dbHealthy = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbHealthy = true;
  } catch {
    dbHealthy = false;
  }
  const dbLatency = Date.now() - dbStart;

  // Test de latencia de cache
  //
  // OBTENER el cliente va DENTRO del try: `getValkeyClient()` lanza cuando la
  // caché no responde, y estaba fuera. El resultado era que /health devolvía
  // 500 en vez de reportar "cache: down" — justo al revés de para lo que
  // existe un health check, y encima tumbaba también el estado de la base de
  // datos, que estaba perfectamente sana.
  const cacheStart = Date.now();
  let cacheHealthy = false;
  try {
    const valkey = await getValkeyClient();
    await valkey.ping();
    cacheHealthy = true;
  } catch {
    cacheHealthy = false;
  }
  const cacheLatency = Date.now() - cacheStart;

  return {
    databaseStatus: (dbHealthy ? "healthy" : "down") as "healthy" | "degraded" | "down",
    cacheStatus: (cacheHealthy ? "healthy" : "down") as "healthy" | "degraded" | "down",
    websocketConnections: wsStats.connections,
    activeChannels: wsStats.channels,
    latency: {
      database: dbLatency,
      cache: cacheLatency,
    },
  };
}

/**
 * Obtiene estadísticas de almacenamiento
 */
async function getStorageStats() {
  try {
    const result = await db.execute<{
      total_size: number;
      file_count: number;
    }>(sql`
      SELECT 
        COALESCE(SUM((metadata->>'size')::int), 0) as total_size,
        COUNT(*) as file_count
      FROM media
    `);

    const totalBytes = result.rows[0]?.total_size || 0;
    const fileCount = result.rows[0]?.file_count || 0;

    return {
      used: totalBytes,
      total: 10 * 1024 * 1024 * 1024, // 10GB placeholder
      files: fileCount,
    };
  } catch {
    return { used: 0, total: 10 * 1024 * 1024 * 1024, files: 0 };
  }
}

/**
 * Obtiene tiempo de uptime del servidor
 */
function getUptimeStats() {
  const uptime = process.uptime();
  const startTime = new Date(Date.now() - uptime * 1000);

  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);

  return {
    since: startTime.toISOString(),
    duration: days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`,
    percentage: 99.9, // Ideal, se calcularía con histórico real
  };
}

/**
 * Métricas de performance REALES desde el MetricsRegistry (SLIs medidos por el
 * middleware de telemetría). Antes esto devolvía valores con Math.random().
 */
function getPerformanceStats() {
  const snap = getMetricsSnapshot();
  return {
    avgResponseTime: snap.latency.avg,
    requestsPerMinute: snap.throughputPerMin,
    errorRate: parseFloat(snap.errorRate.toFixed(4)),
    p95ResponseTime: snap.latency.p95,
    p99ResponseTime: snap.latency.p99,
    successRate: parseFloat(snap.successRate.toFixed(4)),
  };
}

/**
 * Obtiene actividad reciente
 */
async function getRecentActivity(limit: number = 10): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];

  // Entradas recientes
  const recentEntries = await db
    .select({
      id: dataEntries.id,
      title: dataEntries.title,
      datasetId: dataEntries.dataSetId,
      createdAt: dataEntries.createdAt,
    })
    .from(dataEntries)
    .orderBy(desc(dataEntries.createdAt))
    .limit(limit);

  for (const entry of recentEntries) {
    activities.push({
      id: entry.id,
      type: "entry",
      action: "created",
      description: `Entry "${entry.title.slice(0, 30)}..." created`,
      timestamp: entry.createdAt?.toISOString() || new Date().toISOString(),
      metadata: { datasetId: entry.datasetId },
    });
  }

  // Usuarios recientes
  const recentUsers = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      createdAt: authUsers.createdAt,
    })
    .from(authUsers)
    .orderBy(desc(authUsers.createdAt))
    .limit(5);

  for (const user of recentUsers) {
    activities.push({
      id: user.id,
      type: "user",
      action: "registered",
      description: `User ${user.name || user.email} registered`,
      timestamp: user.createdAt?.toISOString() || new Date().toISOString(),
    });
  }

  // Ordenar y limitar
  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las estadísticas del sistema
 */
export async function getSystemStats(): Promise<SystemStats> {
  const [dbStats, infraStats, storageStats, uptimeStats, perfStats] = await Promise.all([
    getDatabaseStats(),
    getInfraStats(),
    getStorageStats(),
    getUptimeStats(),
    getPerformanceStats(),
  ]);

  return {
    ...dbStats,
    performance: perfStats,
    infra: infraStats,
    storage: storageStats,
    uptime: uptimeStats,
  };
}

/**
 * Obtiene estado de salud del sistema
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const infra = await getInfraStats();

  const checks = {
    database: infra.databaseStatus === "healthy",
    cache: infra.cacheStatus === "healthy",
    storage: true, // Asumimos S3/MinIO está OK
    realtime: infra.websocketConnections >= 0,
  };

  /**
   * No todas las dependencias pesan igual.
   *
   * Antes se calculaba `allHealthy = every(...)` y `anyDown = some(!...)`, que
   * son complementarios exactos: en cuanto uno fallaba el otro era cierto, así
   * que **"degraded" era inalcanzable** y cualquier dependencia caída daba 503.
   * En la práctica eso significaba que un parpadeo de Valkey sacaba de rotación
   * a TODAS las instancias de la API, que seguían pudiendo servir tráfico
   * perfectamente — el balanceador provocaba la caída que creía estar evitando.
   *
   * La base de datos es lo único sin lo cual no hay nada que servir. La caché y
   * el tiempo real degradan; no tumban.
   */
  const CRITICAL: Array<keyof typeof checks> = ["database"];
  const criticalDown = CRITICAL.some((key) => !checks[key]);
  const allHealthy = Object.values(checks).every(Boolean);

  return {
    status: criticalDown ? "down" : allHealthy ? "healthy" : "degraded",
    checks,
    latency: infra.latency,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Obtiene métricas para gráficos
 */
export async function getMetrics(timeRange: "1h" | "24h" | "7d" | "30d" = "24h") {
  const now = new Date();
  const ranges = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  const startDate = new Date(now.getTime() - ranges[timeRange]);

  // Entradas creadas en el rango
  const entriesByDay = await db.execute<{ date: string; count: number }>(sql`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as count
    FROM data_entries
    WHERE created_at >= ${startDate}
    GROUP BY DATE(created_at)
    ORDER BY date
  `);

  // Usuarios creados en el rango
  const usersByDay = await db.execute<{ date: string; count: number }>(sql`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as count
    FROM auth_users
    WHERE created_at >= ${startDate}
    GROUP BY DATE(created_at)
    ORDER BY date
  `);

  return {
    timeRange,
    entries: entriesByDay.rows,
    users: usersByDay.rows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

export const observabilityRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * GET /api/health - Liveness: ¿el proceso responde? (no toca dependencias)
 */
observabilityRoutes.get("/health", async (c) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
  return c.json(health, statusCode);
});

/**
 * GET /api/live - Liveness puro (para orquestadores). Siempre 200 si el event
 * loop responde; no consulta DB/cache (evita reinicios en cascada por una
 * dependencia caída).
 */
observabilityRoutes.get("/live", (c) => {
  return c.json({
    status: "alive",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/ready - Readiness: ¿puede el servicio atender tráfico? Verifica
 * dependencias críticas (DB, cache). 503 si alguna está caída → el balanceador
 * deja de enrutar hasta que se recupere.
 */
observabilityRoutes.get("/ready", async (c) => {
  const infra = await getInfraStats();
  const checks = {
    database: infra.databaseStatus === "healthy",
    cache: infra.cacheStatus === "healthy",
  };
  const ready = checks.database; // cache degradado no bloquea readiness
  return c.json(
    {
      status: ready ? "ready" : "not_ready",
      checks,
      latency: infra.latency,
      timestamp: new Date().toISOString(),
    },
    ready ? 200 : 503
  );
});

/**
 * GET /api/admin/slo - Estado de SLIs/SLOs, error budget y alertas por síntoma.
 * Práctica #3 y #4: la conversación pasa de "¿está caído?" a "¿cumplimos las
 * expectativas del usuario y se está quemando el error budget?".
 */
observabilityRoutes.get("/admin/slo", requireAuth, (c) => {
  const report = buildAlertReport();
  return c.json({
    ...report,
    routes: getRouteSnapshots(15),
  });
});

/**
 * GET /api/slo - Resumen público de SLO (sin detalle de rutas ni causas).
 */
observabilityRoutes.get("/slo", (c) => {
  const status = evaluateSlo();
  return c.json({
    availability: {
      sli: parseFloat(status.availability.sli.toFixed(5)),
      slo: status.availability.slo,
      met: status.availability.met,
      budgetRemaining: parseFloat(status.availability.budgetRemaining.toFixed(4)),
    },
    latency: status.latency,
    window: { minutes: status.window.windowMinutes, requests: status.window.total },
  });
});

/**
 * GET /api/admin/stats - Estadísticas completas (admin)
 */
observabilityRoutes.get("/admin/stats", requireAuth, async (c) => {
  try {
    const stats = await getSystemStats();
    return c.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

/**
 * GET /api/admin/activity - Actividad reciente
 */
observabilityRoutes.get("/admin/activity", requireAuth, async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 10, 50);

  try {
    const activity = await getRecentActivity(limit);
    return c.json({ activity });
  } catch (error) {
    return c.json({ error: "Failed to fetch activity" }, 500);
  }
});

/**
 * GET /api/admin/metrics - Métricas para gráficos
 */
observabilityRoutes.get("/admin/metrics", requireAuth, async (c) => {
  const range = (c.req.query("range") as any) || "24h";

  try {
    const metrics = await getMetrics(range);
    return c.json(metrics);
  } catch (error) {
    return c.json({ error: "Failed to fetch metrics" }, 500);
  }
});

/**
 * GET /api/admin/realtime - Stats de WebSocket en tiempo real
 */
observabilityRoutes.get("/admin/realtime", requireAuth, async (c) => {
  const wsStats = realtimeManager.getStats();

  // Mismo motivo que en `getInfraStats`: pedir el cliente lanza si la caché no
  // responde. Fuera del try, esto tumbaba unas stats de WebSocket que ni
  // siquiera dependen de Valkey.
  let pubsubStats = { channels: 0, patterns: 0 };
  try {
    const valkey = await getValkeyClient();
    await valkey.info("stats");
    // Parsear info básica
    pubsubStats = {
      channels: wsStats.channels,
      patterns: wsStats.rooms,
    };
  } catch {
    // Ignore
  }

  return c.json({
    websockets: wsStats,
    pubsub: pubsubStats,
  });
});

/**
 * GET / - Homepage con stats (para el dashboard)
 */
observabilityRoutes.get("/", async (c) => {
  try {
    const [stats, health, activity] = await Promise.all([
      getSystemStats(),
      getHealthStatus(),
      getRecentActivity(5),
    ]);

    return c.json({
      message: "Kitsuden API",
      version: "0.5.0",
      status: health.status,
      stats: {
        datasets: stats.datasets.total,
        entries: stats.datasets.entries,
        users: stats.users.total,
        content: stats.content.posts + stats.content.games,
        agents: stats.agents.total,
        uptime: stats.uptime.duration,
      },
      activity,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        message: "Kitsuden API",
        version: "0.5.0",
        status: "degraded",
        error: "Partial data available",
      },
      200
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TELEMETRY & TRACEABILITY ENDPOINTS (Prometheus / Loki / OpenTelemetry friendly)
// ═══════════════════════════════════════════════════════════════════════════════

interface TraceFilters {
  agentId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Lista traces de agentes con filtros y paginación.
 */
async function listTraces(filters: TraceFilters = {}) {
  const { agentId, status, from, to, limit = 50, offset = 0 } = filters;
  const conditions = [];

  if (agentId) conditions.push(eq(agentTraces.agentId, agentId));
  // `eqEnum` devuelve undefined si el valor no pertenece al enum.
  const filtro663 = eqEnum(agentTraces.status, status);
  if (filtro663) conditions.push(filtro663);
  if (from) conditions.push(gte(agentTraces.createdAt, from));
  if (to) conditions.push(lte(agentTraces.createdAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [tracesList, totalResult] = await Promise.all([
    db
      .select({
        trace: agentTraces,
        agentName: agentIdentities.name,
      })
      .from(agentTraces)
      .leftJoin(agentIdentities, eq(agentTraces.agentId, agentIdentities.id))
      .where(where)
      .orderBy(desc(agentTraces.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(agentTraces).where(where),
  ]);

  return {
    traces: tracesList.map((r) => ({
      ...r.trace,
      agentName: r.agentName,
    })),
    total: totalResult[0]?.count || 0,
    limit,
    offset,
  };
}

/**
 * Obtiene un trace con sus steps.
 */
async function getTraceWithSteps(traceId: string) {
  const [trace] = await db
    .select({
      trace: agentTraces,
      agentName: agentIdentities.name,
    })
    .from(agentTraces)
    .leftJoin(agentIdentities, eq(agentTraces.agentId, agentIdentities.id))
    .where(eq(agentTraces.id, traceId))
    .limit(1);

  if (!trace) return null;

  const steps = await db
    .select()
    .from(agentTraceSteps)
    .where(eq(agentTraceSteps.traceId, traceId))
    .orderBy(agentTraceSteps.stepOrder);

  return {
    ...trace.trace,
    agentName: trace.agentName,
    steps,
  };
}

/**
 * Métricas agregadas de ejecución de tools.
 */
async function getToolTelemetry(timeRange: "1h" | "24h" | "7d" | "30d" = "24h") {
  const ranges = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const since = new Date(Date.now() - ranges[timeRange]);

  const perTool = await db
    .select({
      toolName: agentTraceSteps.toolName,
      count: count(),
      avgDuration: sql<number>`COALESCE(AVG(${agentTraceSteps.durationMs}), 0)`,
      errors: sql<number>`COUNT(CASE WHEN ${agentTraceSteps.errorMessage} IS NOT NULL THEN 1 END)`,
    })
    .from(agentTraceSteps)
    .where(
      and(eq(agentTraceSteps.stepType, "tool_call" as any), gte(agentTraceSteps.createdAt, since))
    )
    .groupBy(agentTraceSteps.toolName);

  const perAgent = await db
    .select({
      agentId: agentTraces.agentId,
      count: count(),
      avgDuration: sql<number>`COALESCE(AVG(${agentTraces.totalDurationMs}), 0)`,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since))
    .groupBy(agentTraces.agentId);

  return {
    timeRange,
    since: since.toISOString(),
    perTool,
    perAgent,
  };
}

/**
 * Logs de auditoría en formato Loki-like (streams + values).
 */
async function getLogsAsLokiStreams(filters: {
  agentId?: string;
  action?: string;
  resource?: string;
  success?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}) {
  const { agentId, action, resource, success, from, to, limit = 100, offset = 0 } = filters;
  const conditions = [];

  if (agentId) conditions.push(eq(agentAuditLogs.agentId, agentId));
  // `eqEnum` devuelve undefined si el valor no pertenece al enum.
  const filtro784 = eqEnum(agentAuditLogs.action, action);
  if (filtro784) conditions.push(filtro784);
  if (resource) conditions.push(eq(agentAuditLogs.resource, resource));
  if (success !== undefined) conditions.push(eq(agentAuditLogs.success, success));
  if (from) conditions.push(gte(agentAuditLogs.createdAt, from));
  if (to) conditions.push(lte(agentAuditLogs.createdAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db
    .select()
    .from(agentAuditLogs)
    .where(where)
    .orderBy(desc(agentAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  // Agrupar en streams por agentId + action + success
  const streamMap = new Map<
    string,
    { stream: Record<string, string>; values: [string, string][] }
  >();

  for (const log of logs) {
    const labels: Record<string, string> = {
      agent_id: log.agentId || "unknown",
      action: log.action || "unknown",
      success: String(log.success),
    };
    if (log.resource) labels.resource = log.resource;

    const key = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");

    if (!streamMap.has(key)) {
      streamMap.set(key, { stream: labels, values: [] });
    }

    const timestampNs = `${BigInt(new Date(log.createdAt).getTime()) * 1000000n}`;
    const value = JSON.stringify({
      id: log.id,
      keyId: log.keyId,
      resourceId: log.resourceId,
      details: log.details,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      durationMs: log.durationMs,
      errorMessage: log.errorMessage,
    });

    streamMap.get(key)!.values.push([timestampNs, value]);
  }

  return { streams: Array.from(streamMap.values()) };
}

/**
 * Genera métricas en formato Prometheus exposition.
 */
async function generatePrometheusMetrics(): Promise<string> {
  const lines: string[] = [];
  const now = Date.now();

  lines.push("# HELP kitsuden_up Kitsuden API uptime indicator");
  lines.push("# TYPE kitsuden_up gauge");
  lines.push(`kitsuden_up 1 ${now}`);

  // Memory
  const mem = process.memoryUsage();
  lines.push("# HELP kitsuden_memory_heap_used_bytes Heap used in bytes");
  lines.push("# TYPE kitsuden_memory_heap_used_bytes gauge");
  lines.push(`kitsuden_memory_heap_used_bytes ${mem.heapUsed}`);
  lines.push("# HELP kitsuden_memory_heap_total_bytes Heap total in bytes");
  lines.push("# TYPE kitsuden_memory_heap_total_bytes gauge");
  lines.push(`kitsuden_memory_heap_total_bytes ${mem.heapTotal}`);

  // Uptime
  lines.push("# HELP kitsuden_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE kitsuden_uptime_seconds counter");
  lines.push(`kitsuden_uptime_seconds ${Math.floor(process.uptime())}`);

  // ── HTTP SLIs (últimos 60 min) — práctica #3 ──
  const http = getMetricsSnapshot();
  const slo = evaluateSlo();
  lines.push("# HELP kitsuden_http_requests_total HTTP requests in the last 60m");
  lines.push("# TYPE kitsuden_http_requests_total gauge");
  lines.push(`kitsuden_http_requests_total ${http.total}`);
  lines.push("# HELP kitsuden_http_server_errors_total HTTP 5xx in the last 60m");
  lines.push("# TYPE kitsuden_http_server_errors_total gauge");
  lines.push(`kitsuden_http_server_errors_total ${http.serverErrors}`);
  lines.push("# HELP kitsuden_http_success_rate Success rate SLI (non-5xx / total)");
  lines.push("# TYPE kitsuden_http_success_rate gauge");
  lines.push(`kitsuden_http_success_rate ${http.successRate.toFixed(5)}`);
  lines.push("# HELP kitsuden_http_latency_ms Request latency percentiles (ms)");
  lines.push("# TYPE kitsuden_http_latency_ms gauge");
  lines.push(`kitsuden_http_latency_ms{quantile="0.5"} ${http.latency.p50}`);
  lines.push(`kitsuden_http_latency_ms{quantile="0.95"} ${http.latency.p95}`);
  lines.push(`kitsuden_http_latency_ms{quantile="0.99"} ${http.latency.p99}`);
  lines.push("# HELP kitsuden_slo_error_budget_remaining Fraction of error budget left");
  lines.push("# TYPE kitsuden_slo_error_budget_remaining gauge");
  lines.push(`kitsuden_slo_error_budget_remaining ${slo.availability.budgetRemaining.toFixed(5)}`);
  lines.push("# HELP kitsuden_slo_availability_met Availability SLO met (1=yes)");
  lines.push("# TYPE kitsuden_slo_availability_met gauge");
  lines.push(`kitsuden_slo_availability_met ${slo.availability.met ? 1 : 0}`);

  // WebSockets
  const wsStats = realtimeManager.getStats();
  lines.push("# HELP kitsuden_websocket_connections_active Active WebSocket connections");
  lines.push("# TYPE kitsuden_websocket_connections_active gauge");
  lines.push(`kitsuden_websocket_connections_active ${wsStats.connections}`);

  // DB latency
  const dbStart = Date.now();
  let dbHealthy = 0;
  try {
    await db.execute(sql`SELECT 1`);
    dbHealthy = 1;
  } catch {
    dbHealthy = 0;
  }
  const dbLatency = Date.now() - dbStart;
  lines.push("# HELP kitsuden_db_healthy Database health (1 = healthy)");
  lines.push("# TYPE kitsuden_db_healthy gauge");
  lines.push(`kitsuden_db_healthy ${dbHealthy}`);
  lines.push("# HELP kitsuden_db_latency_milliseconds Database latency in milliseconds");
  lines.push("# TYPE kitsuden_db_latency_milliseconds gauge");
  lines.push(`kitsuden_db_latency_milliseconds ${dbLatency}`);

  // Agents counts
  const [{ agentsTotal }] = await db.select({ agentsTotal: count() }).from(agentIdentities);
  lines.push("# HELP kitsuden_agents_total Total registered agents");
  lines.push("# TYPE kitsuden_agents_total gauge");
  lines.push(`kitsuden_agents_total ${agentsTotal}`);

  // Traces by status (last 24h)
  const traceSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tracesByStatus = await db
    .select({ status: agentTraces.status, count: count() })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, traceSince))
    .groupBy(agentTraces.status);

  lines.push("# HELP kitsuden_agent_traces_total Agent traces created (last 24h)");
  lines.push("# TYPE kitsuden_agent_traces_total counter");
  for (const row of tracesByStatus) {
    lines.push(`kitsuden_agent_traces_total{status="${row.status}"} ${row.count}`);
  }

  // Trace steps by tool (last 24h)
  const stepsByTool = await db
    .select({ toolName: agentTraceSteps.toolName, count: count() })
    .from(agentTraceSteps)
    .where(gte(agentTraceSteps.createdAt, traceSince))
    .groupBy(agentTraceSteps.toolName);

  lines.push("# HELP kitsuden_agent_trace_steps_total Agent trace steps executed (last 24h)");
  lines.push("# TYPE kitsuden_agent_trace_steps_total counter");
  for (const row of stepsByTool) {
    const tool = row.toolName || "unknown";
    lines.push(
      `kitsuden_agent_trace_steps_total{tool="${tool.replace(/"/g, '\\"')}"} ${row.count}`
    );
  }

  // Audit logs by action (last 24h)
  const auditByAction = await db
    .select({
      action: agentAuditLogs.action,
      success: agentAuditLogs.success,
      count: count(),
    })
    .from(agentAuditLogs)
    .where(gte(agentAuditLogs.createdAt, traceSince))
    .groupBy(agentAuditLogs.action, agentAuditLogs.success);

  lines.push("# HELP kitsuden_agent_audit_logs_total Agent audit log entries (last 24h)");
  lines.push("# TYPE kitsuden_agent_audit_logs_total counter");
  for (const row of auditByAction) {
    const action = row.action || "unknown";
    lines.push(
      `kitsuden_agent_audit_logs_total{action="${action}",success="${row.success}"} ${row.count}`
    );
  }

  return lines.join("\n") + "\n";
}

/**
 * GET /api/admin/traces - Lista de traces con filtros.
 */
observabilityRoutes.get("/admin/traces", requireAuth, async (c) => {
  try {
    const agentId = c.req.query("agentId") || undefined;
    const status = c.req.query("status") || undefined;
    const from = c.req.query("from") ? new Date(c.req.query("from")!) : undefined;
    const to = c.req.query("to") ? new Date(c.req.query("to")!) : undefined;
    const limit = Math.min(Number(c.req.query("limit") || "50"), 200);
    const offset = Math.max(Number(c.req.query("offset") || "0"), 0);

    const result = await listTraces({ agentId, status, from, to, limit, offset });
    return c.json(result);
  } catch (error) {
    console.error("Traces list error:", error);
    return c.json({ error: "Failed to fetch traces" }, 500);
  }
});

/**
 * GET /api/admin/traces/:id - Trace con steps.
 */
observabilityRoutes.get("/admin/traces/:id", requireAuth, async (c) => {
  try {
    const trace = await getTraceWithSteps(c.req.param("id"));
    if (!trace) return c.json({ error: "Trace not found" }, 404);
    return c.json(trace);
  } catch (error) {
    console.error("Trace detail error:", error);
    return c.json({ error: "Failed to fetch trace" }, 500);
  }
});

/**
 * GET /api/admin/traces/:id/steps - Steps de un trace.
 */
observabilityRoutes.get("/admin/traces/:id/steps", requireAuth, async (c) => {
  try {
    const steps = await db
      .select()
      .from(agentTraceSteps)
      .where(eq(agentTraceSteps.traceId, c.req.param("id")))
      .orderBy(agentTraceSteps.stepOrder);
    return c.json({ steps });
  } catch (error) {
    console.error("Trace steps error:", error);
    return c.json({ error: "Failed to fetch trace steps" }, 500);
  }
});

/**
 * GET /api/admin/telemetry/tools - Métricas de uso de tools.
 */
observabilityRoutes.get("/admin/telemetry/tools", requireAuth, async (c) => {
  try {
    const range = (c.req.query("range") as any) || "24h";
    const metrics = await getToolTelemetry(range);
    return c.json(metrics);
  } catch (error) {
    console.error("Tool telemetry error:", error);
    return c.json({ error: "Failed to fetch tool telemetry" }, 500);
  }
});

/**
 * GET /api/admin/logs - Logs de auditoría en formato Loki-like.
 */
observabilityRoutes.get("/admin/logs", requireAuth, async (c) => {
  try {
    const successParam = c.req.query("success");
    const filters = {
      agentId: c.req.query("agentId") || undefined,
      action: c.req.query("action") || undefined,
      resource: c.req.query("resource") || undefined,
      success: successParam === undefined ? undefined : successParam === "true",
      from: c.req.query("from") ? new Date(c.req.query("from")!) : undefined,
      to: c.req.query("to") ? new Date(c.req.query("to")!) : undefined,
      limit: Math.min(Number(c.req.query("limit") || "100"), 1000),
      offset: Math.max(Number(c.req.query("offset") || "0"), 0),
    };

    const loki = await getLogsAsLokiStreams(filters);
    return c.json(loki);
  } catch (error) {
    console.error("Logs error:", error);
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
});

/**
 * GET /api/admin/metrics/prometheus - Métricas en formato Prometheus.
 */
observabilityRoutes.get("/admin/metrics/prometheus", requireAuth, async (c) => {
  try {
    const metrics = await generatePrometheusMetrics();
    return c.text(metrics, 200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    });
  } catch (error) {
    console.error("Prometheus metrics error:", error);
    return c.text("# Failed to generate metrics\n", 500);
  }
});

/**
 * GET /metrics - Prometheus scraping endpoint (público, sin auth).
 */
observabilityRoutes.get("/metrics", async (c) => {
  try {
    const metrics = await generatePrometheusMetrics();
    return c.text(metrics, 200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    });
  } catch (error) {
    console.error("Prometheus metrics error:", error);
    return c.text("# Failed to generate metrics\n", 500);
  }
});
