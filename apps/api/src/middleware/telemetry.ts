/**
 * Kitsuden — Telemetry Middleware
 * ============================================================================
 *
 * Une las 5 prácticas de observabilidad a nivel de request:
 *
 *   requestContextMiddleware()  → crea/continúa el TraceContext W3C, lo mete en
 *                                 AsyncLocalStorage, setea requestId y responde
 *                                 con el header `traceparent` (propagación).
 *   accessLogAndMetrics()       → mide la request (status + latencia), la
 *                                 registra en el MetricsRegistry (SLIs reales) y
 *                                 emite un access-log estructurado ya correlado
 *                                 con trace_id/span_id.
 *
 * Debe montarse temprano: requestContextMiddleware ANTES de todo lo demás (para
 * que el contexto esté disponible en cualquier handler/middleware posterior).
 */

import { runInRequestScope, type RequestScope } from "@kitsuden/engine";
import type { Context, Next } from "hono";

import { logger } from "../lib/logger";
import { recordRequest } from "../lib/metrics";
import { rutaParaLog } from "../lib/ruta-para-log";
import { startTrace, runWithTrace, toTraceparent, getTraceContext } from "../lib/tracing";

/**
 * Crea el TraceContext y ejecuta el resto de la request dentro de su ámbito ALS.
 * Reemplaza al viejo middleware de `requestId`.
 */
export function requestContextMiddleware() {
  return async (c: Context, next: Next) => {
    const requestId = crypto.randomUUID();
    const ctx = startTrace({
      traceparent: c.req.header("traceparent"),
      requestId,
    });

    // Exponer en el contexto de Hono (compat con código que lee requestId).
    c.set("requestId", requestId);
    c.set("traceId", ctx.traceId);
    c.set("spanId", ctx.spanId);

    // Propagar el trace en la respuesta (W3C).
    c.header("traceparent", toTraceparent(ctx));
    c.header("x-trace-id", ctx.traceId);
    c.header("x-request-id", requestId);

    // Scope de request MUTABLE: middlewares posteriores (withTransactionalRLS)
    // lo enriquecen con el tx de RLS, y repo() lo usa automáticamente.
    const scope: RequestScope = { requestId, traceId: ctx.traceId, services: {} };

    // Ejecutar TODO el pipeline dentro del contexto de traza Y del request-scope.
    await runWithTrace(ctx, () => runInRequestScope(scope, () => next()));
  };
}

/**
 * Normaliza la ruta a un patrón (sin ids) para agrupar métricas por endpoint
 * y no explotar la cardinalidad. Ej: /api/data-sets/abc-123/entries →
 * /api/data-sets/:id/entries.
 */
function routePattern(c: Context): string {
  // Hono expone el patrón matcheado en c.req.routePath cuando hay match.
  const rp = (c.req as unknown as { routePath?: string }).routePath;
  if (rp && rp !== "/*") return rp;
  // Fallback determinista: reemplaza UUIDs y números por :id.
  return c.req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

/**
 * Mide la request y emite el access-log estructurado. Reemplaza al viejo
 * middleware de "Request started/completed".
 */
export function accessLogAndMetrics() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    let error: unknown;
    try {
      await next();
    } catch (err) {
      error = err;
      throw err;
    } finally {
      const durationMs = Date.now() - start;
      const status = error ? 500 : c.res.status;
      const route = routePattern(c);

      recordRequest({ method: c.req.method, route, status, durationMs });

      const ctx = getTraceContext();
      const fields = {
        type: "access",
        method: c.req.method,
        // Sin tokens: ver lib/ruta-para-log.ts
        path: rutaParaLog(c.req.path),
        route,
        status,
        durationMs,
        userId: c.get("user")?.id ?? "anonymous",
        userAgent: c.req.header("user-agent"),
        // trace_id/span_id ya los añade el mixin del logger, pero los dejamos
        // explícitos por si el sink no aplica el mixin.
        trace_id: ctx?.traceId,
        span_id: ctx?.spanId,
      };

      if (status >= 500) logger.error(fields, "request failed");
      else if (status >= 400) logger.warn(fields, "request client error");
      else logger.info(fields, "request completed");
    }
  };
}
