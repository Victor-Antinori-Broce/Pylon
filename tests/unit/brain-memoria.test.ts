/**
 * Agent memory (brain) — the pure pieces (2026-10-28)
 *
 * The graphify parser (format + schema_version), the claim verdict (stale
 * when the source changes), the range check, the embedding providers
 * (lexical by default, http opt-in, honest labels) and the declaration of
 * the SDK operations (tool names, scopes, sensible = DELETE only).
 */
import { esSensible, nombreDeHerramienta, scopesQueConceden } from "@kitsuden/shared";
import { describe, expect, it } from "vitest";

import { KON_DE_MEMORIA, operacionesDeMemoria } from "../../apps/api/src/routes/brain-memoria";
import {
  checkClaim,
  createHttpEmbeddingProvider,
  parseGraphify,
  rangeProblem,
  resolveEmbeddingProvider,
} from "../../packages/engine/src/brain";

const grafo = (extra: Record<string, unknown> = {}) => ({
  directed: false,
  multigraph: false,
  graph: {},
  nodes: [
    { id: "a", label: "a.py", file_type: "code", source_file: "a.py", community: 1, community_name: "core" },
    { id: "b", label: "b.py", file_type: "code" },
  ],
  links: [
    { source: "a", target: "b", relation: "imports_from", confidence: "EXTRACTED", confidence_score: 1 },
    { source: "b", target: "a", relation: "similar", confidence: "INFERRED", confidence_score: 0.8 },
    { source: "a", target: "b", relation: "maybe", confidence: "AMBIGUOUS", confidence_score: 0.2 },
    { source: "a", target: "b", confidence: "EXTRACTED" },
    { source: "a", target: "zz", relation: "calls", confidence: "EXTRACTED" },
    { source: "a", target: "b", relation: "legacy_numeric", confidence: 0.65 },
  ],
  hyperedges: [{ id: "h", nodes: ["a", "b"] }],
  ...extra,
});

