/**
 * Kitsuden — Distributed Tracing (W3C Trace Context)
 * ============================================================================
 *
 * Práctica #2 (Distributed Tracing) + base de #5 (Log-Trace Correlation) del
 * manual de observabilidad.
 *
 * Implementa un contexto de traza propagable compatible con W3C Trace Context
 * (header `traceparent`), sostenido con AsyncLocalStorage para que CUALQUIER
 * código (logs, queries, jobs) pueda leer el trace_id/span_id actual sin pasarlo
 * a mano. Es interoperable en el cable con OpenTelemetry/Jaeger/Tempo: el
 * `traceparent` que emitimos lo entiende cualquier colector OTel, así que migrar
 * al SDK de OpenTelemetry más adelante es un reemplazo directo de esta capa.
 *
 * Formato traceparent (W3C):  00-<trace_id:32hex>-<span_id:16hex>-<flags:2hex>
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface TraceContext {
  traceId: string; // 32 hex
  spanId: string; // 16 hex (span actual)
  parentSpanId?: string; // span padre (si vino propagado)
  sampled: boolean;
  /** requestId legible para humanos (correlación con logs existentes). */
  requestId: string;
}

const als = new AsyncLocalStorage<TraceContext>();

// ── Generación de IDs (W3C: hex aleatorio) ────────────────────────────────────

export function generateTraceId(): string {
  return randomBytes(16).toString("hex"); // 32 hex
}

export function generateSpanId(): string {
  return randomBytes(8).toString("hex"); // 16 hex
}

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * Parsea un header `traceparent` entrante (W3C). Devuelve null si es inválido.
 */
export function parseTraceparent(
  header: string | null | undefined
): { traceId: string; spanId: string; sampled: boolean } | null {
  if (!header) return null;
  const m = header.trim().match(TRACEPARENT_RE);
  if (!m) return null;
  const [, traceId, spanId, flags] = m;
  // trace_id / span_id all-zero son inválidos por spec.
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & 0x01) === 1 };
}

/** Serializa el contexto actual como header `traceparent` para propagar. */
export function toTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? "01" : "00";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

// ── Sampling determinista ─────────────────────────────────────────────────────

/**
 * Sampling probabilístico DETERMINISTA basado en el trace_id (no en Math.random),
 * para que el mismo trace se muestree igual en todos los servicios.
 * Práctica #2: "no tracear el 100% en producción".
 */
export function shouldSample(traceId: string, ratio: number): boolean {
  if (ratio >= 1) return true;
  if (ratio <= 0) return false;
  // Usa los últimos 4 hex del trace como valor uniforme [0,1).
  const slice = parseInt(traceId.slice(-4), 16) / 0xffff;
  return slice < ratio;
}

const SAMPLE_RATIO = Number(process.env.TRACE_SAMPLE_RATIO ?? "1");

// ── Ciclo de vida del contexto ────────────────────────────────────────────────

export interface StartTraceOptions {
  traceparent?: string | null;
  requestId: string;
  /** Fuerza el muestreo (p.ej. siempre samplear si hay error — tail sampling). */
  forceSample?: boolean;
}

/**
 * Crea un TraceContext para una request nueva, continuando la traza entrante si
 * llegó un `traceparent` válido, o iniciando una nueva.
 */
export function startTrace(options: StartTraceOptions): TraceContext {
  const incoming = parseTraceparent(options.traceparent);
  const traceId = incoming?.traceId ?? generateTraceId();
  const spanId = generateSpanId();
  const sampled =
    options.forceSample || (incoming ? incoming.sampled : shouldSample(traceId, SAMPLE_RATIO));

  return {
    traceId,
    spanId,
    parentSpanId: incoming?.spanId,
    sampled,
    requestId: options.requestId,
  };
}

/** Ejecuta `fn` con el TraceContext activo (accesible vía getTraceContext()). */
export function runWithTrace<T>(ctx: TraceContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/** Devuelve el TraceContext activo (o undefined fuera de una request). */
export function getTraceContext(): TraceContext | undefined {
  return als.getStore();
}

/** Campos de correlación para inyectar en logs (práctica #5). */
export function getTraceLogFields(): { trace_id?: string; span_id?: string; requestId?: string } {
  const ctx = als.getStore();
  if (!ctx) return {};
  return { trace_id: ctx.traceId, span_id: ctx.spanId, requestId: ctx.requestId };
}
