/**
 * Kitsuden — Code Graph: Búsqueda semántica de símbolos
 * ============================================================================
 *
 * "Busca por significado, no por regex". Complementa `searchCode` (exacta) con
 * búsqueda por similitud de embeddings sobre los símbolos ya indexados.
 *
 * DISEÑO: el engine NO se acopla al proveedor de embeddings ni a la DB — el
 * host inyecta un `EmbeddingProvider` (misma filosofía que `SystemMapDatabase`
 * o `WikiAuthor`). Así el módulo es testeable en memoria y funciona con
 * OpenAI, Ollama o un motor local sin cambiar una línea de aquí.
 *
 * DEGRADACIÓN LIMPIA: sin proveedor, `semanticSearch` cae a un ranking léxico
 * determinista (nombre + contexto), nunca lanza. La búsqueda sigue sirviendo,
 * solo que sin la parte "por significado".
 */

import type { CodeGraph, CodeSymbol, SourceFileInput } from "./indexer";

// ── Contrato del proveedor (inyectado por el host) ───────────────────────────

export interface CodeEmbeddingProvider {
  /** Devuelve un vector por cada texto, en el mismo orden. */
  embed(texts: string[]): Promise<number[][]>;
}

export interface SemanticHit {
  symbol: CodeSymbol;
  /** 0..1 — mayor es más relevante. */
  score: number;
  /** Fragmento del código del símbolo, para mostrar en resultados. */
  snippet: string;
  /** "semantic" (embeddings) o "lexical" (fallback determinista). */
  mode: "semantic" | "lexical";
}

export interface SemanticIndex {
  /** Documento por símbolo: firma + contexto, listo para embeber. */
  documents: { symbol: CodeSymbol; text: string }[];
  /** Vectores alineados con `documents` (vacío si no hubo proveedor). */
  vectors: number[][];
}

export interface BuildIndexOptions {
  /** Máximo de símbolos a indexar (default 2000). */
  maxSymbols?: number;
  /** Solo símbolos exportados (default true: la API pública es lo que importa). */
  exportedOnly?: boolean;
}

// ── Construcción del documento por símbolo ───────────────────────────────────

/**
 * Texto que representa a un símbolo para búsqueda semántica: su firma más las
 * líneas siguientes. Es lo que un humano leería para saber "qué hace esto".
 */
function symbolDocument(symbol: CodeSymbol, source: string, contextLines = 6): string {
  const lines = source.split("\n");
  const start = symbol.line - 1;
  const body = lines.slice(start, start + contextLines).join("\n");
  // El nombre va primero y separado por palabras para que pese en el embedding:
  // "buildSystemMap" → "build System Map".
  const spaced = symbol.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return `${symbol.kind} ${symbol.name} (${spaced}) en ${symbol.file}\n${body}`;
}

/**
 * Construye el índice semántico del grafo. Si no se pasa proveedor, deja
 * `vectors` vacío y la búsqueda usará el ranking léxico.
 */
export async function buildSemanticIndex(
  graph: CodeGraph,
  files: SourceFileInput[],
  provider?: CodeEmbeddingProvider,
  options: BuildIndexOptions = {}
): Promise<SemanticIndex> {
  const maxSymbols = options.maxSymbols ?? 2000;
  const exportedOnly = options.exportedOnly ?? true;

  const sourceByPath = new Map(files.map((f) => [f.path, f.content]));

  const picked = graph.symbols
    .filter((s) => (exportedOnly ? s.exported : true))
    .filter((s) => sourceByPath.has(s.file))
    // Orden determinista antes de truncar.
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .slice(0, maxSymbols);

  const documents = picked.map((symbol) => ({
    symbol,
    text: symbolDocument(symbol, sourceByPath.get(symbol.file)!),
  }));

  if (!provider || documents.length === 0) {
    return { documents, vectors: [] };
  }

  const vectors = await provider.embed(documents.map((d) => d.text));
  return { documents, vectors };
}

// ── Similitud ────────────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Ranking léxico determinista: fallback cuando no hay embeddings.
 * Pondera coincidencia de nombre por encima de coincidencia en el cuerpo.
 */
function lexicalScore(query: string, doc: { symbol: CodeSymbol; text: string }): number {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;

  const name = doc.symbol.name.toLowerCase();
  const text = doc.text.toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (name === term) score += 1;
    else if (name.includes(term)) score += 0.6;
    if (text.includes(term)) score += 0.15;
  }
  return Math.min(score / terms.length, 1);
}

/**
 * Busca símbolos por significado. Con `provider` usa embeddings; sin él, cae al
 * ranking léxico determinista (nunca lanza).
 */
export async function semanticSearch(
  index: SemanticIndex,
  query: string,
  provider?: CodeEmbeddingProvider,
  limit = 10
): Promise<SemanticHit[]> {
  if (index.documents.length === 0) return [];

  const snippetOf = (text: string) => text.split("\n").slice(1, 4).join("\n").trim().slice(0, 300);

  // Camino semántico: requiere proveedor Y vectores ya calculados.
  if (provider && index.vectors.length === index.documents.length) {
    const [queryVector] = await provider.embed([query]);
    if (queryVector && queryVector.some((v) => v !== 0)) {
      return index.documents
        .map((doc, i) => ({
          symbol: doc.symbol,
          score: cosine(queryVector, index.vectors[i]),
          snippet: snippetOf(doc.text),
          mode: "semantic" as const,
        }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score || a.symbol.id.localeCompare(b.symbol.id))
        .slice(0, limit);
    }
  }

  // Fallback léxico (también cubre el vector cero de un proveedor sin API key).
  return index.documents
    .map((doc) => ({
      symbol: doc.symbol,
      score: lexicalScore(query, doc),
      snippet: snippetOf(doc.text),
      mode: "lexical" as const,
    }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.symbol.id.localeCompare(b.symbol.id))
    .slice(0, limit);
}
