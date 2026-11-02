/**
 * Todos los errores de `/api/*` salen en `application/problem+json` (RFC 9457)
 * ============================================================================
 *
 * ── POR QUÉ A LA SALIDA Y NO RUTA A RUTA ──────────────────────────────────
 *
 * Hay cientos de `c.json({ error: "…" }, 4xx)` repartidos por el núcleo y los
 * kons, más `app.onError`, `app.notFound`, el limitador, el límite de cuerpo,
 * el pool agotado y las puertas de autorización, cada uno con su forma.
 * Migrarlos uno a uno deja fuera el siguiente que se escriba (es lo que ya
 * pasó con `errores-sin-detalle.ts`). Esto es la red: tras el handler, si la
 * respuesta es un error, se reescribe con UNA forma:
 *
 *   { …lo que mandaba la ruta (incluido `error`, tal cual),
 *     type, title, status, detail, instance,
 *     code: "KITSUDEN_E_*", retryable, retry_after, hint, docs, requestId }
 *
 * El catálogo de códigos vive en `@kitsuden/shared` (`errores.ts`).
 *
 * ── COMPATIBILIDAD ─────────────────────────────────────────────────────────
 *
 * - `error` se conserva con su valor original (texto u objeto
 *   `{ code, message, details }`); si la ruta no lo mandaba, lleva el detalle.
 *   El panel, las webs del propietario, Inti y el SDK lo leen.
 * - Los demás campos originales se conservan. Si uno choca con un nombre de
 *   RFC 9457 o de Kitsuden (`code`, `status`, `type`…), su valor antiguo pasa
 *   a `legacy_<nombre>` en vez de perderse.
 * - Se excluye `/api/auth/*` (protocolo propio de better-auth: su cliente
 *   ramifica por su `code`).
 * - Un cuerpo JSON-RPC (`"jsonrpc": "2.0"`, el MCP) no se toca: lleva el mismo
 *   problema en `error.data` (ver lib/problemas-mcp.ts). Lo que el MCP no
 *   llega a ver —la autenticación global que rechaza una clave antes— sí se
 *   normaliza.
 *
 * ── ORDEN ──────────────────────────────────────────────────────────────────
 *
 * Va por FUERA de `poolAgotadoA503` y de `erroresSinDetalle`: ve la respuesta
 * ya decidida (503 del pool, 5xx sin detalle en producción) y solo le da forma.
 * Si fuera por dentro, `erroresSinDetalle` dejaría de reconocer el cuerpo como
 * JSON (`problem+json` no contiene `application/json`) y en producción volvería
 * a enseñarse el detalle interno de un 500.
 */
import {
  PROBLEM_JSON,
  buildProblem,
  errorCodeForStatus,
  errorCodeFromLegacy,
  parseRetryAfter,
  type ProblemDetails,
} from "@kitsuden/shared";
import type { Context, Next } from "hono";

/** Caminos con su propio protocolo de error. */
// `/api/oauth`: los errores de OAuth tienen su forma (RFC 6749 §5.2:
// `{ error, error_description }`) y los clientes MCP la leen tal cual.
export const EXCLUIDAS_DE_PROBLEMAS = ["/api/auth", "/api/oauth"];

/** Nombres que pone el problema; si el cuerpo original los traía, pasan a `legacy_*`. */
const RESERVADOS = new Set([
  "type",
  "title",
  "status",
  "detail",
  "instance",
  "code",
  "retryable",
  "retry_after",
  "hint",
  "docs",
]);

const MAX_DETALLE = 500;

function textoUtil(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_DETALLE) : null;
}

/**
 * Convierte una respuesta de error cualquiera en un problema. Pura: la usan el
 * middleware y los tests.
 */
