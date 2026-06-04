/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RATE LIMITER - Protección contra abuso de API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implementación basada en Valkey (Redis) con sliding window.
 * Soporta límites diferenciados por endpoint y tipo de autenticación.
 */

import { getValkeyClient } from "./valkey";
import type { Context, Next } from "hono";
import type { AppVariables } from "../types/hono";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export interface RateLimitConfig {
  /** Requests permitidos por ventana */
  limit: number;
  /** Ventana de tiempo en segundos */
  window: number;
  /** Mensaje de error personalizado */
  message?: string;
  /** Key personalizada para identificar el cliente */
  keyGenerator?: (c: Context<{ Variables: AppVariables }>) => string;
  /** Si debe saltarse el rate limiting */
  skip?: (c: Context<{ Variables: AppVariables }>) => boolean;
}

/** Configuración por defecto */
const DEFAULT_CONFIG: RateLimitConfig = {
  limit: 100,
  window: 60,
  message: "Rate limit exceeded. Please try again later.",
};

/** Configuraciones específicas por ruta */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Auth - más estricto para prevenir brute force
  "/api/auth/login": { limit: 5, window: 300, message: "Too many login attempts. Try again in 5 minutes." },
  "/api/auth/register": { limit: 3, window: 3600, message: "Too many registration attempts. Try again later." },
  "/api/auth/forgot-password": { limit: 3, window: 3600, message: "Too many password reset attempts." },
  
  // MCP - moderado por uso intensivo de AI
  "/api/mcp": { limit: 200, window: 60, message: "MCP rate limit exceeded." },
  
  // Agents playground - uso intensivo
  "/api/agents/playground": { limit: 50, window: 60, message: "Playground rate limit exceeded." },
  
  // Batch operations - más permisivo pero controlado
  "/api/datasets/batch": { limit: 30, window: 60, message: "Batch operations limited to 30/minute." },
  
  // Import/Export - muy permisivo pero trackeable
  "/api/datasets/export": { limit: 10, window: 60, message: "Export operations limited to 10/minute." },
  "/api/datasets/import": { limit: 10, window: 60, message: "Import operations limited to 10/minute." },
  
  // Search - moderado
  "/api/search": { limit: 120, window: 60, message: "Search rate limit exceeded." },
  
  // GraphQL - moderado
  "/api/graphql": { limit: 100, window: 60, message: "GraphQL rate limit exceeded." },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  limit: number;
  retryAfter?: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPLEMENTACIÓN CORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera la key para rate limiting basada en cliente
 */
function generateKey(c: Context<{ Variables: AppVariables }>, config: RateLimitConfig): string {
  if (config.keyGenerator) {
    return `ratelimit:${config.keyGenerator(c)}`;
  }

  // Prioridad: API Key > User ID > IP
  const apiKey = c.req.header("authorization")?.replace("Bearer ", "").slice(0, 32);
  const userId = c.get("user")?.id;
  const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

  const identifier = apiKey || userId || ip;
  const route = c.req.path;

  return `ratelimit:${route}:${identifier}`;
}

/**
 * Verifica si el request está dentro del rate limit (sliding window)
 */
export async function checkRateLimit(
  c: Context<{ Variables: AppVariables }>,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const key = generateKey(c, config);
  const now = Date.now();
  const windowMs = config.window * 1000;
  const reset = now + windowMs;

  const valkey = await getValkeyClient();

  // Si no hay Valkey, permitir (fail open para no bloquear)
  if (!valkey) {
    return { allowed: true, remaining: config.limit, reset, limit: config.limit };
  }

  try {
    // Usar sorted set para sliding window
    const windowStart = now - windowMs;
    
    // Remover entradas antiguas fuera de la ventana
    await valkey.zRemRangeByScore(key, 0, windowStart);

    // Contar entradas actuales
    const currentCount = await valkey.zCard(key);

    // Verificar si está dentro del límite
    const allowed = currentCount < config.limit;
    
    if (allowed) {
      // Añadir entrada actual
      await valkey.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
      // Setear expiración
      await valkey.pExpire(key, windowMs);
    }

    const remaining = Math.max(0, config.limit - currentCount - 1);

    return {
      allowed,
      remaining,
      reset,
      limit: config.limit,
      retryAfter: allowed ? undefined : Math.ceil(config.window / 2),
    };
  } catch (error) {
    console.error("Rate limiter error:", error);
    // Fail open en caso de error
    return { allowed: true, remaining: config.limit, reset, limit: config.limit };
  }
}

