/**
 * Inline Relations Service — Django-style Inlines
 *
 * Enables viewing and editing related records inline within parent forms:
 * - ForeignKey inlines (parent → children)
 * - Many-to-Many inlines with through table
 * - Tabular and Stacked layouts
 * - Nested inlines (limited depth)
 */

import { resolveExecutor } from "@kitsuden/engine";
import { sql } from "drizzle-orm";

import { db } from "../db";
import {
  esColumnaSecreta,
  sinColumnasSecretas,
  tablaEsExplorable,
  tablaNativaProhibida,
} from "../lib/tablas-explorables";

import { introspectTable } from "./schema-introspector";

/**
 * ── LA LISTA NEGRA TAMBIÉN AQUÍ (auditoría 2026-11-04, F10/F69) ────────────
 *
 * Los hijos de una tabla salen de `information_schema`: cualquier tabla con FK
 * a `<padre>.id`. Con `auth_users` de padre, eso eran `auth_accounts`
 * (hashes de contraseña y tokens OAuth), `auth_sessions` y `api_keys`, y el
 * POST reescribía una credencial con nombres de columna elegidos por quien
 * llama. Ahora el padre y cada hijo pasan la misma puerta que el explorador
 * (`tablaEsExplorable`, más todo `auth_*` salvo `auth_users`, como MCP), las
 * filas salen sin columnas secretas, y una escritura solo nombra columnas que
 * existen en la tabla, no secretas.
 *
 * Tablas de plataforma que el explorador enseña aunque ningún kon las declare
 * (nombres SQL; el registro del explorador las tiene por clave).
 */
const REGISTRO_DEL_NUCLEO = ["auth_users", "media", "data_sets", "data_entries", "site_settings", "modules"];

/** ¿Puede esta tabla ser padre o hijo de una relación en línea? */
export async function tablaInlinePermitida(nombre: string): Promise<boolean> {
  if (tablaNativaProhibida(nombre)) return false;
  return (await tablaEsExplorable(nombre, REGISTRO_DEL_NUCLEO)).permitida;
}

/** El ejecutor de la petición (transacción con contexto RLS) o, fuera de ella, la global. */
const exec = (): typeof db => resolveExecutor(db) as typeof db;

/** Inline configuration for a relationship */
export interface InlineConfig {
  /** Name of the inline relationship */
  name: string;

  /** Label for the UI */
  label: string;

  /** Type of inline */
  type: "fk" | "m2m" | "generic";

  /** Table containing the related records */
  table: string;

  /** Foreign key column in the related table pointing to parent */
  fkColumn: string;

  /** Columns to display in the inline */
  fields: string[];

  /** Whether inline is editable */
  editable?: boolean;

  /** Whether records can be added */
  canAdd?: boolean;

  /** Whether records can be deleted */
  canDelete?: boolean;

  /** Maximum number of inline records to show */
  maxCount?: number;

  /** Layout style */
  layout?: "tabular" | "stacked";

  /** Sort field */
  sortField?: string;
}

/** Data returned for an inline relationship */

export interface InlineData {
  config: InlineConfig;

  records: Record<string, unknown>[];
  totalCount: number;
  canAddMore: boolean;
}

/** Information about a relation between tables */
export interface RelationInfo {
  /** Column in parent table that is a FK */
  column: string;

  /** Table being referenced */
  relatedTable: string;

  /** Column in related table */
  relatedColumn: string;

  /** Type of relation */
  type: "belongs_to" | "has_many" | "many_to_many";

  /** For has_many: column in child table pointing to parent */
  inverseColumn?: string;
}

/** Query row from database execution */

interface QueryRow extends Record<string, unknown> {}

/**
 * Detect all relations for a table
 */
