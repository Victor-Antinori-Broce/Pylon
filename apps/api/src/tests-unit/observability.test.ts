/**
 * Observability — Deterministic unit tests for the 5 senior practices
 * ============================================================================
 * #1 Structured logging (trace fields), #2 Distributed tracing (W3C),
 * #3 SLIs/SLOs/error budget, #4 Symptom-based alerting, #5 Log-trace correlation.
 */

import { describe, it, expect, beforeEach } from "bun:test";

import { recordRequest, getMetricsSnapshot, getRouteSnapshots, resetMetrics } from "../lib/metrics";
import { evaluateSlo, evaluateSymptomAlerts, buildAlertReport, type SloConfig } from "../lib/slo";
import {
  parseTraceparent,
  toTraceparent,
  startTrace,
  runWithTrace,
  getTraceContext,
  getTraceLogFields,
  shouldSample,
  generateTraceId,
} from "../lib/tracing";

// ── #2 Distributed Tracing (W3C Trace Context) ────────────────────────────────

describe("Tracing — W3C Trace Context", () => {
  it("parsea un traceparent válido", () => {
    const p = parseTraceparent("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    expect(p).toEqual({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      sampled: true,
    });
  });

  it("rechaza traceparent inválido o all-zero", () => {
    expect(parseTraceparent("garbage")).toBeNull();
    expect(parseTraceparent(null)).toBeNull();
    expect(parseTraceparent("00-" + "0".repeat(32) + "-b7ad6b7169203331-01")).toBeNull();
  });

  it("continúa la traza entrante (mismo trace_id, span nuevo, parent = span entrante)", () => {
    const ctx = startTrace({
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      requestId: "req-1",
    });
    expect(ctx.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(ctx.parentSpanId).toBe("b7ad6b7169203331");
    expect(ctx.spanId).not.toBe("b7ad6b7169203331");
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("inicia una traza nueva si no hay traceparent", () => {
    const ctx = startTrace({ traceparent: undefined, requestId: "req-2" });
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.parentSpanId).toBeUndefined();
  });

  it("serializa a traceparent válido (round-trip)", () => {
    const ctx = startTrace({ traceparent: undefined, requestId: "r" });
    const header = toTraceparent(ctx);
    const parsed = parseTraceparent(header);
    expect(parsed?.traceId).toBe(ctx.traceId);
    expect(parsed?.spanId).toBe(ctx.spanId);
  });

  it("sampling es determinista por trace_id", () => {
    const id = generateTraceId();
    expect(shouldSample(id, 1)).toBe(true);
    expect(shouldSample(id, 0)).toBe(false);
    // Mismo id + mismo ratio → mismo resultado (idempotente).
    expect(shouldSample(id, 0.5)).toBe(shouldSample(id, 0.5));
  });
});

// ── #1 + #5 Structured logging + Log-Trace correlation ────────────────────────

describe("Log-Trace correlation (AsyncLocalStorage)", () => {
  it("getTraceLogFields expone trace_id/span_id dentro del contexto", () => {
    const ctx = startTrace({ traceparent: undefined, requestId: "req-x" });
    const fields = runWithTrace(ctx, () => getTraceLogFields());
    expect(fields.trace_id).toBe(ctx.traceId);
    expect(fields.span_id).toBe(ctx.spanId);
    expect(fields.requestId).toBe("req-x");
  });

  it("fuera del contexto no hay campos de traza", () => {
    expect(getTraceContext()).toBeUndefined();
    expect(getTraceLogFields()).toEqual({});
  });
});

// ── #3 SLIs / SLOs / Error Budget ─────────────────────────────────────────────

describe("Metrics + SLO (SLIs reales)", () => {
  beforeEach(() => resetMetrics());

  it("calcula success rate, error rate y percentiles reales", () => {
    for (let i = 0; i < 98; i++) {
      recordRequest({ method: "GET", route: "/api/x", status: 200, durationMs: 50 });
    }
    recordRequest({ method: "GET", route: "/api/x", status: 500, durationMs: 900 });
    recordRequest({ method: "GET", route: "/api/x", status: 500, durationMs: 950 });

    const snap = getMetricsSnapshot();
    expect(snap.total).toBe(100);
    expect(snap.serverErrors).toBe(2);
    expect(snap.errorRate).toBeCloseTo(0.02, 5);
    expect(snap.successRate).toBeCloseTo(0.98, 5);
    expect(snap.latency.p99).toBeGreaterThanOrEqual(900);
    expect(snap.latency.p50).toBeLessThan(100);
  });

  it("4xx cuenta como éxito de disponibilidad (error del cliente, no del servicio)", () => {
    for (let i = 0; i < 10; i++) {
      recordRequest({ method: "POST", route: "/api/y", status: 404, durationMs: 10 });
    }
    const snap = getMetricsSnapshot();
    expect(snap.serverErrors).toBe(0);
    expect(snap.successRate).toBe(1);
    expect(snap.clientErrors).toBe(10);
  });

  it("evaluateSlo calcula error budget y burn rate", () => {
    // 5% de 5xx contra SLO 99% → budget=1%, consumo=5x.
    for (let i = 0; i < 95; i++)
      recordRequest({ method: "GET", route: "/z", status: 200, durationMs: 30 });
    for (let i = 0; i < 5; i++)
      recordRequest({ method: "GET", route: "/z", status: 500, durationMs: 30 });

    const cfg: SloConfig = {
      availabilityTarget: 0.99,
      latencyP99Ms: 500,
      windowMinutes: 60,
      burnRatePageThreshold: 2,
    };
    const status = evaluateSlo(cfg);
    expect(status.availability.met).toBe(false);
    expect(status.availability.errorBudget).toBeCloseTo(0.01, 5);
    expect(status.availability.burnRate).toBeCloseTo(5, 1);
  });

  it("getRouteSnapshots agrega por ruta", () => {
    recordRequest({ method: "GET", route: "/a", status: 200, durationMs: 10 });
    recordRequest({ method: "GET", route: "/a", status: 500, durationMs: 20 });
    const routes = getRouteSnapshots();
    const a = routes.find((r) => r.route === "GET /a");
    expect(a?.total).toBe(2);
    expect(a?.serverErrors).toBe(1);
  });
});

// ── #4 Symptom-based alerting ─────────────────────────────────────────────────

describe("Symptom-based alerting", () => {
  beforeEach(() => resetMetrics());

  const cfg: SloConfig = {
    availabilityTarget: 0.999,
    latencyP99Ms: 500,
    windowMinutes: 60,
    burnRatePageThreshold: 2,
  };

  it("no alerta sin tráfico suficiente (evita falsos positivos)", () => {
    recordRequest({ method: "GET", route: "/a", status: 500, durationMs: 10 });
    expect(evaluateSymptomAlerts(cfg)).toHaveLength(0);
  });

  it("paginado por burn rate de error budget (síntoma)", () => {
    for (let i = 0; i < 95; i++)
      recordRequest({ method: "GET", route: "/a", status: 200, durationMs: 30 });
    for (let i = 0; i < 5; i++)
      recordRequest({ method: "GET", route: "/a", status: 500, durationMs: 30 });
    const alerts = evaluateSymptomAlerts(cfg);
    const burn = alerts.find((a) => a.name === "error_budget_burn");
    expect(burn?.kind).toBe("symptom");
    expect(burn?.severity).toBe("page");
  });

  it("paginado por latencia p99 sobre SLO (síntoma)", () => {
    for (let i = 0; i < 100; i++)
      recordRequest({ method: "GET", route: "/a", status: 200, durationMs: 1200 });
    const alerts = evaluateSymptomAlerts(cfg);
    expect(alerts.some((a) => a.name === "latency_p99_breach" && a.severity === "page")).toBe(true);
  });

  it("las causas nunca paginan: van a ticket", () => {
    const report = buildAlertReport(cfg);
    for (const cause of report.causes) {
      expect(cause.kind).toBe("cause");
      expect(cause.severity).not.toBe("page");
    }
  });
});
