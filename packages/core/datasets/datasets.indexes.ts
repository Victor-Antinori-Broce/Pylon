/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATASETS AUTO-INDEXES - Índices Automáticos Inteligentes
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sistema de detección, sugerencia y gestión automática de índices PostgreSQL.
 * Optimiza performance basándose en patrones de query reales.
 *
 * Features:
 * - Detección automática de campos frecuentemente consultados
 * - Sugerencias de índices basadas en estadísticas
 * - Creación declarativa de índices en schema
 * - Análisis de query performance
 * - Limpieza de índices no utilizados
 */

import { camposDelSchema } from "@kitsuden/shared";
import type { KonContext } from "@kitsuden/shared";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export type IndexType = "btree" | "gin" | "gist" | "hash" | "brin";

export interface IndexDefinition {
  /** Nombre del índice (auto-generado si no se proporciona) */
  name?: string;
  /** Tipo de índice */
  type: IndexType;
  /** Campo(s) a indexar */
  fields: string[];
  /** Condición WHERE para índice parcial */
  where?: string;
  /** Único */
  unique?: boolean;
  /** Orden descendente */
  desc?: boolean;
}

export interface IndexConfig {
  /** Índices definidos manualmente */
  indexes: IndexDefinition[];
  /** Habilitar auto-detección */
  autoDetect?: boolean;
  /** Umbral de queries para sugerir índice */
  threshold?: number;
  /** Campos a excluir de auto-indexación */
  excludeFields?: string[];
}

export interface IndexSuggestion {
  id: string;
  table: string;
  field: string;
  type: IndexType;
  confidence: "high" | "medium" | "low";
  reason: string;
  estimatedQueries: number;
  estimatedImprovement: string;
  sql: string;
  createdAt: string;
  applied?: boolean;
  appliedAt?: string;
}

export interface IndexStats {
  name: string;
  table: string;
  fields: string[];
  type: IndexType;
  size: string;
  scans: number;
  rowsRead: number;
  lastUsed: string | null;
  isUsed: boolean;
}

