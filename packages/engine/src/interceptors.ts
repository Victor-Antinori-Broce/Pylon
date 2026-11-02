/**
 * Kitsuden — Interceptors (contrato reutilizable, estilo NestJS)
 * ============================================================================
 *
 * Un Interceptor envuelve la ejecución de una ruta con hooks `before` / `after`
 * / `onError`, y puede TRANSFORMAR la respuesta JSON (algo que un middleware
 * plano de Hono no hace ergonómicamente). Es el patrón de NestJS sin decoradores.
 *
 * Modelo "cebolla" (onion): los `before` corren en orden; los `after` en orden
 * INVERSO, envolviendo al handler.
 *
 *   app.get("/posts",
 *     applyInterceptors(timingInterceptor(), responseEnvelope()),
 *     handler);
 *
 * Casos de uso: envolver respuestas en { data }, medir tiempos, cache headers,
 * enmascarar campos, auditar — de forma componible y testeable.
 */

import type { Context, MiddlewareHandler } from "hono";

export interface InterceptorContext {
  c: Context;
  method: string;
  path: string;
}

export interface Interceptor {
  name: string;
  /** Antes del handler. Devolver un Response corta el pipeline (short-circuit). */
  before?(ctx: InterceptorContext): void | Response | Promise<void | Response>;
  /** Después del handler. Puede transformar el body JSON antes de enviarlo. */
  after?(ctx: InterceptorContext, body: unknown): unknown | Promise<unknown>;
  /** En error. No lo maneja (lo re-lanza el composer); solo observa/audita. */
  onError?(ctx: InterceptorContext, err: unknown): void | Promise<void>;
}

/**
 * Compone interceptors en un middleware Hono. Los `after` que transforman body
 * solo aplican a respuestas `application/json`.
 */
export function applyInterceptors(...interceptors: Interceptor[]): MiddlewareHandler {
  return async (c, next) => {
    const ctx: InterceptorContext = { c, method: c.req.method, path: c.req.path };

    // before (en orden). Un Response corta el pipeline.
    for (const it of interceptors) {
      if (it.before) {
        const short = await it.before(ctx);
        if (short instanceof Response) {
          c.res = short;
          return;
        }
      }
    }

    try {
      await next();
    } catch (err) {
      for (const it of interceptors) {
        if (it.onError) await it.onError(ctx, err);
      }
      throw err;
    }

    // Hono no siempre re-lanza desde next(): captura el error en c.error.
    // Observamos onError igual y dejamos que app.onError lo maneje.
    if (c.error) {
      for (const it of interceptors) {
        if (it.onError) await it.onError(ctx, c.error);
      }
      return;
    }

    // after (orden inverso — modelo cebolla). Solo transforma JSON.
    const hasAfter = interceptors.some((it) => it.after);
    if (!hasAfter) return;

    const contentType = c.res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return;

    let body: unknown;
    try {
      body = await c.res.clone().json();
    } catch {
      return; // no era JSON parseable
    }

    let transformed = body;
    for (let i = interceptors.length - 1; i >= 0; i--) {
      const it = interceptors[i];
      if (it.after) transformed = await it.after(ctx, transformed);
    }

    if (transformed !== body) {
      const headers = new Headers(c.res.headers);
      headers.delete("content-length");
      c.res = new Response(JSON.stringify(transformed), {
        status: c.res.status,
        headers,
      });
    }
  };
}

// ── Interceptors integrados ───────────────────────────────────────────────────

/** Añade `X-Response-Time` (ms) a la respuesta. */
export function timingInterceptor(): Interceptor {
  const starts = new WeakMap<Context, number>();
  return {
    name: "timing",
    before(ctx) {
      starts.set(ctx.c, Date.now());
    },
    after(ctx, body) {
      const start = starts.get(ctx.c);
      if (start) ctx.c.header("X-Response-Time", `${Date.now() - start}ms`);
      return body;
    },
  };
}

/**
 * Envuelve el body en `{ data, meta }` de forma consistente (opt-in por ruta).
 * Si el body ya trae `data`, no lo re-envuelve (idempotente).
 */
export function responseEnvelope(meta: Record<string, unknown> = {}): Interceptor {
  return {
    name: "response-envelope",
    after(_ctx, body) {
      if (body && typeof body === "object" && "data" in (body as object)) return body;
      return { data: body, meta: { ...meta, ts: new Date().toISOString() } };
    },
  };
}

/** Setea `Cache-Control` en respuestas GET exitosas. */
export function cacheControl(seconds: number): Interceptor {
  return {
    name: "cache-control",
    after(ctx, body) {
      if (ctx.method === "GET" && ctx.c.res.status < 300) {
        ctx.c.header("Cache-Control", `public, max-age=${seconds}`);
      }
      return body;
    },
  };
}

/** Elimina campos sensibles del body de respuesta (defensa en profundidad). */
export function maskFields(...fields: string[]): Interceptor {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (!fields.includes(k)) out[k] = strip(val);
      }
      return out;
    }
    return v;
  };
  return {
    name: "mask-fields",
    after(_ctx, body) {
      return strip(body);
    },
  };
}
