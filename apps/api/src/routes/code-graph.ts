/**
 * Code Graph — Rutas (función del sistema, sin IA)
 * ============================================================================
 *
 * Navegación semántica del código para agentes y humanos:
 *
 *   GET /api/code-graph                     → resumen (god nodes, clusters)
 *   GET /api/code-graph?full=true           → grafo completo
 *   GET /api/code-graph/symbol/:name        → find_symbol + referencias
 *   GET /api/code-graph/outline?file=...    → esqueleto de un archivo
 *   GET /api/code-graph/path?from=&to=      → camino entre dos nodos
 *   GET /api/code-graph/search?q=...        → búsqueda regex estructurada
 *   GET /api/code-graph/history?path=&grep= → commits (búsqueda/historia)
 *   GET /api/code-graph/commit/:sha         → detalle de un commit
 *   GET /api/code-graph/visualize           → grafo interactivo (HTML)
 *   GET /api/code-graph/semantic?q=...      → búsqueda por significado
 *   POST /api/code-graph/edit/:op           → refactor (rename/replace/delete)
 *
 * El índice se construye lazy y se cachea en memoria; `?refresh=true` lo
 * reconstruye. Como toda ruta /api/*, respeta la negociación TOON.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  indexRepo,
  findSymbol,
  references,
  outline,
  pathBetween,
  communities,
  commitSearch,
  fileHistory,
  commitShow,
  searchCode,
  renderGraphHtml,
  renameSymbol,
  replaceSymbolBody,
  safeDeleteSymbol,
  insertBeforeSymbol,
  buildSemanticIndex,
  semanticSearch,
  type CodeGraph,
  type SourceFileInput,
  type CodeEmbeddingProvider,
  type SemanticIndex,
} from "@kitsuden/engine";
import { Hono } from "hono";

import { protectRoute, requireAdmin } from "../middleware/auth-guard";

const app = new Hono();

const ROOT = process.cwd();

let cached: { graph: CodeGraph; builtAt: string } | null = null;
let building: Promise<CodeGraph> | null = null;

async function getGraph(refresh = false): Promise<CodeGraph> {
  if (cached && !refresh) return cached.graph;
  if (!building) {
    building = indexRepo(ROOT).then((graph) => {
      cached = { graph, builtAt: new Date().toISOString() };
      building = null;
      return graph;
    });
  }
  return building;
}

/** Carga el contenido de los archivos del grafo (para search). */
function loadFiles(graph: CodeGraph): SourceFileInput[] {
  const out: SourceFileInput[] = [];
  for (const f of graph.files) {
    try {
      out.push({ path: f.path, content: readFileSync(join(ROOT, f.path), "utf8") });
    } catch {
      // omitido
    }
  }
  return out;
}

app.get("/", protectRoute, async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const graph = await getGraph(refresh);
  if (c.req.query("full") === "true") return c.json(graph);
  return c.json({
    builtAt: cached?.builtAt,
    summary: graph.summary,
    communities: communities(graph),
  });
});

app.get("/symbol/:name", protectRoute, async (c) => {
  const graph = await getGraph();
  const name = c.req.param("name");
  const matches = findSymbol(graph, name);
  if (matches.length === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: `Símbolo "${name}" no encontrado` } },
      404
    );
  }
  return c.json({ matches, references: references(graph, name) });
});

app.get("/outline", protectRoute, async (c) => {
  const file = c.req.query("file");
  if (!file) return c.json({ error: { code: "VALIDATION", message: "Falta ?file=" } }, 400);
  const graph = await getGraph();
  const result = outline(graph, file);
  if (!result) {
    return c.json({ error: { code: "NOT_FOUND", message: `Archivo "${file}" no indexado` } }, 404);
  }
  return c.json(result);
});

app.get("/path", protectRoute, async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) {
    return c.json({ error: { code: "VALIDATION", message: "Faltan ?from= y ?to=" } }, 400);
  }
  const graph = await getGraph();
  const path = pathBetween(graph, from, to);
  if (!path) {
    return c.json({ error: { code: "NOT_FOUND", message: "Sin camino entre esos nodos" } }, 404);
  }
  return c.json({ from, to, hops: path.length - 1, path });
});

app.get("/search", protectRoute, async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ error: { code: "VALIDATION", message: "Falta ?q=" } }, 400);
  const graph = await getGraph();
  const hits = searchCode(loadFiles(graph), q, {
    regex: c.req.query("regex") !== "false",
    caseSensitive: c.req.query("case") === "true",
    maxResults: Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200),
  });
  return c.json({ query: q, total: hits.length, hits });
});

app.get("/history", protectRoute, (c) => {
  const path = c.req.query("path");
  const grep = c.req.query("grep");
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
  const commits =
    path && !grep
      ? fileHistory(ROOT, path, limit)
      : commitSearch(ROOT, { grep, path, limit, author: c.req.query("author") });
  return c.json({ total: commits.length, commits });
});

