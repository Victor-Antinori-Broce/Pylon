/**
 * Kitsuden — Engine Graphify (arquitectura KITSUDEN §3)
 *
 * Motor de APIs relacionales automáticas. Mapea las relaciones reales de
 * PostgreSQL (via schema-introspector) y expone endpoints anidados sin que
 * el desarrollador escriba controladores:
 *
 *   GET /api/graph                      → grafo completo (tablas + relaciones)
 *   GET /api/graph/:table               → listado paginado
 *   GET /api/graph/:table/:id           → registro puntual
 *   GET /api/graph/:table/:id/:relation → filas relacionadas (1:N, N:1 y N:M)
 *
 * SEGURIDAD:
 *   - Solo identifiers verificados contra information_schema (cero SQL injection:
 *     nombres de tabla/columna nunca se interpolan sin validar existencia).
 *   - Deny-list de tablas sensibles (auth_*, api_keys, kitsuden_secrets...).
 *   - Corre bajo withTransactionalRLS → PostgreSQL aplica RLS en cada query.
 *   - Quien NO es admin solo ve tablas con RLS FORZADA (`puedeVerTabla`).
 *
 * ── POR QUÉ LO ÚLTIMO (auditoría 2026-10-15) ──────────────────────────────
 *
 * La deny-list sola dejaba leer, a CUALQUIER cuenta (el alta es abierta),
 * las ~170 tablas sin RLS: suscriptores del boletín con su email, contactos
 * del CRM, empleados del directorio, pedidos con dirección, `data_sources`
 * con su contraseña, la configuración de las acciones (secretos de webhooks),
 * el código de las funciones, los registros de auditoría con IPs… La RLS no
 * filtra nada en una tabla que no la tiene. Ahora, sin rol admin, una tabla
 * es legible solo si Postgres la aísla por fila (RLS activada Y forzada:
 * las colecciones del Vault y las tablas personales de rls-owned-tables.sql).
 */

import { sql } from "drizzle-orm";

import { db } from "../db";

import { introspectTable, getAllTables, type IntrospectedTable } from "./schema-introspector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = { execute: (q: any) => Promise<{ rows: any[] }> };

// ═══════════════════════════════════════════════════════════════
// SEGURIDAD — tablas jamás expuestas por Graphify
// ═══════════════════════════════════════════════════════════════

// `oauth_`: clientes, concesiones y hashes de tokens de OAuth para MCP (0055)
const DENY_PREFIXES = ["auth_", "pg_", "drizzle_", "_", "oauth_"];
const DENY_TABLES = new Set([
  "api_keys",
  "kitsuden_secrets",
  "agent_tokens",
  "agent_api_keys",
  "auth_users",
  "auth_sessions",
  "auth_accounts",
  "auth_verifications",
]);

/** El de `services/vault.ts` (aquí en literal: vault importa este módulo). */
const VAULT_PREFIX = "vault_";

export function isTableExposed(tableName: string): boolean {
  if (DENY_TABLES.has(tableName)) return false;
  return !DENY_PREFIXES.some((p) => tableName.startsWith(p));
}

/** Quién pregunta. Por defecto, nadie con privilegios. */
export interface AccesoGraphify {
  esAdmin?: boolean;
}

/**
 * ¿Puede esta identidad leer esta tabla por Graphify?
 *
 * Admin: todo lo expuesto. Cualquier otra cuenta: solo lo expuesto que tenga
 * RLS forzada, porque solo ahí Postgres recorta por dueño las filas que ve.
 */
export function puedeVerTabla(
  tableName: string,
  acceso: AccesoGraphify,
  conRlsForzada: ReadonlySet<string>
): boolean {
  if (!isTableExposed(tableName)) return false;
  if (acceso.esAdmin === true) return true;
  // Sin admin, SOLO colecciones del Vault (y con RLS forzada). Auditoría
  // 2026-10-25: las tablas de los kons también tienen RLS forzada, pero sus
  // políticas dejan ver filas cuyo recorte de COLUMNAS hace la ruta del kon
  // (directorio: salario, fecha de nacimiento; DMS: `storage_path` de ficheros
  // en /media). Graph hace `SELECT *` y se saltaba ese recorte.
  return tableName.startsWith(VAULT_PREFIX) && conRlsForzada.has(tableName);
}

let rlsCache: { tablas: Set<string>; ts: number } | null = null;

/** Tablas de `public` con RLS activada y forzada (cacheado como el grafo). */
export async function tablasConRlsForzada(): Promise<Set<string>> {
  if (rlsCache && Date.now() - rlsCache.ts < GRAPH_CACHE_TTL) return rlsCache.tablas;
  const result = await db.execute(sql`
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity AND c.relforcerowsecurity
  `);
  const filas = ((result as unknown as { rows?: { tabla: string }[] }).rows ??
    (result as unknown as { tabla: string }[])) as { tabla: string }[];
  const tablas = new Set<string>(filas.map((r) => r.tabla));
  rlsCache = { tablas, ts: Date.now() };
  return tablas;
}

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

