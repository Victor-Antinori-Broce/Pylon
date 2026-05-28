/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SEARCH ENGINE - Full-Text + Vector Search con PGVector
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Combina búsqueda full-text tradicional de PostgreSQL con
 * búsqueda semántica usando embeddings y PGVector.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
import { requireAuth } from "../middleware/auth";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// FULL-TEXT SEARCH (PostgreSQL tsvector)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inicializa las extensiones necesarias en PostgreSQL
 * Ejecutar una sola vez en setup
 */
export async function initializeSearchExtensions(): Promise<void> {
  try {
    // Habilitar pgvector
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    
    // Habilitar pg_trgm para búsqueda fuzzy
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    
    console.log("✅ Search extensions initialized (vector, pg_trgm)");
  } catch (error) {
    console.error("Failed to initialize search extensions:", error);
    throw error;
  }
}

/**
 * Crea índices de búsqueda en una tabla
 */
export async function createSearchIndexes(tableName: string, textColumns: string[]): Promise<void> {
  const tsvectorColumn = `${tableName}_search_vector`;
  
  // Crear columna tsvector si no existe
  await db.execute(sql`
    ALTER TABLE ${sql.identifier(tableName)} 
    ADD COLUMN IF NOT EXISTS ${sql.identifier(tsvectorColumn)} tsvector
  `);

  // Crear trigger para auto-actualizar tsvector
  const triggerFunction = `
    CREATE OR REPLACE FUNCTION ${tableName}_search_update() RETURNS trigger AS $$
    BEGIN
      NEW.${tsvectorColumn} := to_tsvector('english', 
        ${textColumns.map(col => `COALESCE(NEW.${col}, '')`).join(" || ' ' || ")}
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  
  await db.execute(sql.raw(triggerFunction));

  // Crear trigger
  await db.execute(sql`
    DROP TRIGGER IF EXISTS ${sql.identifier(`${tableName}_search_trigger`)} 
    ON ${sql.identifier(tableName)};
    
    CREATE TRIGGER ${sql.identifier(`${tableName}_search_trigger`)}
    BEFORE INSERT OR UPDATE ON ${sql.identifier(tableName)}
    FOR EACH ROW
    EXECUTE FUNCTION ${sql.identifier(`${tableName}_search_update`)}();
  `);

  // Crear índice GIN
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${sql.identifier(`${tableName}_search_idx`)}
    ON ${sql.identifier(tableName)} USING GIN (${sql.identifier(tsvectorColumn)});
  `);

  // Crear índice para búsqueda fuzzy (trigram)
  for (const column of textColumns) {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ${sql.identifier(`${tableName}_${column}_trgm_idx`)}
      ON ${sql.identifier(tableName)} USING GIN (${sql.identifier(column)} gin_trgm_ops);
    `);
  }

  console.log(`✅ Search indexes created for ${tableName}`);
}

/**
 * Búsqueda full-text tradicional
 */
export async function searchFullText(options: SearchOptions): Promise<SearchResult[]> {
  const { query, limit = 20, offset = 0 } = options;
  
  // Normalizar query para tsquery
  const results = await db.execute<{
    id: string;
    title: string;
    content: string;
    type: string;
    dataset_id: string;
    score: number;
    highlights: string[];
    created_at: string;
  }>(sql`
    SELECT 
      id,
      title,
      content,
      type,
      dataset_id,
      ts_rank_cd(search_vector, query) as score,
      ts_headline('english', content, query, 'MaxFragments=3,MaxWords=50,MinWords=10') as highlights,
      created_at
    FROM data_entries,
    plainto_tsquery('english', ${query}) query
    WHERE search_vector @@ query
    ${options.datasetId ? sql`AND dataset_id = ${options.datasetId}` : sql``}
    ORDER BY score DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return results.rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    datasetId: row.dataset_id,
    score: row.score,
    highlights: row.highlights ? [row.highlights as unknown as string] : undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Búsqueda fuzzy usando trigrams (para typos)
 */
export async function searchFuzzy(
  query: string, 
  table: string = "data_entries",
  column: string = "title",
  limit: number = 10
): Promise<{ id: string; title: string; similarity: number }[]> {
  const results = await db.execute<{
    id: string;
    title: string;
    similarity: number;
  }>(sql`
    SELECT 
      id,
      ${sql.identifier(column)} as title,
      similarity(${sql.identifier(column)}, ${query}) as similarity
    FROM ${sql.identifier(table)}
    WHERE ${sql.identifier(column)} % ${query}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `);

  return results.rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VECTOR SEARCH (PGVector)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera embedding usando un servicio externo (OpenAI, local, etc.)
 * En producción, esto llamaría a tu servicio de embeddings
 */
export async function generateEmbedding(_text: string): Promise<number[]> {
  // TODO: Integrar con servicio real de embeddings (OpenAI, Ollama, etc.)
  // Por ahora retornamos un mock para desarrollo
  
  // Ejemplo de integración con OpenAI:
  // const response = await fetch("https://api.openai.com/v1/embeddings", {
  //   method: "POST",
  //   headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
  //   body: JSON.stringify({ input: text, model: "text-embedding-3-small" })
  // });
  // const data = await response.json();
  // return data.data[0].embedding;
  
  // Mock: vector aleatorio de 384 dimensiones (compatible con all-MiniLM)
  return Array.from({ length: 384 }, () => (Math.random() - 0.5) * 2);
}

/**
 * Crea tabla de vectores para documentos
 */
export async function createVectorTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vector_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,
      embedding VECTOR(384),
      metadata JSONB DEFAULT '{}',
      dataset_id UUID REFERENCES data_sets(id) ON DELETE CASCADE,
      source_type VARCHAR(50),
      source_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Índice HNSW para búsqueda vectorial eficiente
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS vector_documents_embedding_idx 
    ON vector_documents 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);

  // Índices adicionales
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS vector_documents_dataset_idx ON vector_documents(dataset_id);
    CREATE INDEX IF NOT EXISTS vector_documents_source_idx ON vector_documents(source_type, source_id);
  `);

  console.log("✅ Vector documents table created");
}

/**
 * Inserta o actualiza un documento vectorial
 */
export async function upsertVectorDocument(
  content: string,
  metadata: Record<string, any> = {},
  options: {
    id?: string;
    datasetId?: string;
    sourceType?: string;
    sourceId?: string;
    embedding?: number[];
  } = {}
): Promise<string> {
  const embedding = options.embedding || await generateEmbedding(content);
  const embeddingLiteral = `[${embedding.join(",")}]`;

  if (options.id) {
    // Update
    await db.execute(sql`
      UPDATE vector_documents
      SET 
        content = ${content},
        embedding = ${sql.raw(embeddingLiteral)}::vector,
        metadata = ${JSON.stringify(metadata)}::jsonb,
        updated_at = NOW()
      WHERE id = ${options.id}
    `);
    return options.id;
  } else {
    // Insert
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO vector_documents (content, embedding, metadata, dataset_id, source_type, source_id)
      VALUES (
        ${content},
        ${sql.raw(embeddingLiteral)}::vector,
        ${JSON.stringify(metadata)}::jsonb,
        ${options.datasetId || null},
        ${options.sourceType || null},
        ${options.sourceId || null}
      )
      RETURNING id
    `);
    return result.rows[0].id;
  }
}

