/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * KITSUDEN QL ENGINE - Traductor Prisma JSON a Drizzle SQL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Traduce consultas en formato Prisma JSON a sentencias SQL seguras mediante
 * Drizzle ORM. Soporta operadores complejos, lógica AND/OR anidada y
 * resolución de relaciones (Anti N+1) mediante Auto-Join.
 *
 * Features:
 * - Operadores: eq, neq, gt, gte, lt, lte, in, contains
 * - Lógica anidada: AND, OR, NOT
 * - Validación de esquema: Verifica columnas existentes
 * - Auto-Join: Expande relaciones con findMany({ with: {} })
 * - Seguridad: Solo operadores tipados de Drizzle, sin SQL dinámico
 *
 * @example
 * ```typescript
 * const result = await parseKitsudenQuery(agentIdentities, {
 *   where: {
 *     AND: [
 *       { isActive: true },
 *       { type: { eq: "service" } },
 *       { rateLimit: { gte: 60 } }
 *     ]
 *   },
 *   expand: ["traces", "apiKeys"]
 * });
 * ```
 */

import { eq, ne, gt, gte, lt, lte, inArray, ilike, and, or, not, sql, SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

import { db } from "../../../apps/api/src/db";
import * as schema from "../../../apps/api/src/db/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Operadores de filtro soportados */
export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "contains"
  | "startsWith"
  | "endsWith";

/** Operadores lógicos */
export type LogicalOperator = "AND" | "OR" | "NOT";

/** Filtro de campo individual */
export interface FieldFilter {
  eq?: any;
  neq?: any;
  gt?: any;
  gte?: any;
  lt?: any;
  lte?: any;
  in?: any[];
  contains?: string;
  startsWith?: string;
  endsWith?: string;
}

/** Filtro where recursivo */
export interface WhereFilter {
  [key: string]: FieldFilter | any | WhereFilter[];
  AND?: WhereFilter[];
  OR?: WhereFilter[];
  NOT?: WhereFilter;
}

/** Opciones de consulta Kitsuden QL */
export interface KitsudenQueryOptions {
  /** Filtros where */
  where?: WhereFilter;
  /** Relaciones a expandir */
  expand?: string[];
  /** Campos a seleccionar */
  select?: string[];
  /** Límite de resultados */
  limit?: number;
  /** Offset para paginación */
  offset?: number;
  /** Ordenamiento [{ field: "createdAt", direction: "desc" }] */
  orderBy?: Array<{ field: string; direction?: "asc" | "desc" }>;
}

/** Resultado de consulta */
export interface KitsudenQueryResult<T = any> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    executedAt: string;
    queryTimeMs: number;
  };
}

/** Error semántico de validación */
export class KitsudenQLError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "KitsudenQLError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAPA DE RELACIONES (Metadatos del Esquema)
// ═══════════════════════════════════════════════════════════════════════════════

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

/**
 * Registra una relación en el mapa global.
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
 */
