/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OBSERVABILITY - Métricas y estadísticas del sistema
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proporciona métricas reales para el dashboard de administración.
 * Reemplaza todos los mockups con datos del sistema real.
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
export interface SystemStats {
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
    performance: {
        avgResponseTime: number;
        requestsPerMinute: number;
        errorRate: number;
    };
    infra: {
        databaseStatus: "healthy" | "degraded" | "down";
        cacheStatus: "healthy" | "degraded" | "down";
        websocketConnections: number;
        activeChannels: number;
    };
    storage: {
        used: number;
        total: number;
        files: number;
    };
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
    metadata?: Record<string, any>;
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
/**
 * Obtiene todas las estadísticas del sistema
 */
export declare function getSystemStats(): Promise<SystemStats>;
/**
 * Obtiene estado de salud del sistema
 */
export declare function getHealthStatus(): Promise<HealthStatus>;
/**
 * Obtiene métricas para gráficos
 */
export declare function getMetrics(timeRange?: "1h" | "24h" | "7d" | "30d"): Promise<{
    timeRange: "1h" | "24h" | "7d" | "30d";
    entries: {
        date: string;
        count: number;
    }[];
    users: {
        date: string;
        count: number;
    }[];
}>;
export declare const observabilityRoutes: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=observability.d.ts.map