export interface QueryStats {
  field: string;
  table: string;
  totalQueries: number;
  filterQueries: number;
  sortQueries: number;
  joinQueries: number;
  avgScanTime: number;
  lastQueryAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS ZOD
// ═══════════════════════════════════════════════════════════════════════════════

export const indexDefinitionSchema = z.object({
  name: z.string().optional(),
  type: z.enum(["btree", "gin", "gist", "hash", "brin"]).default("btree"),
  fields: z.array(z.string()).min(1),
  where: z.string().optional(),
  unique: z.boolean().default(false),
  desc: z.boolean().default(false),
});

export const indexConfigSchema = z.object({
  indexes: z.array(indexDefinitionSchema).default([]),
  autoDetect: z.boolean().default(true),
  threshold: z.number().int().min(1).default(50),
  excludeFields: z.array(z.string()).default(["id", "created_at", "updated_at"]),
});

// ═══════════════════════════════════════════════════════════════════════════════
// INDEX MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

import { eq, sql } from "drizzle-orm";
import { messageOf } from "@kitsuden/engine";

/**
 * Analiza el schema de un dataset y sugiere índices óptimos
 */
export function suggestIndexesForDataset(datasetSlug: string, schema: unknown): IndexSuggestion[] {
  const suggestions: IndexSuggestion[] = [];

  for (const field of camposDelSchema(schema) as any[]) {
    const suggestion = analyzeFieldForIndex(datasetSlug, field);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return suggestions;
}

/**
 * ── SQL DE ÍNDICES SIN INYECCIÓN (auditoría 2026-10-25) ────────────────────
 *
 * Todo este fichero construye DDL con texto y lo ejecuta con `sql.raw` (un
 * `CREATE INDEX` no admite parámetros). La clave de un campo la escribe un
 * EDITOR al definir el esquema, y un admin aplica después los índices: una
 * clave como `x')); DROP TABLE …; --` era SQL del editor ejecutado con el rol
 * de la app. Ahora:
 *   · la clave de un campo tiene que ser un identificador simple
 *     (`CLAVE_DE_CAMPO`); si no, ese campo no se indexa;
 *   · el nombre del índice se construye con `identificador()` (solo
 *     `[a-z0-9_]`, ≤ 63), o se rechaza si viene dado y no lo es;
 *   · `where` (SQL libre para índices parciales) ya no se acepta: un índice
 *     parcial va en una migración.
 */
const CLAVE_DE_CAMPO = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const NOMBRE_DE_INDICE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Texto → identificador SQL sin comillas: minúsculas, `[a-z0-9_]`, ≤ 63. */
function identificador(texto: string): string {
  const limpio = texto
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 63);
  return /^[a-z_]/.test(limpio) ? limpio : `i_${limpio}`.slice(0, 63);
}

function exigirClaveDeCampo(clave: unknown): string {
  if (typeof clave !== "string" || !CLAVE_DE_CAMPO.test(clave)) {
    throw new Error(`Invalid field key for an index: ${JSON.stringify(clave)}`);
  }
  return clave;
}

function analyzeFieldForIndex(slug: string, field: any): IndexSuggestion | null {
  const fieldName = field.key || field.name;
  // Una clave que no es un identificador simple no se indexa (ver arriba)
  if (typeof fieldName !== "string" || !CLAVE_DE_CAMPO.test(fieldName)) return null;
  const table = identificador(slug);

  // Reglas de sugerencia basadas en tipo de campo
  switch (field.type) {
    case "relation":
    case "select":
      // Campos de relación y select son frecuentemente filtrados
      return {
        id: identificador(`idx_${table}_${fieldName}_btree`),
        table: slug,
        field: fieldName,
        type: "btree",
        confidence: "high",
        reason: `Foreign key / Select field frequently filtered in queries`,
        estimatedQueries: 100,
        estimatedImprovement: "60-80%",
        sql: `CREATE INDEX ${identificador(`idx_${table}_${fieldName}_btree`)} ON data_entries ((data->>'${fieldName}'));`,
        createdAt: new Date().toISOString(),
      };

    case "text":
      if (field.validation?.pattern || field.unique) {
        // Campos con pattern o unique son buenos candidatos
        return {
          id: identificador(`idx_${table}_${fieldName}_gin`),
          table: slug,
          field: fieldName,
          type: "gin",
          confidence: "medium",
          reason: `Text field with validation pattern, suitable for GIN index`,
          estimatedQueries: 50,
          estimatedImprovement: "40-60%",
          sql: `CREATE INDEX ${identificador(`idx_${table}_${fieldName}_gin`)} ON data_entries USING gin ((data->>'${fieldName}') gin_trgm_ops);`,
          createdAt: new Date().toISOString(),
        };
      }
      break;

    case "number":
      // Números son frecuentemente usados en rangos y sorting
      return {
        id: identificador(`idx_${table}_${fieldName}_btree`),
        table: slug,
        field: fieldName,
        type: "btree",
        confidence: "medium",
        reason: `Numeric field often used for range queries and sorting`,
        estimatedQueries: 75,
        estimatedImprovement: "50-70%",
        sql: `CREATE INDEX ${identificador(`idx_${table}_${fieldName}_btree`)} ON data_entries (((data->>'${fieldName}')::numeric));`,
        createdAt: new Date().toISOString(),
      };

    case "date":
    case "datetime":
      // Fechas son casi siempre filtradas y ordenadas
      return {
        id: identificador(`idx_${table}_${fieldName}_btree`),
        table: slug,
        field: fieldName,
        type: "btree",
        confidence: "high",
        reason: `Date field frequently used for range queries`,
        estimatedQueries: 150,
        estimatedImprovement: "70-90%",
        sql: `CREATE INDEX ${identificador(`idx_${table}_${fieldName}_btree`)} ON data_entries (((data->>'${fieldName}')::timestamp));`,
        createdAt: new Date().toISOString(),
      };

    case "multiselect":
    case "tags":
      // Arrays son perfectos para GIN
      return {
        id: identificador(`idx_${table}_${fieldName}_gin`),
        table: slug,
        field: fieldName,
        type: "gin",
        confidence: "high",
        reason: `Array/Tags field, GIN index optimal for containment queries`,
        estimatedQueries: 80,
        estimatedImprovement: "80-95%",
        sql: `CREATE INDEX ${identificador(`idx_${table}_${fieldName}_gin`)} ON data_entries USING gin ((data->'${fieldName}'));`,
        createdAt: new Date().toISOString(),
      };
  }

  return null;
}

/**
 * Obtiene estadísticas actuales de índices
 */
export async function getIndexStats(ctx: KonContext): Promise<IndexStats[]> {
  const { db } = ctx;

  // `pg_indexes` no tiene `indexrelname` (se llama `indexname`) y `schemaname`
  // está en las dos vistas: el `JOIN … USING (indexrelname)` de antes fallaba
  // SIEMPRE, y `/indexes/stats` y `/indexes/report` respondían 500 (lo encontró
  // Schemathesis, 2026-10-26). `idx_scan` y `idx_tup_read` vienen de la misma
  // vista: no hace falta pg_stat_statements.
  const result = await db.instance.execute(sql`
    SELECT
      i.schemaname,
      i.tablename,
      i.indexname,
      i.indexdef,
      pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
      s.idx_scan,
      s.idx_tup_read
    FROM pg_indexes i
    JOIN pg_stat_user_indexes s
      ON s.schemaname = i.schemaname AND s.indexrelname = i.indexname
    WHERE i.schemaname = 'public'
    AND i.tablename IN ('data_entries', 'data_sets')
    ORDER BY pg_relation_size(s.indexrelid) DESC;
  `);

  return result.rows.map((row: any) => ({
    name: row.indexname,
    table: row.tablename,
    fields: extractFieldsFromIndexDef(row.indexdef),
    type: extractTypeFromIndexDef(row.indexdef),
    size: row.size,
    scans: Number(row.idx_scan ?? 0),
    rowsRead: Number(row.idx_tup_read ?? 0),
    lastUsed: null,
    isUsed: Number(row.idx_scan ?? 0) > 0,
  }));
}

/**
 * Crea un índice en la base de datos
 */
export async function createIndex(ctx: KonContext, suggestion: IndexSuggestion): Promise<boolean> {
  try {
    await ctx.db.instance.execute(sql.raw(suggestion.sql));
    ctx.logger.info(`📈 Created index: ${suggestion.id}`);
    return true;
  } catch (error) {
    ctx.logger.error(`Failed to create index ${suggestion.id}:`, error as any);
    return false;
  }
}

/**
 * Elimina un índice
 */
export async function dropIndex(ctx: KonContext, indexName: string): Promise<boolean> {
  try {
    await ctx.db.instance.execute(sql`DROP INDEX IF EXISTS ${sql.identifier(indexName)}`);
    ctx.logger.info(`🗑️ Dropped index: ${indexName}`);
    return true;
  } catch (error) {
    ctx.logger.error(`Failed to drop index ${indexName}:`, error as any);
    return false;
  }
}

/**
 * Aplica índices sugeridos automáticamente
 */
export async function applyAutoIndexes(
  ctx: KonContext,
  suggestions: IndexSuggestion[],
  minConfidence: "high" | "medium" = "high"
): Promise<{ created: string[]; failed: string[] }> {
  const result = { created: [] as string[], failed: [] as string[] };

  const confidenceLevels = { high: 2, medium: 1, low: 0 };
  const minLevel = confidenceLevels[minConfidence];

  for (const suggestion of suggestions) {
    if (confidenceLevels[suggestion.confidence] >= minLevel) {
      const success = await createIndex(ctx, suggestion);
      if (success) {
        result.created.push(suggestion.id);
      } else {
        result.failed.push(suggestion.id);
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analiza el rendimiento de queries en un dataset
 */
export async function analyzeQueryPerformance(
  ctx: KonContext,
  datasetId: string
): Promise<QueryStats[]> {
  const { db } = ctx;

  // Obtener campos del dataset
  const { dataSets } = await import("./datasets.schema");

  const [dataset] = await db.instance
    .select()
    .from(dataSets)
    .where(eq(dataSets.id, datasetId))
    .limit(1);

  if (!dataset) {
    throw new Error(`Dataset not found: ${datasetId}`);
  }

  const stats: QueryStats[] = [];

  for (const field of camposDelSchema(dataset.schema) as any[]) {
    const fieldName = field.key || field.name;

    // Simular análisis (en producción esto leería de pg_stat_statements)
    const fieldStats: QueryStats = {
      field: fieldName,
      table: dataset.slug,
      totalQueries: Math.floor(Math.random() * 1000), // Mock
      filterQueries: Math.floor(Math.random() * 500),
      sortQueries: Math.floor(Math.random() * 200),
      joinQueries: Math.floor(Math.random() * 100),
      avgScanTime: Math.random() * 100,
      lastQueryAt: new Date().toISOString(),
    };

    stats.push(fieldStats);
  }

  return stats.sort((a, b) => b.totalQueries - a.totalQueries);
}

/**
 * Genera reporte de índices recomendados
 */
export async function generateIndexReport(ctx: KonContext): Promise<{
  existing: IndexStats[];
  suggested: IndexSuggestion[];
  unused: string[];
  recommendations: string[];
}> {
  const existing = await getIndexStats(ctx);
  const suggested: IndexSuggestion[] = [];

  // Analizar todos los datasets
  const { dataSets } = await import("./datasets.schema");
  const datasets = await ctx.db.instance.select().from(dataSets);

  for (const dataset of datasets) {
    if (camposDelSchema(dataset.schema).length > 0) {
      const dsSuggestions = suggestIndexesForDataset(dataset.slug, dataset.schema);
      suggested.push(...dsSuggestions);
    }
  }

  // Filtrar sugerencias que ya existen
  const existingNames = new Set(existing.map((e) => e.name));
  const newSuggestions = suggested.filter((s) => !existingNames.has(s.id));

  // Índices sin ningún uso según pg_stat_user_indexes (el contador se pone a
  // cero al reiniciar Postgres: «sin usar» es «sin usar desde el arranque»).
  // Las claves primarias de Postgres acaban en `_pkey`.
  const unused = existing
    .filter((e) => e.scans === 0 && !e.name.includes("primary") && !e.name.endsWith("_pkey"))
    .map((e) => e.name);

  const recommendations: string[] = [];

  if (newSuggestions.length > 0) {
    recommendations.push(
      `Create ${newSuggestions.length} suggested indexes for better performance`
    );
  }

  if (unused.length > 0) {
    recommendations.push(`Consider removing ${unused.length} unused indexes to save space`);
  }

  return {
    existing,
    suggested: newSuggestions,
    unused,
    recommendations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECLARATIVE INDEX MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aplica configuración declarativa de índices a un dataset
 */
export async function applyIndexConfig(
  ctx: KonContext,
  datasetId: string,
  config: IndexConfig
): Promise<{ created: string[]; removed: string[]; errors: string[] }> {
  const result = { created: [] as string[], removed: [] as string[], errors: [] as string[] };

  // Obtener dataset
  const { db } = ctx;
  const { dataSets } = await import("./datasets.schema");

  const [dataset] = await db.instance
    .select()
    .from(dataSets)
    .where(eq(dataSets.id, datasetId))
    .limit(1);

  if (!dataset) {
    throw new Error(`Dataset not found: ${datasetId}`);
  }

  // Crear índices definidos
  for (const index of config.indexes) {
    try {
      if (index.name !== undefined && !NOMBRE_DE_INDICE.test(index.name)) {
        throw new Error(`Invalid index name: ${JSON.stringify(index.name)}`);
      }
      const indexName = index.name || generateIndexName(dataset.slug, index);
      const indexSql = buildIndexSQL("data_entries", indexName, index);

      await db.instance.execute(sql.raw(indexSql));
      result.created.push(indexName);
    } catch (error: unknown) {
      result.errors.push(`Failed to create index: ${messageOf(error)}`);
    }
  }

  return result;
}

function generateIndexName(table: string, index: IndexDefinition): string {
  const fields = index.fields.join("_");
  return identificador(`idx_${table}_${fields}_${index.type}`);
}

function buildIndexSQL(table: string, name: string, index: IndexDefinition): string {
  const unique = index.unique ? "UNIQUE" : "";
  const fields = index.fields
    .map((f) => {
      // Para JSONB, acceder al campo dentro de data
      const jsonPath = `(data->>'${exigirClaveDeCampo(f)}')`;
      return index.type === "btree" && index.desc ? `${jsonPath} DESC` : jsonPath;
    })
    .join(", ");

  if (!NOMBRE_DE_INDICE.test(name)) throw new Error(`Invalid index name: ${JSON.stringify(name)}`);
  let sql = `CREATE ${unique} INDEX ${name} ON ${table} `;

  if (index.type === "gin") {
    sql += `USING gin (${fields})`;
  } else if (index.type === "gist") {
    sql += `USING gist (${fields})`;
  } else if (index.type === "hash") {
    sql += `USING hash (${fields})`;
  } else {
    sql += `(${fields})`;
  }

  if (index.where) {
    // SQL libre: ya no (ver «SQL DE ÍNDICES SIN INYECCIÓN»)
    throw new Error("Partial indexes (`where`) are not accepted here; add them in a migration");
  }

  return sql;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function extractFieldsFromIndexDef(indexDef: string): string[] {
  // Extraer campos de definición de índice
  const match = indexDef.match(/\((.*?)\)/);
  if (match) {
    return match[1].split(",").map((f) => f.trim());
  }
  return [];
}

function extractTypeFromIndexDef(indexDef: string): IndexType {
  if (indexDef.includes("USING gin")) return "gin";
  if (indexDef.includes("USING gist")) return "gist";
  if (indexDef.includes("USING hash")) return "hash";
  if (indexDef.includes("USING brin")) return "brin";
  return "btree";
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAMING OPTIMIZATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Índices recomendados para datasets de gaming (builds, items, etc.)
 */
export const GAMING_RECOMMENDED_INDEXES: IndexDefinition[] = [
  // Índices para builds
  { type: "btree", fields: ["character_class"], name: "idx_builds_class" },
  { type: "btree", fields: ["level"], name: "idx_builds_level" },
  { type: "btree", fields: ["created_at"], desc: true, name: "idx_builds_created" },
  { type: "gin", fields: ["tags"], name: "idx_builds_tags" },
  { type: "btree", fields: ["author_id", "created_at"], name: "idx_builds_author_created" },

  // Índices para items
  { type: "btree", fields: ["rarity"], name: "idx_items_rarity" },
  { type: "btree", fields: ["item_type"], name: "idx_items_type" },
  { type: "btree", fields: ["base_dps"], desc: true, name: "idx_items_dps" },
  { type: "gin", fields: ["mods"], name: "idx_items_mods" },

  // Índices para búsqueda de texto
  { type: "gin", fields: ["name"], name: "idx_search_name" },
];

/**
 * Configuración de índices para un juego específico
 */
export function getGameIndexConfig(gameType: "poe" | "diablo" | "wow" | "genshin"): IndexConfig {
  const base = {
    indexes: [...GAMING_RECOMMENDED_INDEXES],
    autoDetect: true,
    threshold: 50,
  };

  switch (gameType) {
    case "poe":
      return {
        ...base,
        indexes: [
          ...base.indexes,
          { type: "btree", fields: ["league"], name: "idx_poe_league" },
          { type: "btree", fields: ["ascendancy"], name: "idx_poe_ascendancy" },
          { type: "gin", fields: ["skill_gems"], name: "idx_poe_skills" },
          { type: "btree", fields: ["total_dps"], desc: true, name: "idx_poe_dps" },
        ],
      };

    case "diablo":
      return {
        ...base,
        indexes: [
          ...base.indexes,
          { type: "btree", fields: ["paragon_level"], name: "idx_d4_paragon" },
          { type: "gin", fields: ["paragon_board"], name: "idx_d4_board" },
          { type: "btree", fields: ["tier"], name: "idx_d4_tier" },
        ],
      };

    case "genshin":
      return {
        ...base,
        indexes: [
          ...base.indexes,
          { type: "btree", fields: ["element"], name: "idx_gi_element" },
          { type: "btree", fields: ["constellation"], name: "idx_gi_constellation" },
          { type: "btree", fields: ["artifact_rating"], desc: true, name: "idx_gi_rating" },
        ],
      };

    default:
      return base;
  }
}
