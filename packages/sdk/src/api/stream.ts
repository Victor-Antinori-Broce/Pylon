/**
 * Streaming operations (`salida.flujo` on the server): Server-Sent Events read
 * as an `AsyncIterable` of typed events.
 *
 *   for await (const step of api.imports.progreso({ id })) {
 *     console.log(step.done, "/", step.total);
 *   }
 *
 * Standard SSE (`text/event-stream`), no custom protocol: every `data:` event
 * is one item (JSON), `event: end` closes the stream, `event: error` carries a
 * problem+json and throws `KitsudenApiError`. Breaking out of the loop aborts
 * the request, and the server closes its generator.
 *
 * Not retried: a stream may have done work by the time it fails. Zero
 * dependencies, like the rest of the client: `fetch` + `ReadableStream`.
 */

import { KitsudenApiError, KitsudenNetworkError } from "./errors";
import { buildUrl, metaDe, problemaDe, type RawRequest, type TransportConfig } from "./transport";
import type { Problem } from "./types";

interface EventoCrudo {
  event?: string;
  data: string;
}

function parsearBloque(bloque: string): EventoCrudo | null {
  const datos: string[] = [];
  let event: string | undefined;
  for (const linea of bloque.split(/\r?\n/)) {
    if (!linea || linea.startsWith(":")) continue;
    const i = linea.indexOf(":");
    const campo = i === -1 ? linea : linea.slice(0, i);
    const valor = i === -1 ? "" : linea.slice(i + 1).replace(/^ /, "");
    if (campo === "data") datos.push(valor);
    else if (campo === "event") event = valor;
  }
  if (datos.length === 0 && !event) return null;
  return { event, data: datos.join("\n") };
}

function json(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export async function* streamEvents<E>(cfg: TransportConfig, req: RawRequest): AsyncGenerator<E, void, undefined> {
  const { info, params } = req;
  const o = req.options ?? {};
  const url = buildUrl(cfg.baseUrl, info, params);
  const headers: Record<string, string> = { ...cfg.headers, accept: "text/event-stream" };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  if (cfg.sessionCookie) headers.cookie = cfg.sessionCookie;
  let cuerpo: BodyInit | undefined;
  if (req.body !== undefined && info.body !== null) {
    if (info.body === "multipart") cuerpo = req.body as BodyInit;
    else {
      headers["content-type"] = "application/json";
      cuerpo = JSON.stringify(req.body);
    }
  }
  Object.assign(headers, o.headers ?? {});

  const ctl = new AbortController();
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
    });
  } catch (err) {
    o.signal?.removeEventListener("abort", alAbortar);
    if (o.signal?.aborted) throw err;
    throw new KitsudenNetworkError(`${info.method} ${url}: ${(err as Error)?.message ?? String(err)}`, {
      cause: err,
      operation: info,
      attempts: 1,
      timedOut: false,
    });
  }

  const meta = metaDe(res, info, null, 1);
  const tipo = (res.headers.get("content-type") ?? "").toLowerCase();
  if (res.status !== 200 || !tipo.includes("text/event-stream") || !res.body) {
    // Not a stream: an error (or anything else) answered before it started.
    o.signal?.removeEventListener("abort", alAbortar);
    const t = await res.text();
    const p = json(t);
    const problema =
      p && typeof p === "object" && "code" in (p as object)
        ? (p as Problem)
        : problemaDe(res.status, p, res.statusText);
    throw new KitsudenApiError(problema, meta, null);
  }

  const lector = res.body.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  let terminado = false;
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (value) resto += decodificador.decode(value, { stream: true });
      if (done) resto += decodificador.decode();
      const bloques = resto.split(/\r?\n\r?\n/);
      resto = done ? "" : (bloques.pop() ?? "");
      for (const b of bloques) {
        const ev = parsearBloque(b);
        if (!ev) continue;
        if (ev.event === "end") {
          terminado = true;
          return;
        }
        if (ev.event === "error") {
          terminado = true;
          const p = json(ev.data);
          const problema =
            p && typeof p === "object" && "code" in (p as object)
              ? (p as Problem)
              : problemaDe(500, p, "Stream error");
          throw new KitsudenApiError(problema, meta, null);
        }
        if (!ev.event || ev.event === "message") yield json(ev.data) as E;
      }
      if (done) {
        terminado = true;
        return;
      }
    }
  } finally {
    o.signal?.removeEventListener("abort", alAbortar);
    if (!terminado) {
      // The caller stopped iterating: close the connection (the server
      // cancels its generator and runs its `finally`).
      ctl.abort();
      await lector.cancel().catch(() => {});
    }
  }
}
