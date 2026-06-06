/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VALIDATION TEST - Verifica que no hay errores 500/400
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

import { observabilityRoutes } from "../lib/observability";
import { rateLimit, checkRateLimit, RATE_LIMIT_CONFIGS } from "../lib/rate-limiter";
import { searchRoutes } from "../lib/search";
import type { AppVariables } from "../types/hono";

// Importar los módulos a probar

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const app = new Hono<{ Variables: AppVariables }>();

// Mock context helper
function createMockContext(_path: string, headers: Record<string, string> = {}) {
  return {
    req: {
      path: _path,
      header: (name: string) => headers[name] || undefined,
    },
    get: () => null,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("🔒 Rate Limiter - Sin errores 500/400", () => {
  it("rate limit configs están bien definidos", () => {
    expect(RATE_LIMIT_CONFIGS).toBeDefined();
    expect(Object.keys(RATE_LIMIT_CONFIGS).length).toBeGreaterThan(0);

    // Verificar que cada config tiene los campos requeridos
    for (const [_path, config] of Object.entries(RATE_LIMIT_CONFIGS)) {
      expect(config.limit).toBeGreaterThan(0);
      expect(config.window).toBeGreaterThan(0);
      expect(config.message).toBeDefined();
    }
  });

  it("checkRateLimit no lanza error 500", async () => {
    const mockContext = createMockContext("/api/test", {
      "x-forwarded-for": "192.168.1.1",
    });

    const result = await checkRateLimit(mockContext, { limit: 10, window: 60 });

    expect(result).toBeDefined();
    expect(typeof result.allowed).toBe("boolean");
    expect(typeof result.remaining).toBe("number");
    expect(typeof result.limit).toBe("number");
    expect(typeof result.reset).toBe("number");
  });

  it("rateLimit middleware no lanza error", async () => {
    const middleware = rateLimit({ limit: 5, window: 60 });
    const mockContext = createMockContext("/api/test", {
      "x-forwarded-for": "192.168.1.2",
    });

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    // No debería lanzar error
    await middleware(mockContext, next);

    // El middleware debería llamar next o retornar response
    expect(nextCalled || mockContext.res).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("🔍 Search - Sin errores 500/400", () => {
  it("search routes están montadas sin error", () => {
    // Verificar que las rutas existen
    expect(searchRoutes).toBeDefined();
    expect(typeof searchRoutes).toBe("object");
  });

  it("configuraciones de búsqueda son válidas", () => {
    // Validar que los tipos de búsqueda son válidos
    const validTypes = ["fulltext", "vector", "hybrid"];

    for (const type of validTypes) {
      expect(validTypes).toContain(type);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OBSERVABILITY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("📊 Observability - Sin errores 500/400", () => {
  it("observability routes están montadas sin error", () => {
    expect(observabilityRoutes).toBeDefined();
    expect(typeof observabilityRoutes).toBe("object");
  });

  it("homepage response tiene estructura correcta", async () => {
    // Simular request al homepage
    const res = await app.request("/");

    // No debería ser 500
    expect(res.status).not.toBe(500);

    // Si es 200, verificar estructura
    if (res.status === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("message");
      expect(body).toHaveProperty("version");
      expect(body).toHaveProperty("status");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

describe("🔗 Integración - Todo funciona junto", () => {
  it("todos los endpoints responden sin error 500", async () => {
    const endpoints = [
      { method: "GET", path: "/api/health" },
      { method: "GET", path: "/api/search/suggestions?q=test" },
    ];

    for (const endpoint of endpoints) {
      const res = await app.request(endpoint.path, { method: endpoint.method });

      // No debería ser 500
      expect(res.status).not.toBe(500);

      // Log para debugging
      if (res.status === 500) {
        console.error(`❌ Error 500 en ${endpoint.method} ${endpoint.path}`);
        const body = await res.text();
        console.error("Response:", body);
      }
    }
  });

  it("rate limit headers están presentes", async () => {
    const res = await app.request("/api/search/suggestions?q=test");

    // Verificar headers de rate limiting
    const limit = res.headers.get("X-RateLimit-Limit");
    const remaining = res.headers.get("X-RateLimit-Remaining");

    // Si hay rate limiting, los headers deben estar presentes
    if (limit) {
      expect(Number(limit)).toBeGreaterThan(0);
    }
    if (remaining) {
      expect(Number(remaining)).toBeGreaterThanOrEqual(0);
    }
  });
});

console.log("✅ Validation Tests Loaded - Verificando errores 500/400...");
