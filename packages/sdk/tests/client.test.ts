/**
 * Typed client (`KitsudenApi`) against a mocked server: every behaviour the
 * contract promises (auth, idempotency, retries, approvals, formats,
 * provenance, pagination, errors), without network.
 */

import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  API_VERSION,
  ERROR_CODES,
  KONS,
  KitsudenApi,
  KitsudenApiError,
  KitsudenNetworkError,
  ProposalPendingError,
  createKitsuden,
  decodeTron,
  encodeToon,
  expectOk,
  isKitsudenError,
  isProposalPending,
  parseRetryAfter,
  provenanceOf,
  type KitsudenApiOptions,
} from "../src/index";

const BASE = "http://kitsuden.test";
const SPEC = JSON.parse(readFileSync(join(__dirname, "../openapi/kitsuden.openapi.json"), "utf8"));

interface Llamada {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

type Respuesta = Response | (() => Response) | Error;

function servidor(respuestas: Respuesta[] = []) {
  const llamadas: Llamada[] = [];
  const cola = [...respuestas];
  const fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    llamadas.push({
      url: new URL(String(entrada)),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : null,
    });
    const r = cola.length > 1 ? cola.shift()! : cola[0];
    if (!r) return json({});
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r.clone();
  }) as typeof fetch;
  return { fetch, llamadas };
}

