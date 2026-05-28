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
import type { GrimoireContext } from "@gremius/shared";
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
export declare const indexDefinitionSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodDefault<z.ZodEnum<["btree", "gin", "gist", "hash", "brin"]>>;
    fields: z.ZodArray<z.ZodString, "many">;
    where: z.ZodOptional<z.ZodString>;
    unique: z.ZodDefault<z.ZodBoolean>;
    desc: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    desc: boolean;
    type: "btree" | "hash" | "gist" | "gin" | "brin";
    fields: string[];
    unique: boolean;
    name?: string | undefined;
    where?: string | undefined;
}, {
    fields: string[];
    name?: string | undefined;
    desc?: boolean | undefined;
    where?: string | undefined;
    type?: "btree" | "hash" | "gist" | "gin" | "brin" | undefined;
    unique?: boolean | undefined;
}>;
export declare const indexConfigSchema: z.ZodObject<{
    indexes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        type: z.ZodDefault<z.ZodEnum<["btree", "gin", "gist", "hash", "brin"]>>;
        fields: z.ZodArray<z.ZodString, "many">;
        where: z.ZodOptional<z.ZodString>;
        unique: z.ZodDefault<z.ZodBoolean>;
        desc: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        desc: boolean;
        type: "btree" | "hash" | "gist" | "gin" | "brin";
        fields: string[];
        unique: boolean;
        name?: string | undefined;
        where?: string | undefined;
    }, {
        fields: string[];
        name?: string | undefined;
        desc?: boolean | undefined;
        where?: string | undefined;
        type?: "btree" | "hash" | "gist" | "gin" | "brin" | undefined;
        unique?: boolean | undefined;
    }>, "many">>;
    autoDetect: z.ZodDefault<z.ZodBoolean>;
    threshold: z.ZodDefault<z.ZodNumber>;
    excludeFields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    threshold: number;
    indexes: {
        desc: boolean;
        type: "btree" | "hash" | "gist" | "gin" | "brin";
        fields: string[];
        unique: boolean;
        name?: string | undefined;
        where?: string | undefined;
    }[];
    autoDetect: boolean;
    excludeFields: string[];
}, {
    threshold?: number | undefined;
    indexes?: {
        fields: string[];
        name?: string | undefined;
        desc?: boolean | undefined;
        where?: string | undefined;
        type?: "btree" | "hash" | "gist" | "gin" | "brin" | undefined;
        unique?: boolean | undefined;
    }[] | undefined;
    autoDetect?: boolean | undefined;
    excludeFields?: string[] | undefined;
}>;
/**
 * Analiza el schema de un dataset y sugiere índices óptimos
 */
export declare function suggestIndexesForDataset(datasetSlug: string, schema: {
    fields: any[];
}): IndexSuggestion[];
/**
 * Obtiene estadísticas actuales de índices
 */
export declare function getIndexStats(ctx: GrimoireContext): Promise<IndexStats[]>;
/**
 * Crea un índice en la base de datos
 */
export declare function createIndex(ctx: GrimoireContext, suggestion: IndexSuggestion): Promise<boolean>;
/**
 * Elimina un índice
 */
export declare function dropIndex(ctx: GrimoireContext, indexName: string): Promise<boolean>;
/**
 * Aplica índices sugeridos automáticamente
 */
export declare function applyAutoIndexes(ctx: GrimoireContext, suggestions: IndexSuggestion[], minConfidence?: "high" | "medium"): Promise<{
    created: string[];
    failed: string[];
}>;
/**
 * Analiza el rendimiento de queries en un dataset
 */
export declare function analyzeQueryPerformance(ctx: GrimoireContext, datasetId: string): Promise<QueryStats[]>;
/**
 * Genera reporte de índices recomendados
 */
export declare function generateIndexReport(ctx: GrimoireContext): Promise<{
    existing: IndexStats[];
    suggested: IndexSuggestion[];
    unused: string[];
    recommendations: string[];
}>;
/**
 * Aplica configuración declarativa de índices a un dataset
 */
export declare function applyIndexConfig(ctx: GrimoireContext, datasetId: string, config: IndexConfig): Promise<{
    created: string[];
    removed: string[];
    errors: string[];
}>;
/**
 * Índices recomendados para datasets de gaming (builds, items, etc.)
 */
export declare const GAMING_RECOMMENDED_INDEXES: IndexDefinition[];
/**
 * Configuración de índices para un juego específico
 */
export declare function getGameIndexConfig(gameType: "poe" | "diablo" | "wow" | "genshin"): IndexConfig;
//# sourceMappingURL=datasets.indexes.d.ts.map