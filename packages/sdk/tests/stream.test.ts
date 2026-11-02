/**
 * Streaming operations (kitsuden2.md C5): Server-Sent Events read as a typed
 * `AsyncIterable`, and the generator emitting `StreamOperation` for an
 * operation the OpenAPI marks as a stream.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { KitsudenApiError } from "../src/index";
import { streamEvents } from "../src/api/stream";
import { DEFAULT_RETRY, randomIdempotencyKey, type TransportConfig } from "../src/api/transport";
import type { OperationInfo } from "../src/api/types";

const INFO: OperationInfo = {
  kon: "kon-demo",
  id: "progreso",
  operationId: "demo.progreso",
  method: "GET",
  path: "/demo/imports/{id}/progress",
  pathParams: ["id"],
  queryParams: [],
  body: null,
  responses: { "200": "event-stream" },
  idempotent: true,
  readOnly: true,
  sensitive: false,
  scope: null,
  mcpTool: null,
  errors: [],
  stream: true,
};

/** A fetch that answers with an SSE body sent in the given chunks (split anywhere). */
function fetchSse(trozos: string[], estado = 200, tipo = "text/event-stream") {
  const llamadas: { url: string; accept: string | null; signal?: AbortSignal | null }[] = [];
  let cancelado = false;
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), accept: new Headers(init?.headers).get("accept"), signal: init?.signal });
    const enc = new TextEncoder();
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (i < trozos.length) c.enqueue(enc.encode(trozos[i++]!));
        else c.close();
      },
      cancel() {
        cancelado = true;
      },
    });
    return new Response(body, { status: estado, headers: { "content-type": tipo } });
  }) as typeof fetch;
  return { f, llamadas, cancelado: () => cancelado };
}

function cfg(f: typeof fetch): TransportConfig {
  return {
    baseUrl: "http://kitsuden.test",
    token: "tok",
    fetch: f,
    format: "json",
    provenance: false,
    headers: {},
    timeoutMs: 30_000,
    retry: DEFAULT_RETRY,
    sleep: async () => {},
    random: Math.random,
    newIdempotencyKey: randomIdempotencyKey,
  } as TransportConfig;
}

async function todos<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe("streamEvents", () => {
  it("yields each data event as JSON and stops at `end`, even split across chunks", async () => {
    const { f, llamadas } = fetchSse([
      'id: 1\ndata: {"hechos":1,',
      '"total":2}\n\nid: 2\ndata: {"hechos":2,"total":2}\n',
      "\n: comment\n\nevent: end\ndata: {\"count\":2}\n\n",
    ]);
    const eventos = await todos(
      streamEvents<{ hechos: number; total: number }>(cfg(f), { info: INFO, params: { id: "x 1" } })
    );
    expect(eventos).toEqual([
      { hechos: 1, total: 2 },
      { hechos: 2, total: 2 },
    ]);
    expect(llamadas[0]?.url).toBe("http://kitsuden.test/api/demo/imports/x%201/progress");
    expect(llamadas[0]?.accept).toBe("text/event-stream");
  });

  it("an `error` event throws KitsudenApiError with its problem", async () => {
    const { f } = fetchSse([
      'data: {"n":1}\n\n',
      'event: error\ndata: {"type":"about:blank","title":"Boom","status":500,"code":"KITSUDEN_E_INTERNAL"}\n\n',
    ]);
    const vistos: unknown[] = [];
    await expect(async () => {
      for await (const e of streamEvents(cfg(f), { info: INFO, params: { id: "1" } })) vistos.push(e);
    }).rejects.toBeInstanceOf(KitsudenApiError);
    expect(vistos).toEqual([{ n: 1 }]);
  });

  it("a non-stream answer (403 problem+json) throws before iterating", async () => {
    const f = (async () =>
      new Response(JSON.stringify({ type: "about:blank", title: "Forbidden", status: 403, code: "KITSUDEN_E_FORBIDDEN" }), {
        status: 403,
        headers: { "content-type": "application/problem+json" },
      })) as typeof fetch;
    try {
      await todos(streamEvents(cfg(f), { info: INFO, params: { id: "1" } }));
      throw new Error("no lanzó");
    } catch (e) {
      expect(e).toBeInstanceOf(KitsudenApiError);
      expect((e as KitsudenApiError).code).toBe("KITSUDEN_E_FORBIDDEN");
    }
  });

  it("breaking out of the loop aborts the request", async () => {
    const { f, llamadas, cancelado } = fetchSse(['data: {"n":1}\n\n', 'data: {"n":2}\n\n', 'data: {"n":3}\n\n']);
    for await (const e of streamEvents<{ n: number }>(cfg(f), { info: INFO, params: { id: "1" } })) {
      if (e.n === 1) break;
    }
    expect(llamadas[0]?.signal?.aborted).toBe(true);
    expect(cancelado()).toBe(true);
  });
});

describe("generator: a stream operation becomes a StreamOperation", () => {
  const dir = mkdtempSync(join(tmpdir(), "ksdk-flujo-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("emits the event type, `stream: true` and StreamOperation<Params, Event>", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "demo", version: "0.0.0" },
      tags: [{ name: "kon-demo", description: "Demo" }],
      paths: {
        "/demo/imports/{id}/progress": {
          get: {
            operationId: "demo.progreso",
            summary: "Import progress",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: {
              "200": {
                description: "SSE",
                content: {
                  "text/event-stream": {
                    schema: { type: "string" },
                    "x-kitsuden-event-schema": {
                      type: "object",
                      properties: { hechos: { type: "integer" }, total: { type: "integer" } },
                      required: ["hechos", "total"],
                    },
                  },
                },
              },
            },
            "x-kitsuden-operation": {
              kon: "kon-demo",
              id: "progreso",
              access: "sesion",
              scope: "kon:demo:progreso",
              sensitive: false,
              readOnly: true,
              idempotent: true,
              errors: [],
              stream: true,
              mcp: { tool: "demo_progreso" },
            },
          },
        },
      },
      components: { schemas: { Problem: { properties: { code: { enum: ["KITSUDEN_E_INTERNAL"] } } } } },
    };
    const rutaSpec = join(dir, "spec.json");
    writeFileSync(rutaSpec, JSON.stringify(spec));
    const raiz = join(__dirname, "../../..");
    const r = spawnSync(
      process.execPath,
      [
        join(raiz, "scripts/sdk/generate.mjs"),
        `--spec=${rutaSpec}`,
        `--out-ts=${join(dir, "ts")}`,
        `--out-py=${join(dir, "py")}`,
      ],
      { encoding: "utf8" }
    );
    expect(r.status, r.stderr).toBe(0);
    const ts = readFileSync(join(dir, "ts/kons/demo.ts"), "utf8");
    expect(ts).toContain("export type ProgresoEvent = {");
    expect(ts).toContain("readonly progreso: StreamOperation<ProgresoParams, ProgresoEvent>;");
    expect(ts).toContain('"stream":true');
    expect(ts).toContain("import type { OperationInfo, StreamOperation }");
    const py = readFileSync(join(dir, "py/kons/demo.py"), "utf8");
    expect(py).toContain('200: "text"');
  });
});
