/**
 * KITSUDEN Brain — Deterministic Extraction
 * ============================================================================
 *
 * Núcleo DETERMINISTA que convierte una fuente cruda en señales estructuradas
 * (resumen, keywords, headings, links, backlinks sugeridos). No usa IA: la
 * misma entrada produce siempre la misma salida.
 *
 * Esta capa es la que permite que "una IA local entienda cómo hacerlo": el
 * trabajo de análisis ya viene resuelto y reproducible; el modelo (si se usa)
 * solo redacta la prosa a partir de estas señales.
 */

import { embedTextLocal, cosineSimilarity } from "./embeddings";
import type { BrainNote } from "./types";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "his",
  "has",
  "had",
  "how",
  "man",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "did",
  "get",
  "may",
  "que",
  "los",
  "las",
  "una",
  "con",
  "por",
  "para",
  "del",
  "que",
  "como",
  "más",
  "este",
  "esta",
  "esto",
  "with",
  "from",
  "this",
  "that",
  "have",
  "will",
  "your",
  "they",
  "when",
  "para",
  "sobre",
  "entre",
  "cada",
  "pero",
  "sino",
  "también",
  "porque",
]);

export interface ExtractionResult {
  summary: string;
  keywords: string[];
  headings: string[];
  links: string[];
  /** ids de notas existentes relacionadas (backlinks sugeridos), por similitud. */
  relatedNoteIds: string[];
}

/** Divide texto en oraciones de forma simple y estable. */
function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Tokeniza a términos en minúscula, sin stopwords ni tokens cortos. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ_\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));
}

/** Resumen extractivo determinista: las primeras N oraciones significativas. */
export function summarize(text: string, maxSentences = 3): string {
  const sentences = splitSentences(text).filter((s) => s.length > 20);
  return sentences.slice(0, maxSentences).join(" ");
}

/** Top-K keywords por frecuencia (orden estable: freq desc, luego alfabético). */
export function keywords(text: string, topK = 8): string[] {
  const freq = new Map<string, number>();
  for (const term of tokenize(text)) {
    freq.set(term, (freq.get(term) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topK)
    .map(([term]) => term);
}

/** Extrae headings Markdown (líneas `#`, `##`, ...). */
export function headings(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Extrae URLs presentes en el texto. */
export function links(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)"'<>]+/g) ?? [];
  return Array.from(new Set(matches));
}

/**
 * Sugiere notas existentes relacionadas por similitud de embedding local
 * (determinista: mismo texto + mismas notas → mismos ids).
 */
export function suggestBacklinks(
  text: string,
  existingNotes: BrainNote[],
  opts: { threshold?: number; limit?: number } = {}
): string[] {
  const threshold = opts.threshold ?? 0.25;
  const limit = opts.limit ?? 5;
  const vec = embedTextLocal(text);

  return existingNotes
    .map((n) => ({
      id: n.id,
      score:
        Array.isArray(n.embedding) && n.embedding.length === vec.length
          ? cosineSimilarity(vec, n.embedding)
          : 0,
    }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((x) => x.id);
}

/** Extracción completa y determinista de una fuente. */
export function extractSignals(content: string, existingNotes: BrainNote[] = []): ExtractionResult {
  return {
    summary: summarize(content),
    keywords: keywords(content),
    headings: headings(content),
    links: links(content),
    relatedNoteIds: suggestBacklinks(content, existingNotes),
  };
}
