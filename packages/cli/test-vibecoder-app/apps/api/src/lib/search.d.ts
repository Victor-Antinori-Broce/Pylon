/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SEARCH ENGINE - Full-Text + Vector Search con PGVector
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Combina búsqueda full-text tradicional de PostgreSQL con
 * búsqueda semántica usando embeddings y PGVector.
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
export interface SearchOptions {
    query: string;
    datasetId?: string;
    type?: "fulltext" | "vector" | "hybrid";
    limit?: number;
    offset?: number;
    filters?: Record<string, any>;
    sortBy?: "relevance" | "date" | "title";
}
export interface SearchResult {
    id: string;
    title: string;
    content: string;
    type: string;
    datasetId?: string;
    score: number;
    highlights?: string[];
    metadata?: Record<string, any>;
    createdAt: string;
}
export interface VectorDocument {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
    datasetId?: string;
}
/**
 * Inicializa las extensiones necesarias en PostgreSQL
 * Ejecutar una sola vez en setup
 */
export declare function initializeSearchExtensions(): Promise<void>;
/**
 * Crea índices de búsqueda en una tabla
 */
export declare function createSearchIndexes(tableName: string, textColumns: string[]): Promise<void>;
/**
 * Búsqueda full-text tradicional
 */
export declare function searchFullText(options: SearchOptions): Promise<SearchResult[]>;
/**
 * Búsqueda fuzzy usando trigrams (para typos)
 */
export declare function searchFuzzy(query: string, table?: string, column?: string, limit?: number): Promise<{
    id: string;
    title: string;
    similarity: number;
}[]>;
/**
 * Genera embedding usando un servicio externo (OpenAI, local, etc.)
 * En producción, esto llamaría a tu servicio de embeddings
 */
export declare function generateEmbedding(text: string): Promise<number[]>;
/**
 * Crea tabla de vectores para documentos
 */
export declare function createVectorTable(): Promise<void>;
/**
 * Inserta o actualiza un documento vectorial
 */
export declare function upsertVectorDocument(content: string, metadata?: Record<string, any>, options?: {
    id?: string;
    datasetId?: string;
    sourceType?: string;
    sourceId?: string;
    embedding?: number[];
}): Promise<string>;
/**
 * Búsqueda semántica por similitud vectorial
 */
export declare function searchVector(query: string, options?: {
    datasetId?: string;
    limit?: number;
    threshold?: number;
    sourceType?: string;
}): Promise<SearchResult[]>;
/**
 * Búsqueda híbrida: combina full-text + vector
 */
export declare function searchHybrid(options: SearchOptions): Promise<SearchResult[]>;
/**
 * Búsqueda principal unificada
 */
export declare function search(options: SearchOptions): Promise<SearchResult[]>;
export declare const searchRoutes: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=search.d.ts.map