export async function detectRelations(tableName: string): Promise<RelationInfo[]> {
  const introspected = await introspectTable(tableName);
  if (!introspected) return [];

  const relations: RelationInfo[] = [];

  // 1. Detect outgoing FKs (belongs_to)
  for (const col of introspected.columns) {
    if (col.isForeignKey && col.foreignTable) {
      relations.push({
        column: col.name,
        relatedTable: col.foreignTable,
        relatedColumn: col.foreignColumn || "id",
        type: "belongs_to",
      });
    }
  }

  // 2. Detect incoming relations (has_many)
  // Find tables that have FKs pointing to this table
  try {
    const result = await db.execute(sql`
      SELECT
        tc.table_name as child_table,
        kcu.column_name as fk_column,
        ccu.table_name as parent_table,
        ccu.column_name as parent_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = ${tableName}
      AND ccu.column_name = 'id'
    `);

    for (const row of result.rows as QueryRow[]) {
      // Avoid self-referential loops
      if (row.child_table !== tableName) {
        relations.push({
          column: "id", // parent's id is referenced
          relatedTable: row.child_table as string,
          relatedColumn: row.parent_column as string,
          type: "has_many",
          inverseColumn: row.fk_column as string,
        });
      }
    }
  } catch (err) {
    console.error(`[InlineRelations] Failed to detect incoming relations for ${tableName}:`, err);
  }

  // 3. Detect many-to-many through junction tables
  try {
    // Find potential junction tables (contain two FKs)
    const result = await db.execute(sql`
      SELECT 
        tc.table_name as junction_table,
        COUNT(*) as fk_count
      FROM information_schema.table_constraints tc
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      )
      GROUP BY tc.table_name
      HAVING COUNT(*) = 2
    `);

    for (const row of result.rows as QueryRow[]) {
      // Check if this junction table references our table
      const refsResult = await db.execute(sql`
        SELECT
          kcu.column_name,
          ccu.table_name as referenced_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ${row.junction_table}
      `);

      const refs = refsResult.rows as QueryRow[];
      const hasCurrentTable = refs.some((r) => r.referenced_table === tableName);

      if (hasCurrentTable && refs.length === 2) {
        const otherRef = refs.find((r) => r.referenced_table !== tableName);
        if (otherRef) {
          relations.push({
            column: "id",
            relatedTable: otherRef.referenced_table as string,
            relatedColumn: "id",
            type: "many_to_many",
          });
        }
      }
    }
  } catch (err) {
    console.error(`[InlineRelations] Failed to detect M2M relations for ${tableName}:`, err);
  }

  return relations;
}

/**
 * Generate inline configs for a table
 */
export async function generateInlineConfigs(tableName: string): Promise<InlineConfig[]> {
  // Ni el padre ni los hijos fuera de la lista blanca, ni prohibidos.
  if (!(await tablaInlinePermitida(tableName))) return [];
  const relations = await detectRelations(tableName);
  const configs: InlineConfig[] = [];

  for (const relation of relations) {
    // Only create inlines for has_many relations
    if (relation.type !== "has_many" || !relation.inverseColumn) continue;
    if (!(await tablaInlinePermitida(relation.relatedTable))) continue;

    // Introspect the child table to get field suggestions
    const childIntrospected = await introspectTable(relation.relatedTable);
    if (!childIntrospected) continue;

    // Pick fields to display (exclude FK to parent and metadata)
    const visibles = childIntrospected.columns.filter((c) => !esColumnaSecreta(c.name));
    const fields = visibles
      .filter(
        (c) =>
          c.name !== relation.inverseColumn &&
          c.name !== "id" &&
          !c.name.endsWith("_id") &&
          !c.name.endsWith("At") &&
          !c.name.startsWith("created") &&
          !c.name.startsWith("updated")
      )
      .slice(0, 5) // Max 5 fields
      .map((c) => c.name);

    // Add some meaningful fields if we filtered too aggressively
    if (fields.length === 0) {
      fields.push(
        ...visibles
          .filter((c) => c.name !== "id" && c.name !== relation.inverseColumn)
          .slice(0, 3)
          .map((c) => c.name)
      );
    }

    configs.push({
      name: relation.relatedTable,
      label: humanize(relation.relatedTable),
      type: "fk",
      table: relation.relatedTable,
      fkColumn: relation.inverseColumn,
      fields,
      editable: true,
      canAdd: true,
      canDelete: true,
      maxCount: 10,
      layout: "tabular",
      sortField: childIntrospected.columns.find(
        (c) => c.name === "created_at" || c.name === "sort_order"
      )?.name,
    });
  }

  return configs;
}

/**
 * Fetch inline data for a parent record
 */