app.get("/commit/:sha", protectRoute, (c) => {
  const detail = commitShow(ROOT, c.req.param("sha"));
  if (!detail) {
    return c.json({ error: { code: "NOT_FOUND", message: "Commit no encontrado" } }, 404);
  }
  return c.json(detail);
});

// ═══════════════════════════════════════════════════════════════════════════
// VISUALIZACIÓN — grafo de fuerza dirigida, HTML autocontenido (sin CDN)
// ═══════════════════════════════════════════════════════════════════════════

app.get("/visualize", protectRoute, async (c) => {
  const graph = await getGraph(c.req.query("refresh") === "true");
  const html = renderGraphHtml(graph, {
    title: c.req.query("title") ?? "Kitsuden Code Graph",
    maxNodes: Math.min(Number.parseInt(c.req.query("nodes") ?? "150", 10) || 150, 400),
    includeSymbols: c.req.query("symbols") === "true",
  });
  return c.html(html);
});

// ═══════════════════════════════════════════════════════════════════════════
// BÚSQUEDA SEMÁNTICA — "por significado", no por regex
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Proveedor de embeddings inyectado desde @kitsuden/core (vector-search).
 * Si no hay OPENAI_API_KEY, `generateEmbeddings` devuelve vectores cero y
 * `semanticSearch` cae automáticamente al ranking léxico determinista.
 */
async function embeddingProvider(): Promise<CodeEmbeddingProvider | undefined> {
  try {
    const mod: any = await import("../../../../packages/core/vector-search/embeddings");
    if (!mod.isEmbeddingAvailable?.()) return undefined;
    return { embed: (texts: string[]) => mod.generateEmbeddings(texts) };
  } catch {
    return undefined; // vector-search no disponible → fallback léxico
  }
}

let semanticIndex: SemanticIndex | null = null;

app.get("/semantic", protectRoute, async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ error: { code: "VALIDATION", message: "Falta ?q=" } }, 400);

  const graph = await getGraph();
  const provider = await embeddingProvider();

  // El índice se construye una vez (embeber ~2k símbolos es caro).
  if (!semanticIndex || c.req.query("refresh") === "true") {
    semanticIndex = await buildSemanticIndex(graph, loadFiles(graph), provider, {
      exportedOnly: c.req.query("all") !== "true",
    });
  }

  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "10", 10) || 10, 50);
  const hits = await semanticSearch(semanticIndex, q, provider, limit);

  return c.json({
    query: q,
    mode: hits[0]?.mode ?? (provider ? "semantic" : "lexical"),
    indexed: semanticIndex.documents.length,
    total: hits.length,
    hits,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDICIÓN SEMÁNTICA — refactor a nivel símbolo
//
// SEGURIDAD: requiere ADMIN (modifica el código fuente del servidor) y es
// dry-run salvo `apply: true` explícito en el body. El engine además verifica
// que el resultado siga siendo sintácticamente válido antes de escribir.
// ═══════════════════════════════════════════════════════════════════════════

app.post("/edit/:op", protectRoute, requireAdmin, async (c) => {
  const op = c.req.param("op");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const { name, newName, code, apply } = body as Record<string, string | boolean>;

  if (typeof name !== "string" || !name) {
    return c.json({ error: { code: "VALIDATION", message: "Falta 'name'" } }, 400);
  }

  const graph = await getGraph();
  const files = loadFiles(graph);
  const opts = { apply: apply === true, root: ROOT };

  let result;
  switch (op) {
    case "rename":
      if (typeof newName !== "string" || !newName) {
        return c.json({ error: { code: "VALIDATION", message: "Falta 'newName'" } }, 400);
      }
      result = await renameSymbol(files, name, newName, opts);
      break;
    case "replace":
      if (typeof code !== "string" || !code) {
        return c.json({ error: { code: "VALIDATION", message: "Falta 'code'" } }, 400);
      }
      result = await replaceSymbolBody(files, name, code, opts);
      break;
    case "delete":
      result = await safeDeleteSymbol(files, name, opts);
      break;
    case "insert-before":
      if (typeof code !== "string" || !code) {
        return c.json({ error: { code: "VALIDATION", message: "Falta 'code'" } }, 400);
      }
      result = await insertBeforeSymbol(files, name, code, opts);
      break;
    default:
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: `Operación "${op}" desconocida. Usa: rename|replace|delete|insert-before`,
          },
        },
        400
      );
  }

  // Una edición aplicada invalida los índices en memoria.
  if (result.applied) {
    cached = null;
    semanticIndex = null;
  }

  return c.json(result, result.ok ? 200 : 409);
});

export const codeGraphRoutes = app;
