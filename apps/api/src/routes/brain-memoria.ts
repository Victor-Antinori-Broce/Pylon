/**
 * Agent memory (brain) as SDK operations: REST + OpenAPI + MCP from ONE
 * declaration (2026-10-28)
 * ============================================================================
 *
 * Mounted by the core at `/api/brain/memory` (index.ts) inside the request's
 * RLS transaction, and registered among the MOUNTED operations so that:
 *
 *   · every operation is an MCP tool (`brain_search`, `brain_read`,
 *     `brain_note_write`…; names fixed with `mcp.nombre`, they are contract);
 *   · the `/api/brain` gate (admin only) lets through an agent whose scopes
 *     open THAT operation (`operacionAbiertaPorScopeFino`), and the team
 *     (admin, editor) through its own rule in `RUTAS_SOLO_ADMIN`;
 *   · phase F holds the sensible ones (DELETE by default) as proposals.
 *
 * Who sees what is decided by Postgres (rls-owned-tables.sql, «Agent
 * memory»): a note belongs to a user OR an agent, is private by default, and
 * `shared` makes it readable by the team and by agents. Admin sees all.
 *
 * Scopes: `brain:read` (search, read, list, export) and `brain:write`
 * (everything, reads included). Also `brain:*`, the fine ones
 * (`kon:brain:<operation>`) and `admin`, as for any SDK operation.
 *
 * Legacy routes (`routes/brain.ts`: scan, sync, capture, graph, tree…) stay
 * as they were: admin only, global (they run as the system).
 */

import {
  actorFromUser,
  addClaim,
  connectNotes,
  deleteMemoryNote,
  exportOkf,
  getVisibleNote,
  importGraphify,
  lintClaims,
  listClaims,
  listMemoryNotes,
  listNoteConnections,
  parseGraphify,
  resolveEmbeddingProvider,
  resolveExecutor,
  reverifyClaim,
  searchMemoryNotes,
  toMemoryNote,
  writeMemoryNote,
  type BrainActor,
  type PluggableEmbeddingProvider,
} from "@kitsuden/engine";
import { defineOperacion } from "@kitsuden/shared";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import {
  routerDeOperaciones,
  type OperacionCualquiera,
} from "../../../../packages/engine/src/operaciones";
import { db } from "../db";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import { requireAuth, optionalAuth } from "../middleware/auth";

export const KON_DE_MEMORIA = "kon-brain";
export const RUTA_DE_MEMORIA = "/api/brain/memory";
export const SCOPE_BRAIN_READ = "brain:read";
export const SCOPE_BRAIN_WRITE = "brain:write";

const lectura = {
  acceso: "sesion" as const,
  permiso: { scopes: [SCOPE_BRAIN_READ, SCOPE_BRAIN_WRITE], roles: ["admin", "editor"] },
  etiquetas: ["brain"],
};
const escritura = {
  acceso: "sesion" as const,
  permiso: { scopes: [SCOPE_BRAIN_WRITE], roles: ["admin", "editor"] },
  etiquetas: ["brain"],
};

/** The request's RLS transaction (or the global db outside a request). */
function ex(): typeof db {
  return resolveExecutor(db) as typeof db;
}

function actor(usuario: unknown): BrainActor {
  return actorFromUser(usuario);
}

