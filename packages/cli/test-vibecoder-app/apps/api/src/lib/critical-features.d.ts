/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CRITICAL FEATURES INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Integración de características críticas:
 * - Rate Limiting (protección contra abuso)
 * - Search Engine (full-text + vectorial)
 * - Observability (métricas reales)
 */
import type { Hono } from "hono";
import type { AppVariables } from "../types/hono";
/**
 * Registra todas las rutas críticas en la app Hono
 */
export declare function registerCriticalFeatures(app: Hono<{
    Variables: AppVariables;
}>): void;
export { rateLimit, globalRateLimit } from "./rate-limiter";
export { search, searchFullText, searchVector, searchHybrid } from "./search";
export { getSystemStats, getHealthStatus, getMetrics } from "./observability";
//# sourceMappingURL=critical-features.d.ts.map