function assertIdentifier(name: string, kind: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new GraphifyError(400, `Invalid ${kind} identifier: ${name}`);
  }
}

export class GraphifyError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "GraphifyError";
  }
}

// ═══════════════════════════════════════════════════════════════
// GRAFO DE RELACIONES (cacheado)
// ═══════════════════════════════════════════════════════════════

export interface GraphEdge {
  from: string; // tabla con la FK
  fromColumn: string;
  to: string; // tabla referenciada
  toColumn: string;
}

export interface RelationResolution {
  kind: "belongs-to" | "has-many" | "many-to-many";
  edge: GraphEdge;
  /** Solo para N:M — tabla intermedia y su edge hacia el destino */
  through?: { table: string; edgeToTarget: GraphEdge };
}

let graphCache: { edges: GraphEdge[]; tables: string[]; ts: number } | null = null;
const GRAPH_CACHE_TTL = 5 * 60 * 1000;

/**
 * Construye el grafo global de FKs (todas las tablas expuestas).
 */
export async function buildGraph(): Promise<{ edges: GraphEdge[]; tables: string[] }> {
  if (graphCache && Date.now() - graphCache.ts < GRAPH_CACHE_TTL) {
    return { edges: graphCache.edges, tables: graphCache.tables };
  }

  const result = await db.execute(sql`
    SELECT
      tc.table_name AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name AS to_table,
      ccu.column_name AS to_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edges: GraphEdge[] = result.rows.map((r: any) => ({
    from: r.from_table as string,
    fromColumn: r.from_column as string,
    to: r.to_table as string,
    toColumn: r.to_column as string,
  }));

  const allTables = await getAllTables();
  const tables = allTables.filter(isTableExposed);
  const exposedEdges = edges.filter((e) => isTableExposed(e.from) && isTableExposed(e.to));

  graphCache = { edges: exposedEdges, tables, ts: Date.now() };
  return { edges: exposedEdges, tables };
}

export function invalidateGraphifyCache(): void {
  graphCache = null;
  rlsCache = null;
}

/** El grafo que esta identidad puede ver: tablas legibles y aristas entre ellas. */
export async function buildGraphFor(
  acceso: AccesoGraphify
): Promise<{ edges: GraphEdge[]; tables: string[] }> {
  const graph = await buildGraph();
  if (acceso.esAdmin) return graph;
  const forzadas = await tablasConRlsForzada();
  const ver = (t: string) => puedeVerTabla(t, acceso, forzadas);
  return {
    tables: graph.tables.filter(ver),
    edges: graph.edges.filter((e) => ver(e.from) && ver(e.to)),
  };
}

/**
 * Resuelve cómo llegar de `sourceTable` a `relation`:
 *   1. belongs-to  → source tiene FK hacia relation (N:1)
 *   2. has-many    → relation tiene FK hacia source (1:N)
 *   3. many-to-many→ existe tabla intermedia con FKs a ambas
 */
export async function resolveRelation(
  sourceTable: string,
  relation: string
): Promise<RelationResolution | null> {
  const { edges } = await buildGraph();

  // N:1 — source → relation
  const belongsTo = edges.find((e) => e.from === sourceTable && e.to === relation);
  if (belongsTo) return { kind: "belongs-to", edge: belongsTo };

  // 1:N — relation → source
  const hasMany = edges.find((e) => e.from === relation && e.to === sourceTable);
  if (hasMany) return { kind: "has-many", edge: hasMany };

  // N:M — join table with FK to source AND FK to relation
  const edgesToSource = edges.filter((e) => e.to === sourceTable);
  for (const edgeToSource of edgesToSource) {
    const joinTable = edgeToSource.from;
    const edgeToTarget = edges.find((e) => e.from === joinTable && e.to === relation);
    if (edgeToTarget) {
      return {
        kind: "many-to-many",
        edge: edgeToSource,
        through: { table: joinTable, edgeToTarget },
      };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// QUERIES DINÁMICAS (identifiers validados contra introspección)
// ═══════════════════════════════════════════════════════════════

async function requireTable(tableName: string, acceso: AccesoGraphify): Promise<IntrospectedTable> {
  assertIdentifier(tableName, "table");
  if (!isTableExposed(tableName)) {
    throw new GraphifyError(403, `Table '${tableName}' is not exposed by Graphify`);
  }
  // 404 y no 403: a quien no puede leerla no se le confirma que exista
  if (!puedeVerTabla(tableName, acceso, acceso.esAdmin ? new Set() : await tablasConRlsForzada())) {
    throw new GraphifyError(404, `Table '${tableName}' not found`);
  }
  const table = await introspectTable(tableName);
  if (!table) throw new GraphifyError(404, `Table '${tableName}' not found`);
  return table;
}

function requireColumn(table: IntrospectedTable, columnName: string): void {
  assertIdentifier(columnName, "column");
  if (!table.columns.some((col) => col.name === columnName)) {
    throw new GraphifyError(400, `Column '${columnName}' does not exist on '${table.name}'`);
  }
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: "asc" | "desc";
  /** Filtros de igualdad columna=valor (columnas validadas) */
  filters?: Record<string, string>;
}

/**
 * Listado paginado de una tabla, con filtros de igualdad opcionales.
 */
export async function listRows(
  executor: Executor,
  tableName: string,
  opts: ListOptions = {},
  acceso: AccesoGraphify = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ rows: any[]; limit: number; offset: number }> {
  const table = await requireTable(tableName, acceso);

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const orderBy = opts.orderBy ?? table.primaryKey[0] ?? table.columns[0]?.name ?? "id";
  requireColumn(table, orderBy);
  const orderDir = opts.order === "desc" ? sql.raw("DESC") : sql.raw("ASC");

  // WHERE dinámico con placeholders parametrizados (los VALORES nunca se interpolan)
  const conditions = [];
  for (const [col, value] of Object.entries(opts.filters ?? {})) {
    requireColumn(table, col);
    conditions.push(sql`${sql.identifier(col)}::text = ${value}`);
  }
  const whereClause =
    conditions.length > 0 ? sql` WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const query = sql`
    SELECT * FROM ${sql.identifier(tableName)}${whereClause}
    ORDER BY ${sql.identifier(orderBy)} ${orderDir}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const result = await executor.execute(query);
  return { rows: result.rows, limit, offset };
}

/**
 * Registro puntual por primary key.
 */
export async function getRow(
  executor: Executor,
  tableName: string,
  id: string,
  acceso: AccesoGraphify = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const table = await requireTable(tableName, acceso);
  const pk = table.primaryKey[0];
  if (!pk) throw new GraphifyError(400, `Table '${tableName}' has no primary key`);

  const result = await executor.execute(
    sql`SELECT * FROM ${sql.identifier(tableName)} WHERE ${sql.identifier(pk)}::text = ${id} LIMIT 1`
  );
  return result.rows[0] ?? null;
}

/**
 * Filas relacionadas — resuelve JOINs automáticamente según la dirección
 * de la FK (belongs-to / has-many / many-to-many).
 */
export async function getRelatedRows(
  executor: Executor,
  tableName: string,
  id: string,
  relation: string,
  opts: ListOptions = {},
  acceso: AccesoGraphify = {}
): Promise<{
  kind: RelationResolution["kind"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  limit: number;
  offset: number;
}> {
  const sourceTable = await requireTable(tableName, acceso);
  await requireTable(relation, acceso);

  const resolution = await resolveRelation(tableName, relation);
  if (!resolution) {
    throw new GraphifyError(
      404,
      `No relation found between '${tableName}' and '${relation}'. ` +
        `Check GET /api/graph for available edges.`
    );
  }

  const pk = sourceTable.primaryKey[0];
  if (!pk) throw new GraphifyError(400, `Table '${tableName}' has no primary key`);

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];

  if (resolution.kind === "belongs-to") {
    // source.fkColumn → relation.pk : devuelve el padre (0..1 filas)
    const { fromColumn, toColumn } = resolution.edge;
    const result = await executor.execute(sql`
      SELECT r.* FROM ${sql.identifier(relation)} r
      JOIN ${sql.identifier(tableName)} s
        ON s.${sql.identifier(fromColumn)} = r.${sql.identifier(toColumn)}
      WHERE s.${sql.identifier(pk)}::text = ${id}
      LIMIT ${limit} OFFSET ${offset}
    `);
    rows = result.rows;
  } else if (resolution.kind === "has-many") {
    // relation.fkColumn → source.pk : devuelve los hijos (0..N filas)
    const { fromColumn, toColumn } = resolution.edge;
    const result = await executor.execute(sql`
      SELECT r.* FROM ${sql.identifier(relation)} r
      JOIN ${sql.identifier(tableName)} s
        ON r.${sql.identifier(fromColumn)} = s.${sql.identifier(toColumn)}
      WHERE s.${sql.identifier(pk)}::text = ${id}
      LIMIT ${limit} OFFSET ${offset}
    `);
    rows = result.rows;
  } else {
    // many-to-many via join table
    const { edge: edgeToSource, through } = resolution;
    const { table: joinTable, edgeToTarget } = through!;
    const result = await executor.execute(sql`
      SELECT r.* FROM ${sql.identifier(relation)} r
      JOIN ${sql.identifier(joinTable)} j
        ON j.${sql.identifier(edgeToTarget.fromColumn)} = r.${sql.identifier(edgeToTarget.toColumn)}
      JOIN ${sql.identifier(tableName)} s
        ON j.${sql.identifier(edgeToSource.fromColumn)} = s.${sql.identifier(edgeToSource.toColumn)}
      WHERE s.${sql.identifier(pk)}::text = ${id}
      LIMIT ${limit} OFFSET ${offset}
    `);
    rows = result.rows;
  }

  return { kind: resolution.kind, rows, limit, offset };
}
