/**
 * Kitsuden — Code Graph: Indexer determinista de símbolos
 * ============================================================================
 *
 * Convierte código TypeScript en un grafo consultable de símbolos y relaciones
 * (estilo Graphify/Serena/Sourcegraph, pero como función del sistema, SIN IA):
 *
 *   - Símbolos: funciones, clases, interfaces, types, enums, consts top-level
 *     con archivo + línea (navegación a nivel símbolo, no líneas sueltas).
 *   - Relaciones: `imports` (archivo→archivo/paquete), `declares`
 *     (archivo→símbolo) y `calls` (símbolo→símbolo, mejor esfuerzo).
 *   - Confianza por arista: "direct" (leída del AST) o "inferred" (resuelta
 *     por nombre), como los tags EXTRACTED/INFERRED de Graphify.
 *
 * Determinista: misma entrada → misma salida. Parsing sintáctico puro con el
 * compiler API de TypeScript (sin type-checker, sin LSP, sin red).
 *
 * El módulo `typescript` se carga lazy (dynamic import) para no pagar su costo
 * en el arranque del servidor cuando el code-graph no se usa.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, posix } from "node:path";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface SourceFileInput {
  /** Ruta relativa al root del repo, con forward slashes. */
  path: string;
  content: string;
}

export type CodeSymbolKind = "function" | "class" | "interface" | "type" | "enum" | "const";

export interface CodeSymbol {
  /** `${file}#${name}` — único dentro del grafo. */
  id: string;
  name: string;
  kind: CodeSymbolKind;
  file: string;
  line: number;
  exported: boolean;
}

export type CodeEdgeRelation = "imports" | "declares" | "calls";

export interface CodeGraphEdge {
  from: string;
  to: string;
  relation: CodeEdgeRelation;
  /** "direct" = leído del AST; "inferred" = resuelto por nombre. */
  confidence: "direct" | "inferred";
}

export interface CodeGraphFile {
  path: string;
  /** Especificadores de import tal como aparecen (ya resueltos si son relativos). */
  imports: string[];
  /** IDs de símbolos declarados en el archivo. */
  symbols: string[];
}

export interface CodeGraph {
  files: CodeGraphFile[];
  symbols: CodeSymbol[];
  edges: CodeGraphEdge[];
  summary: {
    totalFiles: number;
    totalSymbols: number;
    totalEdges: number;
    /** Nodos más conectados (grado total), estilo "god nodes" de Graphify. */
    godNodes: { id: string; degree: number }[];
  };
}

export interface IndexRepoOptions {
  /** Subdirectorios a indexar, relativos al root. Default: apps y packages. */
  dirs?: string[];
  /** Máximo de archivos (protección; default 5000). */
  maxFiles?: number;
}

// ── Carga lazy de typescript ─────────────────────────────────────────────────

let tsModule: any = null;

async function loadTs(): Promise<any> {
  if (!tsModule) {
    const mod: any = await import("typescript");
    tsModule = mod.default ?? mod;
  }
  return tsModule;
}

// ── Núcleo: indexar una lista de archivos (puro, testeable) ──────────────────

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".bun", "coverage"]);

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Resuelve un import relativo contra el set de archivos conocidos. */
function resolveRelativeImport(fromFile: string, spec: string, known: Set<string>): string | null {
  const base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    base.replace(/\.js$/, ".ts"),
  ]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

