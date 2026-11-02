/**
 * Kitsuden — Capa LLM
 * ============================================================================
 * Caché semántica (estilo GPTCache) y salida estructurada garantizada.
 * Módulos PUROS: todo se inyecta (store, embeddings, provider), así que se
 * testean en memoria y funcionan con cualquier backend.
 */

export {
  SemanticCache,
  memoryStore,
  cosine,
  type CacheStore,
  type EmbeddingProvider,
  type CachedResponse,
  type SemanticCacheOptions,
  type CacheHit,
  type CacheStats,
} from "./semantic-cache";

export {
  generateStructured,
  extractJson,
  toJsonSchema,
  type StructuredProvider,
  type StructuredRequest,
  type StructuredMode,
  type StructuredResult,
  type StructuredOptions,
} from "./structured";