describe("parseGraphify", () => {
  it("reads the node-link format and keeps EXTRACTED / INFERRED", () => {
    const p = parseGraphify(grafo());
    expect(p.schemaVersion).toBeNull();
    expect(p.warnings.join(" ")).toContain("legacy");
    expect(p.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(p.nodes[0]!.community).toBe("core");
    const porRel = Object.fromEntries(p.edges.map((e) => [e.relation, e]));
    expect(porRel.imports_from).toMatchObject({ origin: "EXTRACTED", confidence: 1, ambiguous: false });
    expect(porRel.similar).toMatchObject({ origin: "INFERRED", confidence: 0.8 });
    expect(porRel.maybe).toMatchObject({ origin: "INFERRED", confidence: 0.2, ambiguous: true });
    // numeric legacy confidence → INFERRED with that score (as graphify ≥ 0.9.48)
    expect(porRel.legacy_numeric).toMatchObject({ origin: "INFERRED", confidence: 0.65 });
    expect(p.edges).toHaveLength(4); // no relation and dangling target skipped
    expect(p.warnings.join(" ")).toMatch(/without 'relation'/);
    expect(p.warnings.join(" ")).toMatch(/unknown nodes/);
    expect(p.hyperedges).toBe(1);
  });

  it("accepts the legacy `edges` key", () => {
    const { links, ...resto } = grafo();
    const p = parseGraphify({ ...resto, edges: links });
    expect(p.edges.length).toBe(4);
  });

  it("checks graph.schema_version", () => {
    expect(parseGraphify(grafo({ graph: { schema_version: 1, graphify_version: "0.9.99" } })).graphifyVersion).toBe(
      "0.9.99"
    );
    expect(parseGraphify(grafo({ graph: { schema_version: "1.2" } })).schemaVersion).toBe("1.2");
    expect(() => parseGraphify(grafo({ graph: { schema_version: 2 } }))).toThrow(/not supported/);
    expect(() => parseGraphify(grafo({ graph: { schema_version: { x: 1 } } }))).toThrow(/string or a number/);
    const forzado = parseGraphify(grafo({ graph: { schema_version: 2 } }), { allowUnknownSchemaVersion: true });
    expect(forzado.warnings.join(" ")).toContain("unknown");
  });

  it("rejects what is not a graph, and caps the size", () => {
    expect(() => parseGraphify([])).toThrow();
    expect(() => parseGraphify({ nodes: [] })).toThrow(/links/);
    expect(() => parseGraphify({ nodes: [{ label: "sin id" }], links: [] })).toThrow(/no id/);
    expect(() => parseGraphify(grafo(), { maxNodes: 1 })).toThrow(/at most 1/);
  });
});

describe("claims: the deterministic verdict", () => {
  const claim = (over: Record<string, unknown> = {}) => ({
    sourceId: "s1",
    sourceSha256: "h1",
    sourceUri: "file:///a.md",
    sourceRange: null,
    ...over,
  });
  it("fresh while the cited source is the newest with that uri", () => {
    expect(checkClaim(claim(), { id: "s1", contentHash: "h1", content: "x" }, { id: "s1", contentHash: "h1" }).status).toBe(
      "fresh"
    );
  });
  it("stale when a newer capture of the uri has another hash", () => {
    const v = checkClaim(claim(), { id: "s1", contentHash: "h1", content: "x" }, { id: "s2", contentHash: "h2" });
    expect(v).toMatchObject({ status: "stale", newerSourceId: "s2" });
    expect(v.reason).toContain("source changed");
  });
  it("stale when the source is gone or its hash does not match", () => {
    expect(checkClaim(claim(), null, null).reason).toBe("source deleted");
    expect(checkClaim(claim(), { id: "s1", contentHash: "OTHER", content: "x" }, null).reason).toContain("does not match");
  });
  it("stale when the range does not fit", () => {
    const v = checkClaim(claim({ sourceRange: { unit: "line", start: 1, end: 9 } }), { id: "s1", contentHash: "h1", content: "a\nb" }, null);
    expect(v.status).toBe("stale");
    expect(v.reason).toContain("out of bounds");
  });
  it("rangeProblem: lines are 1-based inclusive, chars 0-based end-exclusive", () => {
    expect(rangeProblem("a\nb\nc", { unit: "line", start: 1, end: 3 })).toBeNull();
    expect(rangeProblem("a\nb\nc", { unit: "line", start: 0, end: 1 })).not.toBeNull();
    expect(rangeProblem("abc", { unit: "char", start: 0, end: 3 })).toBeNull();
    expect(rangeProblem("abc", { unit: "char", start: 2, end: 1 })).toContain("before");
  });
});

describe("embedding providers", () => {
  it("lexical by default, and it says so", () => {
    const p = resolveEmbeddingProvider({});
    expect(p.info).toEqual({ kind: "lexical-hash-384", mode: "lexical", dimensions: 384 });
  });
  it("http needs url and model, and is labelled semantic", () => {
    expect(() => resolveEmbeddingProvider({ KITSUDEN_BRAIN_EMBEDDINGS: "http" })).toThrow(/URL/);
    expect(() => resolveEmbeddingProvider({ KITSUDEN_BRAIN_EMBEDDINGS: "openai" })).toThrow(/not a known/);
    const p = resolveEmbeddingProvider({
      KITSUDEN_BRAIN_EMBEDDINGS: "http",
      KITSUDEN_BRAIN_EMBEDDINGS_URL: "http://127.0.0.1:11434/v1",
      KITSUDEN_BRAIN_EMBEDDINGS_MODEL: "nomic-embed-text",
    });
    expect(p.info).toMatchObject({ kind: "http:nomic-embed-text", mode: "semantic" });
  });
  it("http provider calls an OpenAI-compatible /embeddings and normalizes", async () => {
    let pedido: { url: string; body: unknown } | null = null;
    const p = createHttpEmbeddingProvider({
      url: "http://local/v1/",
      model: "m",
      fetchImpl: (async (url: string, init: RequestInit) => {
        pedido = { url, body: JSON.parse(String(init.body)) };
        return new Response(JSON.stringify({ data: [{ embedding: [3, 4] }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(await p.embed("hola")).toEqual([0.6, 0.8]);
    expect(pedido).toEqual({ url: "http://local/v1/embeddings", body: { model: "m", input: "hola" } });
    expect(p.info.dimensions).toBe(2);
  });
});

describe("the SDK declaration (REST + OpenAPI + MCP from one place)", () => {
  const nombres = operacionesDeMemoria.map((op) => nombreDeHerramienta(KON_DE_MEMORIA, op));
  it("publishes the brain tools under their contract names", () => {
    expect(nombres).toEqual(
      expect.arrayContaining(["brain_search", "brain_read", "brain_note_write", "brain_list", "brain_connections"])
    );
    expect(new Set(nombres).size).toBe(nombres.length);
  });
  it("reads open with brain:read; writes need brain:write", () => {
    for (const op of operacionesDeMemoria) {
      const concede = scopesQueConceden(KON_DE_MEMORIA, op);
      expect(concede).toContain("brain:write");
      expect(concede).toContain("brain:*");
      if (op.metodo === "GET") expect(concede).toContain("brain:read");
      else expect(concede).not.toContain("brain:read");
    }
  });
  it("only DELETE is sensible (phase F default)", () => {
    const sensibles = operacionesDeMemoria.filter((op) => esSensible(op)).map((op) => op.id);
    expect(sensibles).toEqual(["borrar-nota"]);
  });
});
