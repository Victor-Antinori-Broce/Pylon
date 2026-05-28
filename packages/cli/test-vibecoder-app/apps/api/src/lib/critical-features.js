// @ts-nocheck
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
import { globalRateLimit, rateLimit, rateLimitRoutes } from "./rate-limiter";
import { searchRoutes } from "./search";
import { observabilityRoutes } from "./observability";
/**
 * Registra todas las rutas críticas en la app Hono
 */
export function registerCriticalFeatures(app) {
    console.log("\n🔒 Initializing Critical Features...\n");
    // ═══════════════════════════════════════════════════════════════════════════════
    // 1. RATE LIMITING - Global middleware
    // ═══════════════════════════════════════════════════════════════════════════════
    // Aplicar rate limiting global a todas las rutas API
    app.use("/api/*", globalRateLimit());
    // Rate limits específicos para endpoints críticos
    app.use("/api/auth/login", rateLimit({ limit: 5, window: 300 }));
    app.use("/api/auth/register", rateLimit({ limit: 3, window: 3600 }));
    app.use("/api/mcp", rateLimit({ limit: 200, window: 60 }));
    app.use("/api/search", rateLimit({ limit: 120, window: 60 }));
    // Admin routes para gestionar rate limits
    app.route("/api/admin/rate-limits", rateLimitRoutes);
    console.log("  ✅ Rate Limiting: Global protection enabled");
    console.log("     - /api/*: 300 req/min default");
    console.log("     - /api/auth/*: Strict limits for brute force protection");
    console.log("     - /api/mcp: 200 req/min for AI workloads");
    // ═══════════════════════════════════════════════════════════════════════════════
    // 2. SEARCH ENGINE - Full-text + Vector
    // ═══════════════════════════════════════════════════════════════════════════════
    app.route("/api/search", searchRoutes);
    console.log("  ✅ Search Engine: Full-text + Vector search enabled");
    console.log("     - POST /api/search (hybrid/fulltext/vector)");
    console.log("     - GET /api/search/suggestions (autocomplete)");
    console.log("     - POST /api/search/index (vector indexing)");
    console.log("     - POST /api/search/init (setup extensions)");
    // ═══════════════════════════════════════════════════════════════════════════════
    // 3. OBSERVABILITY - Métricas reales
    // ═══════════════════════════════════════════════════════════════════════════════
    // Montar rutas de observabilidad (reemplaza /api/health básico)
    app.route("/", observabilityRoutes);
    console.log("  ✅ Observability: Real-time metrics enabled");
    console.log("     - GET /api/health (comprehensive health checks)");
    console.log("     - GET /api/admin/stats (system statistics)");
    console.log("     - GET /api/admin/activity (recent activity)");
    console.log("     - GET /api/admin/metrics (time-series data)");
    console.log("     - GET /api/admin/realtime (websocket stats)");
    console.log("\n✨ Critical Features Ready\n");
}
// Re-exports para uso directo
export { rateLimit, globalRateLimit } from "./rate-limiter";
export { search, searchFullText, searchVector, searchHybrid } from "./search";
export { getSystemStats, getHealthStatus, getMetrics } from "./observability";
//# sourceMappingURL=critical-features.js.map