/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRIMOIRE: AI Memories (pgvector Integration)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * El "Cerebro de IA" de Gremius. Almacena embeddings vectoriales para
 * búsqueda semántica, memoria conversacional y RAG (Retrieval Augmented Generation).
 *
 * Tecnología: pgvector extension para PostgreSQL
 * Dimensiones: 1536 (OpenAI text-embedding-3-small standard)
 *
 * Tablas:
 *   - ai_memories: Almacena contenido con su embedding vectorial
 *   - ai_memory_chunks: Fragmentos de documentos grandes (chunking)
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  vector, // Native pgvector support in drizzle-orm
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════
// Tabla Principal: AI Memories
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Memoria semántica principal del sistema AI.
 *
 * Cada registro representa un "recuerdo" o conocimiento indexado
 * con su representación vectorial para búsqueda por similitud.
 */
export const aiMemories = pgTable(
  "ai_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Contenido semántico
    content: text("content").notNull(),

    // Embedding vectorial (1536 dims = OpenAI text-embedding-3-small)
    // IMPORTANTE: Requiere CREATE EXTENSION vector; en PostgreSQL
    embedding: vector("embedding", { dimensions: 1536 }),

    // Metadatos flexibles (source, author, tags, etc.)
    metadata: jsonb("metadata").$type<{
      source?: string; // ej: "user-upload", "web-scrape", "manual-entry"
      sourceId?: string; // ID del documento origen
      author?: string;
      title?: string;
      url?: string;
      tags?: string[];
      category?: string;
      confidence?: number; // Confianza del embedding (0-1)
      [key: string]: any;
    }>(),

    // Tipo de memoria para filtrado
    memoryType: varchar("memory_type", { length: 50 }).default("knowledge").notNull(),
    // "knowledge" | "conversation" | "document" | "search-cache"

    // Relación opcional con usuario creador
    createdById: uuid("created_by_id"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    // TTL para memorias temporales (null = permanente)
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    // Índice para búsqueda por similitud vectorial (IVFFlat - aproximado, rápido)
    // Nota: Requiere CREATE EXTENSION vector;
    embeddingIndex: index("ai_memories_embedding_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops")
    ),

    // Índices para filtros comunes
    memoryTypeIdx: index("ai_memories_type_idx").on(table.memoryType),
    createdAtIdx: index("ai_memories_created_idx").on(table.createdAt),
    // Nota: Para índice en metadata->>source usar:
    // CREATE INDEX ai_memories_source_idx ON ai_memories USING btree ((metadata->>'source'));
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Tabla de Fragmentos (Chunking para documentos grandes)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fragmentos de documentos grandes.
 *
 * Cuando un documento excede el límite de tokens para embeddings,
 * se divide en chunks solapados para preservar contexto.
 */
export const aiMemoryChunks = pgTable(
  "ai_memory_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Relación con la memoria padre
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => aiMemories.id, { onDelete: "cascade" }),

    // Contenido del fragmento
    content: text("content").notNull(),

    // Embedding del fragmento (mismas dimensiones)
    embedding: vector("embedding", { dimensions: 1536 }),

    // Posición en el documento original
    chunkIndex: integer("chunk_index").notNull(), // 0, 1, 2...
    totalChunks: integer("total_chunks").notNull(), // Total de chunks

    // Metadatos específicos del chunk
    metadata: jsonb("metadata").$type<{
      startOffset?: number; // Posición carácter inicio
      endOffset?: number; // Posición carácter fin
      overlapBefore?: number; // Caracteres solapados con chunk anterior
      overlapAfter?: number; // Caracteres solapados con chunk siguiente
    }>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Índice para búsqueda vectorial en chunks
    chunkEmbeddingIdx: index("ai_chunks_embedding_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops")
    ),
    // Índice para recuperar todos los chunks de una memoria
    memoryIdIdx: index("ai_chunks_memory_idx").on(table.memoryId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Relaciones
// ═══════════════════════════════════════════════════════════════════════════

export const aiMemoriesRelations = relations(aiMemories, ({ many }) => ({
  chunks: many(aiMemoryChunks),
}));

export const aiMemoryChunksRelations = relations(aiMemoryChunks, ({ one }) => ({
  memory: one(aiMemories, {
    fields: [aiMemoryChunks.memoryId],
    references: [aiMemories.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Tipos TypeScript (inferidos)
// ═══════════════════════════════════════════════════════════════════════════

export type AiMemory = typeof aiMemories.$inferSelect;
export type AiMemoryInsert = typeof aiMemories.$inferInsert;
export type AiMemoryChunk = typeof aiMemoryChunks.$inferSelect;
export type AiMemoryChunkInsert = typeof aiMemoryChunks.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// Notas de Implementación
// ═══════════════════════════════════════════════════════════════════════════
/**
 * BÚSQUEDA POR SIMILITUD:
 *
 * Ejemplo de consulta SQL para búsqueda semántica:
 *
 * ```sql
 * SELECT id, content, metadata,
 *        embedding <=> '[...vector...]' AS distance
 * FROM ai_memories
 * WHERE memory_type = 'knowledge'
 * ORDER BY embedding <=> '[...vector...]'
 * LIMIT 5;
 * ```
 *
 * Operadores pgvector:
 *   - <=> : Distancia euclidiana (L2)
 *   - <-> : Distancia Manhattan (L1)
 *   - <=| : Distancia del coseno (1 - cosine similarity)
 *   - <#> : Producto interno negativo
 *
 * En Drizzle ORM:
 * ```typescript
 * const results = await db
 *   .select({
 *     id: aiMemories.id,
 *     content: aiMemories.content,
 *     distance: sql`embedding <=> ${embeddingVector}`,
 *   })
 *   .from(aiMemories)
 *   .orderBy(sql`embedding <=> ${embeddingVector}`)
 *   .limit(5);
 * ```
 *
 * ÍNDICES DISPONIBLES:
 *   - ivfflat : Búsqueda aproximada rápida (recomendado para >100k vectores)
 *   - hnsw : Búsqueda aproximada más precisa pero más lenta en escritura
 *
 * MIGRACIÓN INICIAL REQUERIDA:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 */
