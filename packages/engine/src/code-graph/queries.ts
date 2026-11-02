/**
 * Kitsuden — Code Graph: Queries (estilo Serena/Sourcegraph, sin IA)
 * ============================================================================
 *
 * Operaciones de navegación semántica sobre un CodeGraph ya indexado:
 *
 *   - findSymbol / references  → como find_symbol y find_references de Serena
 *   - outline                  → esqueleto de un archivo a nivel símbolo
 *   - pathBetween              → `graphify path A B` (BFS determinista)
 *   - communities              → subsistemas por paquete/kon (clusters)
 *   - searchCode               → búsqueda regex estructurada (Sourcegraph-style)
 *
 * Todo puro y determinista: mismas entradas → mismas salidas.
 */

import type { CodeGraph, CodeSymbol, SourceFileInput } from "./indexer";

// ── Símbolos ─────────────────────────────────────────────────────────────────

export interface SymbolMatch extends CodeSymbol {
  /** true si el nombre coincidió exacto; false si fue por prefijo. */
  exact: boolean;
}

/** Busca símbolos por nombre: exactos primero, luego por prefijo (case-insensitive). */
export function findSymbol(graph: CodeGraph, name: string, limit = 20): SymbolMatch[] {
  const lower = name.toLowerCase();
  const exact: SymbolMatch[] = [];
  const prefix: SymbolMatch[] = [];
  for (const s of graph.symbols) {
    if (s.name === name) exact.push({ ...s, exact: true });
    else if (s.name.toLowerCase().startsWith(lower)) prefix.push({ ...s, exact: false });
  }
  const rank = (a: CodeSymbol, b: CodeSymbol) => a.file.localeCompare(b.file) || a.line - b.line;
  return [...exact.sort(rank), ...prefix.sort(rank)].slice(0, limit);
}

export interface SymbolReferences {
  symbol: CodeSymbol;
  /** Símbolos que llaman a este símbolo (aristas `calls` entrantes). */
  calledBy: { id: string; confidence: string }[];
  /** Archivos que importan el archivo donde se declara. */
  importedBy: string[];
}

/** Referencias de un símbolo: quién lo llama y quién importa su archivo. */
export function references(graph: CodeGraph, name: string): SymbolReferences[] {
  const matches = graph.symbols.filter((s) => s.name === name);
  return matches.map((symbol) => ({
    symbol,
    calledBy: graph.edges
      .filter((e) => e.relation === "calls" && e.to === symbol.id)
      .map((e) => ({ id: e.from, confidence: e.confidence }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    importedBy: graph.edges
      .filter((e) => e.relation === "imports" && e.to === symbol.file)
      .map((e) => e.from)
      .sort(),
  }));
}

// ── Outline ──────────────────────────────────────────────────────────────────

export interface FileOutline {
  file: string;
  imports: string[];
  symbols: { name: string; kind: string; line: number; exported: boolean }[];
}

/** Esqueleto de un archivo: imports + símbolos con línea (estilo Serena). */
export function outline(graph: CodeGraph, filePath: string): FileOutline | null {
  const normalized = filePath.replace(/\\/g, "/");
  const file = graph.files.find((f) => f.path === normalized || f.path.endsWith(normalized));
  if (!file) return null;
  return {
    file: file.path,
    imports: file.imports,
    symbols: graph.symbols
      .filter((s) => s.file === file.path)
      .sort((a, b) => a.line - b.line)
      .map(({ name, kind, line, exported }) => ({ name, kind, line, exported })),
  };
}

// ── Caminos y clusters ───────────────────────────────────────────────────────

/**
 * Camino más corto entre dos nodos del grafo (BFS sobre vista no dirigida).
 * Acepta IDs de archivo o de símbolo; también resuelve nombres de símbolo.
 */
export function pathBetween(graph: CodeGraph, from: string, to: string): string[] | null {
  const resolve = (ref: string): string | null => {
    const normalized = ref.replace(/\\/g, "/");
    if (graph.files.some((f) => f.path === normalized)) return normalized;
    if (graph.symbols.some((s) => s.id === normalized)) return normalized;
    const byName = graph.symbols.filter((s) => s.name === ref);
    if (byName.length >= 1) return byName[0].id;
    const fileSuffix = graph.files.find((f) => f.path.endsWith(normalized));
    return fileSuffix?.path ?? null;
  };

  const start = resolve(from);
  const goal = resolve(to);
  if (!start || !goal) return null;
  if (start === goal) return [start];

  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
  };
  for (const e of graph.edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  for (const list of adjacency.values()) list.sort();

  const prev = new Map<string, string>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const node = queue.shift()!;
    if (node === goal) {
      const path = [goal];
      let cur = goal;
      while (cur !== start) {
        cur = prev.get(cur)!;
        path.unshift(cur);
      }
      return path;
    }
    for (const next of adjacency.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, node);
      queue.push(next);
    }
  }
  return null;
}

export interface Community {
  /** p.ej. "apps/api", "packages/engine", "packages/kons/kon-games". */
  group: string;
  files: number;
  symbols: number;
}

/** Agrupa archivos por subsistema (paquete/kon) — clusters deterministas. */
export function communities(graph: CodeGraph): Community[] {
  const groupOf = (path: string): string => {
    const parts = path.split("/");
    if (parts[0] === "packages" && parts[1] === "kons" && parts.length > 2)
      return parts.slice(0, 3).join("/");
    return parts.slice(0, 2).join("/");
  };
  const acc = new Map<string, { files: number; symbols: number }>();
  for (const f of graph.files) {
    const g = groupOf(f.path);
    const entry = acc.get(g) ?? { files: 0, symbols: 0 };
    entry.files += 1;
    entry.symbols += f.symbols.length;
    acc.set(g, entry);
  }
  return Array.from(acc.entries())
    .map(([group, v]) => ({ group, ...v }))
    .sort((a, b) => b.files - a.files || a.group.localeCompare(b.group));
}

// ── Búsqueda de código (Sourcegraph-style) ───────────────────────────────────

export interface CodeSearchHit {
  file: string;
  line: number;
  text: string;
}

export interface CodeSearchOptions {
  /** Tratar `pattern` como regex (default true). Si es inválida → literal. */
  regex?: boolean;
  maxResults?: number;
  caseSensitive?: boolean;
}

/** Búsqueda línea a línea sobre los archivos dados. Determinista. */
export function searchCode(
  files: SourceFileInput[],
  pattern: string,
  options: CodeSearchOptions = {}
): CodeSearchHit[] {
  const max = options.maxResults ?? 100;
  const flags = options.caseSensitive ? "" : "i";
  let re: RegExp;
  try {
    re = new RegExp(options.regex === false ? escapeRegExp(pattern) : pattern, flags);
  } catch {
    re = new RegExp(escapeRegExp(pattern), flags);
  }

  const hits: CodeSearchHit[] = [];
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push({ file: file.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
        if (hits.length >= max) return hits;
      }
    }
  }
  return hits;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
