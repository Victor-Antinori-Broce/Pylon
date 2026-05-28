// @ts-nocheck
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
import { z } from "zod";
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
/**
 * Analiza el schema de un dataset y sugiere índices óptimos
 */
export function suggestIndexesForDataset(datasetSlug, schema) {
    const suggestions = [];
    for (const field of schema.fields) {
        const suggestion = analyzeFieldForIndex(datasetSlug, field);
        if (suggestion) {
            suggestions.push(suggestion);
        }
    }
    return suggestions;
}
function analyzeFieldForIndex(table, field) {
    const fieldName = field.key || field.name;
    // Reglas de sugerencia basadas en tipo de campo
    switch (field.type) {
        case "relation":
        case "select":
            // Campos de relación y select son frecuentemente filtrados
            return {
                id: `idx_${table}_${fieldName}_btree`,
                table,
                field: fieldName,
                type: "btree",
                confidence: "high",
                reason: `Foreign key / Select field frequently filtered in queries`,
                estimatedQueries: 100,
                estimatedImprovement: "60-80%",
                sql: `CREATE INDEX idx_${table}_${fieldName}_btree ON data_entries ((data->>'${fieldName}'));`,
                createdAt: new Date().toISOString(),
            };
        case "text":
            if (field.validation?.pattern || field.unique) {
                // Campos con pattern o unique son buenos candidatos
                return {
                    id: `idx_${table}_${fieldName}_gin`,
                    table,
                    field: fieldName,
                    type: "gin",
                    confidence: "medium",
                    reason: `Text field with validation pattern, suitable for GIN index`,
                    estimatedQueries: 50,
                    estimatedImprovement: "40-60%",
                    sql: `CREATE INDEX idx_${table}_${fieldName}_gin ON data_entries USING gin ((data->>'${fieldName}') gin_trgm_ops);`,
                    createdAt: new Date().toISOString(),
                };
            }
            break;
        case "number":
            // Números son frecuentemente usados en rangos y sorting
            return {
                id: `idx_${table}_${fieldName}_btree`,
                table,
                field: fieldName,
                type: "btree",
                confidence: "medium",
                reason: `Numeric field often used for range queries and sorting`,
                estimatedQueries: 75,
                estimatedImprovement: "50-70%",
                sql: `CREATE INDEX idx_${table}_${fieldName}_btree ON data_entries (((data->>'${fieldName}')::numeric));`,
                createdAt: new Date().toISOString(),
            };
        case "date":
        case "datetime":
            // Fechas son casi siempre filtradas y ordenadas
            return {
                id: `idx_${table}_${fieldName}_btree`,
                table,
                field: fieldName,
                type: "btree",
                confidence: "high",
                reason: `Date field frequently used for range queries`,
                estimatedQueries: 150,
                estimatedImprovement: "70-90%",
                sql: `CREATE INDEX idx_${table}_${fieldName}_btree ON data_entries (((data->>'${fieldName}')::timestamp));`,
                createdAt: new Date().toISOString(),
            };
        case "multiselect":
        case "tags":
            // Arrays son perfectos para GIN
            return {
                id: `idx_${table}_${fieldName}_gin`,
                table,
                field: fieldName,
                type: "gin",
                confidence: "high",
                reason: `Array/Tags field, GIN index optimal for containment queries`,
                estimatedQueries: 80,
                estimatedImprovement: "80-95%",
                sql: `CREATE INDEX idx_${table}_${fieldName}_gin ON data_entries USING gin ((data->'${fieldName}'));`,
                createdAt: new Date().toISOString(),
            };
    }
    return null;
}
/**
 * Obtiene estadísticas actuales de índices
 */
export async function getIndexStats(ctx) {
    const { db } = ctx;
    const result = await db.instance.execute(sql `
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef,
      pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_indexes 
    JOIN pg_stat_user_indexes USING (indexrelname)
    WHERE schemaname = 'public'
    AND tablename IN ('data_entries', 'data_sets')
    ORDER BY pg_relation_size(indexrelid) DESC;
  `);
    return result.rows.map((row) => ({
        name: row.indexname,
        table: row.tablename,
        fields: extractFieldsFromIndexDef(row.indexdef),
        type: extractTypeFromIndexDef(row.indexdef),
        size: row.size,
        scans: 0, // Requiere pg_stat_statements
        rowsRead: 0,
        lastUsed: null,
        isUsed: true,
    }));
}
/**
 * Crea un índice en la base de datos
 */
export async function createIndex(ctx, suggestion) {
    try {
        await ctx.db.instance.execute(sql.raw(suggestion.sql));
        ctx.logger.info(`📈 Created index: ${suggestion.id}`);
        return true;
    }
    catch (error) {
        ctx.logger.error(`Failed to create index ${suggestion.id}:`, error);
        return false;
    }
}
/**
 * Elimina un índice
 */
