/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RATE LIMITER - Protección contra abuso de API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implementación basada en Valkey (Redis) con sliding window.
 * Soporta límites diferenciados por endpoint y tipo de autenticación.
 */
import type { Context, Next } from "hono";
import type { AppVariables } from "../types/hono";
export interface RateLimitConfig {
    /** Requests permitidos por ventana */
    limit: number;
    /** Ventana de tiempo en segundos */
    window: number;
    /** Mensaje de error personalizado */
    message?: string;
    /** Key personalizada para identificar el cliente */
    keyGenerator?: (c: Context<{
        Variables: AppVariables;
    }>) => string;
    /** Si debe saltarse el rate limiting */
    skip?: (c: Context<{
        Variables: AppVariables;
    }>) => boolean;
}
/** Configuraciones específicas por ruta */
export declare const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig>;
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
/**
 * Verifica si el request está dentro del rate limit (sliding window)
 */
export declare function checkRateLimit(c: Context<{
    Variables: AppVariables;
}>, config?: RateLimitConfig): Promise<RateLimitResult>;
/**
 * Middleware de rate limiting para Hono
 */
export declare function rateLimit(config?: Partial<RateLimitConfig>): (c: Context<{
    Variables: AppVariables;
}>, next: Next) => Promise<void | (Response & import("hono").TypedResponse<{
    error: string;
    message: string | undefined;
    retryAfter: number | undefined;
}, 429, "json">)>;
/**
 * Middleware de rate limiting global (para aplicar en todas las rutas)
 */
export declare function globalRateLimit(): (c: Context<{
    Variables: AppVariables;
}>, next: Next) => Promise<void | (Response & import("hono").TypedResponse<{
    error: string;
    message: string;
    retryAfter: number | undefined;
}, 429, "json">)>;
import { Hono } from "hono";
export declare const rateLimitRoutes: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=rate-limiter.d.ts.map