/**
 * Middleware de rate limiting para Hono
 */
export function rateLimit(config?: Partial<RateLimitConfig>) {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const path = c.req.path;
    
    // Buscar configuración específica o usar default
    const pathConfig = RATE_LIMIT_CONFIGS[path] || DEFAULT_CONFIG;
    const finalConfig = { ...pathConfig, ...config };

    // Verificar si debe saltarse
    if (finalConfig.skip?.(c)) {
      return await next();
    }

    try {
      const result = await checkRateLimit(c, finalConfig);

      // Headers siempre presentes
      c.header("X-RateLimit-Limit", String(result.limit));
      c.header("X-RateLimit-Remaining", String(result.remaining));
      c.header("X-RateLimit-Reset", String(result.reset));

      if (!result.allowed) {
        c.header("Retry-After", String(result.retryAfter || 60));
        return c.json(
          {
            error: "Rate Limit Exceeded",
            message: finalConfig.message,
            retryAfter: result.retryAfter,
          },
          429
        );
      }
    } catch {
      // Valkey unreachable — fail open (don't block requests)
    }

    await next();
  };
}

/**
 * Middleware de rate limiting global (para aplicar en todas las rutas)
 */
export function globalRateLimit() {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    // Skip para health checks y assets estáticos
    if (c.req.path.startsWith("/health") || 
        c.req.path.startsWith("/assets") ||
        c.req.path === "/") {
      return await next();
    }

    // Buscar config específica o usar default conservador
    const pathConfig = RATE_LIMIT_CONFIGS[c.req.path];
    const config = pathConfig || { limit: 300, window: 60 }; // 300 req/min default

    try {
      const result = await checkRateLimit(c, config);

      c.header("X-RateLimit-Limit", String(result.limit));
      c.header("X-RateLimit-Remaining", String(result.remaining));
      c.header("X-RateLimit-Reset", String(Math.ceil(result.reset / 1000)));

      if (!result.allowed) {
        c.header("Retry-After", String(result.retryAfter || 60));
        return c.json(
          {
            error: "Rate Limit Exceeded",
            message: config.message || "Too many requests. Please slow down.",
            retryAfter: result.retryAfter,
          },
          429
        );
      }
    } catch {
      // Valkey unreachable — fail open (don't block requests)
    }

    await next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS DE ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";

export const rateLimitRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * GET /api/admin/rate-limits - Ver estadísticas de rate limiting
 */
rateLimitRoutes.get("/", requireAuth, async (c) => {
  const valkey = await getValkeyClient();
  
  if (!valkey) {
    return c.json({ error: "Valkey not available" }, 503);
  }

  try {
    // Scanear keys de rate limit
    const keys: string[] = [];
    let cursor = "0";
    
    do {
      const result = await valkey.scan(cursor, { MATCH: "ratelimit:*", COUNT: 100 });
      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== "0");

    // Agrupar por ruta
    const stats: Record<string, { active: number; totalRequests: number }> = {};
    
    for (const key of keys.slice(0, 100)) { // Limitar a 100 keys
      const parts = key.split(":");
      const route = parts[1] || "unknown";
      const count = await valkey.zCard(key);
      
      if (!stats[route]) {
        stats[route] = { active: 0, totalRequests: 0 };
      }
      stats[route].active++;
      stats[route].totalRequests += count;
    }

    return c.json({
      activeKeys: keys.length,
      routes: stats,
      configs: RATE_LIMIT_CONFIGS,
    });
  } catch (error) {
    console.error("Rate limit stats error:", error);
    return c.json({ error: "Failed to fetch rate limit stats" }, 500);
  }
});

/**
 * DELETE /api/admin/rate-limits/:key - Resetear rate limit específico
 */
rateLimitRoutes.delete("/:key", requireAuth, async (c) => {
  const valkey = await getValkeyClient();
  
  if (!valkey) {
    return c.json({ error: "Valkey not available" }, 503);
  }

  const key = c.req.param("key");
  
  try {
    await valkey.del(`ratelimit:${key}`);
    return c.json({ success: true, message: `Rate limit cleared for ${key}` });
  } catch (error) {
    return c.json({ error: "Failed to clear rate limit" }, 500);
  }
});
