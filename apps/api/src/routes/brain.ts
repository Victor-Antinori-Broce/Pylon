/**
 * KITSUDEN Brain — API Routes
 *
 * Exposes the Brain engine over HTTP:
 *   - GET  /api/brain/status
 *   - POST /api/brain/scan
 *   - GET  /api/brain/notes
 *   - POST /api/brain/notes
 *   - GET  /api/brain/notes/:id
 *   - GET  /api/brain/notes/:id/similar
 *   - DELETE /api/brain/notes/:id
 *   - GET  /api/brain/graph
 *   - GET  /api/brain/graph/:id/neighborhood
 *   - POST /api/brain/connections
 *   - GET  /api/brain/llms.txt
 *   - GET  /api/brain/wiki
 *
 * Owner-aware memory for agents (REST + OpenAPI + MCP) lives in
 * routes/brain-memoria.ts under /api/brain/memory.
 */

import { zValidator } from "@hono/zod-validator";
import {
  addBrainNoteWithConnections,
  capture,
  createBrainConnection,
  deleteBrainNote,
  digest,
  generateBrainSchemaDoc,
  getBrainIndex,
  getBrainNeighborhood,
  getBrainNote,
  getKnowledgeGraph,
  getSource,
  lint,
  listBrainConnections,
  listBrainNotes,
  listSources,
  resolveAuthor,
  scanProjectKnowledge,
  searchSimilarBrainNotes,
  syncBrain,
  buildContentTree,
  retrieveFromTree,
  renderTreeIndex,
  type AuthorMode,
  messageOf,
} from "@kitsuden/engine";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db";
import { protectRoute, requireAdmin } from "../middleware/auth-guard";
import { fichero } from "../lib/fichero";

const app = new Hono();

// ═══════════════════════════════════════════════════════════════════════════
// Segundo Cerebro (método Karpathy): sources / capture / sync / lint / digest
// ═══════════════════════════════════════════════════════════════════════════

// Layer 3: el esquema BRAIN.md (público — lo consumen IAs locales/CLI/API).
app.get("/schema", async (c) => {
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(generateBrainSchemaDoc({ projectName: "Kitsuden" }));
});

// Layer 1: ingestar una fuente cruda inmutable.
const captureSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  sourceType: z.enum(["url", "file", "text", "note"]).optional(),
  uri: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

app.get("/sources", protectRoute, async (c) => {
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 100;
  const sources = await listSources(db, limit);
  return c.json({ sources });
});

app.get("/sources/:id", protectRoute, async (c) => {
  const source = await getSource(db, c.req.param("id"));
  if (!source) return c.json({ error: "Source not found" }, 404);
  return c.json({ source });
});

// Ingesta pura (Layer 1) sin derivar página.
app.post("/sources", requireAdmin, zValidator("json", captureSchema), async (c) => {
  const body = c.req.valid("json");
  const { captureSource } = await import("@kitsuden/engine");
  const { source, deduped } = await captureSource(db, body);
  return c.json({ source, deduped }, deduped ? 200 : 201);
});

// Capture completo: Layer 1 → Layer 2 (deriva página + conexiones).
const captureFullSchema = captureSchema.extend({
  author: z.enum(["instruction", "api", "cli"]).optional(),
});

app.post("/capture", requireAdmin, zValidator("json", captureFullSchema), async (c) => {
  const body = c.req.valid("json");
  const author = resolveAuthor(body.author as AuthorMode | undefined);
  const result = await capture(db, body, author);
  return c.json(result, result.deduped ? 200 : 201);
});

// Reconciliar Layer 2 desde Layer 1.
app.post("/sync", requireAdmin, async (c) => {
  const force = c.req.query("force") === "true";
  const author = resolveAuthor((c.req.query("author") as AuthorMode) || undefined);
  const result = await syncBrain(db, { force, author });
  return c.json(result);
});

// Health-check determinista (sin IA).
app.get("/lint", protectRoute, async (c) => {
  const report = await lint(db);
  return c.json(report, report.healthy ? 200 : 200);
});

// Recap de actividad reciente.
app.post("/digest", requireAdmin, async (c) => {
  const days = c.req.query("days") ? Number(c.req.query("days")) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const author = resolveAuthor((c.req.query("author") as AuthorMode) || undefined);
  const result = await digest(db, { since, author });
  return c.json(result);
});

// Public status
app.get("/status", async (c) => {
  const index = await getBrainIndex(db);
  return c.json({
    enabled: true,
    ...index,
  });
});

// Trigger a scan (admin only)
app.post("/scan", requireAdmin, async (c) => {
  const result = await scanProjectKnowledge(db);
  return c.json(result);
});

// List notes
app.get("/notes", protectRoute, async (c) => {
  const query = c.req.query();
  const notes = await listBrainNotes(db, {
    category: query.category as any,
    source: query.source,
    search: query.search,
    tags: query.tags ? query.tags.split(",") : undefined,
    limit: query.limit ? Number(query.limit) : 50,
    offset: query.offset ? Number(query.offset) : 0,
    orderBy: query.orderBy as any,
  });
  return c.json({ notes });
});

// Create note
const createNoteSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  source: z.enum(["code", "user", "agent", "system", "insight"]).optional(),
  sourcePath: z.string().optional(),
  category: z
    .enum([
      "schema",
      "route",
      "kon",
      "agent",
      "function",
      "dataset",
      "insight",
      "connection",
      "general",
    ])
    .optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().int().min(0).max(100).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

