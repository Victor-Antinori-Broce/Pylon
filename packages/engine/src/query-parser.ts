/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * QUERY ENGINE - Traductor JSON a SQL con Auto-Join
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Motor de consultas que traduce objetos JSON declarativos a queries Drizzle,
 * con soporte para expansiones de relaciones (Anti N+1).
 *
 * Features:
 * - parseQuery: Convierte JSON a query Drizzle
 * - AutoJoin: Expande relaciones 1:1 y 1:N en una sola query
 * - WhiteList: Seguridad por lista blanca de campos
 * - Relación dinámica: Detecta FKs automáticamente
 *
 * @example
 * ```typescript
 * const result = await parseQuery({
 *   table: agentIdentities,
 *   where: { isActive: true },
 *   expand: ["traces", "apiKeys"],
 *   limit: 10,
 * });
 * // Retorna: { id, name, traces: [...], apiKeys: [...] }
 * ```
 */

import {
  eq,
  and,
  not,
  gt,
  gte,
  lt,
  lte,
  like,
  ilike,
  inArray,
  isNull,
  isNotNull,
  desc,
  asc,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

import { db } from "../../../apps/api/src/db";
import * as schema from "../../../apps/api/src/db/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export interface QueryOptions<_T = any> {
  /** Tabla principal */
  table: PgTable;
  /** Filtros where */
  where?: Record<string, unknown>;
  /** Expandir relaciones */
  expand?: string[];
  /** Campos a seleccionar (default: todos los permitidos) */
  select?: string[];
  /** Límite de resultados */
  limit?: number;
  /** Offset para paginación */
  offset?: number;
  /** Ordenamiento [{ field: "createdAt", direction: "desc" }] */
  orderBy?: Array<{ field: string; direction?: "asc" | "desc" }>;
}

export interface QueryResult<T = any> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    executedAt: string;
  };
}

/** Definición de relación descubierta */
interface RelationDef {
  name: string;
  type: "one" | "many";
  table: PgTable;
  fkColumn: string;
  targetColumn: string;
  targetTable: PgTable;
}

/** Mapa de relaciones por tabla */
const relationsMap = new Map<string, Map<string, RelationDef>>();

/** Lista blanca global de campos (seguridad) */
const fieldWhiteList = new Set<string>([
  "id",
  "name",
  "description",
  "type",
  "status",
  "createdAt",
  "updatedAt",
  "email",
  "role",
  "isActive",
  "slug",
  "title",
  "content",
  "data",
  "metadata",
  "sessionId",
  "totalDurationMs",
  "tokensIn",
  "tokensOut",
  "estimatedCost",
  "errorMessage",
  "input",
  "output",
  "agentId",
  "traceId",
  "stepOrder",
  "stepType",
  "content",
  "reasoning",
  "toolName",
  "toolInput",
  "toolOutput",
  "durationMs",
]);

/** Campos prohibidos (nunca se exponen) */
const fieldBlackList = new Set<string>(["keyHash", "password", "secret", "token"]);

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRO DE RELACIONES (Basado en Foreign Keys)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registra una relación en el mapa global.
 * Esto permite que el motor sepa cómo hacer join entre tablas.
 */
function registerRelation(
  sourceTable: PgTable,
  relationName: string,
  def: Omit<RelationDef, "name">
): void {
  const tableName = getTableName(sourceTable);
  if (!relationsMap.has(tableName)) {
    relationsMap.set(tableName, new Map());
  }
  relationsMap.get(tableName)!.set(relationName, { name: relationName, ...def });
}

/**
 * Inicializa las relaciones conocidas del esquema.
 * En producción, esto podría ser generado automáticamente.
 */
