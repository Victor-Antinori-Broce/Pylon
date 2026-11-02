/**
 * One HTTP call of the typed client: URL, headers, retries, decoding.
 *
 * Only `fetch`, `AbortController`, `Headers`, `URLSearchParams`, `TextDecoder`
 * and `crypto.getRandomValues` (all in Node 18+, Bun, Deno and browsers).
 */

import { decodeToon } from "../toon";

import { KitsudenApiError, KitsudenDecodeError, KitsudenNetworkError } from "./errors";
import { decodeTron } from "./tron";
import type {
  CallOptions,
  Format,
  OperationInfo,
  Outcome,
  Problem,
  Proposal,
  ProvenanceSummary,
  ResponseMeta,
  RetryPolicy,
} from "./types";

export const MIME = {
  json: "application/json",
  toon: "application/vnd.toon",
  tron: "application/vnd.tron",
  auto: "application/vnd.kitsuden.auto",
} as const;

export const DEFAULT_RETRY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 8_000,
  maxRetryAfterMs: 60_000,
};

/** Statuses retried when the body is not a Kitsuden problem (a proxy in front, say). */
const REINTENTABLES_SIN_PROBLEMA = new Set([408, 429, 502, 503, 504]);

export interface TransportConfig {
  baseUrl: string;
  token?: string;
  sessionCookie?: string;
  credentials?: RequestCredentials;
  fetch: typeof fetch;
  format: Format;
  provenance: boolean;
  untrustedWrap?: CallOptions["untrustedWrap"];
  headers: Record<string, string>;
  timeoutMs: number;
  retry: RetryPolicy;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  newIdempotencyKey: () => string;
}

/** A random key that matches the server's pattern (`^[A-Za-z0-9_.:-]+$`, 8–128). */
export function randomIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `ksdk-${hex}`;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** The URL of one call (path params encoded, query params like the MCP tools: text as is, the rest as JSON). */
export function buildUrl(
  baseUrl: string,
  info: OperationInfo,
  params: Record<string, unknown>
): string {
  let camino = info.path;
  for (const nombre of info.pathParams) {
    const v = params[nombre];
    if (v === undefined || v === null || v === "") {
      throw new TypeError(`${info.operationId}: missing path parameter '${nombre}'`);
    }
    camino = camino.replace(`{${nombre}}`, encodeURIComponent(texto(v)));
  }
  const q = new URLSearchParams();
  for (const nombre of info.queryParams) {
    const v = params[nombre];
    if (v === undefined || v === null) continue;
    q.set(nombre, texto(v));
  }
  const qs = q.toString();
  return `${baseUrl}/api${camino === "/" ? "" : camino}${qs ? `?${qs}` : ""}`;
}

export function acceptFor(format: Format): string {
  return MIME[format];
}

export function parseProvenance(raw: string | null): ProvenanceSummary | null {
  if (!raw) return null;
  const out: ProvenanceSummary = { untrusted: 0, authors: {}, raw };
  for (const parte of raw.split(";")) {
    const [k, v] = parte.split("=").map((s) => s.trim());
    if (!k || v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === "untrusted") out.untrusted = n;
    else out.authors[k] = n;
  }
  return out;
}

/** `Retry-After` in seconds (delta or HTTP date), or `null`. */
export function parseRetryAfter(v: string | null, now = Date.now()): number | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const fecha = Date.parse(s);
  if (Number.isNaN(fecha)) return null;
  return Math.max(0, (fecha - now) / 1000);
}

function formatoDe(
  contentType: string | null,
  cabecera: string | null
): "json" | "toon" | "tron" | null {
  const f = cabecera?.trim().toLowerCase();
  if (f === "json" || f === "toon" || f === "tron") return f;
  if (!contentType) return null;
  if (contentType.includes(MIME.toon)) return "toon";
  if (contentType.includes(MIME.tron)) return "tron";
  if (contentType.includes("json")) return "json";
  return null;
}

export function metaDe(
  res: Response,
  info: OperationInfo | null,
  clave: string | null,
  intentos: number
): ResponseMeta {
  const contentType = res.headers.get("content-type");
  return {
    status: res.status,
    headers: res.headers,
    requestId: res.headers.get("x-request-id"),
    format: formatoDe(contentType, res.headers.get("x-kitsuden-format")),
    contentType,
    provenance: parseProvenance(res.headers.get("x-kitsuden-provenance")),
    idempotencyKey: clave,
    replayed: (res.headers.get("idempotent-replayed") ?? "").toLowerCase() === "true",
    attempts: intentos,
    operation: info,
  };
}

