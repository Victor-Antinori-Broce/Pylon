/**
 * Kitsuden — SLOs, Error Budgets y Symptom-based Alerting
 * ============================================================================
 *
 * Prácticas #3 (SLIs/SLOs/Error Budgets) y #4 (Alertar por Síntomas, no Causas)
 * del manual de observabilidad.
 *
 * - SLO: target para un SLI (ej. 99.9% de éxito, p99 < 500ms).
 * - Error budget: 1 - SLO. Si SLO=99.9%, budget=0.1% de requests pueden fallar.
 * - Burn rate: qué tan rápido se consume el budget (alerta si es alto).
 * - Alerting por síntomas: solo se "paginan" síntomas (impacto al usuario:
 *   error rate, latencia p99); las causas (CPU, memoria) van a ticket, no page.
 */

import { getMetricsSnapshot, type MetricsSnapshot } from "./metrics";

// ── Configuración de SLOs (con defaults sensatos, override por env) ───────────

export interface SloConfig {
  /** Objetivo de disponibilidad (success rate). Ej. 0.999 = 99.9%. */
  availabilityTarget: number;
  /** Objetivo de latencia p99 en ms. */
  latencyP99Ms: number;
  /** Ventana de evaluación en minutos. */
  windowMinutes: number;
  /** Burn rate que dispara page (múltiplo de consumo normal del budget). */
  burnRatePageThreshold: number;
}

export const sloConfig: SloConfig = {
  availabilityTarget: Number(process.env.SLO_AVAILABILITY ?? "0.999"),
  latencyP99Ms: Number(process.env.SLO_LATENCY_P99_MS ?? "500"),
  windowMinutes: Number(process.env.SLO_WINDOW_MINUTES ?? "60"),
  burnRatePageThreshold: Number(process.env.SLO_BURN_PAGE ?? "2"),
};

// ── Evaluación de SLO / error budget ──────────────────────────────────────────

export interface SloStatus {
  window: MetricsSnapshot;
  availability: {
    sli: number; // success rate observado
    slo: number; // target
    met: boolean;
    errorBudget: number; // 1 - slo
    budgetConsumed: number; // fracción del budget ya gastada [0..>1]
    budgetRemaining: number; // fracción restante [<0..1]
    burnRate: number; // errorRate / errorBudget
  };
  latency: {
    p99: number;
    slo: number;
    met: boolean;
  };
}

export function evaluateSlo(config: SloConfig = sloConfig): SloStatus {
  const snap = getMetricsSnapshot(config.windowMinutes);
  const errorBudget = 1 - config.availabilityTarget;
  const budgetConsumed = errorBudget > 0 ? snap.errorRate / errorBudget : 0;
  const burnRate = budgetConsumed; // sobre la ventana, consumo relativo al budget

  return {
    window: snap,
    availability: {
      sli: snap.successRate,
      slo: config.availabilityTarget,
      met: snap.successRate >= config.availabilityTarget,
      errorBudget,
      budgetConsumed,
      budgetRemaining: 1 - budgetConsumed,
      burnRate,
    },
    latency: {
      p99: snap.latency.p99,
      slo: config.latencyP99Ms,
      met: snap.latency.p99 <= config.latencyP99Ms || snap.total === 0,
    },
  };
}

// ── Alerting por síntomas (práctica #4) ───────────────────────────────────────

export type AlertKind = "symptom" | "cause" | "predictive";
export type AlertSeverity = "page" | "ticket" | "info";

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  name: string;
  message: string;
  value: number;
  threshold: number;
  action: string;
}

/**
 * Evalúa alertas de SÍNTOMA a partir de los SLIs. Solo estas justifican un page
 * (impacto real al usuario). Las causas (CPU/memoria/disco) se evalúan aparte y
 * NUNCA paginan — van a ticket. Regla de oro del manual.
 */
export function evaluateSymptomAlerts(config: SloConfig = sloConfig): Alert[] {
  const status = evaluateSlo(config);
  const alerts: Alert[] = [];

  // Sin tráfico suficiente, no alertamos (evita falsos positivos).
  if (status.window.total < 20) return alerts;

  // Síntoma 1: burn rate del error budget alto → page.
  if (status.availability.burnRate >= config.burnRatePageThreshold) {
    alerts.push({
      kind: "symptom",
      severity: "page",
      name: "error_budget_burn",
      message: `Error budget quemándose rápido: ${(status.window.errorRate * 100).toFixed(2)}% de errores 5xx (SLO ${(config.availabilityTarget * 100).toFixed(1)}%)`,
      value: Number(status.availability.burnRate.toFixed(2)),
      threshold: config.burnRatePageThreshold,
      action: "Page: investigar el trace de las requests 5xx recientes",
    });
  }

  // Síntoma 2: latencia p99 excede el SLO → page.
  if (!status.latency.met) {
    alerts.push({
      kind: "symptom",
      severity: "page",
      name: "latency_p99_breach",
      message: `Latencia p99 ${status.latency.p99}ms excede SLO ${config.latencyP99Ms}ms`,
      value: status.latency.p99,
      threshold: config.latencyP99Ms,
      action: "Page: buscar el trace más lento y pivotar a sus logs",
    });
  }

  return alerts;
}

/**
 * Evalúa alertas de CAUSA (recursos del sistema). Nunca paginan: van a ticket.
 * Distinción explícita de la práctica #4.
 */
export function evaluateCauseAlerts(): Alert[] {
  const alerts: Alert[] = [];
  const mem = process.memoryUsage();
  const heapRatio = mem.heapUsed / mem.heapTotal;

  if (heapRatio > 0.9) {
    alerts.push({
      kind: "cause",
      severity: "ticket",
      name: "heap_pressure",
      message: `Uso de heap ${(heapRatio * 100).toFixed(0)}% (causa, no síntoma)`,
      value: Number(heapRatio.toFixed(2)),
      threshold: 0.9,
      action: "Ticket para SRE — no paginar salvo que impacte un SLI",
    });
  }

  return alerts;
}

export interface AlertReport {
  generatedAt: string;
  slo: SloStatus;
  symptoms: Alert[];
  causes: Alert[];
  /** true si hay algún síntoma que amerita page. */
  paging: boolean;
}

export function buildAlertReport(config: SloConfig = sloConfig): AlertReport {
  const symptoms = evaluateSymptomAlerts(config);
  const causes = evaluateCauseAlerts();
  return {
    generatedAt: new Date().toISOString(),
    slo: evaluateSlo(config),
    symptoms,
    causes,
    paging: symptoms.some((a) => a.severity === "page"),
  };
}
