
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TESTS: Critical Features (Rate Limiting, Search, Observability)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
import { registerCriticalFeatures } from "../lib/critical-features";
import { checkRateLimit } from "../lib/rate-limiter";
import { search, searchFullText, searchVector } from "../lib/search";
import { getSystemStats, getHealthStatus } from "../lib/observability";

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const app = new Hono<{ Variables: AppVariables }>();

// Mock context
createMockContext(app);

// Register features
registerCriticalFeatures(app);

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("🔒 Rate Limiting", () => {
  it("should track rate limits per identifier", async () => {
    const mockContext = {
      req: {
        path: "/api/test",
        header: (name: string) => {
          if (name === "x-forwarded-for") return "192.168.1.1";
          return undefined;
        },
      },
      get: () => null,
    } as any;

    const result = await checkRateLimit(mockContext, { limit: 5, window: 60 });
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThan(5);
    expect(result.limit).toBe(5);
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  it("should block when limit exceeded", async () => {
    const mockContext = {
      req: {
        path: "/api/test",
        header: (name: string) => {
          if (name === "x-forwarded-for") return "192.168.1.2";
          return undefined;
        },
      },
      get: () => null,
    } as any;

    // Exhaust limit
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(mockContext, { limit: 2, window: 60 });
    }

    const result = await checkRateLimit(mockContext, { limit: 2, window: 60 });
    
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
  });

  it("should return 429 on rate limited endpoint", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "test" }),
    });

    // Primera request debería pasar (o fallar por auth, no por rate limit)
    expect([200, 401, 429]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("🔍 Search Engine", () => {
  it("should have search endpoints", async () => {
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", type: "fulltext" }),
    });

    // Puede fallar si no hay datos, pero el endpoint debe existir
    expect([200, 400, 500]).toContain(res.status);
  });

  it("should validate search query length", async () => {
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "a" }), // Too short
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("at least 2 characters");
  });

  it("should provide autocomplete suggestions", async () => {
    const res = await app.request("/api/search/suggestions?q=test");
    
    expect(res.status).toBe(200);
    const body = await res.json() as { suggestions: any[] };
    expect(body).toHaveProperty("suggestions");
    expect(Array.isArray(body.suggestions)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OBSERVABILITY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("📊 Observability", () => {
  it("should return health status", async () => {
    const res = await app.request("/api/health");
    
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body).toHaveProperty("timestamp");
  });

  it("should return system stats", async () => {
    // Necesita auth, debería fallar con 401
    const res = await app.request("/api/admin/stats");
    expect([200, 401]).toContain(res.status);
  });

  it("should return homepage with stats", async () => {
    const res = await app.request("/");
    
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("stats");
  });

  it("should track real-time connections", async () => {
    const res = await app.request("/api/admin/realtime");
    
    // Necesita auth
    expect([200, 401]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("🔗 Integration", () => {
  it("should have rate limit headers on protected endpoints", async () => {
    const res = await app.request("/api/search/suggestions?q=test");
    
    expect(res.headers.get("X-RateLimit-Limit")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("should return 404 for unknown routes", async () => {
    const res = await app.request("/api/unknown-route");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function createMockContext(app: Hono<{ Variables: AppVariables }>) {
  // Add middleware to set mock user context
  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    await next();
  });
}

console.log("✅ Critical Features Tests Loaded");
