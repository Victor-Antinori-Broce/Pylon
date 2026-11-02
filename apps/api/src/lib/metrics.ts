/**
 * Kitsuden — Metrics Registry (SLIs reales)
 * ============================================================================
 *
 * Base de la práctica #3 (SLIs/SLOs). Recolecta métricas REALES de las requests
 * HTTP (reemplaza los valores `Math.random()` que había en observability.ts):
 *   - Success rate (SLI de disponibilidad): ratio de requests no-5xx.
 *   - Latencia p50/p95/p99 (SLI de latencia).
 *   - Throughput (requests/min).
 *
 * Ventana deslizante de 60 buckets de 1 minuto → permite calcular SLIs y burn
 * rate sobre ventanas cortas (1h, 5m) sin depender de una TSDB externa.
 */

const WINDOW_MINUTES = 60;
const MAX_SAMPLES_PER_BUCKET = 500; // reservoir acotado para percentiles

interface MinuteBucket {
  minute: number; // epoch minute
  total: number;
  success: number; // status < 500
  serverErrors: number; // 5xx
  clientErrors: number; // 4xx
  latencies: number[]; // reservoir acotado (ms)
  sumLatency: number;
  maxLatency: number;
}

function emptyBucket(minute: number): MinuteBucket {
  return {
    minute,
    total: 0,
    success: 0,
    serverErrors: 0,
    clientErrors: 0,
    latencies: [],
    sumLatency: 0,
    maxLatency: 0,
  };
}

// Ring buffer de buckets por minuto.
const buckets = new Map<number, MinuteBucket>();

function currentMinute(): number {
  return Math.floor(Date.now() / 60000);
}

function getBucket(minute: number): MinuteBucket {
  let b = buckets.get(minute);
  if (!b) {
    b = emptyBucket(minute);
    buckets.set(minute, b);
    // Purga buckets fuera de ventana.
    const cutoff = minute - WINDOW_MINUTES;
    for (const key of buckets.keys()) {
      if (key < cutoff) buckets.delete(key);
    }
  }
  return b;
}

// Por-ruta (acotado) para diagnóstico de qué endpoint quema el budget.
interface RouteStat {
  total: number;
  serverErrors: number;
  sumLatency: number;
  maxLatency: number;
}
const routeStats = new Map<string, RouteStat>();
const MAX_ROUTES = 200;

/**
 * Registra el resultado de una request. Llamado por el middleware de telemetría.
 */
export function recordRequest(input: {
  method: string;
  route: string; // patrón, no la URL con ids
  status: number;
  durationMs: number;
}): void {
  const b = getBucket(currentMinute());
  b.total++;
  b.sumLatency += input.durationMs;
  if (input.durationMs > b.maxLatency) b.maxLatency = input.durationMs;

  if (input.status >= 500) b.serverErrors++;
  else if (input.status >= 400) b.clientErrors++;
  else b.success++;
  // 4xx cuenta como "no-5xx" → éxito de disponibilidad del servicio (el error
  // es del cliente). success = total - serverErrors para el SLI.

  // Reservoir sampling acotado.
  if (b.latencies.length < MAX_SAMPLES_PER_BUCKET) {
    b.latencies.push(input.durationMs);
  } else {
    const j = Math.floor(Math.random() * b.total);
    if (j < MAX_SAMPLES_PER_BUCKET) b.latencies[j] = input.durationMs;
  }

  // Por-ruta.
  const key = `${input.method} ${input.route}`;
  let rs = routeStats.get(key);
  if (!rs) {
    if (routeStats.size < MAX_ROUTES) {
      rs = { total: 0, serverErrors: 0, sumLatency: 0, maxLatency: 0 };
      routeStats.set(key, rs);
    }
  }
  if (rs) {
    rs.total++;
    rs.sumLatency += input.durationMs;
    if (input.durationMs > rs.maxLatency) rs.maxLatency = input.durationMs;
    if (input.status >= 500) rs.serverErrors++;
  }
}

// ── Cálculo de percentiles ────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export interface MetricsSnapshot {
  windowMinutes: number;
  total: number;
  serverErrors: number;
  clientErrors: number;
  successRate: number; // (total - 5xx) / total  → SLI disponibilidad
  errorRate: number; // 5xx / total
  latency: { p50: number; p95: number; p99: number; avg: number; max: number };
  throughputPerMin: number;
}

/**
 * Agrega los buckets de los últimos `windowMinutes` en un snapshot de SLIs.
 */
export function getMetricsSnapshot(windowMinutes = WINDOW_MINUTES): MetricsSnapshot {
  const now = currentMinute();
  const from = now - windowMinutes + 1;

  let total = 0;
  let serverErrors = 0;
  let clientErrors = 0;
  let sumLatency = 0;
  let maxLatency = 0;
  const allLatencies: number[] = [];

  for (let m = from; m <= now; m++) {
    const b = buckets.get(m);
    if (!b) continue;
    total += b.total;
    serverErrors += b.serverErrors;
    clientErrors += b.clientErrors;
    sumLatency += b.sumLatency;
    if (b.maxLatency > maxLatency) maxLatency = b.maxLatency;
    for (const l of b.latencies) allLatencies.push(l);
  }

  allLatencies.sort((a, b) => a - b);
  const successRate = total > 0 ? (total - serverErrors) / total : 1;
  const errorRate = total > 0 ? serverErrors / total : 0;

  return {
    windowMinutes,
    total,
    serverErrors,
    clientErrors,
    successRate,
    errorRate,
    latency: {
      p50: percentile(allLatencies, 50),
      p95: percentile(allLatencies, 95),
      p99: percentile(allLatencies, 99),
      avg: total > 0 ? Math.round(sumLatency / total) : 0,
      max: maxLatency,
    },
    throughputPerMin: windowMinutes > 0 ? Math.round(total / windowMinutes) : 0,
  };
}

export interface RouteSnapshot {
  route: string;
  total: number;
  serverErrors: number;
  avgLatency: number;
  maxLatency: number;
}

/** Top rutas por volumen (para saber qué endpoint impacta los SLIs). */
export function getRouteSnapshots(limit = 20): RouteSnapshot[] {
  return Array.from(routeStats.entries())
    .map(([route, s]) => ({
      route,
      total: s.total,
      serverErrors: s.serverErrors,
      avgLatency: s.total > 0 ? Math.round(s.sumLatency / s.total) : 0,
      maxLatency: s.maxLatency,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Reinicia el registro (para tests). */
export function resetMetrics(): void {
  buckets.clear();
  routeStats.clear();
}
