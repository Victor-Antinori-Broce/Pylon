/**
 * Second Brain — Deterministic unit tests (no DB, no network)
 * ============================================================================
 *
 * Verifican que el NÚCLEO del segundo cerebro es determinista: misma entrada →
 * misma salida. Esto es lo que permite que una IA local, API o CLI lo ejecute
 * de forma reproducible.
 */

import {
  hashContent,
  summarize,
  keywords,
  headings,
  links,
  extractSignals,
  createInstructionAuthor,
  buildAuthorPrompt,
  generateBrainSchemaDoc,
  type AuthorTask,
} from "@kitsuden/engine";
import { describe, it, expect } from "bun:test";

const SAMPLE = `# TOON format
TOON is a token-oriented notation. It declares array keys once and lists CSV rows.
This reduces token usage for LLM responses significantly. See https://toonformat.dev for details.
The format is deterministic and round-trippable.`;

describe("Second Brain — extraction (determinista)", () => {
  it("hashContent es estable y distingue contenidos", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
    expect(hashContent("abc")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("summarize devuelve las primeras oraciones significativas, de forma estable", () => {
    const a = summarize(SAMPLE);
    const b = summarize(SAMPLE);
    expect(a).toBe(b);
    expect(a).toContain("TOON");
  });

  it("keywords es determinista y excluye stopwords", () => {
    const k1 = keywords(SAMPLE);
    const k2 = keywords(SAMPLE);
    expect(k1).toEqual(k2);
    expect(k1).toContain("toon");
    expect(k1).not.toContain("the");
  });

  it("headings extrae encabezados Markdown", () => {
    expect(headings(SAMPLE)).toContain("TOON format");
  });

  it("links extrae URLs y deduplica", () => {
    expect(links(SAMPLE)).toEqual(["https://toonformat.dev"]);
  });

  it("extractSignals es totalmente determinista", () => {
    const s1 = extractSignals(SAMPLE);
    const s2 = extractSignals(SAMPLE);
    expect(s1).toEqual(s2);
  });
});

describe("Second Brain — InstructionAuthor (determinista, sin IA)", () => {
  const task: AuthorTask = {
    title: "TOON format",
    content: SAMPLE,
    signals: extractSignals(SAMPLE),
    relatedTitles: ["AI Optimization"],
    schemaRules: "- regla de prueba",
  };

  it("produce salida estable byte a byte", async () => {
    const author = createInstructionAuthor();
    const a = await author.author(task);
    const b = await author.author(task);
    expect(a.markdown).toBe(b.markdown);
  });

  it("incluye el bloque AGENT-TASK y marca pendingAgent", async () => {
    const author = createInstructionAuthor();
    const res = await author.author(task);
    expect(res.markdown).toContain("<!-- AGENT-TASK");
    expect(res.markdown).toContain("[[AI Optimization]]");
    expect(res.pendingAgent).toBe(true);
    expect(res.authoredBy).toBe("instruction");
  });

  it("buildAuthorPrompt es determinista y contiene las señales", () => {
    const p1 = buildAuthorPrompt(task);
    const p2 = buildAuthorPrompt(task);
    expect(p1).toBe(p2);
    expect(p1).toContain("TOON format");
    expect(p1).toContain("[[AI Optimization]]");
  });
});

describe("Second Brain — BRAIN.md (Layer 3)", () => {
  it("genera el esquema determinista con las 3 capas y 4 operaciones", () => {
    const doc = generateBrainSchemaDoc({ projectName: "Kitsuden" });
    expect(doc).toBe(generateBrainSchemaDoc({ projectName: "Kitsuden" }));
    expect(doc).toContain("Layer 1");
    expect(doc).toContain("Layer 2");
    expect(doc).toContain("Layer 3");
    expect(doc).toContain("capture");
    expect(doc).toContain("lint");
    expect(doc).toContain("KITSUDEN_BRAIN_AUTHOR");
  });
});