/**
 * Búsqueda semántica por similitud vectorial
 */
export async function searchVector(
  query: string,
  options: {
    datasetId?: string;
    limit?: number;
    threshold?: number;
    sourceType?: string;
  } = {}
): Promise<SearchResult[]> {
  const { limit = 10, threshold = 0.7 } = options;
  
  const queryEmbedding = await generateEmbedding(query);
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute<{
    id: string;
    content: string;
    metadata: Record<string, any>;
    dataset_id: string;
    source_type: string;
    similarity: number;
    created_at: string;
  }>(sql`
    SELECT 
      id,
      content,
      metadata,
      dataset_id,
      source_type,
      1 - (embedding <=> ${sql.raw(embeddingLiteral)}::vector) as similarity,
      created_at
    FROM vector_documents
    WHERE embedding IS NOT NULL
    ${options.datasetId ? sql`AND dataset_id = ${options.datasetId}` : sql``}
    ${options.sourceType ? sql`AND source_type = ${options.sourceType}` : sql``}
    ORDER BY embedding <=> ${sql.raw(embeddingLiteral)}::vector
    LIMIT ${limit}
  `);

  return results.rows
    .filter(row => row.similarity >= threshold)
    .map(row => ({
      id: row.id,
      title: row.metadata?.title || row.content.slice(0, 100),
      content: row.content,
      type: row.source_type || "vector_doc",
      datasetId: row.dataset_id,
      score: row.similarity,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
}

/**
 * Búsqueda híbrida: combina full-text + vector
 */
export async function searchHybrid(options: SearchOptions): Promise<SearchResult[]> {
  // Ejecutar ambas búsquedas en paralelo
  const [fulltextResults, vectorResults] = await Promise.all([
    searchFullText({ ...options, limit: (options.limit || 10) * 2 }),
    searchVector(options.query, {
      datasetId: options.datasetId,
      limit: (options.limit || 10) * 2,
    }),
  ]);

  // Combinar y deduplicar resultados
  const seen = new Set<string>();
  const combined: SearchResult[] = [];

  // Normalizar scores (0-1)
  const maxFulltextScore = Math.max(...fulltextResults.map(r => r.score), 1);
  const maxVectorScore = Math.max(...vectorResults.map(r => r.score), 1);

  // Agregar full-text con peso 0.6
  for (const result of fulltextResults) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      combined.push({
        ...result,
        score: (result.score / maxFulltextScore) * 0.6,
      });
    }
  }

  // Agregar vector con peso 0.4
  for (const result of vectorResults) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      combined.push({
        ...result,
        score: (result.score / maxVectorScore) * 0.4,
      });
    } else {
      // Boost existing result
      const existing = combined.find(r => r.id === result.id);
      if (existing) {
        existing.score += (result.score / maxVectorScore) * 0.4;
      }
    }
  }

  // Ordenar por score combinado y limitar
  return combined
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 10);
}

