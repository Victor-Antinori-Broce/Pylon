/**
 * Kitsuden — Caché de LLM del host (semántica cuando hay embeddings)
 * ============================================================================
 *
 * Cablea la `SemanticCache` del engine con la infraestructura real: Valkey
 * como store y el `vector-search` de core como proveedor de embeddings.
 *
 * Degradación en dos escalones, ninguno rompe la petición:
 *   Valkey + embeddings → caché semántica (acierta con reformulaciones)
 *   Valkey sin embeddings → caché exacta (como antes)
 *   Valkey caído → sin caché
 *   Sin VALKEY_URL (instancia única) → el mismo store en la memoria del proceso
 */

// Se usa el alias LLMEmbeddingProvider: el nombre EmbeddingProvider a secas
// colisiona con el del Brain, que tiene otra forma.
import { SemanticCache, type CacheStore, type LLMEmbeddingProvider } from "@kitsuden/engine";

import { memoriaDel, memoriaGet, memoriaKeys, memoriaSet } from "../lib/cache-en-memoria";
import { getValkeyClient, isValkeyAvailable, valkeyConfigurado } from "../lib/valkey";

/** Store en memoria: el de instancia única, sin Valkey. */
const memoriaStore: CacheStore = {
  get: async (key) => memoriaGet(key),
  set: async (key, value, ttlSeconds) => memoriaSet(key, value, ttlSeconds),
  keys: async (pattern) => memoriaKeys(pattern).slice(0, 500),
  del: async (key) => memoriaDel(key),
};

/** Store sobre Valkey. Cada método falla en silencio: la caché es un extra. */
const soloValkey: CacheStore = {
  async get(key) {
    if (!(await isValkeyAvailable())) return null;
    const client = await getValkeyClient();
    const value = await client.get(key);
    return typeof value === "string" ? value : null;
  },

  async set(key, value, ttlSeconds) {
    if (!(await isValkeyAvailable())) return;
    const client = await getValkeyClient();
    await client.set(key, value, { EX: ttlSeconds });
  },

  async keys(pattern) {
    if (!(await isValkeyAvailable())) return [];
    const client = await getValkeyClient();
    // SCAN en vez de KEYS: KEYS bloquea el servidor con datasets grandes.
    const found: string[] = [];
    let cursor = "0";
    do {
      const res: any = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = String(res.cursor ?? res[0] ?? "0");
      const batch: string[] = res.keys ?? res[1] ?? [];
      found.push(...batch);
      // Cota dura: el barrido semántico no debe degenerar en un escaneo total.
      if (found.length >= 500) break;
    } while (cursor !== "0");
    return found;
  },

  async del(key) {
    if (!(await isValkeyAvailable())) return;
    const client = await getValkeyClient();
    await client.del(key);
  },
};

/** Valkey si está configurado; si no, la memoria del proceso. */
const valkeyStore: CacheStore = {
  get: (key) => (valkeyConfigurado() ? soloValkey : memoriaStore).get(key),
  set: (key, value, ttl) => (valkeyConfigurado() ? soloValkey : memoriaStore).set(key, value, ttl),
  keys: (pattern) => (valkeyConfigurado() ? soloValkey : memoriaStore).keys(pattern),
  del: (key) => (valkeyConfigurado() ? soloValkey : memoriaStore).del(key),
};

/**
 * Proveedor de embeddings desde @kitsuden/core. Se resuelve una vez, de forma
 * perezosa: si no hay OPENAI_API_KEY, `isEmbeddingAvailable` es false y la
 * caché queda en modo exacto.
 */
let _embeddings: LLMEmbeddingProvider | null | undefined;

async function resolveEmbeddings(): Promise<LLMEmbeddingProvider | undefined> {
  if (_embeddings !== undefined) return _embeddings ?? undefined;

  try {
    const mod: any = await import("../../../../packages/core/vector-search/embeddings");
    if (!mod.isEmbeddingAvailable?.()) {
      _embeddings = null;
      return undefined;
    }
    _embeddings = { embed: (text: string) => mod.generateEmbedding(text) };
    return _embeddings;
  } catch {
    _embeddings = null;
    return undefined;
  }
}

let _cache: SemanticCache | null = null;

/** Instancia compartida. La primera llamada decide si hay modo semántico. */
export async function getLlmCache(): Promise<SemanticCache> {
  if (_cache) return _cache;

  const embeddings = await resolveEmbeddings();
  _cache = new SemanticCache({
    store: valkeyStore,
    embeddings,
    // 0.95: un falso positivo devuelve una respuesta EQUIVOCADA al usuario,
    // que es mucho peor que pagar otra llamada al modelo.
    threshold: Number(process.env.LLM_CACHE_THRESHOLD) || 0.95,
    ttlSeconds: Number(process.env.LLM_CACHE_TTL) || 3600,
  });

  console.log(
    `  🧠 Caché LLM: ${embeddings ? "semántica (embeddings activos)" : "exacta (sin embeddings)"}`
  );
  return _cache;
}

/** Invalida la caché de un agente (llamar al cambiar su system prompt). */
export async function invalidateAgentCache(agentId: string): Promise<number> {
  const cache = await getLlmCache();
  return cache.invalidate(agentId);
}