function json(cuerpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function problema(
  code: string,
  status: number,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return new Response(
    JSON.stringify({
      type: `https://x/${code}`,
      title: code,
      status,
      detail: `detail of ${code}`,
      code,
      retryable: false,
      retry_after: null,
      hint: "h",
      docs: "d",
      ...extra,
    }),
    { status, headers: { "content-type": "application/problem+json", ...headers } }
  );
}

const esperas: number[] = [];
function cliente(fetch: typeof globalThis.fetch, extra: KitsudenApiOptions = {}) {
  esperas.length = 0;
  return new KitsudenApi({
    baseUrl: BASE,
    token: "kitsuden_agent_test",
    fetch,
    sleep: async (ms) => void esperas.push(ms),
    random: () => 0.5,
    idempotencyKey: () => "ksdk-fixed-key-0001",
    ...extra,
  });
}

// ═════════════════════════════════════════════════════════════════════════════

describe("generated surface", () => {
  it("has one typed function per operation of the OpenAPI document, grouped by kon", () => {
    const delSpec: string[] = [];
    for (const [camino, item] of Object.entries<
      Record<string, { "x-kitsuden-operation": { kon: string; id: string } }>
    >(SPEC.paths))
      for (const [metodo, o] of Object.entries(item))
        delSpec.push(
          `${metodo.toUpperCase()} ${camino} ${o["x-kitsuden-operation"].kon}/${o["x-kitsuden-operation"].id}`
        );
    const k = cliente(servidor().fetch);
    const delCliente = k.operations.map((o) => `${o.method} ${o.path} ${o.kon}/${o.id}`);
    expect(delCliente.sort()).toEqual(delSpec.sort());
    for (const [kon, ops] of Object.entries(KONS)) {
      for (const nombre of Object.keys(ops)) {
        const f = (k as unknown as Record<string, Record<string, { info: unknown }>>)[kon]![
          nombre
        ]!;
        expect(typeof f).toBe("function");
        expect(f.info).toBe((ops as Record<string, unknown>)[nombre]);
      }
    }
  });

  it("exports the error catalog of the document and its version", () => {
    expect([...ERROR_CODES]).toEqual(SPEC.components.schemas.Problem.properties.code.enum);
    expect(API_VERSION).toBe(SPEC.info.version);
  });
});

describe("configuration and auth", () => {
  it("reads KITSUDEN_API_URL and KITSUDEN_API_TOKEN, and normalizes a trailing /api", async () => {
    const prev = { url: process.env.KITSUDEN_API_URL, token: process.env.KITSUDEN_API_TOKEN };
    process.env.KITSUDEN_API_URL = "http://from-env.test/api/";
    process.env.KITSUDEN_API_TOKEN = "kitsuden_agent_env";
    try {
      const s = servidor([json({ docs: [], totalDocs: 0 })]);
      const k = createKitsuden({ fetch: s.fetch });
      expect(k.baseUrl).toBe("http://from-env.test");
      await k.datasets.listarDatasets();
      expect(s.llamadas[0]!.url.href).toBe("http://from-env.test/api/datasets");
      expect(s.llamadas[0]!.headers.authorization).toBe("Bearer kitsuden_agent_env");
      const sin = createKitsuden({ fetch: s.fetch, token: null });
      await sin.datasets.listarDatasets();
      expect(s.llamadas[1]!.headers.authorization).toBeUndefined();
    } finally {
      process.env.KITSUDEN_API_URL = prev.url;
      process.env.KITSUDEN_API_TOKEN = prev.token;
      if (prev.url === undefined) delete process.env.KITSUDEN_API_URL;
      if (prev.token === undefined) delete process.env.KITSUDEN_API_TOKEN;
    }
  });

  it("refuses to guess a URL (no localhost default)", () => {
    const prev = process.env.KITSUDEN_API_URL;
    delete process.env.KITSUDEN_API_URL;
    try {
      expect(() => new KitsudenApi({ fetch: servidor().fetch })).toThrow(/KITSUDEN_API_URL/);
    } finally {
      if (prev !== undefined) process.env.KITSUDEN_API_URL = prev;
    }
  });

  it("sends a session cookie instead of a token", async () => {
    const s = servidor([json({ docs: [], totalDocs: 0 })]);
    const k = cliente(s.fetch, { token: null, sessionCookie: "better-auth.session_token=abc" });
    await k.datasets.listarDatasets();
    expect(s.llamadas[0]!.headers.cookie).toBe("better-auth.session_token=abc");
    expect(s.llamadas[0]!.headers.authorization).toBeUndefined();
  });
});

describe("requests", () => {
  it("encodes path parameters, flattens query parameters and sends the body as JSON", async () => {
    const s = servidor([json({ id: "e1" }, 201)]);
    const k = cliente(s.fetch);
    const r = await k.datasets.crearEntrada({ id: "a b/c", body: { title: "T", data: { n: 1 } } });
    expect(r.kind).toBe("ok");
    const l = s.llamadas[0]!;
    expect(l.method).toBe("POST");
    expect(l.url.pathname).toBe("/api/datasets/a%20b%2Fc/entries");
    expect(l.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(l.body!)).toEqual({ title: "T", data: { n: 1 } });

    await k.datasets.listarEntradas({ id: "d1", limit: 5, includeCalculated: "true" });
    expect(s.llamadas[1]!.url.search).toBe("?limit=5&includeCalculated=true");
  });

  it("throws before sending when a path parameter is missing", async () => {
    const s = servidor();
    const k = cliente(s.fetch);
    await expect(k.datasets.obtenerDataset({ id: "" })).rejects.toThrow(
      /missing path parameter 'id'/
    );
    expect(s.llamadas).toHaveLength(0);
  });

  it("puts an Idempotency-Key on every write (never on reads); yours or none on request", async () => {
    const s = servidor([json({ id: "x" }, 201)]);
    const k = cliente(s.fetch);
    await k.datasets.crearDataset({ body: { name: "n" } });
    await k.datasets.listarDatasets();
    await k.datasets.crearDataset({ body: { name: "n" } }, { idempotencyKey: "mine-123456" });
    await k.datasets.crearDataset({ body: { name: "n" } }, { idempotencyKey: false });
    expect(s.llamadas.map((l) => l.headers["idempotency-key"] ?? null)).toEqual([
      "ksdk-fixed-key-0001",
      null,
      "mine-123456",
      null,
    ]);
  });

  it("generates keys that the server accepts (pattern and length)", async () => {
    const s = servidor([json({}, 201)]);
    const k = new KitsudenApi({ baseUrl: BASE, fetch: s.fetch, token: null });
    await k.datasets.crearDataset({ body: { name: "n" } });
    await k.datasets.crearDataset({ body: { name: "n" } });
    const [a, b] = s.llamadas.map((l) => l.headers["idempotency-key"]!);
    expect(a).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    expect(a).not.toBe(b);
  });
});

describe("retries", () => {
  it("retries a read on 503, waiting what Retry-After says", async () => {
    const s = servidor([
      problema("KITSUDEN_E_UNAVAILABLE", 503, { retryable: true }, { "retry-after": "2" }),
      json({ docs: [], totalDocs: 0 }),
    ]);
    const k = cliente(s.fetch);
    const r = await k.datasets.listarDatasets();
    expect(r.kind).toBe("ok");
    expect(s.llamadas).toHaveLength(2);
    expect(esperas).toEqual([2000]);
    expect(r.meta.attempts).toBe(2);
  });

  it("retries a write with the SAME Idempotency-Key", async () => {
    const s = servidor([
      new TypeError("fetch failed"),
      problema(
        "KITSUDEN_E_IDEMPOTENCY_IN_PROGRESS",
        409,
        { retryable: true },
        { "retry-after": "1" }
      ),
      json({ id: "x" }, 201),
    ]);
    const k = cliente(s.fetch, { idempotencyKey: () => `ksdk-${Math.random()}`.replace(".", "") });
    const r = await k.datasets.crearDataset({ body: { name: "n" } });
    expect(r.kind).toBe("ok");
    const claves = new Set(s.llamadas.map((l) => l.headers["idempotency-key"]));
    expect(s.llamadas).toHaveLength(3);
    expect(claves.size).toBe(1);
    expect(r.meta.idempotencyKey).toBe([...claves][0]);
  });

  it("does not retry a write that has no Idempotency-Key and is not idempotent", async () => {
    const s = servidor([new TypeError("fetch failed")]);
    const k = cliente(s.fetch);
    await expect(
      k.datasets.crearDataset({ body: { name: "n" } }, { idempotencyKey: false })
    ).rejects.toBeInstanceOf(KitsudenNetworkError);
    expect(s.llamadas).toHaveLength(1);
  });

  it("never retries what the server says is not retryable", async () => {
    const s = servidor([problema("KITSUDEN_E_VALIDATION", 422)]);
    const k = cliente(s.fetch);
    const e = await k.datasets.listarDatasets().catch((x) => x);
    expect(e).toBeInstanceOf(KitsudenApiError);
    expect(e.code).toBe("KITSUDEN_E_VALIDATION");
    expect(isKitsudenError(e, "KITSUDEN_E_VALIDATION")).toBe(true);
    expect(isKitsudenError(e, "KITSUDEN_E_NOT_FOUND")).toBe(false);
    expect(s.llamadas).toHaveLength(1);
  });

  it("does not wait an hour: a Retry-After above the cap is thrown with its value", async () => {
    const s = servidor([
      problema(
        "KITSUDEN_E_QUOTA_EXCEEDED",
        429,
        { retryable: true, retry_after: 3600 },
        { "retry-after": "3600" }
      ),
    ]);
    const k = cliente(s.fetch);
    const e = await k.datasets.listarDatasets().catch((x) => x);
    expect(e.code).toBe("KITSUDEN_E_QUOTA_EXCEEDED");
    expect(e.retryAfter).toBe(3600);
    expect(esperas).toEqual([]);
  });

  it("stops after maxRetries and with retry:false", async () => {
    const s = servidor([problema("KITSUDEN_E_UNAVAILABLE", 503, { retryable: true })]);
    const k = cliente(s.fetch, { retry: { maxRetries: 3 } });
    await expect(k.datasets.listarDatasets()).rejects.toBeInstanceOf(KitsudenApiError);
    expect(s.llamadas).toHaveLength(4);
    expect(esperas).toEqual([125, 250, 500]); // full jitter with random() = 0.5
    await expect(k.datasets.listarDatasets(undefined, { retry: false })).rejects.toBeInstanceOf(
      KitsudenApiError
    );
    expect(s.llamadas).toHaveLength(5);
  });

  it("reads Retry-After as seconds or as an HTTP date", () => {
    expect(parseRetryAfter("7")).toBe(7);
    expect(
      parseRetryAfter(
        new Date(Date.UTC(2030, 0, 1, 0, 0, 30)).toUTCString(),
        Date.UTC(2030, 0, 1, 0, 0, 0)
      )
    ).toBe(30);
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("human approval (202 KITSUDEN_E_APPROVAL_REQUIRED)", () => {
  const propuesta = {
    id: "p-1",
    status: "pending",
    statusUrl: "/api/proposals/p-1",
    method: "POST",
    path: "/api/datasets",
  };

  it("returns a typed pending proposal and never resends", async () => {
    const s = servidor([problema("KITSUDEN_E_APPROVAL_REQUIRED", 202, { proposal: propuesta })]);
    const k = cliente(s.fetch);
    const r = await k.datasets.crearDataset({ body: { name: "n" } });
    expect(r.kind).toBe("proposal_pending");
    expect(isProposalPending(r)).toBe(true);
    if (r.kind === "proposal_pending") {
      expect(r.proposal.id).toBe("p-1");
      expect(r.proposal.statusUrl).toBe("/api/proposals/p-1");
      expect(r.problem.code).toBe("KITSUDEN_E_APPROVAL_REQUIRED");
    }
    expect(s.llamadas).toHaveLength(1);
    expect(() => expectOk(r)).toThrow(ProposalPendingError);
  });

  it("recognizes the approval by its code whatever the media type (json, toon)", async () => {
    const cuerpo = {
      type: "x",
      title: "Pending human approval",
      status: 202,
      detail: "held",
      code: "KITSUDEN_E_APPROVAL_REQUIRED",
      retryable: false,
      retry_after: null,
      hint: "",
      docs: "",
      proposal: propuesta,
    };
    const s = servidor([
      json(cuerpo, 202),
      new Response(encodeToon(cuerpo), {
        status: 202,
        headers: { "content-type": "application/vnd.toon", "x-kitsuden-format": "toon" },
      }),
    ]);
    const k = cliente(s.fetch);
    const a = await k.datasets.crearDataset({ body: { name: "n" } });
    const b = await k.datasets.crearDataset({ body: { name: "n" } }, { format: "toon" });
    expect([a.kind, b.kind]).toEqual(["proposal_pending", "proposal_pending"]);
    expect(b.kind === "proposal_pending" && b.proposal.id).toBe("p-1");
  });

  it("a 202 that is a normal JSON success stays a success", async () => {
    const s = servidor([json({ ok: true, status: "sending" }, 202)]);
    const k = cliente(s.fetch);
    const r = await k.newsletter.enviarCampana({ id: "c1" });
    expect(r.kind).toBe("ok");
    expect(expectOk(r)).toEqual({ ok: true, status: "sending" });
  });
});

describe("errors", () => {
  it("parses problem+json into a typed error with code, hint and request id", async () => {
    const s = servidor([problema("KITSUDEN_E_NOT_FOUND", 404, {}, { "x-request-id": "req-9" })]);
    const k = cliente(s.fetch);
    const e = (await k.datasets.obtenerDataset({ id: "nope" }).catch((x) => x)) as KitsudenApiError;
    expect(e.status).toBe(404);
    expect(e.problem.hint).toBe("h");
    expect(e.requestId).toBe("req-9");
    expect(e.message).toContain("KITSUDEN_E_NOT_FOUND");
  });

  it("turns a non-Kitsuden error page into the same shape (retried if 502/503/504)", async () => {
    const html = () =>
      new Response("<html>bad gateway</html>", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "content-type": "text/html" },
      });
    const s = servidor([html, html, html]);
    const k = cliente(s.fetch);
    const e = (await k.datasets.listarDatasets().catch((x) => x)) as KitsudenApiError;
    expect(e.code).toBe("KITSUDEN_E_INTERNAL");
    expect(e.problem.detail).toContain("bad gateway");
    expect(s.llamadas).toHaveLength(3);
  });

  it("a network failure of a read is retried, then reported", async () => {
    const s = servidor([new TypeError("ECONNREFUSED")]);
    const k = cliente(s.fetch);
    const e = (await k.datasets.listarDatasets().catch((x) => x)) as KitsudenNetworkError;
    expect(e).toBeInstanceOf(KitsudenNetworkError);
    expect(e.attempts).toBe(3);
  });
});

describe("formats", () => {
  const datos = {
    docs: [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ],
    totalDocs: 2,
  };

  it("asks with Accept and decodes TOON", async () => {
    const s = servidor([
      new Response(encodeToon(datos), {
        headers: { "content-type": "application/vnd.toon", "x-kitsuden-format": "toon" },
      }),
    ]);
    const k = cliente(s.fetch, { format: "toon" });
    const r = await k.datasets.listarDatasets();
    expect(s.llamadas[0]!.headers.accept).toBe("application/vnd.toon");
    expect(expectOk(r)).toEqual(datos);
    expect(r.meta.format).toBe("toon");
  });

  it("decodes TRON and auto (whatever the server picked)", async () => {
    const caso = JSON.parse(
      readFileSync(join(__dirname, "fixtures/tron-cases.json"), "utf8")
    ).cases.find(
      (c: { json: unknown }) => typeof c.json === "object" && c.json && "docs" in (c.json as object)
    );
    const s = servidor([
      new Response(caso.tron, {
        headers: { "content-type": "application/vnd.tron", "x-kitsuden-format": "tron" },
      }),
      json(datos, 200, { "x-kitsuden-format": "json" }),
    ]);
    const k = cliente(s.fetch, { format: "auto" });
    const r = await k.datasets.listarDatasets();
    expect(s.llamadas[0]!.headers.accept).toBe("application/vnd.kitsuden.auto");
    expect(expectOk(r)).toEqual(caso.json);
    const r2 = await k.datasets.listarDatasets(undefined, { format: "tron" });
    expect(s.llamadas[1]!.headers.accept).toBe("application/vnd.tron");
    expect(expectOk(r2)).toEqual(datos);
  });

  it("returns text and binary bodies as such, and 204 as null", async () => {
    const s = servidor([
      new Response("# md", { headers: { "content-type": "text/markdown" } }),
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/pdf" } }),
      new Response(null, { status: 204 }),
    ]);
    const k = cliente(s.fetch);
    expect(expectOk(await k.request("GET", "/x.md"))).toBe("# md");
    const bin = expectOk(await k.request("GET", "/x.pdf"));
    expect(new Uint8Array(bin as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(expectOk(await k.request("DELETE", "/x"))).toBeNull();
  });
});

describe("provenance", () => {
  it("asks for it and exposes the summary and each row's author", async () => {
    const s = servidor([
      json(
        {
          docs: [{ id: "1", _provenance: { id: "1", author: "user", untrusted: true } }],
          totalDocs: 1,
        },
        200,
        {
          "x-kitsuden-provenance": "untrusted=1; user=1",
        }
      ),
    ]);
    const k = cliente(s.fetch);
    const r = await k.datasets.listarDatasets(undefined, { provenance: true });
    expect(s.llamadas[0]!.headers["x-kitsuden-provenance"]).toBe("1");
    expect(r.meta.provenance).toEqual({
      untrusted: 1,
      authors: { user: 1 },
      raw: "untrusted=1; user=1",
    });
    expect(provenanceOf(expectOk(r).docs[0])).toEqual({ id: "1", author: "user", untrusted: true });
  });
});

describe("pagination", () => {
  it("walks page by page until totalPages", async () => {
    const pagina = (n: number) =>
      json({
        docs: [{ id: `p${n}a` }, { id: `p${n}b` }],
        totalDocs: 5,
        totalPages: 3,
        page: n,
        limit: 2,
      });
    const s = servidor([
      pagina(1),
      pagina(2),
      json({ docs: [{ id: "p3a" }], totalPages: 3, page: 3, limit: 2 }),
    ]);
    const k = cliente(s.fetch);
    const ids: string[] = [];
    for await (const post of k.blog.listarEntradas.iterate({ limit: 2 })) ids.push(post.id);
    expect(ids).toEqual(["p1a", "p1b", "p2a", "p2b", "p3a"]);
    expect(s.llamadas.map((l) => l.url.searchParams.get("page"))).toEqual(["1", "2", "3"]);
  });

  it("walks by offset until the total, and stops on a short page", async () => {
    const s = servidor([
      json({ status: "ok", data: [{ id: "1" }, { id: "2" }], total: 3 }),
      json({ status: "ok", data: [{ id: "3" }], total: 3 }),
    ]);
    const k = cliente(s.fetch);
    const op = k.operations.find(
      (o) => o.pagination?.style === "offset" && o.pathParams.length === 0
    )!;
    const grupo = (
      k as unknown as Record<
        string,
        Record<string, { iterate: (p: object) => AsyncIterable<{ id: string }> }>
      >
    )[
      Object.keys(KONS).find((kon) =>
        Object.values((KONS as Record<string, object>)[kon]!).includes(op)
      )!
    ]!;
    const nombre = Object.entries(grupo).find(
      ([, f]) => (f as unknown as { info: unknown }).info === op
    )![0];
    const vistos: string[] = [];
    for await (const x of grupo[nombre]!.iterate({ limit: 2 })) vistos.push(x.id);
    expect(vistos).toEqual(["1", "2", "3"]);
    expect(s.llamadas.map((l) => l.url.searchParams.get("offset"))).toEqual(["0", "2"]);
  });

  it("throws ProposalPendingError if a page is held for approval", async () => {
    const s = servidor([
      problema("KITSUDEN_E_APPROVAL_REQUIRED", 202, {
        proposal: { id: "p", status: "pending", statusUrl: "/api/proposals/p" },
      }),
    ]);
    const k = cliente(s.fetch);
    const it = k.blog.listarEntradas.pages();
    await expect(it.next()).rejects.toBeInstanceOf(ProposalPendingError);
  });
});

describe("TRON decoder parity with @tron-format/tron (shared fixtures)", () => {
  const { cases } = JSON.parse(readFileSync(join(__dirname, "fixtures/tron-cases.json"), "utf8"));
  it.each(cases.map((c: { tron: string; json: unknown }, i: number) => [i, c]))(
    "case %i",
    (_i, c) => {
      const { tron, json: esperado } = c as { tron: string; json: unknown };
      expect(decodeTron(tron)).toEqual(esperado);
    }
  );

  it("rejects malformed TRON instead of returning half the data", () => {
    expect(() => decodeTron("class A: x\n\nA(1")).toThrow(/TRON/);
    expect(() => decodeTron("B(1)")).toThrow(/undefined class/);
    expect(() => decodeTron('{"a": 1} 2')).toThrow(/after the data/);
  });
});

describe("over real HTTP (node:http)", () => {
  let srv: Server;
  let base = "";
  const vistas: { method: string; url: string; headers: Record<string, unknown> }[] = [];
  beforeAll(async () => {
    srv = createServer((req, res) => {
      vistas.push({ method: req.method!, url: req.url!, headers: req.headers });
      if (req.url?.startsWith("/api/datasets")) {
        res.writeHead(200, { "content-type": "application/json", "x-request-id": "real-1" });
        res.end(JSON.stringify({ docs: [], totalDocs: 0 }));
      } else {
        res.writeHead(404, { "content-type": "application/problem+json" });
        res.end(
          JSON.stringify({
            type: "x",
            title: "Not found",
            status: 404,
            detail: "no",
            code: "KITSUDEN_E_NOT_FOUND",
            retryable: false,
            retry_after: null,
            hint: "",
            docs: "",
          })
        );
      }
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const a = srv.address();
    base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  });
  afterAll(() => new Promise<void>((r) => srv.close(() => r())));

  it("works with the runtime's own fetch", async () => {
    const k = new KitsudenApi({ baseUrl: `${base}/api`, token: "kitsuden_agent_real" });
    const r = await k.datasets.listarDatasets({ limit: 3 });
    expect(r.meta.requestId).toBe("real-1");
    expect(vistas[0]).toMatchObject({ method: "GET", url: "/api/datasets?limit=3" });
    expect(vistas[0]!.headers.authorization).toBe("Bearer kitsuden_agent_real");
    await expect(k.request("GET", "/nope")).rejects.toMatchObject({
      code: "KITSUDEN_E_NOT_FOUND",
      status: 404,
    });
  });
});
