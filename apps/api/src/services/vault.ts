/**
 * Kitsuden — KITSUDEN Vault (arquitectura KITSUDEN §3)
 *
 * Gestor de esquemas dinámicos con `CREATE TABLE` / `ALTER TABLE` REALES
 * en PostgreSQL, en lugar de JSONB. Complementa (NO reemplaza) el Dataset
 * Engine JSONB existente — ADR-001 sigue vigente para datasets clásicos;
 * Vault es la vía opt-in para colecciones que necesitan índices y tipos
 * nativos con rendimiento de tabla real.
 *
 * GARANTÍAS DE SEGURIDAD MULTI-TENANT:
 *   1. Solo tablas con prefijo `vault_` — el motor jamás toca tablas core.
 *   2. Identifiers validados con regex estricta (^[a-z][a-z0-9_]{0,50}$).
 *   3. Tipos de columna limitados a una whitelist (sin SQL arbitrario).
 *   4. RLS habilitado + FORCE en cada tabla creada, con la misma política
 *      owner_isolation del Muro de Titanio (app.current_user_id).
 *   5. Cada operación DDL queda registrada como snapshot JSON en
 *      apps/api/drizzle/vault/ (historial estilo migración).
 *
 * FEATURE FLAG: KITSUDEN_VAULT_ENABLED=true (default: off — decisión disruptiva,
 * ver kitsuden.md §3).
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { db } from "../db";
import { conexionDdlConfigurada } from "../lib/conexion-ddl";
import { logger } from "../lib/logger";

import { invalidateGraphifyCache } from "./graphify";
import { introspectTable, clearIntrospectionCache } from "./schema-introspector";

// ═══════════════════════════════════════════════════════════════
// TYPES & VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Conexión para el DDL del Vault (CREATE/ALTER/DROP TABLE, índices, RLS).
 *
 * Auditoría 2026-10-25, probado con el rol de la app: en producción la API se
 * conecta con un rol SIN privilegios de esquema (`start-with-check.sh` solo le
 * da DML), así que crear una colección fallaba con 42501. Y no conviene darle
 * CREATE: el dueño de una tabla puede quitarle la RLS. El DDL va por la cuenta
 * de administración (`DATABASE_ADMIN_URL`, que el compose de producción ya
 * pasa a la API); el rol de la app recibe el DML por los `ALTER DEFAULT
 * PRIVILEGES` que fija el arranque. Sin esa variable (lite, desarrollo), `db`.
 */
type EjecutorDdl = { execute: (consulta: ReturnType<typeof sql.raw>) => Promise<unknown> };
let conexionDdl: EjecutorDdl | null = null;
async function ddl(): Promise<EjecutorDdl> {
  // 2026-10-26: primero el rol de DDL limitado, no el superusuario (ver
  // lib/conexion-ddl.ts); la imagen de producción ya no deja la URL de admin
  // en el entorno de la API.
  const url = conexionDdlConfigurada()?.url;
  if (!url) return db as unknown as EjecutorDdl;
  if (!conexionDdl) {
    const pg = (await import("pg")).default;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    conexionDdl = drizzle(new pg.Pool({ connectionString: url, max: 2 })) as unknown as EjecutorDdl;
  }
  return conexionDdl;
}

export class VaultError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export const VAULT_PREFIX = "vault_";

const NAME_RE = /^[a-z][a-z0-9_]{0,50}$/;

/** Whitelist de tipos — la ÚNICA vía por la que el usuario define tipos SQL */
const COLUMN_TYPES = {
  text: "text",
  varchar: "varchar(500)",
  integer: "integer",
  bigint: "bigint",
  numeric: "numeric(18,4)",
  boolean: "boolean",
  timestamp: "timestamptz",
  date: "date",
  uuid: "uuid",
  jsonb: "jsonb",
} as const;

export type VaultColumnType = keyof typeof COLUMN_TYPES;

export interface VaultColumnDef {
  name: string;
  type: VaultColumnType;
  required?: boolean;
  unique?: boolean;
  indexed?: boolean;
}