function initializeRelations(): void {
  // Agent Identities relations
  registerRelation(schema.agentIdentities, "traces", {
    type: "many",
    table: schema.agentTraces,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  registerRelation(schema.agentIdentities, "apiKeys", {
    type: "many",
    table: schema.agentApiKeys,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  registerRelation(schema.agentIdentities, "memories", {
    type: "many",
    table: schema.agentMemory,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  registerRelation(schema.agentIdentities, "auditLogs", {
    type: "many",
    table: schema.agentAuditLogs,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // Agent Traces relations
  registerRelation(schema.agentTraces, "steps", {
    type: "many",
    table: schema.agentTraceSteps,
    fkColumn: "traceId",
    targetColumn: "id",
    targetTable: schema.agentTraces,
  });

  registerRelation(schema.agentTraces, "agent", {
    type: "one",
    table: schema.agentTraces,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // Data Sets relations
  registerRelation(schema.dataSets, "entries", {
    type: "many",
    table: schema.dataEntries,
    fkColumn: "dataSetId",
    targetColumn: "id",
    targetTable: schema.dataSets,
  });

  registerRelation(schema.dataEntries, "dataset", {
    type: "one",
    table: schema.dataEntries,
    fkColumn: "dataSetId",
    targetColumn: "id",
    targetTable: schema.dataSets,
  });
}

// Inicializar relaciones
initializeRelations();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS Y UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════

/** Obtiene el nombre de una tabla */
function getTableName(table: PgTable): string {
  return (table as any)[Symbol.for("drizzle:Name")] ?? table.constructor.name;
}

/** Obtiene una columna de la tabla */
function getColumn(table: PgTable, columnName: string): PgColumn | undefined {
  return (table as any)[columnName];
}

/** Obtiene todas las columnas de una tabla */
function getTableColumns(table: PgTable): string[] {
  const columns: string[] = [];
  for (const key of Object.keys(table)) {
    if (key !== "_" && key !== "$inferSelect" && key !== "$inferInsert") {
      columns.push(key);
    }
  }
  return columns;
}

/** Verifica si un campo existe en la tabla */
function validateColumnExists(table: PgTable, columnName: string): boolean {
  // Campos especiales de operadores lógicos
  if (["AND", "OR", "NOT"].includes(columnName)) return true;

  const column = getColumn(table, columnName);
  return column !== undefined;
}

/** Valida que un operador sea soportado */
function validateOperator(operator: string): operator is FilterOperator {
  const validOperators: FilterOperator[] = [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "contains",
    "startsWith",
    "endsWith",
  ];
  return validOperators.includes(operator as FilterOperator);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAPEO DE OPERADORES A DRIZZLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Construye una condición SQL para un operador específico.
 *
 * Mapeo de operadores:
 * - eq -> eq()
 * - neq -> ne()
 * - gt/gte/lt/lte -> gt()/gte()/lt()/lte()
 * - in -> inArray()
 * - contains -> ilike(column, `%${value}%`)
 * - startsWith -> ilike(column, `${value}%`)
 * - endsWith -> ilike(column, `%${value}`)
 */
function buildOperatorCondition(
  column: PgColumn,
  operator: FilterOperator,
  value: any
): SQL | undefined {
  switch (operator) {
    case "eq":
      return eq(column, value);
    case "neq":
      return ne(column, value);
    case "gt":
      return gt(column, value);
    case "gte":
      return gte(column, value);
    case "lt":
      return lt(column, value);
    case "lte":
      return lte(column, value);
    case "in":
      if (!Array.isArray(value)) {
        throw new KitsudenQLError(
          `El operador "in" requiere un array de valores`,
          "INVALID_OPERATOR_VALUE",
          { operator, value, expected: "array" }
        );
      }
      return inArray(column, value);
    case "contains":
      if (typeof value !== "string") {
        throw new KitsudenQLError(
          `El operador "contains" requiere un string`,
          "INVALID_OPERATOR_VALUE",
          { operator, value, expected: "string" }
        );
      }
      // Escapar caracteres especiales de SQL LIKE
      const escapedValue = value.replace(/[%_]/g, "\\$&");
      return ilike(column, `%${escapedValue}%`);
    case "startsWith":
      if (typeof value !== "string") {
        throw new KitsudenQLError(
          `El operador "startsWith" requiere un string`,
          "INVALID_OPERATOR_VALUE",
          { operator, value, expected: "string" }
        );
      }
      const escapedStart = value.replace(/[%_]/g, "\\$&");
      return ilike(column, `${escapedStart}%`);
    case "endsWith":
      if (typeof value !== "string") {
        throw new KitsudenQLError(
          `El operador "endsWith" requiere un string`,
          "INVALID_OPERATOR_VALUE",
          { operator, value, expected: "string" }
        );
      }
      const escapedEnd = value.replace(/[%_]/g, "\\$&");
      return ilike(column, `%${escapedEnd}`);
    default:
      throw new KitsudenQLError(`Operador no soportado: ${operator}`, "UNSUPPORTED_OPERATOR", {
        operator,
        supportedOperators: [
          "eq",
          "neq",
          "gt",
          "gte",
          "lt",
          "lte",
          "in",
          "contains",
          "startsWith",
          "endsWith",
        ],
      });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER RECURSIVO DE WHERE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parsea recursivamente un objeto where y lo convierte a condiciones SQL de Drizzle.
 *
 * Soporta:
 * - Filtros de campo: { level: { gte: 50 } }
 * - Igualdad directa: { element: "pyro" }
 * - Operadores lógicos AND/OR: { AND: [{...}, {...}] }
 * - Operador NOT: { NOT: { level: { lt: 10 } } }
 */
function parseWhereClause(table: PgTable, where: WhereFilter | undefined): SQL | undefined {
  if (!where || Object.keys(where).length === 0) {
    return undefined;
  }

  const conditions: SQL[] = [];

  for (const [key, value] of Object.entries(where)) {
    // Operador lógico AND
    if (key === "AND") {
      if (!Array.isArray(value)) {
        throw new KitsudenQLError(
          "AND requiere un array de condiciones",
          "INVALID_LOGICAL_OPERATOR",
          {
            key,
            value,
          }
        );
      }
      const andConditions = value
        .map((w) => parseWhereClause(table, w))
        .filter((c): c is SQL => c !== undefined);
      if (andConditions.length > 0) {
        conditions.push(and(...andConditions) as SQL);
      }
      continue;
    }

    // Operador lógico OR
    if (key === "OR") {
      if (!Array.isArray(value)) {
        throw new KitsudenQLError(
          "OR requiere un array de condiciones",
          "INVALID_LOGICAL_OPERATOR",
          {
            key,
            value,
          }
        );
      }
      const orConditions = value
        .map((w) => parseWhereClause(table, w))
        .filter((c): c is SQL => c !== undefined);
      if (orConditions.length > 0) {
        conditions.push(or(...orConditions) as SQL);
      }
      continue;
    }

    // Operador lógico NOT
    if (key === "NOT") {
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new KitsudenQLError(
          "NOT requiere un objeto de condiciones",
          "INVALID_LOGICAL_OPERATOR",
          {
            key,
            value,
          }
        );
      }
      const notCondition = parseWhereClause(table, value as WhereFilter);
      if (notCondition) {
        conditions.push(not(notCondition));
      }
      continue;
    }

    // Validar que la columna existe en el esquema
    if (!validateColumnExists(table, key)) {
      const tableName = getTableName(table);
      const availableColumns = getTableColumns(table);
      throw new KitsudenQLError(
        `Columna "${key}" no existe en la tabla "${tableName}"`,
        "COLUMN_NOT_FOUND",
        {
          column: key,
          table: tableName,
          availableColumns: availableColumns.slice(0, 20), // Limitar por brevedad
        }
      );
    }

    const column = getColumn(table, key);
    if (!column) {
      continue; // Skip si no se encuentra la columna (ya lanzamos error arriba)
    }

    // Valor es un objeto con operadores: { level: { gte: 50 } }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [op, opValue] of Object.entries(value)) {
        if (!validateOperator(op)) {
          throw new KitsudenQLError(`Operador "${op}" no soportado`, "UNSUPPORTED_OPERATOR", {
            operator: op,
            column: key,
            supportedOperators: [
              "eq",
              "neq",
              "gt",
              "gte",
              "lt",
              "lte",
              "in",
              "contains",
              "startsWith",
              "endsWith",
            ],
          });
        }
        const sqlCond = buildOperatorCondition(column, op, opValue);
        if (sqlCond) conditions.push(sqlCond);
      }
    } else {
      // Igualdad directa: { element: "pyro" } -> eq(column, "pyro")
      conditions.push(eq(column, value));
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions) as SQL;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-JOIN ENGINE (Anti N+1) con findMany({ with: {} })
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Construye el objeto "with" para findMany con relaciones.
 *
 * @example
 * Input: ["traces", "apiKeys"]
 * Output: { traces: true, apiKeys: true }
 */
function buildWithObject(
  table: PgTable,
  expand: string[]
): Record<string, true | { with: Record<string, true> }> | undefined {
  if (!expand || expand.length === 0) return undefined;

  const tableName = getTableName(table);
  const tableRelations = relationsMap.get(tableName);

  if (!tableRelations) return undefined;

  const withObj: Record<string, true | { with: Record<string, true> }> = {};

  for (const relName of expand) {
    const relation = tableRelations.get(relName);
    if (!relation) {
      const availableRelations = Array.from(tableRelations.keys());
      throw new KitsudenQLError(
        `Relación "${relName}" no existe en la tabla "${tableName}"`,
        "RELATION_NOT_FOUND",
        {
          relation: relName,
          table: tableName,
          availableRelations,
        }
      );
    }

    // Para relaciones simples, solo incluimos true
    // Para relaciones anidadas, podríamos expandir más
    withObj[relName] = true;
  }

  return Object.keys(withObj).length > 0 ? withObj : undefined;
}

/**
 * Ejecuta la consulta usando db.query.findMany con relaciones.
 *
 * Esta es la implementación Anti N+1 usando la API de query de Drizzle
 * que automáticamente hace los joins necesarios en una sola query.
 */
async function executeWithRelations<T>(
  table: PgTable,
  whereClause: SQL | undefined,
  withObj: Record<string, true | { with: Record<string, true> }> | undefined,
  options: KitsudenQueryOptions
): Promise<T[]> {
  const tableName = getTableName(table);
  const limit = Math.min(Math.max(1, options.limit ?? 50), 1000);
  const offset = Math.max(0, options.offset ?? 0);

  // Construir la query base
  // Nota: Drizzle ORM tiene una API de query que permite "with" para relaciones
  // db.query[tableName].findMany({ where, with, limit, offset })

  const queryConfig: any = {
    limit,
    offset,
  };

  if (whereClause) {
    queryConfig.where = whereClause;
  }

  if (withObj) {
    queryConfig.with = withObj;
  }

  // Ejecutar la query usando la API de query de Drizzle
  // Necesitamos acceder a db.query[tableName]
  const queryApi = (db.query as any)[tableName];

  if (!queryApi) {
    // Fallback a select tradicional si no hay query API
    return executeFallback<T>(table, whereClause, options);
  }

  try {
    const results = await queryApi.findMany(queryConfig);
    return results as T[];
  } catch (error) {
    // Si falla el query API, hacer fallback al método tradicional
    console.warn(`[KitsudenQL] Query API falló para ${tableName}, usando fallback:`, error);
    return executeFallback<T>(table, whereClause, options);
  }
}

/**
 * Fallback a método tradicional usando select().
 * Implementa Anti N+1 manualmente.
 */
async function executeFallback<T>(
  table: PgTable,
  whereClause: SQL | undefined,
  options: KitsudenQueryOptions
): Promise<T[]> {
  const limit = Math.min(Math.max(1, options.limit ?? 50), 1000);
  const offset = Math.max(0, options.offset ?? 0);

  // Query base
  let query = db.select().from(table).$dynamic();

  if (whereClause) {
    query = query.where(whereClause);
  }

  // Aplicar limit y offset
  query = query.limit(limit).offset(offset);

  const rows = await query;

  // Si hay expansiones, cargarlas manualmente (Anti N+1)
  if (options.expand && options.expand.length > 0) {
    return expandRelationsManually(table, rows, options.expand) as Promise<T[]>;
  }

  return rows as T[];
}

/**
 * Expande relaciones manualmente usando estrategia Anti N+1.
 * 1. Obtener IDs de las filas principales
 * 2. Hacer queries separadas por relación usando IN (ids)
 * 3. Mergear resultados
 */
async function expandRelationsManually(
  table: PgTable,
  rows: any[],
  expand: string[]
): Promise<any[]> {
  if (rows.length === 0) return rows;

  const tableName = getTableName(table);
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return rows;

  // Cargar todas las relaciones en paralelo
  const relationsData = await Promise.all(
    expand.map(async (relName) => {
      const relation = relationsMap.get(tableName)?.get(relName);
      if (!relation) {
        console.warn(`[KitsudenQL] Relación no encontrada: ${tableName}.${relName}`);
        return { relName, data: new Map() };
      }

      const relData = await loadRelationData(relation, ids);
      return { relName, data: relData, relation };
    })
  );

  // Mergear resultados
  return rows.map((row) => {
    const expanded = { ...row };
    for (const { relName, data, relation } of relationsData) {
      if (!relation) continue;

      if (relation.type === "one") {
        // Relación N:1
        expanded[relName] = data.get(row[relation.fkColumn]) || null;
      } else {
        // Relación 1:N
        expanded[relName] = data.get(row.id) || [];
      }
    }
    return expanded;
  });
}

/**
 * Carga los datos de una relación para un conjunto de IDs.
 */
async function loadRelationData(
  relation: RelationDef,
  parentIds: string[]
): Promise<Map<string, any | any[]>> {
  const result = new Map<string, any | any[]>();

  if (relation.type === "one") {
    // N:1 - Buscar en tabla destino
    const targetColumn = getColumn(relation.targetTable, "id");
    if (!targetColumn) return result;

    const rows = await db
      .select()
      .from(relation.targetTable)
      .where(inArray(targetColumn, parentIds));

    for (const row of rows) {
      result.set((row as any).id, row);
    }
  } else {
    // 1:N - Buscar en tabla relacionada por FK
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
// API PÚBLICA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parsea y ejecuta una consulta Kitsuden QL.
 *
 * Traduce un objeto JSON estilo Prisma a una consulta SQL ejecutable mediante Drizzle.
 *
 * @param table - Tabla de Drizzle ORM (ej: schema.agentIdentities)
 * @param jsonPayload - Objeto JSON con la consulta (where, expand, limit, etc.)
 * @returns Resultado de la consulta con metadatos
 *
 * @example
 * ```typescript
 * const result = await parseKitsudenQuery(agentIdentities, {
 *   where: {
 *     AND: [
 *       { isActive: true },
 *       { type: { eq: "service" } },
 *       { rateLimit: { gte: 60 } }
 *     ]
 *   },
 *   expand: ["traces", "apiKeys"],
 *   limit: 10,
 *   orderBy: [{ field: "createdAt", direction: "desc" }]
 * });
 * ```
 */
export async function parseKitsudenQuery<T = any>(
  table: PgTable,
  jsonPayload: KitsudenQueryOptions
): Promise<KitsudenQueryResult<T>> {
  const startTime = performance.now();
  const tableName = getTableName(table);

  try {
    // 1. Validar y parsear el where clause
    const whereClause = parseWhereClause(table, jsonPayload.where);

    // 2. Construir objeto "with" para relaciones
    const withObj = jsonPayload.expand ? buildWithObject(table, jsonPayload.expand) : undefined;

    // 3. Ejecutar consulta con o sin relaciones
    const data = await executeWithRelations<T>(table, whereClause, withObj, jsonPayload);

    // 4. Contar total para metadatos
    let totalQuery = db.select({ count: sql<number>`count(*)` }).from(table);
    if (whereClause) {
      totalQuery = totalQuery.where(whereClause) as any;
    }
    // `count(*)` es bigint, y los drivers de Postgres lo entregan como STRING
    // para no perder precisión. Sin la conversión, `total` acaba siendo "42" y
    // la comparación de `hasMore` (`offset + data.length < total`) compara un
    // número con una cadena — que en JavaScript no falla, solo da resultados
    // equivocados en silencio.
    const [filaTotal] = await totalQuery;
    const total = Number(filaTotal?.count ?? 0);

    const queryTimeMs = performance.now() - startTime;

    return {
      data,
      meta: {
        total,
        limit: jsonPayload.limit ?? 50,
        offset: jsonPayload.offset ?? 0,
        hasMore: (jsonPayload.offset ?? 0) + data.length < total,
        executedAt: new Date().toISOString(),
        queryTimeMs: Math.round(queryTimeMs * 100) / 100,
      },
    };
  } catch (error) {
    if (error instanceof KitsudenQLError) {
      throw error;
    }

    // Wrap unexpected errors
    throw new KitsudenQLError(
      `Error ejecutando consulta: ${(error as Error).message}`,
      "QUERY_EXECUTION_ERROR",
      { table: tableName, payload: jsonPayload, originalError: error }
    );
  }
}

/**
 * Valida una consulta Kitsuden QL sin ejecutarla.
 *
 * @returns Objeto con validación y lista de errores si los hay
 *
 * @example
 * ```typescript
 * const { valid, errors } = validateKitsudenQuery(agentIdentities, {
 *   where: { level: { gte: 50 } },
 *   expand: ["traces"]
 * });
 * ```
 */
export function validateKitsudenQuery(
  table: PgTable,
  jsonPayload: KitsudenQueryOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tableName = getTableName(table);

  try {
    // Intentar parsear el where (esto valida columnas y operadores)
    parseWhereClause(table, jsonPayload.where);
  } catch (error) {
    if (error instanceof KitsudenQLError) {
      errors.push(`${error.code}: ${error.message}`);
    } else {
      errors.push(`Error inesperado: ${(error as Error).message}`);
    }
  }

  // Validar expansiones
  if (jsonPayload.expand) {
    const tableRelations = relationsMap.get(tableName);
    for (const rel of jsonPayload.expand) {
      if (!tableRelations?.has(rel)) {
        const available = tableRelations ? Array.from(tableRelations.keys()) : [];
        errors.push(
          `RELATION_NOT_FOUND: Relación "${rel}" no existe. Disponibles: ${available.join(", ")}`
        );
      }
    }
  }

  // Validar límites
  if (jsonPayload.limit !== undefined) {
    if (jsonPayload.limit < 1 || jsonPayload.limit > 1000) {
      errors.push("INVALID_LIMIT: limit debe estar entre 1 y 1000");
    }
  }

  if (jsonPayload.offset !== undefined && jsonPayload.offset < 0) {
    errors.push("INVALID_OFFSET: offset no puede ser negativo");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Obtiene las relaciones disponibles para una tabla.
 *
 * @example
 * ```typescript
 * const relations = getAvailableRelations(agentIdentities);
 * // ["traces", "apiKeys", "memories", "auditLogs"]
 * ```
 */
export function getAvailableRelations(table: PgTable): string[] {
  const tableName = getTableName(table);
  const rels = relationsMap.get(tableName);
  return rels ? Array.from(rels.keys()) : [];
}

/**
 * Registra dinámicamente una nueva relación para Auto-Join.
 *
 * @example
 * ```typescript
 * registerDynamicRelation(characters, "weapon", {
 *   type: "one",
 *   table: characters,
 *   fkColumn: "weaponId",
 *   targetColumn: "id",
 *   targetTable: weapons
 * });
 * ```
 */
export function registerDynamicRelation(
  sourceTable: PgTable,
  relationName: string,
  def: Omit<RelationDef, "name">
): void {
  registerRelation(sourceTable, relationName, def);
}

/**
 * Obtiene el mapa completo de relaciones (para debugging).
 */
export function getRelationsMap(): Map<string, Map<string, RelationDef>> {
  return relationsMap;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE DEBUG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Imprime el SQL generado para una consulta (sin ejecutar).
 * Útil para debugging.
 */
export function debugQuery(
  table: PgTable,
  jsonPayload: KitsudenQueryOptions
): { sql: string; params: any[] } {
  const tableName = getTableName(table);

  try {
    const whereClause = parseWhereClause(table, jsonPayload.where);

    return {
      sql: `SELECT * FROM "${tableName}"${whereClause ? " WHERE ?" : ""}`,
      params: whereClause ? [whereClause] : [],
    };
  } catch (error) {
    return {
      sql: `Error generando SQL: ${(error as Error).message}`,
      params: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTACIONES ADICIONALES
// ═══════════════════════════════════════════════════════════════════════════════

export { relationsMap, getTableName, getColumn, validateColumnExists, validateOperator };