/** Decode a text body according to its declared format. */
export function decodeBody(text: string, format: "json" | "toon" | "tron" | null): unknown {
  if (format === "toon") return decodeToon(text);
  if (format === "tron") return decodeTron(text);
  return text.length === 0 ? null : JSON.parse(text);
}

export function problemaDe(status: number, cuerpo: unknown, statusText: string): Problem {
  if (cuerpo && typeof cuerpo === "object" && typeof (cuerpo as Problem).code === "string") {
    const p = cuerpo as Problem;
    return { ...p, status: typeof p.status === "number" ? p.status : status };
  }
  // Not a Kitsuden problem (a proxy, an HTML page): synthesize one so callers have one shape.
  const detalle =
    cuerpo && typeof cuerpo === "object" && "error" in cuerpo
      ? texto((cuerpo as { error: unknown }).error)
      : typeof cuerpo === "string" && cuerpo
        ? cuerpo.slice(0, 500)
        : statusText || `HTTP ${status}`;
  return {
    type: "about:blank",
    title: statusText || `HTTP ${status}`,
    status,
    detail: detalle,
    code:
      status >= 500
        ? "KITSUDEN_E_INTERNAL"
        : status === 404
          ? "KITSUDEN_E_NOT_FOUND"
          : "KITSUDEN_E_BAD_REQUEST",
    retryable: REINTENTABLES_SIN_PROBLEMA.has(status),
    retry_after: null,
    hint: "",
    docs: "",
    error: cuerpo,
  };
}

function esperaDeBackoff(intento: number, r: RetryPolicy, random: () => number): number {
  const techo = Math.min(r.maxDelayMs, r.baseDelayMs * 2 ** intento);
  return Math.round(random() * techo);
}