export async function indexFiles(files: SourceFileInput[]): Promise<CodeGraph> {
  const ts = await loadTs();

  const sorted = [...files]
    .map((f) => ({ ...f, path: normalizePath(f.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const knownPaths = new Set(sorted.map((f) => f.path));

  const outFiles: CodeGraphFile[] = [];
  const symbols: CodeSymbol[] = [];
  const edges: CodeGraphEdge[] = [];
  /** name → ids de símbolos con ese nombre (para resolver calls). */
  const byName = new Map<string, string[]>();
  /** Llamadas pendientes de resolver: {fromId, calleeName, sameFile}. */
  const pendingCalls: { fromId: string; callee: string; file: string }[] = [];

  for (const file of sorted) {
    const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);

    const fileSymbols: string[] = [];
    const fileImports: string[] = [];

    const lineOf = (node: any): number =>
      sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    const isExported = (node: any): boolean =>
      (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

    const addSymbol = (name: string, kind: CodeSymbolKind, node: any) => {
      const id = `${file.path}#${name}`;
      symbols.push({
        id,
        name,
        kind,
        file: file.path,
        line: lineOf(node),
        exported: isExported(node),
      });
      fileSymbols.push(id);
      edges.push({ from: file.path, to: id, relation: "declares", confidence: "direct" });
      const list = byName.get(name) ?? [];
      list.push(id);
      byName.set(name, list);
      return id;
    };

    /** Recolecta nombres de funciones llamadas dentro de un nodo. */
    const collectCalls = (node: any, ownerId: string) => {
      const visit = (n: any) => {
        if (ts.isCallExpression(n)) {
          const callee = n.expression;
          let name: string | null = null;
          if (ts.isIdentifier(callee)) name = callee.text;
          else if (ts.isPropertyAccessExpression(callee)) name = callee.name.text;
          if (name) pendingCalls.push({ fromId: ownerId, callee: name, file: file.path });
        }
        ts.forEachChild(n, visit);
      };
      ts.forEachChild(node, visit);
    };

    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const spec = stmt.moduleSpecifier.text;
        const resolved = spec.startsWith(".")
          ? resolveRelativeImport(file.path, spec, knownPaths)
          : null;
        const target = resolved ?? spec;
        fileImports.push(target);
        edges.push({
          from: file.path,
          to: resolved ?? `pkg:${spec}`,
          relation: "imports",
          confidence: resolved ? "direct" : "direct",
        });
      } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        const id = addSymbol(stmt.name.text, "function", stmt);
        if (stmt.body) collectCalls(stmt.body, id);
      } else if (ts.isClassDeclaration(stmt) && stmt.name) {
        const id = addSymbol(stmt.name.text, "class", stmt);
        collectCalls(stmt, id);
      } else if (ts.isInterfaceDeclaration(stmt)) {
        addSymbol(stmt.name.text, "interface", stmt);
      } else if (ts.isTypeAliasDeclaration(stmt)) {
        addSymbol(stmt.name.text, "type", stmt);
      } else if (ts.isEnumDeclaration(stmt)) {
        addSymbol(stmt.name.text, "enum", stmt);
      } else if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          const init = decl.initializer;
          const isFn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
          const id = addSymbol(decl.name.text, isFn ? "function" : "const", stmt);
          if (init) collectCalls(init, id);
        }
      }
    }

    outFiles.push({ path: file.path, imports: fileImports.sort(), symbols: fileSymbols });
  }

  // Resolver llamadas por nombre (mejor esfuerzo, determinista):
  //   - match en el mismo archivo → direct
  //   - match cross-file único cuyo archivo está IMPORTADO por el caller →
  //     inferred (sin la relación de import no inventamos aristas; evita que
  //     nombres comunes tipo `.references()` de drizzle creen falsos god nodes)
  const importsOf = new Map<string, Set<string>>();
  for (const f of outFiles) importsOf.set(f.path, new Set(f.imports));

  const seenCallEdge = new Set<string>();
  for (const call of pendingCalls) {
    const candidates = byName.get(call.callee) ?? [];
    if (candidates.length === 0) continue;
    const sameFile = candidates.filter((id) => id.startsWith(`${call.file}#`));
    let target: string | null = null;
    let confidence: "direct" | "inferred" = "inferred";
    if (sameFile.length === 1) {
      target = sameFile[0];
      confidence = "direct";
    } else {
      const callerImports = importsOf.get(call.file);
      const imported = candidates.filter((id) => callerImports?.has(id.slice(0, id.indexOf("#"))));
      if (imported.length === 1) target = imported[0];
    }
    if (!target || target === call.fromId) continue;
    const key = `${call.fromId}→${target}`;
    if (seenCallEdge.has(key)) continue;
    seenCallEdge.add(key);
    edges.push({ from: call.fromId, to: target, relation: "calls", confidence });
  }

  // God nodes: grado total (in + out) sobre todas las aristas.
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const godNodes = Array.from(degree.entries())
    .map(([id, d]) => ({ id, degree: d }))
    .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
    .slice(0, 10);

  return {
    files: outFiles,
    symbols,
    edges,
    summary: {
      totalFiles: outFiles.length,
      totalSymbols: symbols.length,
      totalEdges: edges.length,
      godNodes,
    },
  };
}

// ── Indexar el repo desde disco ──────────────────────────────────────────────

function walkTsFiles(root: string, dir: string, out: string[], max: number): void {
  if (out.length >= max) return;
  const abs = join(root, dir);
  if (!existsSync(abs)) return;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (out.length >= max) return;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walkTsFiles(root, join(dir, entry.name), out, max);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(normalizePath(join(dir, entry.name)));
    }
  }
}

export async function indexRepo(root: string, options: IndexRepoOptions = {}): Promise<CodeGraph> {
  const dirs = options.dirs ?? ["apps", "packages"];
  const maxFiles = options.maxFiles ?? 5000;
  const paths: string[] = [];
  for (const dir of dirs) walkTsFiles(root, dir, paths, maxFiles);

  const files: SourceFileInput[] = [];
  for (const p of paths.sort()) {
    try {
      files.push({ path: p, content: readFileSync(join(root, p), "utf8") });
    } catch {
      // Archivo ilegible → se omite (determinista para el resto).
    }
  }
  return indexFiles(files);
}