export async function fetchInlineData(
  config: InlineConfig,
  parentId: string,
  options: { page?: number; limit?: number } = {}
): Promise<InlineData> {
  const { page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  try {
    // Build query dynamically
    const result = await exec().execute(sql`
      SELECT *
      FROM ${sql.identifier(config.table)}
      WHERE ${sql.identifier(config.fkColumn)} = ${parentId}
      ${config.sortField ? sql`ORDER BY ${sql.identifier(config.sortField)} DESC` : sql``}
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    // Get total count
    const countResult = await exec().execute(sql`
      SELECT COUNT(*) as count
      FROM ${sql.identifier(config.table)}
      WHERE ${sql.identifier(config.fkColumn)} = ${parentId}
    `);

    const totalCount = parseInt((countResult.rows[0] as QueryRow).count as string);

    return {
      config,
      // Ni a un admin se le enseña un token o un hash por aquí.
      records: sinColumnasSecretas(result.rows) as Record<string, unknown>[],
      totalCount,
      canAddMore: !config.maxCount || totalCount < config.maxCount,
    };
  } catch (err) {
    console.error(`[InlineRelations] Failed to fetch inline data:`, err);
    return {
      config,
      records: [],
      totalCount: 0,
      canAddMore: false,
    };
  }
}

/** Inline record with optional id */
interface InlineRecord {
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * ¿Qué tiene de malo esta escritura? `null` si nada.
 *
 * Los nombres de columna van a `sql.identifier`, así que no inyectan SQL, pero
 * sí eligen QUÉ se escribe: solo columnas reales de la tabla y nunca una
 * secreta (contraseña, token, hash de clave).
 */
export function problemaDeRegistrosInline(
  records: unknown,
  deletedIds: unknown,
  columnas: ReadonlySet<string>
): string | null {
  if (!Array.isArray(records)) return "'records' must be an array";
  if (!Array.isArray(deletedIds) || deletedIds.some((id) => typeof id !== "string")) {
    return "'deletedIds' must be an array of ids";
  }
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return "Each record must be an object";
    }
    for (const columna of Object.keys(record)) {
      if (esColumnaSecreta(columna)) return `Column '${columna}' cannot be written here`;
      if (!columnas.has(columna)) return `Unknown column '${columna}'`;
    }
  }
  return null;
}

/**
 * Save inline records (create/update/delete)
 */
export async function saveInlineRecords(
  tableName: string,
  fkColumn: string,
  parentId: string,
  records: InlineRecord[],
  deletedIds: string[] = []
): Promise<{ success: boolean; error?: string }> {
  // Columnas reales de la tabla hija, de `information_schema`.
  const hija = await introspectTable(tableName);
  if (!hija) return { success: false, error: `Table '${tableName}' not found` };
  const problema = problemaDeRegistrosInline(
    records,
    deletedIds,
    new Set(hija.columns.map((c) => c.name))
  );
  if (problema) return { success: false, error: problema };

  try {
    // Delete removed records
    if (deletedIds.length > 0) {
      const idPlaceholders = deletedIds.map((id: string) => sql`${id}`);
      await exec().execute(sql`
        DELETE FROM ${sql.identifier(tableName)}
        WHERE id IN (${sql.join(idPlaceholders, sql`, `)})
        AND ${sql.identifier(fkColumn)} = ${parentId}
      `);
    }

    // Upsert records
    for (const record of records) {
      const data = { ...record, [fkColumn]: parentId };

      if (record.id) {
        // Update
        const { id, ...updateData } = data;
        const entries = Object.entries(updateData);
        await exec().execute(sql`
          UPDATE ${sql.identifier(tableName)}
          SET ${sql.join(
            entries.map(([k, v]) => sql`${sql.identifier(k)} = ${v}`),
            sql`, `
          )}
          WHERE id = ${id}
          AND ${sql.identifier(fkColumn)} = ${parentId}
        `);
      } else {
        // Insert
        const keys = Object.keys(data);
        const values = Object.values(data);
        await exec().execute(sql`
          INSERT INTO ${sql.identifier(tableName)} (${sql.join(
            keys.map((k) => sql.identifier(k)),
            sql`, `
          )})
          VALUES (${sql.join(
            values.map((v) => sql`${v}`),
            sql`, `
          )})
        `);
      }
    }

    return { success: true };
  } catch (err) {
    console.error(`[InlineRelations] Failed to save inline records:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save records",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function humanize(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
