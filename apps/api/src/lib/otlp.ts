/**
 * Kitsuden — Exportar las trazas en OTLP, para quien ya tiene su colector (kitsuden2.md G2)
 * ============================================================================
 *
 * La «caja de cristal» (trazas.ts) funciona sin configurar nada: guarda en el
 * mismo Postgres y se ve en el panel. Quien YA tenga OpenTelemetry (Jaeger,
 * Tempo, Honeycomb, Grafana…) puede recibir además cada traza como un span:
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
 *   OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer abc,x-tenant=kitsuden   (opcional)
 *   OTEL_SERVICE_NAME=kitsuden-api                                          (opcional)
 *
 * OTLP/HTTP con JSON (`POST {endpoint}/v1/traces`), el formato que acepta
 * cualquier colector desde la versión 1.0 de la especificación, sin
 * dependencias: un `fetch` por lote. El `trace_id` es el W3C de la petición
 * (el mismo de la cabecera `traceparent` y de los logs), así que el span se
 * une a la traza distribuida que el colector ya tenga.
 *
 * Mejor esfuerzo: si el colector no responde, se avisa (como mucho una vez
 * por minuto) y el lote se pierde para OTLP; en Postgres ya está guardado.
 */

import { randomBytes } from "node:crypto";

import { logger } from "./logger";

import type { Traza } from "./trazas";

export function otlpConfigurado(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
}

function urlDeTrazas(): string {
  const propia = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (propia) return propia;
  return `${(process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "").replace(/\/+$/, "")}/v1/traces`;
}

function cabeceras(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  for (const par of (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "").split(",")) {
    const i = par.indexOf("=");
    if (i > 0) h[par.slice(0, i).trim().toLowerCase()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return h;
}

type Atributo = { key: string; value: Record<string, unknown> };

function atributo(key: string, valor: string | number | boolean | null | undefined): Atributo | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean") return { key, value: { boolValue: valor } };
  if (typeof valor === "number") {
    return Number.isInteger(valor)
      ? { key, value: { intValue: String(valor) } }
      : { key, value: { doubleValue: valor } };
  }
  return { key, value: { stringValue: valor } };
}

/** Una traza como span OTLP (JSON). Exportado para las pruebas. */
export function spanDe(t: Traza): Record<string, unknown> {
  const fin = BigInt(t.creado.getTime()) * 1_000_000n;
  const inicio = fin - BigInt(Math.max(0, Math.round(t.duracionMs * 1_000_000)));
  const traceId = t.traceId && /^[0-9a-f]{32}$/.test(t.traceId) ? t.traceId : randomBytes(16).toString("hex");
  return {
    traceId,
    spanId: randomBytes(8).toString("hex"),
    name: `${t.metodo} ${t.ruta}`,
    kind: 2, // SERVER
    startTimeUnixNano: inicio.toString(),
    endTimeUnixNano: fin.toString(),
    attributes: [
      atributo("http.request.method", t.metodo),
      atributo("http.route", t.ruta),
      atributo("http.response.status_code", t.estado),
      atributo("kitsuden.request_id", t.requestId),
      atributo("kitsuden.actor.type", t.actorTipo),
      atributo("kitsuden.actor.id", t.actorId),
      atributo("kitsuden.kon", t.kon),
      atributo("kitsuden.operation", t.operacion),
      atributo("kitsuden.db.duration_ms", t.tiempoDbMs),
      atributo("kitsuden.db.queries", t.consultas),
      atributo("kitsuden.db.rows_written", t.filasAfectadas),
      atributo("kitsuden.blocked", t.bloqueos),
    ].filter((a): a is Atributo => a !== null),
    status: t.estado >= 500 ? { code: 2 } : { code: 0 },
  };
}

let avisado = 0;

export async function exportarSpansOtlp(lote: Traza[]): Promise<void> {
  if (!otlpConfigurado() || lote.length === 0) return;
  const cuerpo = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: process.env.OTEL_SERVICE_NAME || "kitsuden-api" } },
          ],
        },
        scopeSpans: [{ scope: { name: "kitsuden.trazas" }, spans: lote.map(spanDe) }],
      },
    ],
  };
  try {
    const res = await fetch(urlDeTrazas(), {
      method: "POST",
      headers: cabeceras(),
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (Date.now() - avisado > 60_000) {
      avisado = Date.now();
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[otlp] el colector no aceptó el lote de spans"
      );
    }
  }
}