function leerJsonSeguro(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export interface RawRequest {
  info: OperationInfo;
  params: Record<string, unknown>;
  body?: unknown;
  options?: CallOptions;
}

/**
 * Run one operation. Returns `ok` or `proposal_pending`; throws
 * `KitsudenApiError` / `KitsudenNetworkError` / `KitsudenDecodeError`.
 *
 * Retries ONLY when it is safe: the operation reads, is declared idempotent,
 * or carries an `Idempotency-Key` (the server replays instead of running it
 * twice). And only on a network failure or a response the server marks
 * `retryable` (429, 503…), waiting what `Retry-After` says. A 202 approval is
 * never retried.
 */
export async function execute<T>(cfg: TransportConfig, req: RawRequest): Promise<Outcome<T>> {
  const { info, params } = req;
  const o = req.options ?? {};
  const politica: RetryPolicy =
    o.retry === false ? { ...cfg.retry, maxRetries: 0 } : { ...cfg.retry, ...(o.retry ?? {}) };
  const formato = o.format ?? cfg.format;
  const url = buildUrl(cfg.baseUrl, info, params);
  const escritura = info.method !== "GET";

  const headers: Record<string, string> = { accept: acceptFor(formato), ...cfg.headers };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  if (cfg.sessionCookie) headers.cookie = cfg.sessionCookie;
  if (o.provenance ?? cfg.provenance) headers["x-kitsuden-provenance"] = "1";
  const envoltorio = o.untrustedWrap ?? cfg.untrustedWrap;
  if (envoltorio) headers["x-kitsuden-untrusted-wrap"] = envoltorio;

  let cuerpo: BodyInit | undefined;
  if (req.body !== undefined && info.body !== null) {
    if (info.body === "multipart") {
      cuerpo = req.body as BodyInit;
    } else {
      headers["content-type"] = "application/json";
      cuerpo = JSON.stringify(req.body);
    }
  }

  let clave: string | null = null;
  if (escritura && o.idempotencyKey !== false) {
    clave = typeof o.idempotencyKey === "string" ? o.idempotencyKey : cfg.newIdempotencyKey();
    headers["idempotency-key"] = clave;
  }
  Object.assign(headers, o.headers ?? {});

  const seguro = !escritura || info.idempotent || info.readOnly || clave !== null;
  const conRedireccion = Object.values(info.responses).includes("redirect");
  const plazo = o.timeoutMs ?? cfg.timeoutMs;

  for (let intento = 0; ; intento++) {
    const intentos = intento + 1;
    const ctl = new AbortController();
    let porPlazo = false;
    const temporizador =
      plazo > 0 ? setTimeout(() => ((porPlazo = true), ctl.abort()), plazo) : undefined;
    const alAbortar = () => ctl.abort();
    o.signal?.addEventListener("abort", alAbortar, { once: true });

    let res: Response;
    try {
      res = await cfg.fetch(url, {
        method: info.method,
        headers,
        body: cuerpo,
        signal: ctl.signal,
        ...(cfg.credentials ? { credentials: cfg.credentials } : {}),
        ...(conRedireccion ? { redirect: "manual" as const } : {}),
      });
    } catch (err) {
      clearTimeout(temporizador);
      o.signal?.removeEventListener("abort", alAbortar);
      if (o.signal?.aborted) throw err;
      if (seguro && intento < politica.maxRetries) {
        await cfg.sleep(esperaDeBackoff(intento, politica, cfg.random));
        continue;
      }
      throw new KitsudenNetworkError(
        `${info.method} ${url}: ${porPlazo ? `no response in ${plazo} ms` : ((err as Error)?.message ?? String(err))}`,
        { cause: err, operation: info, attempts: intentos, timedOut: porPlazo }
      );
    }

    try {
      const meta = metaDe(res, info, clave, intentos);
      const tipo = (meta.contentType ?? "").toLowerCase();

      // ── 202: pending human approval. Never retried. ──
      // Recognized by its `code`, not by the media type: the API has sent it
      // both as application/problem+json and as application/json (measured
      // against a live API), and a client that asked for TOON/TRON may get it
      // in that format.
      if (res.status === 202 && (meta.format !== null || tipo.includes("json"))) {
        const t = await res.text();
        let p: unknown;
        try {
          p = decodeBody(t, tipo.includes("problem+json") ? "json" : meta.format);
        } catch {
          p = t;
        }
        const posible = p as (Problem & { proposal?: Proposal }) | null;
        if (
          posible &&
          typeof posible === "object" &&
          posible.code === "KITSUDEN_E_APPROVAL_REQUIRED"
        ) {
          return {
            kind: "proposal_pending",
            ok: false,
            status: 202,
            proposal: posible.proposal as Proposal,
            problem: posible,
            meta,
          };
        }
        return { kind: "ok", ok: true, status: 202, data: p as T, meta };
      }

      // ── Errors ──
      if (res.status >= 400 || (res.status >= 300 && !conRedireccion)) {
        const crudo = await res.text();
        const problema = problemaDe(res.status, leerJsonSeguro(crudo), res.statusText);
        const cabecera = parseRetryAfter(res.headers.get("retry-after"));
        const espera =
          cabecera ?? (typeof problema.retry_after === "number" ? problema.retry_after : null);
        const reintentable = problema.retryable === true;
        if (reintentable && seguro && intento < politica.maxRetries) {
          const ms =
            espera !== null ? espera * 1000 : esperaDeBackoff(intento, politica, cfg.random);
          if (ms <= politica.maxRetryAfterMs) {
            await cfg.sleep(ms);
            continue;
          }
        }
        throw new KitsudenApiError(problema, meta, espera);
      }

      // ── Success ──
      const clase = info.responses[String(res.status)];
      if (
        clase === "redirect" ||
        (res.status >= 300 && res.status < 400) ||
        res.type === "opaqueredirect"
      ) {
        return {
          kind: "ok",
          ok: true,
          status: res.status,
          data: { status: res.status, location: res.headers.get("location") } as T,
          meta,
        };
      }
      if (res.status === 204 || clase === "empty") {
        return { kind: "ok", ok: true, status: res.status, data: null as T, meta };
      }
      const esTexto =
        meta.format !== null || tipo.startsWith("text/") || tipo.includes("javascript");
      if (clase === "binary" || (!esTexto && clase !== "json" && clase !== "text")) {
        return {
          kind: "ok",
          ok: true,
          status: res.status,
          data: (await res.arrayBuffer()) as T,
          meta,
        };
      }
      const t = await res.text();
      if (clase === "text" || (meta.format === null && !tipo.includes("json"))) {
        return { kind: "ok", ok: true, status: res.status, data: t as T, meta };
      }
      let datos: unknown;
      try {
        datos = decodeBody(t, meta.format);
      } catch (err) {
        throw new KitsudenDecodeError(
          `${info.operationId}: could not decode the ${meta.format ?? "json"} body`,
          meta,
          err
        );
      }
      return { kind: "ok", ok: true, status: res.status, data: datos as T, meta };
    } finally {
      clearTimeout(temporizador);
      o.signal?.removeEventListener("abort", alAbortar);
    }
  }
}