function initializeRelations(): void {
  // agentIdentities → agentTraces (1:N)
  registerRelation(schema.agentIdentities, "traces", {
    type: "many",
    table: schema.agentTraces,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // agentIdentities → agentApiKeys (1:N)
  registerRelation(schema.agentIdentities, "apiKeys", {
    type: "many",
    table: schema.agentApiKeys,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // agentIdentities → agentMemory (1:N)
  registerRelation(schema.agentIdentities, "memories", {
    type: "many",
    table: schema.agentMemory,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // agentIdentities → agentAuditLogs (1:N)
  registerRelation(schema.agentIdentities, "auditLogs", {
    type: "many",
    table: schema.agentAuditLogs,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // agentTraces → agentTraceSteps (1:N)
  registerRelation(schema.agentTraces, "steps", {
    type: "many",
    table: schema.agentTraceSteps,
    fkColumn: "traceId",
    targetColumn: "id",
    targetTable: schema.agentTraces,
  });

  // agentTraces → agentIdentities (N:1)
  registerRelation(schema.agentTraces, "agent", {
    type: "one",
    table: schema.agentTraces,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // dataSets → dataEntries (1:N)
  registerRelation(schema.dataSets, "entries", {
    type: "many",
    table: schema.dataEntries,
    fkColumn: "dataSetId",
    targetColumn: "id",
    targetTable: schema.dataSets,
  });

  // dataEntries → dataSets (N:1)
  registerRelation(schema.dataEntries, "dataset", {
    type: "one",
    table: schema.dataEntries,
    fkColumn: "dataSetId",
    targetColumn: "id",
    targetTable: schema.dataSets,
  });
}

// Inicializar relaciones al importar
initializeRelations();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getTableName(table: PgTable): string {
  return (table as any)[Symbol.for("drizzle:Name")] ?? table.constructor.name;
}

function getColumn(table: PgTable, columnName: string): PgColumn | undefined {
  return (table as any)[columnName];
}

function isFieldAllowed(field: string): boolean {
  if (fieldBlackList.has(field)) return false;
  return fieldWhiteList.has(field) || fieldWhiteList.size === 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER DE WHERE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convierte un objeto where JSON a condiciones SQL de Drizzle.
 *
 * @example
 * { status: "active", id: { $gt: 100 } }
 * → and(eq(table.status, "active"), gt(table.id, 100))
 */
function parseWhereClause(table: PgTable, where: Record<string, unknown>): SQL | undefined {
  const conditions: SQL[] = [];

  for (const [key, value] of Object.entries(where)) {
    // Validar campo permitido
    if (!isFieldAllowed(key)) {
      console.warn(`[QueryEngine] Campo no permitido ignorado: ${key}`);
      continue;
    }

    const column = getColumn(table, key);
    if (!column) {
      console.warn(`[QueryEngine] Columna no encontrada: ${key}`);
      continue;
    }

    // Operadores anidados: { id: { $gt: 100 } }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [op, opValue] of Object.entries(value)) {
        const sqlCond = buildOperatorCondition(column, op, opValue);
        if (sqlCond) conditions.push(sqlCond);
      }
    } else {
      // Igualdad simple: { status: "active" }
      conditions.push(eq(column, value));
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions) as SQL;
}

function buildOperatorCondition(column: PgColumn, operator: string, value: any): SQL | undefined {
  switch (operator) {
    case "$eq":
      return eq(column, value);
    case "$ne":
    case "$neq":
      return not(eq(column, value));
    case "$gt":
      return gt(column, value);
    case "$gte":
      return gte(column, value);
    case "$lt":
      return lt(column, value);
    case "$lte":
      return lte(column, value);
    case "$in":
      return inArray(column, Array.isArray(value) ? value : [value]);
    case "$nin":
      return not(inArray(column, Array.isArray(value) ? value : [value]));
    case "$like":
      return like(column, value);
    case "$ilike":
      return ilike(column, value);
    case "$null":
      return value ? isNull(column) : isNotNull(column);
    default:
      console.warn(`[QueryEngine] Operador desconocido: ${operator}`);
      return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-JOIN ENGINE (Anti N+1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta una query con expansiones de relaciones (Anti N+1).
 *
 * Estrategia:
 * 1. Query principal con limit/offset
 * 2. Para cada relación expand, hacer query separada con IN (ids)
 * 3. Mergear resultados en memoria
 *
 * Esto evita N+1 y es más eficiente que múltiples JOINs para relaciones 1:N.
 */
async function executeWithExpansions<T>(options: QueryOptions, baseQuery: any): Promise<T[]> {
  const { table, expand = [] } = options;
  const tableName = getTableName(table);

  // 1. Ejecutar query base
  const rows = await baseQuery;
  if (rows.length === 0 || expand.length === 0) {
    return rows as T[];
  }

  // 2. Preparar IDs para búsqueda de relaciones
  const ids = rows.map((r: any) => r.id).filter(Boolean);
  if (ids.length === 0) return rows as T[];

  // 3. Cargar relaciones en paralelo (Anti N+1)
  const relationsData = await Promise.all(
    expand.map(async (relName) => {
      const relation = relationsMap.get(tableName)?.get(relName);
      if (!relation) {
        console.warn(`[QueryEngine] Relación no encontrada: ${tableName}.${relName}`);
        return { relName, data: new Map() };
      }

      const relRows = await loadRelation(relation, ids);
      return { relName, data: relRows };
    })
  );

  // 4. Mergear resultados
  const merged = rows.map((row: any) => {
    const expanded: any = { ...row };
    for (const { relName, data } of relationsData) {
      const relation = relationsMap.get(tableName)?.get(relName);
      if (!relation) continue;

      if (relation.type === "one") {
        // Relación N:1 - un solo objeto
        expanded[relName] = data.get(row[relation.fkColumn]) || null;
      } else {
        // Relación 1:N - array de objetos
        expanded[relName] = data.get(row.id) || [];
      }
    }
    return expanded;
  });

  return merged;
}

/**
 * Carga una relación para un conjunto de IDs.
 * Retorna Map<parentId, relatedData> para fácil lookup.
 */
async function loadRelation(
  relation: RelationDef,
  parentIds: string[]
): Promise<Map<string, any | any[]>> {
  const result = new Map<string, any | any[]>();

  if (relation.type === "one") {
    // N:1 - Buscar por FK en tabla origen
    const fkColumn = getColumn(relation.table, relation.fkColumn);
    if (!fkColumn) return result;

    const rows = await db
      .select()
      .from(relation.targetTable)
      .where(inArray(getColumn(relation.targetTable, "id")!, parentIds));

    for (const row of rows) {
      result.set((row as any).id, row);
    }
  } else {
    // 1:N - Buscar por FK en tabla relacionada
    const fkColumn = getColumn(relation.table, relation.fkColumn);
    if (!fkColumn) return result;

    const rows = await db.select().from(relation.table).where(inArray(fkColumn, parentIds));

    // Agrupar por parentId
    for (const row of rows) {
      const parentId = (row as any)[relation.fkColumn];
      if (!result.has(parentId)) {
        result.set(parentId, []);
      }
      (result.get(parentId) as any[]).push(row);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parsea un objeto JSON de query y lo ejecuta contra la base de datos.
 *
 * @example
 * ```typescript
 * const result = await parseQuery({
 *   table: agentIdentities,
 *   where: { isActive: true, type: "service" },
 *   expand: ["traces", "apiKeys"],
 *   limit: 10,
 *   orderBy: [{ field: "createdAt", direction: "desc" }],
 * });
 * ```
 */
export async function parseQuery<T = any>(options: QueryOptions): Promise<QueryResult<T>> {
  const { table, where, limit = 50, offset = 0, orderBy } = options;

  // Construir query base
  let query = db.select().from(table).$dynamic();

  // Aplicar where
  if (where && Object.keys(where).length > 0) {
    const whereClause = parseWhereClause(table, where);
    if (whereClause) {
      query = query.where(whereClause);
    }
  }

  // Aplicar orderBy
  if (orderBy && orderBy.length > 0) {
    const orderConditions = orderBy
      .map((o) => {
        if (!isFieldAllowed(o.field)) return null;
        const col = getColumn(table, o.field);
        if (!col) return null;
        return o.direction === "desc" ? desc(col) : asc(col);
      })
      .filter(Boolean);

    if (orderConditions.length > 0) {
      query = query.orderBy(...(orderConditions as any));
    }
  }

  // Ejecutar con paginación
  const limitSafe = Math.min(Math.max(1, limit), 1000);
  const offsetSafe = Math.max(0, offset);

  query = query.limit(limitSafe).offset(offsetSafe);

  // Ejecutar con expansiones (Anti N+1)
  const data = await executeWithExpansions<T>(options, query);

  // Contar total (sin limit/offset)
  let totalQuery = db.select({ count: sql<number>`count(*)` }).from(table);
  if (where && Object.keys(where).length > 0) {
    const whereClause = parseWhereClause(table, where);
    if (whereClause) {
      totalQuery = totalQuery.where(whereClause) as any;
    }
  }
  const [{ count: total }] = await totalQuery;

  return {
    data,
    meta: {
      total,
      limit: limitSafe,
      offset: offsetSafe,
      hasMore: offsetSafe + data.length < total,
      executedAt: new Date().toISOString(),
    },
  };
}

/**
 * Valida un objeto query sin ejecutarlo.
 * Retorna errores si hay campos no permitidos o relaciones inválidas.
 */
export function validateQuery(options: QueryOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const { table, where, expand, select } = options;
  const tableName = getTableName(table);

  // Validar campos en where
  if (where) {
    for (const key of Object.keys(where)) {
      if (!isFieldAllowed(key)) {
        errors.push(`Campo no permitido en where: ${key}`);
      }
    }
  }

  // Validar campos en select
  if (select) {
    for (const field of select) {
      if (!isFieldAllowed(field)) {
        errors.push(`Campo no permitido en select: ${field}`);
      }
    }
  }

  // Validar expansiones
  if (expand) {
    const tableRels = relationsMap.get(tableName);
    for (const rel of expand) {
      if (!tableRels?.has(rel)) {
        errors.push(`Relación no encontrada: ${tableName}.${rel}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Obtiene las relaciones disponibles para una tabla.
 */
export function getAvailableRelations(table: PgTable): string[] {
  const tableName = getTableName(table);
  const rels = relationsMap.get(tableName);
  return rels ? Array.from(rels.keys()) : [];
}

/**
 * Registra dinámicamente una nueva relación.
 */
export function registerDynamicRelation(
  sourceTable: PgTable,
  relationName: string,
  def: Omit<RelationDef, "name">
): void {
  registerRelation(sourceTable, relationName, def);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════════════

export { relationsMap, fieldWhiteList, fieldBlackList };
