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

import { observabilityRoutes } from "./observability";
import { globalRateLimit, limitadorEncendido, rateLimitRoutes } from "./rate-limiter";
import { searchRoutes } from "./search";

/**
 * Registra todas las rutas críticas en la app Hono
 */
export function registerCriticalFeatures(app: Hono<{ Variables: AppVariables }>) {
  console.log("\n🔒 Initializing Critical Features...\n");

  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. RATE LIMITING - Global middleware
  // ═══════════════════════════════════════════════════════════════════════════════

  // Aplicar rate limiting global a todas las rutas API. `RATE_LIMIT_ENABLED=false`
  // lo apaga (de fábrica, encendido): se leía en config y nadie lo miraba, así
  // que no había forma de quitarlo para un banco de pruebas como Schemathesis.
  // Apagarlo quita TAMBIÉN los límites de login y alta (RATE_LIMIT_CONFIGS).
  if (limitadorEncendido()) {
    app.use("/api/*", globalRateLimit());
  } else {
    console.warn(
      "  ⚠️  Rate Limiting: OFF (RATE_LIMIT_ENABLED=false) — sin límite de fuerza bruta en login"
    );
  }

  // Los límites específicos por ruta (login, alta, MCP, búsqueda…) los aplica
  // `globalRateLimit` leyendo `RATE_LIMIT_CONFIGS`. Aquí había además un
  // `rateLimit()` por ruta con la MISMA clave de Valkey: cada petición contaba
  // dos veces (MCP y búsqueda iban a la mitad de su cupo), y los de login y
  // alta apuntaban a caminos que better-auth no tiene.

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