export async function dropIndex(ctx, indexName) {
    try {
        await ctx.db.instance.execute(sql `DROP INDEX IF EXISTS ${sql.identifier(indexName)}`);
        ctx.logger.info(`🗑️ Dropped index: ${indexName}`);
        return true;
    }
    catch (error) {
        ctx.logger.error(`Failed to drop index ${indexName}:`, error);
        return false;
    }
}
/**
 * Aplica índices sugeridos automáticamente
 */
export async function applyAutoIndexes(ctx, suggestions, minConfidence = "high") {
    const result = { created: [], failed: [] };
    const confidenceLevels = { high: 2, medium: 1, low: 0 };
    const minLevel = confidenceLevels[minConfidence];
    for (const suggestion of suggestions) {
        if (confidenceLevels[suggestion.confidence] >= minLevel) {
            const success = await createIndex(ctx, suggestion);
            if (success) {
                result.created.push(suggestion.id);
            }
            else {
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
export async function analyzeQueryPerformance(ctx, datasetId) {
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
    const schema = dataset.schema;
    const stats = [];
    for (const field of schema?.fields || []) {
        const fieldName = field.key || field.name;
        // Simular análisis (en producción esto leería de pg_stat_statements)
        const fieldStats = {
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
export async function generateIndexReport(ctx) {
    const existing = await getIndexStats(ctx);
    const suggested = [];
    // Analizar todos los datasets
    const { dataSets } = await import("./datasets.schema");
    const datasets = await ctx.db.instance.select().from(dataSets);
    for (const dataset of datasets) {
        const schema = dataset.schema;
        if (schema?.fields) {
            const dsSuggestions = suggestIndexesForDataset(dataset.slug, schema);
            suggested.push(...dsSuggestions);
        }
    }
    // Filtrar sugerencias que ya existen
    const existingNames = new Set(existing.map((e) => e.name));
    const newSuggestions = suggested.filter((s) => !existingNames.has(s.id));
    // Detectar índices no usados (mock - en prod usar pg_stat_user_indexes)
    const unused = existing
        .filter((e) => e.scans === 0 && !e.name.includes("primary"))
        .map((e) => e.name);
    const recommendations = [];
    if (newSuggestions.length > 0) {
        recommendations.push(`Create ${newSuggestions.length} suggested indexes for better performance`);
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
export async function applyIndexConfig(ctx, datasetId, config) {
    const result = { created: [], removed: [], errors: [] };
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
            const indexName = index.name || generateIndexName(dataset.slug, index);
            const indexSql = buildIndexSQL("data_entries", indexName, index);
            await db.instance.execute(sql.raw(indexSql));
            result.created.push(indexName);
        }
        catch (error) {
            result.errors.push(`Failed to create index: ${error.message}`);
        }
    }
    return result;
}
function generateIndexName(table, index) {
    const fields = index.fields.join("_");
    return `idx_${table}_${fields}_${index.type}`;
}
function buildIndexSQL(table, name, index) {
    const unique = index.unique ? "UNIQUE" : "";
    const fields = index.fields.map((f) => {
        // Para JSONB, acceder al campo dentro de data
        const jsonPath = `(data->>'${f}')`;
        return index.type === "btree" && index.desc ? `${jsonPath} DESC` : jsonPath;
    }).join(", ");
    let sql = `CREATE ${unique} INDEX ${name} ON ${table} `;
    if (index.type === "gin") {
        sql += `USING gin (${fields})`;
    }
    else if (index.type === "gist") {
        sql += `USING gist (${fields})`;
    }
    else if (index.type === "hash") {
        sql += `USING hash (${fields})`;
    }
    else {
        sql += `(${fields})`;
    }
    if (index.where) {
        sql += ` WHERE ${index.where}`;
    }
    return sql;
}
// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function extractFieldsFromIndexDef(indexDef) {
    // Extraer campos de definición de índice
    const match = indexDef.match(/\((.*?)\)/);
    if (match) {
        return match[1].split(",").map((f) => f.trim());
    }
    return [];
}
function extractTypeFromIndexDef(indexDef) {
    if (indexDef.includes("USING gin"))
        return "gin";
    if (indexDef.includes("USING gist"))
        return "gist";
    if (indexDef.includes("USING hash"))
        return "hash";
    if (indexDef.includes("USING brin"))
        return "brin";
    return "btree";
}
// ═══════════════════════════════════════════════════════════════════════════════
// GAMING OPTIMIZATIONS
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Índices recomendados para datasets de gaming (builds, items, etc.)
 */
export const GAMING_RECOMMENDED_INDEXES = [
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
export function getGameIndexConfig(gameType) {
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
//# sourceMappingURL=datasets.indexes.js.map