/** Columnas reservadas que el Vault gestiona automáticamente */
const RESERVED_COLUMNS = new Set(["id", "owner_id", "created_at", "updated_at"]);

function assertName(name: string, kind: "collection" | "column"): void {
  if (!NAME_RE.test(name)) {
    throw new VaultError(
      400,
      `Invalid ${kind} name '${name}'. Use lowercase snake_case (a-z, 0-9, _), max 51 chars.`
    );
  }
  if (kind === "column" && RESERVED_COLUMNS.has(name)) {
    throw new VaultError(400, `Column '${name}' is reserved and managed by Vault automatically`);
  }
}

function assertColumnType(type: string): asserts type is VaultColumnType {
  if (!(type in COLUMN_TYPES)) {
    throw new VaultError(
      400,
      `Invalid column type '${type}'. Allowed: ${Object.keys(COLUMN_TYPES).join(", ")}`
    );
  }
}

export function vaultTableName(collection: string): string {
  assertName(collection, "collection");
  return `${VAULT_PREFIX}${collection}`;
}

export function isVaultEnabled(): boolean {
  return process.env.KITSUDEN_VAULT_ENABLED === "true";
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOTS (historial de DDL estilo migración)
// ═══════════════════════════════════════════════════════════════

function snapshotDir(): string {
  // apps/api/drizzle/vault — junto a las migraciones de drizzle-kit
  const candidates = [
    join(process.cwd(), "drizzle", "vault"),
    join(process.cwd(), "apps", "api", "drizzle", "vault"),
  ];
  for (const dir of candidates) {
    const parent = join(dir, "..");
    if (existsSync(parent)) return dir;
  }
  return candidates[0]!;
}

function writeSnapshot(operation: string, detail: Record<string, unknown>): void {
  try {
    const dir = snapshotDir();
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = join(dir, `${stamp}_${operation}.json`);
    writeFileSync(
      file,
      JSON.stringify({ operation, timestamp: new Date().toISOString(), ...detail }, null, 2)
    );
  } catch (err) {
    // Snapshot es trazabilidad, no bloqueante
    logger.warn({ error: (err as Error).message }, "[Vault] Snapshot write failed (non-fatal)");
  }
}

// ═══════════════════════════════════════════════════════════════
// DDL — CREATE / ALTER TABLE reales
// ═══════════════════════════════════════════════════════════════

function columnDDL(col: VaultColumnDef): string {
  assertName(col.name, "column");
  assertColumnType(col.type);
  const pgType = COLUMN_TYPES[col.type];
  const notNull = col.required ? " NOT NULL" : "";
  const unique = col.unique ? " UNIQUE" : "";
  // Identifiers ya validados por regex — interpolación segura
  return `"${col.name}" ${pgType}${notNull}${unique}`;
}

/**
 * Crea una colección Vault: tabla real con id/owner_id/timestamps + RLS.
 */
export async function createCollection(
  collection: string,
  columns: VaultColumnDef[]
): Promise<{ table: string; columns: number }> {
  const table = vaultTableName(collection);

  if (columns.length === 0) {
    throw new VaultError(400, "At least one column is required");
  }
  if (columns.length > 60) {
    throw new VaultError(400, "Maximum 60 columns per collection");
  }

  const names = new Set<string>();
  for (const col of columns) {
    assertName(col.name, "column");
    assertColumnType(col.type);
    if (names.has(col.name)) throw new VaultError(400, `Duplicate column '${col.name}'`);
    names.add(col.name);
  }

  const existing = await introspectTable(table);
  if (existing) throw new VaultError(409, `Collection '${collection}' already exists`);

  const userColumns = columns.map(columnDDL).join(",\n      ");

  // CREATE TABLE real — el corazón de KITSUDEN Vault
  await (await ddl()).execute(
    sql.raw(`
    CREATE TABLE "${table}" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id text,
      ${userColumns},
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  );

  // Índices solicitados
  for (const col of columns) {
    if (col.indexed && !col.unique) {
      await (await ddl()).execute(
        sql.raw(`CREATE INDEX "idx_${table}_${col.name}" ON "${table}" ("${col.name}")`)
      );
    }
  }
  await (await ddl()).execute(sql.raw(`CREATE INDEX "idx_${table}_owner" ON "${table}" (owner_id)`));

  // RLS — Muro de Titanio idéntico al de data_entries
  await (await ddl()).execute(sql.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  await (await ddl()).execute(sql.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`));
  await (await ddl()).execute(
    sql.raw(`
    CREATE POLICY "${table}_owner_isolation" ON "${table}"
      FOR ALL TO PUBLIC
      USING (
        -- «Sistema» = id Y rol vacíos: el anónimo también trae id vacío
        -- (auditoría 2026-10-25; rls-owned-tables.sql rehace las existentes)
        (COALESCE(current_setting('app.current_user_id', true), '') = ''
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
        OR current_setting('app.current_user_role', true) = 'admin'
        OR owner_id = current_setting('app.current_user_id', true)
        OR (owner_id IS NULL AND COALESCE(current_setting('app.current_user_id', true), '') <> '')
      )
      WITH CHECK (
        (COALESCE(current_setting('app.current_user_id', true), '') = ''
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
        OR current_setting('app.current_user_role', true) = 'admin'
        OR owner_id = current_setting('app.current_user_id', true)
      )
  `)
  );

  clearIntrospectionCache();
  invalidateGraphifyCache();
  writeSnapshot("create_collection", { table, columns });
  logger.info({ table, columns: columns.length }, "[Vault] Collection created (real table + RLS)");

  return { table, columns: columns.length };
}

/**
 * ALTER TABLE ADD COLUMN en caliente.
 */
export async function addColumn(collection: string, col: VaultColumnDef): Promise<void> {
  const table = vaultTableName(collection);
  assertName(col.name, "column");
  assertColumnType(col.type);

  const existing = await introspectTable(table);
  if (!existing) throw new VaultError(404, `Collection '${collection}' not found`);
  if (existing.columns.some((c) => c.name === col.name)) {
    throw new VaultError(409, `Column '${col.name}' already exists`);
  }

  // ADD COLUMN con NOT NULL requiere default o tabla vacía; para seguridad
  // multi-tenant las columnas nuevas siempre entran como nullable.
  const pgType = COLUMN_TYPES[col.type];
  await (await ddl()).execute(sql.raw(`ALTER TABLE "${table}" ADD COLUMN "${col.name}" ${pgType}`));

  if (col.unique) {
    await (await ddl()).execute(
      sql.raw(`CREATE UNIQUE INDEX "uq_${table}_${col.name}" ON "${table}" ("${col.name}")`)
    );
  } else if (col.indexed) {
    await (await ddl()).execute(
      sql.raw(`CREATE INDEX "idx_${table}_${col.name}" ON "${table}" ("${col.name}")`)
    );
  }

  clearIntrospectionCache();
  invalidateGraphifyCache();
  writeSnapshot("add_column", { table, column: col });
  logger.info({ table, column: col.name }, "[Vault] Column added (real ALTER TABLE)");
}

/**
 * ALTER TABLE DROP COLUMN (guardado: nunca columnas reservadas).
 */
export async function dropColumn(collection: string, columnName: string): Promise<void> {
  const table = vaultTableName(collection);
  assertName(columnName, "column"); // también rechaza reservadas

  const existing = await introspectTable(table);
  if (!existing) throw new VaultError(404, `Collection '${collection}' not found`);
  if (!existing.columns.some((c) => c.name === columnName)) {
    throw new VaultError(404, `Column '${columnName}' not found`);
  }

  await (await ddl()).execute(sql.raw(`ALTER TABLE "${table}" DROP COLUMN "${columnName}"`));

  clearIntrospectionCache();
  invalidateGraphifyCache();
  writeSnapshot("drop_column", { table, column: columnName });
  logger.info({ table, column: columnName }, "[Vault] Column dropped");
}

/**
 * DROP TABLE (destructivo — requiere confirmación explícita en la ruta).
 */
export async function dropCollection(collection: string): Promise<void> {
  const table = vaultTableName(collection);

  const existing = await introspectTable(table);
  if (!existing) throw new VaultError(404, `Collection '${collection}' not found`);

  await (await ddl()).execute(sql.raw(`DROP TABLE "${table}"`));

  clearIntrospectionCache();
  invalidateGraphifyCache();
  writeSnapshot("drop_collection", { table });
  logger.info({ table }, "[Vault] Collection dropped");
}

/**
 * Lista las colecciones Vault (tablas con prefijo vault_) con su schema.
 */
export async function listCollections(): Promise<
  Array<{ collection: string; table: string; columns: unknown[]; estimatedRowCount: number }>
> {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE ${VAULT_PREFIX + "%"}
    ORDER BY table_name
  `);

  const collections = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of result.rows as any[]) {
    const table = row.table_name as string;
    const introspected = await introspectTable(table);
    collections.push({
      collection: table.slice(VAULT_PREFIX.length),
      table,
      columns: introspected?.columns ?? [],
      estimatedRowCount: introspected?.estimatedRowCount ?? 0,
    });
  }
  return collections;
}

// ═══════════════════════════════════════════════════════════════
// ROW CRUD — valores 100% parametrizados, columnas validadas
// ═══════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = { execute: (q: any) => Promise<{ rows: any[] }> };

async function validateRowColumns(table: string, data: Record<string, unknown>): Promise<string[]> {
  const introspected = await introspectTable(table);
  if (!introspected) throw new VaultError(404, `Collection not found`);

  const validColumns = new Set(introspected.columns.map((c) => c.name));
  const keys = Object.keys(data).filter((k) => !RESERVED_COLUMNS.has(k));

  for (const key of keys) {
    if (!validColumns.has(key)) {
      throw new VaultError(400, `Unknown column '${key}' on '${table}'`);
    }
  }
  if (keys.length === 0) throw new VaultError(400, "No writable columns in payload");
  return keys;
}

/**
 * INSERT parametrizado. owner_id se toma del contexto (nunca del payload).
 */
export async function insertRow(
  executor: Executor,
  collection: string,
  data: Record<string, unknown>,
  ownerId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const table = vaultTableName(collection);
  const keys = await validateRowColumns(table, data);

  const columnIdents = sql.join(
    [sql.identifier("owner_id"), ...keys.map((k) => sql.identifier(k))],
    sql`, `
  );
  const valuePlaceholders = sql.join(
    [sql`${ownerId}`, ...keys.map((k) => sql`${data[k] as never}`)],
    sql`, `
  );

  const result = await executor.execute(
    sql`INSERT INTO ${sql.identifier(table)} (${columnIdents}) VALUES (${valuePlaceholders}) RETURNING *`
  );
  return result.rows[0];
}

/**
 * UPDATE parametrizado por id (RLS decide si el caller puede tocar la fila).
 */
export async function updateRow(
  executor: Executor,
  collection: string,
  id: string,
  data: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const table = vaultTableName(collection);
  const keys = await validateRowColumns(table, data);

  const setClauses = sql.join(
    [
      ...keys.map((k) => sql`${sql.identifier(k)} = ${data[k] as never}`),
      sql`${sql.identifier("updated_at")} = now()`,
    ],
    sql`, `
  );

  const result = await executor.execute(
    sql`UPDATE ${sql.identifier(table)} SET ${setClauses} WHERE id::text = ${id} RETURNING *`
  );
  return result.rows[0] ?? null;
}

/**
 * DELETE por id (RLS aplica).
 */
export async function deleteRow(
  executor: Executor,
  collection: string,
  id: string
): Promise<boolean> {
  const table = vaultTableName(collection);
  const introspected = await introspectTable(table);
  if (!introspected) throw new VaultError(404, `Collection not found`);

  const result = await executor.execute(
    sql`DELETE FROM ${sql.identifier(table)} WHERE id::text = ${id} RETURNING id`
  );
  return result.rows.length > 0;
}