export function problemaDesdeRespuesta(params: {
  status: number;
  /** Cuerpo JSON ya leído (si la respuesta era JSON). */
  cuerpo?: unknown;
  /** Cuerpo en texto (si no era JSON). */
  texto?: string;
  retryAfterCabecera?: string | null;
  instance?: string;
  requestId?: string | null;
  traceId?: string | null;
}): ProblemDetails {
  const { status } = params;
  const cuerpo = params.cuerpo;
  const retryAfter = parseRetryAfter(params.retryAfterCabecera ?? null);

  if (cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo)) {
    const original = cuerpo as Record<string, unknown>;
    const campoError = original.error;
    const errorObjeto =
      campoError && typeof campoError === "object" && !Array.isArray(campoError)
        ? (campoError as Record<string, unknown>)
        : null;

    const code =
      errorCodeFromLegacy(original.code) ??
      errorCodeFromLegacy(errorObjeto?.code) ??
      errorCodeForStatus(status);

    const detail =
      textoUtil(original.message) ??
      textoUtil(errorObjeto?.message) ??
      textoUtil(campoError) ??
      textoUtil(original.detail) ??
      undefined;

    const extensiones: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(original)) {
      if (clave === "requestId" || clave === "traceId") continue;
      if (RESERVADOS.has(clave)) {
        // Un `code` que ya es del catálogo no es «legado»: es el mismo dato.
        if (clave === "code" && valor === code) continue;
        extensiones[`legacy_${clave}`] = valor;
      } else {
        extensiones[clave] = valor;
      }
    }

    return buildProblem({
      code,
      status,
      detail,
      instance: params.instance,
      retryAfter,
      hint: textoUtil(original.hint) ?? undefined,
      requestId:
        (typeof original.requestId === "string" ? original.requestId : null) ??
        params.requestId ??
        null,
      traceId: params.traceId ?? null,
      error: campoError === undefined ? undefined : campoError,
      extensions: extensiones,
    });
  }

  const texto = textoUtil(params.texto);
  return buildProblem({
    code: errorCodeForStatus(status),
    status,
    detail: texto ?? undefined,
    instance: params.instance,
    retryAfter,
    requestId: params.requestId ?? null,
    traceId: params.traceId ?? null,
    extensions: Array.isArray(cuerpo) ? { data: cuerpo } : undefined,
  });
}

/**
 * Responde un problema directamente (para el código nuevo: idempotencia,
 * puertas). Pone `Retry-After` si hay espera.
 */
export function responderProblema(
  c: Context,
  problema: ProblemDetails,
  cabecerasExtra: Record<string, string> = {}
): Response {
  const cabeceras = new Headers({ "content-type": `${PROBLEM_JSON}; charset=utf-8` });
  if (problema.retry_after !== null) cabeceras.set("retry-after", String(problema.retry_after));
  for (const [k, v] of Object.entries(cabecerasExtra)) cabeceras.set(k, v);
  return new Response(JSON.stringify(problema), {
    status: problema.status,
    headers: cabeceras,
  });
}

export function problemasHttp(excluidas: string[] = EXCLUIDAS_DE_PROBLEMAS) {
  return async (c: Context, next: Next) => {
    await next();

    const camino = c.req.path;
    if (!camino.startsWith("/api/")) return;
    if (excluidas.some((p) => camino === p || camino.startsWith(`${p}/`))) return;

    const res = c.res;
    if (res.status < 400 || c.req.method === "HEAD") return;

    const tipo = (res.headers.get("content-type") ?? "").toLowerCase();
    if (tipo.includes("problem+json") || tipo.includes("text/event-stream")) return;

    let cuerpo: unknown;
    let texto: string | undefined;
    if (tipo.includes("json")) {
      cuerpo = await res
        .clone()
        .json()
        .catch(() => undefined);
    } else {
      texto = await res
        .clone()
        .text()
        .catch(() => "");
      // Un cuerpo HTML no es un mensaje: sin etiquetas, el detalle queda limpio.
      if (tipo.includes("html")) texto = undefined;
    }

    if (cuerpo && typeof cuerpo === "object" && (cuerpo as { jsonrpc?: unknown }).jsonrpc === "2.0") {
      return;
    }

    const get = c.get as (k: string) => unknown;
    const problema = problemaDesdeRespuesta({
      status: res.status,
      cuerpo,
      texto,
      retryAfterCabecera: res.headers.get("retry-after"),
      instance: camino,
      requestId: (get("requestId") as string | undefined) ?? null,
      traceId: (get("traceId") as string | undefined) ?? null,
    });

    const cabeceras = new Headers(res.headers);
    cabeceras.delete("content-length");
    cabeceras.set("content-type", `${PROBLEM_JSON}; charset=utf-8`);
    if (problema.retry_after !== null && !cabeceras.has("retry-after")) {
      cabeceras.set("retry-after", String(problema.retry_after));
    }

    // Vaciar antes de asignar: el setter de Hono copia las cabeceras de la
    // respuesta anterior sobre la nueva (incluida una `content-length` vieja).
    c.res = undefined as unknown as Response;
    c.res = new Response(JSON.stringify(problema), { status: res.status, headers: cabeceras });
  };
}