/**
 * Búsqueda principal unificada
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  const searchType = options.type || "hybrid";

  switch (searchType) {
    case "fulltext":
      return searchFullText(options);
    case "vector":
      return searchVector(options.query, {
        datasetId: options.datasetId,
        limit: options.limit,
      });
    case "hybrid":
    default:
      return searchHybrid(options);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

export const searchRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * POST /api/search - Búsqueda unificada
 */
searchRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const options: SearchOptions = {
    query: body.query,
    type: body.type || "hybrid",
    limit: Math.min(body.limit || 20, 100),
    offset: body.offset || 0,
    datasetId: body.datasetId,
    filters: body.filters,
    sortBy: body.sortBy || "relevance",
  };

  if (!options.query || options.query.length < 2) {
    return c.json({ error: "Query must be at least 2 characters" }, 400);
  }

  try {
    const results = await search(options);
    return c.json({
      results,
      total: results.length,
      query: options.query,
      type: options.type,
    });
  } catch (error) {
    console.error("Search error:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});

/**
 * GET /api/search/suggestions - Autocomplete
 */
searchRoutes.get("/suggestions", async (c) => {
  const query = c.req.query("q") || "";
  const limit = Math.min(Number(c.req.query("limit")) || 5, 10);

  if (query.length < 2) {
    return c.json({ suggestions: [] });
  }

  try {
    // Búsqueda fuzzy rápida
    const results = await searchFuzzy(query, "data_entries", "title", limit);
    
    return c.json({
      suggestions: results.map(r => ({
        text: r.title,
        similarity: r.similarity,
      })),
    });
  } catch (error) {
    return c.json({ suggestions: [] });
  }
});

/**
 * POST /api/search/index - Indexar contenido (para admins)
 */
searchRoutes.post("/index", requireAuth, async (c) => {
  const body = await c.req.json();
  
  try {
    const id = await upsertVectorDocument(body.content, body.metadata, {
      id: body.id,
      datasetId: body.datasetId,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
    });

    return c.json({ success: true, id });
  } catch (error) {
    console.error("Index error:", error);
    return c.json({ error: "Failed to index document" }, 500);
  }
});

/**
 * GET /api/search/stats - Estadísticas de búsqueda
 */
searchRoutes.get("/stats", requireAuth, async (c) => {
  try {
    const [vectorCount, tableInfo] = await Promise.all([
      db.execute<{ count: number }>(sql`SELECT COUNT(*) as count FROM vector_documents`),
      db.execute<{ tablename: string; hassearch: boolean }>(sql`
        SELECT 
          tablename,
          EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = c.relname AND indexdef LIKE '%gin%'
          ) as hassearch
        FROM pg_tables t
        JOIN pg_class c ON c.relname = t.tablename
        WHERE schemaname = 'public'
      `),
    ]);

    return c.json({
      vectorDocuments: vectorCount.rows[0]?.count || 0,
      indexedTables: tableInfo.rows.filter(r => r.hassearch).map(r => r.tablename),
    });
  } catch (error) {
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

/**
 * POST /api/search/init - Inicializar búsqueda (setup)
 */
searchRoutes.post("/init", requireAuth, async (c) => {
  try {
    await initializeSearchExtensions();
    await createVectorTable();
    
    // Crear índices para tablas principales
    await createSearchIndexes("data_entries", ["title", "content"]);
    await createSearchIndexes("blog_posts", ["title", "excerpt", "content"]);
    await createSearchIndexes("games", ["title", "description"]);

    return c.json({ success: true, message: "Search initialized successfully" });
  } catch (error) {
    console.error("Init error:", error);
    return c.json({ error: "Failed to initialize search" }, 500);
  }
});