app.post("/notes", protectRoute, zValidator("json", createNoteSchema), async (c) => {
  const body = c.req.valid("json");
  const user = c.get("user");
  const result = await addBrainNoteWithConnections(db, {
    ...body,
    source: body.source ?? "user",
    // 0051: con dueño, pero compartida como siempre (conocimiento del proyecto).
    ownerUserId: user?.id ?? null,
    visibility: "shared",
    metadata: {
      ...body.metadata,
      createdBy: user?.id ?? null,
    },
  });
  return c.json(result, 201);
});

// Get note by id
app.get("/notes/:id", protectRoute, async (c) => {
  const id = c.req.param("id");
  const note = await getBrainNote(db, id);
  if (!note) return c.json({ error: "Note not found" }, 404);
  const connections = await listBrainConnections(db, id);
  return c.json({ note, connections });
});

// Find similar notes
app.get("/notes/:id/similar", protectRoute, async (c) => {
  const id = c.req.param("id");
  const note = await getBrainNote(db, id);
  if (!note) return c.json({ error: "Note not found" }, 404);

  const content = `${note.title} ${note.content}`;
  const similar = await searchSimilarBrainNotes(db, content, {
    limit: Number(c.req.query("limit") ?? 10),
    threshold: Number(c.req.query("threshold") ?? 0.15),
  });
  // Exclude the note itself
  const filtered = similar.filter((n) => n.id !== id);
  return c.json({ note, similar: filtered });
});

// Delete note
app.delete("/notes/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteBrainNote(db, id);
  if (!deleted) return c.json({ error: "Note not found" }, 404);
  return c.json({ success: true });
});

// Knowledge graph
app.get("/graph", protectRoute, async (c) => {
  const graph = await getKnowledgeGraph(db);
  return c.json(graph);
});

// Neighborhood graph
app.get("/graph/:id/neighborhood", protectRoute, async (c) => {
  const id = c.req.param("id");
  const depth = Number(c.req.query("depth") ?? 1);
  const graph = await getBrainNeighborhood(db, id, depth);
  return c.json(graph);
});

// Create connection
const createConnectionSchema = z.object({
  sourceNoteId: z.guid(),
  targetNoteId: z.guid(),
  relationType: z.string().optional(),
  strength: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

app.post("/connections", protectRoute, zValidator("json", createConnectionSchema), async (c) => {
  const body = c.req.valid("json");
  // Hecha a mano por el equipo: MANUAL (0051), con la fuerza como confianza.
  const connection = await createBrainConnection(db, {
    ...body,
    origin: "MANUAL",
    confidence: body.strength ?? 1,
  });
  return c.json({ connection }, 201);
});

// llms.txt
app.get("/llms.txt", async (c) => {
  try {
    const file = fichero(`${process.cwd()}/llms.txt`);
    if (!(await file.exists())) {
      return c.json({ error: "llms.txt not generated yet" }, 404);
    }
    const text = await file.text();
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(text);
  } catch (err: unknown) {
    return c.json({ error: messageOf(err) }, 500);
  }
});

// Wiki redirect
app.get("/wiki", protectRoute, async (c) => {
  return c.json({
    path: ".kitsuden/brain",
    index: ".kitsuden/brain/_index.md",
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ÍNDICE DE ÁRBOL — recuperación por razonamiento (2ª capa, junto al vector)
//
// La búsqueda vectorial trocea y devuelve fragmentos "parecidos"; esto
// preserva la estructura del documento y devuelve secciones CON SU CITA
// ("Guía > Fase 3 > Gear"). Construir el árbol es determinista y sin IA.
// ═══════════════════════════════════════════════════════════════════════════

/** POST /api/brain/tree — construye el índice de un documento. */
app.post("/tree", protectRoute, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    content?: string;
    sourceId?: string;
    title?: string;
    depth?: number;
  };

  if (!body.content) {
    return c.json({ error: { code: "VALIDATION", message: "Falta 'content'" } }, 400);
  }

  const tree = buildContentTree(body.content, {
    sourceId: body.sourceId ?? "doc",
    title: body.title,
  });

  return c.json({
    title: tree.title,
    sourceId: tree.sourceId,
    nodeCount: tree.nodeCount,
    // El índice compacto es lo que un agente necesita para elegir rama:
    // cabe en el contexto aunque el documento no.
    index: renderTreeIndex(tree, body.depth ?? 3),
    root: tree.root,
  });
});

/**
 * POST /api/brain/tree/retrieve — navega el árbol y devuelve secciones citadas.
 *
 * Sin selector usa la heurística (determinista, gratis). El razonamiento con
 * LLM lo hace el agente desde fuera: pide el índice, elige, y luego lee.
 */
app.post("/tree/retrieve", protectRoute, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    content?: string;
    query?: string;
    sourceId?: string;
    sections?: string[];
    maxSections?: number;
  };

  if (!body.content || !body.query) {
    return c.json({ error: { code: "VALIDATION", message: "Faltan 'content' y 'query'" } }, 400);
  }

  const tree = buildContentTree(body.content, { sourceId: body.sourceId ?? "doc" });

  // Si el agente ya eligió las secciones (tras leer el índice), se respetan.
  const selector = body.sections?.length ? { select: async () => body.sections! } : undefined;

  const sections = await retrieveFromTree(tree, body.query, {
    selector,
    maxSections: Math.min(body.maxSections ?? 3, 10),
  });

  return c.json({ query: body.query, total: sections.length, sections });
});

export const brainRoutes = app;