let proveedor: PluggableEmbeddingProvider | null = null;
/** Resolved once (env is read at first use); tests may reset it. */
export function proveedorDeEmbeddings(): PluggableEmbeddingProvider {
  proveedor ??= resolveEmbeddingProvider();
  return proveedor;
}
export function olvidarProveedorDeEmbeddings(): void {
  proveedor = null;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const Visibilidad = z.enum(["private", "shared"]);
const Booleano = z.enum(["true", "false"]);
const Embedding = z.object({
  kind: z.string(),
  mode: z.enum(["lexical", "semantic"]),
  dimensions: z.number(),
});
const Nota = z.object({
  id: z.string(),
  key: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  visibility: Visibilidad,
  owner: z.object({
    userId: z.string().nullable(),
    agentId: z.string().nullable(),
    sponsorUserId: z.string().nullable(),
  }),
  category: z.string(),
  source: z.string(),
  tags: z.array(z.string()),
  importance: z.number(),
  confidence: z.number(),
  metadata: z.record(z.string(), z.unknown()),
  embeddingKind: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const Origen = z.enum(["EXTRACTED", "INFERRED", "MANUAL"]);
const Conexion = z.object({
  id: z.string(),
  sourceNoteId: z.string(),
  targetNoteId: z.string(),
  relationType: z.string(),
  origin: Origen,
  confidence: z.number(),
  strength: z.number(),
  owner: z.object({ userId: z.string().nullable(), agentId: z.string().nullable() }),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
const Rango = z.object({
  unit: z.enum(["line", "char"]),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
});
const Afirmacion = z.object({
  id: z.string(),
  noteId: z.string(),
  statement: z.string(),
  source: z.object({
    id: z.string().nullable(),
    sha256: z.string(),
    uri: z.string().nullable(),
    range: Rango.nullable(),
  }),
  status: z.enum(["fresh", "stale"]),
  staleReason: z.string().nullable(),
  checkedAt: z.string(),
  verifiedAt: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  owner: z.object({ userId: z.string().nullable(), agentId: z.string().nullable() }),
  createdAt: z.string(),
});
const ParamId = z.object({ id: z.guid() });
const Categoria = z.enum([
  "schema",
  "route",
  "kon",
  "agent",
  "function",
  "dataset",
  "insight",
  "connection",
  "general",
]);
const Clave = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[\w.:/@-]+$/, "letters, digits and . _ : / @ -");

// ── Operations ──────────────────────────────────────────────────────────────

export const operacionesDeMemoria: OperacionCualquiera[] = [
  defineOperacion({
    ...lectura,
    id: "buscar",
    metodo: "GET",
    ruta: "/search",
    resumen: "Search memory",
    descripcion:
      "Notes nearest to `q` among those you can see (yours, your agents' if you sign for them, and shared ones). The default embeddings are LEXICAL (a term-frequency hash: shared words, not meaning) and `embedding.mode` says so; only notes embedded with the same provider are compared.",
    entrada: {
      query: z.object({
        q: z.string().min(1).max(2000),
        limit: z.coerce.number().int().min(1).max(50).optional(),
        threshold: z.coerce.number().min(0).max(1).optional(),
        visibility: Visibilidad.optional(),
      }),
    },
    salida: {
      esquema: z.object({
        hits: z.array(z.object({ note: Nota, score: z.number() })),
        embedding: Embedding,
        compared: z.number(),
      }),
    },
    mcp: { nombre: "brain_search" },
    guia: {
      cuandoUsar:
        "To recall what you (or the team, in shared notes) already wrote before writing again. Then read a hit with brain_read.",
      ejemplos: [{ titulo: "Find decisions about auth", argumentos: { q: "auth decision", limit: 5 } }],
      trampas: [
        {
          si: "no hits for a synonym",
          entonces: "the default embeddings are lexical: search with the words the note uses",
        },
      ],
    },
    manejar: async (e, { usuario }) => {
      const q = e.query as { q: string; limit?: number; threshold?: number; visibility?: "private" | "shared" };
      return searchMemoryNotes(ex(), actor(usuario), q.q, proveedorDeEmbeddings(), q);
    },
  }),
  defineOperacion({
    ...lectura,
    id: "listar-notas",
    metodo: "GET",
    ruta: "/notes",
    resumen: "List memory notes",
    descripcion:
      "Notes you can see, most recently updated first. `mine=true` keeps only your own; `keyPrefix` filters by the keys you chose.",
    entrada: {
      query: z.object({
        mine: Booleano.optional(),
        visibility: Visibilidad.optional(),
        tag: z.string().max(100).optional(),
        keyPrefix: z.string().max(300).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      }),
    },
    salida: { esquema: z.object({ notes: z.array(Nota) }) },
    mcp: { nombre: "brain_list" },
    manejar: async (e, { usuario }) => ({
      notes: await listMemoryNotes(ex(), actor(usuario), {
        ...(e.query as Record<string, never>),
        mine: (e.query as { mine?: string }).mine === "true",
      }),
    }),
  }),
  defineOperacion({
    ...escritura,
    id: "escribir-nota",
    metodo: "PUT",
    ruta: "/notes",
    resumen: "Write a memory note (idempotent by key)",
    descripcion:
      "Creates or updates YOUR note with this `key` (keys are per owner: another agent's `key` is another note). Writing the same content again changes nothing (`outcome: unchanged`). Private by default; `visibility: shared` lets the team and other agents read it (never write it).",
    entrada: {
      cuerpo: z.object({
        key: Clave,
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(200_000),
        visibility: Visibilidad.optional(),
        category: Categoria.optional(),
        tags: z.array(z.string().min(1).max(100)).max(50).optional(),
        importance: z.number().int().min(0).max(100).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    salida: {
      esquema: z.object({
        note: Nota,
        outcome: z.enum(["created", "updated", "unchanged"]),
        embedding: Embedding,
      }),
      otrosEstados: [201],
    },
    mcp: { nombre: "brain_note_write" },
    guia: {
      cuandoUsar: "To remember something across sessions. Reuse the same key to update it.",
      ejemplos: [
        {
          titulo: "Remember a decision",
          argumentos: {
            body: { key: "project-x/decisions/db", title: "DB choice", content: "We use Postgres 16 with pgvector." },
          },
        },
      ],
    },
    manejar: async (e, { usuario, c }) => {
      const r = await writeMemoryNote(ex(), actor(usuario), e.cuerpo as never, proveedorDeEmbeddings());
      return c.json(r, r.outcome === "created" ? 201 : 200);
    },
  }),
  defineOperacion({
    ...lectura,
    id: "leer-nota",
    metodo: "GET",
    ruta: "/notes/:id",
    resumen: "Read a memory note",
    descripcion:
      "One note you can see, with its connections (each with `origin` EXTRACTED|INFERRED|MANUAL and `confidence`) and its claims (each with its evidence and fresh|stale status). 404 if it does not exist or is not visible to you.",
    entrada: { params: ParamId },
    salida: {
      esquema: z.object({ note: Nota, connections: z.array(Conexion), claims: z.array(Afirmacion) }),
    },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    mcp: { nombre: "brain_read" },
    manejar: async (e, { usuario }) => {
      const { id } = e.params as { id: string };
      const a = actor(usuario);
      const note = toMemoryNote(await getVisibleNote(ex(), a, id));
      const connections = await listNoteConnections(ex(), a, id);
      const claims = await listClaims(ex(), a, { noteId: id });
      return { note, connections, claims };
    },
  }),
  defineOperacion({
    ...escritura,
    id: "borrar-nota",
    metodo: "DELETE",
    ruta: "/notes/:id",
    resumen: "Delete a memory note",
    descripcion:
      "Deletes YOUR note (and, in cascade, its connections and claims). A shared note of someone else is 403; one you cannot see, 404. Sensible: an agent under human approval gets a proposal (202) instead.",
    entrada: { params: ParamId },
    salida: { estado: 204 },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    mcp: { nombre: "brain_note_delete" },
    manejar: async (e, { usuario, c }) => {
      await deleteMemoryNote(ex(), actor(usuario), (e.params as { id: string }).id);
      return c.body(null, 204);
    },
  }),
  defineOperacion({
    ...lectura,
    id: "conexiones-de-nota",
    metodo: "GET",
    ruta: "/notes/:id/connections",
    resumen: "Connections of a note",
    descripcion:
      "The connections of a note you can see whose other end you can also see, with provenance: `origin` EXTRACTED (explicit in a source), INFERRED (similarity or a model's guess) or MANUAL (asserted through the API), and `confidence` in [0, 1].",
    entrada: { params: ParamId },
    salida: { esquema: z.object({ connections: z.array(Conexion) }) },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    mcp: { nombre: "brain_connections" },
    manejar: async (e, { usuario }) => ({
      connections: await listNoteConnections(ex(), actor(usuario), (e.params as { id: string }).id),
    }),
  }),
  defineOperacion({
    ...escritura,
    id: "conectar",
    metodo: "POST",
    ruta: "/connections",
    resumen: "Connect two notes",
    descripcion:
      "Connects two notes you can see. Idempotent by (source, target, relationType): repeating it returns the existing connection. `origin` defaults to MANUAL with confidence 1.",
    idempotente: true,
    entrada: {
      cuerpo: z.object({
        sourceNoteId: z.guid(),
        targetNoteId: z.guid(),
        relationType: z.string().min(1).max(100).optional(),
        origin: Origen.optional(),
        confidence: z.number().min(0).max(1).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    salida: { esquema: z.object({ connection: Conexion, created: z.boolean() }), estado: 201, otrosEstados: [200] },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    mcp: { nombre: "brain_connect" },
    manejar: async (e, { usuario, c }) => {
      const r = await connectNotes(ex(), actor(usuario), e.cuerpo as never);
      return c.json(r, r.created ? 201 : 200);
    },
  }),
  defineOperacion({
    ...lectura,
    id: "listar-afirmaciones",
    metodo: "GET",
    ruta: "/claims",
    resumen: "List claims with evidence",
    descripcion:
      "Claims (statement + source + the source's SHA-256 + optional range) of the notes you can see. `status=stale` lists the ones whose evidence changed.",
    entrada: {
      query: z.object({
        noteId: z.guid().optional(),
        status: z.enum(["fresh", "stale"]).optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
      }),
    },
    salida: { esquema: z.object({ claims: z.array(Afirmacion) }) },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    mcp: { nombre: "brain_claims" },
    manejar: async (e, { usuario }) => ({ claims: await listClaims(ex(), actor(usuario), e.query as never) }),
  }),
  defineOperacion({
    ...escritura,
    id: "afirmar",
    metodo: "POST",
    ruta: "/claims",
    resumen: "Add a claim with evidence to your note",
    descripcion:
      "Ties a statement of YOUR note to its evidence: an existing source (`sourceId`) or the evidence itself (`source`: title, content, uri), captured as an immutable, content-addressed source. Records the source's SHA-256 and an optional range (`line`: 1-based inclusive; `char`: 0-based, end exclusive). Idempotent by (note, statement, source hash). The response never includes the source's content.",
    idempotente: true,
    entrada: {
      cuerpo: z.object({
        noteId: z.guid(),
        statement: z.string().min(1).max(5000),
        sourceId: z.guid().optional(),
        source: z
          .object({
            title: z.string().min(1).max(500),
            content: z.string().min(1).max(2_000_000),
            uri: z.string().max(2000).optional(),
            sourceType: z.enum(["url", "file", "text", "note"]).optional(),
          })
          .optional(),
        range: Rango.optional(),
      }),
    },
    salida: { esquema: z.object({ claim: Afirmacion, created: z.boolean() }), estado: 201, otrosEstados: [200] },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    mcp: { nombre: "brain_claim_add" },
    guia: {
      cuandoUsar:
        "When a note states a fact taken from a document: cite it, so lint can tell you when the document changed. Give the same `uri` every time you capture a new version of that document.",
      antes: ["noteId: from brain_note_write or brain_search"],
    },
    manejar: async (e, { usuario, c }) => {
      const r = await addClaim(ex(), actor(usuario), e.cuerpo as never);
      return c.json(r, r.created ? 201 : 200);
    },
  }),
  defineOperacion({
    ...escritura,
    id: "reverificar",
    metodo: "POST",
    ruta: "/claims/:id/verify",
    resumen: "Re-verify a claim",
    descripcion:
      "Re-checks your claim against its source: fresh (and recorded as verified by you, now) or stale with the reason. With `rebind: true` and a newer source for the same uri, the claim moves to it — you assert the statement still holds there.",
    idempotente: true,
    entrada: {
      params: ParamId,
      cuerpo: z.object({ rebind: z.boolean().optional() }),
    },
    salida: {
      esquema: z.object({
        claim: Afirmacion,
        check: z.object({
          status: z.enum(["fresh", "stale"]),
          reason: z.string().nullable(),
          newerSourceId: z.string().nullable(),
        }),
        rebound: z.boolean(),
      }),
    },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    mcp: { nombre: "brain_claim_verify" },
    manejar: async (e, { usuario }) =>
      reverifyClaim(ex(), actor(usuario), (e.params as { id: string }).id, e.cuerpo as { rebind?: boolean }),
  }),
  defineOperacion({
    ...escritura,
    id: "revisar",
    metodo: "POST",
    ruta: "/lint",
    resumen: "Lint claims (mark stale evidence)",
    descripcion:
      "Deterministic (no AI): re-checks every claim you can see and stores fresh|stale on the ones you may write. A claim is stale when its source was re-captured with another hash (same uri), was deleted, or its range no longer fits.",
    idempotente: true,
    salida: {
      esquema: z.object({
        checked: z.number(),
        updated: z.number(),
        stale: z.array(
          z.object({ claimId: z.string(), noteId: z.string(), statement: z.string(), reason: z.string() })
        ),
      }),
    },
    mcp: { nombre: "brain_lint" },
    manejar: async (_e, { usuario }) => lintClaims(ex(), { actor: actor(usuario) }),
  }),
  defineOperacion({
    ...lectura,
    id: "exportar-okf",
    metodo: "GET",
    ruta: "/export/okf",
    resumen: "Export to Open Knowledge Format v0.2",
    descripcion:
      "The notes you can see (or `noteIds`, comma-separated) as an OKF v0.2 bundle: `files[]` with paths and Markdown (YAML frontmatter: type, title, tags, status, generated, verified, sources; claims as footnotes), plus a root index.md with okf_version \"0.2\".",
    entrada: {
      query: z.object({
        noteIds: z
          .string()
          .max(20_000)
          .regex(/^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$/, "comma-separated note ids")
          .optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
      }),
    },
    salida: {
      esquema: z.object({
        okfVersion: z.literal("0.2"),
        files: z.array(z.object({ path: z.string(), content: z.string() })),
        notes: z.number(),
        claims: z.number(),
      }),
    },
    mcp: { nombre: "brain_export_okf" },
    coste: 5,
    manejar: async (e, { usuario }) => {
      const q = e.query as { noteIds?: string; limit?: number };
      return exportOkf(ex(), actor(usuario), {
        noteIds: q.noteIds ? q.noteIds.split(",").slice(0, 500) : undefined,
        limit: q.limit,
      });
    },
  }),
  defineOperacion({
    ...escritura,
    id: "importar-graphify",
    metodo: "POST",
    ruta: "/import/graphify",
    resumen: "Import a graphify graph.json",
    descripcion:
      "Loads a graph.json produced by graphify into YOUR memory: each node is a note with key `graphify:<namespace>:<node id>` (re-importing updates the same notes), each link a connection keeping graphify's EXTRACTED/INFERRED as `origin` and `confidence_score` as `confidence` (AMBIGUOUS → INFERRED, flagged). Checks `graph.schema_version`: absent = legacy format (warning), 1 = supported, anything else = 422 unless `allowUnknownSchemaVersion`. At most 5000 nodes and 20000 links per call.",
    idempotente: true,
    coste: 20,
    antes: [bodyLimit({ maxSize: 25 * 1024 * 1024 })],
    entrada: {
      cuerpo: z.object({
        namespace: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, . _ -"),
        visibility: Visibilidad.optional(),
        allowUnknownSchemaVersion: z.boolean().optional(),
        graph: z.record(z.string(), z.unknown()),
      }),
    },
    salida: {
      esquema: z.object({
        namespace: z.string(),
        schemaVersion: z.union([z.string(), z.number()]).nullable(),
        graphifyVersion: z.string().nullable(),
        notes: z.object({ created: z.number(), updated: z.number(), unchanged: z.number() }),
        connections: z.object({
          created: z.number(),
          existing: z.number(),
          extracted: z.number(),
          inferred: z.number(),
        }),
        hyperedgesSkipped: z.number(),
        embedding: Embedding,
        warnings: z.array(z.string()),
      }),
    },
    mcp: { nombre: "brain_import_graphify" },
    manejar: async (e, { usuario }) => {
      const b = e.cuerpo as {
        namespace: string;
        visibility?: "private" | "shared";
        allowUnknownSchemaVersion?: boolean;
        graph: unknown;
      };
      const parsed = parseGraphify(b.graph, { allowUnknownSchemaVersion: b.allowUnknownSchemaVersion });
      return importGraphify(ex(), actor(usuario), parsed, proveedorDeEmbeddings(), {
        namespace: b.namespace,
        visibility: b.visibility,
      });
    },
  }),
];

/** For the inventory (OpenAPI, coverage). */
export const konDeMemoria = {
  id: KON_DE_MEMORIA,
  name: "Agent memory (brain)",
  version: "1.0.0",
  mountPath: RUTA_DE_MEMORIA,
  operaciones: operacionesDeMemoria,
};

registrarOperacionesDelNucleo({
  konId: KON_DE_MEMORIA,
  mountPath: RUTA_DE_MEMORIA,
  descripcion:
    "Agent memory: notes with an owner (private by default, optionally shared), connections with provenance, claims with evidence, OKF export and graphify import.",
  operaciones: operacionesDeMemoria,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const brainMemoriaRoutes = routerDeOperaciones(KON_DE_MEMORIA, operacionesDeMemoria, contexto);
