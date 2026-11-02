/**
 * Kitsuden — Caché semántica de LLM (estilo GPTCache)
 * ============================================================================
 *
 * La caché exacta (hash del prompt) falla en cuanto el usuario reformula:
 * "¿cómo hago un kon?" y "cómo creo un kon?" son dos llamadas al modelo
 * aunque la respuesta sea idéntica. En asistentes conversacionales una parte
 * grande del tráfico son reformulaciones — es dinero y latencia tirados.
 *
 * Esta capa embebe la consulta y busca por SIMILITUD del coseno. Si encuentra
 * una entrada suficientemente parecida, devuelve su respuesta sin llamar al
 * modelo.
 *
 * DISEÑO — dos decisiones que importan:
 *
 *   1. EXACTA PRIMERO, SEMÁNTICA DESPUÉS. El lookup exacto es O(1) y gratis;
 *      solo si falla se paga el embedding. Así el caso repetido literal (que
 *      es frecuente) no cuesta nada extra.
 *
 *   2. TODO INYECTADO. El engine no sabe de Valkey ni de OpenAI: recibe un
 *      `CacheStore` y un `EmbeddingProvider`. Eso lo hace testeable en memoria
 *      y permite cambiar de backend sin tocarlo.
 *
 * SEGURIDAD: el `scope` particiona la caché. Nunca se comparten respuestas
 * entre scopes distintos — un agente de un tenant no puede leer la respuesta
 * cacheada de otro.
 */

// ── Contratos inyectados ─────────────────────────────────────────────────────

/** Almacén clave-valor (Valkey en producción, Map en tests). */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Claves por prefijo — para el barrido semántico. */
  keys(pattern: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Lo que se guarda y se devuelve. */
export interface CachedResponse {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface SemanticCacheOptions {
  store: CacheStore;
  /** Sin proveedor, la caché funciona en modo exacto (degradación limpia). */
  embeddings?: EmbeddingProvider;
  /**
   * Umbral de similitud coseno para considerar un acierto. 0.95 es
   * deliberadamente alto: un falso positivo devuelve una respuesta INCORRECTA
   * al usuario, que es mucho peor que pagar otra llamada al modelo.
   */
  threshold?: number;
  ttlSeconds?: number;
  /** Máximo de entradas a comparar por búsqueda (coste del barrido). */
  maxCandidates?: number;
}

export interface CacheHit extends CachedResponse {
  /** "exact" (hash) o "semantic" (similitud). */
  hit: "exact" | "semantic";
  /** Similitud del acierto semántico (1 en el exacto). */
  similarity: number;
}

export interface CacheStats {
  lookups: number;
  exactHits: number;
  semanticHits: number;
  misses: number;
  /** Tokens de entrada ahorrados por aciertos. */
  tokensSaved: number;
}

// ── Similitud ────────────────────────────────────────────────────────────────

/** Coseno entre dos vectores. Devuelve 0 si alguno es nulo. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Hash estable (FNV-1a) para la clave exacta — sin dependencias de crypto. */
function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ── Caché ────────────────────────────────────────────────────────────────────

export class SemanticCache {
  private store: CacheStore;
  private embeddings?: EmbeddingProvider;
  private threshold: number;
  private ttl: number;
  private maxCandidates: number;
  private stats: CacheStats = {
    lookups: 0,
    exactHits: 0,
    semanticHits: 0,
    misses: 0,
    tokensSaved: 0,
  };

  constructor(options: SemanticCacheOptions) {
    this.store = options.store;
    this.embeddings = options.embeddings;
    this.threshold = options.threshold ?? 0.95;
    this.ttl = options.ttlSeconds ?? 3600;
    this.maxCandidates = options.maxCandidates ?? 200;
  }

  /** Clave del lookup exacto. */
  private exactKey(scope: string, query: string): string {
    return `llmcache:${scope}:x:${hash(query)}`;
  }

  /** Prefijo de las entradas con vector, para el barrido semántico. */
  private vectorPrefix(scope: string): string {
    return `llmcache:${scope}:v:`;
  }

  /**
   * Busca una respuesta cacheada.
   *
   * `query` debe ser el texto que representa semánticamente la petición
   * (típicamente el último mensaje del usuario), NO el prompt completo
   * serializado: un system prompt de 2.000 tokens diluiría la señal.
   *
   * `scope` particiona la caché — usa algo como `${agentId}:${model}` para no
   * mezclar respuestas de agentes o modelos distintos.
   */
  async lookup(scope: string, query: string): Promise<CacheHit | null> {
    this.stats.lookups++;

    // 1. Exacta: O(1) y sin coste de embedding.
    try {
      const raw = await this.store.get(this.exactKey(scope, query));
      if (raw) {
        const value = JSON.parse(raw) as CachedResponse;
        this.stats.exactHits++;
        this.stats.tokensSaved += value.tokensIn;
        return { ...value, hit: "exact", similarity: 1 };
      }
    } catch {
      // Un fallo de la caché nunca debe romper la petición: se sigue de largo.
    }

    // 2. Semántica: solo si hay proveedor de embeddings.
    if (!this.embeddings) {
      this.stats.misses++;
      return null;
    }

    try {
      const vector = await this.embeddings.embed(query);
      const keys = (await this.store.keys(`${this.vectorPrefix(scope)}*`)).slice(
        0,
        this.maxCandidates
      );

      let best: { value: CachedResponse; similarity: number } | null = null;

      for (const key of keys) {
        const raw = await this.store.get(key);
        if (!raw) continue;

        const entry = JSON.parse(raw) as CachedResponse & { vector: number[] };
        if (!Array.isArray(entry.vector)) continue;

        const similarity = cosine(vector, entry.vector);
        if (similarity >= this.threshold && (!best || similarity > best.similarity)) {
          best = { value: entry, similarity };
        }
      }

      if (best) {
        this.stats.semanticHits++;
        this.stats.tokensSaved += best.value.tokensIn;
        return { ...best.value, hit: "semantic", similarity: best.similarity };
      }
    } catch {
      // Sin embeddings disponibles → se comporta como caché exacta.
    }

    this.stats.misses++;
    return null;
  }

  /** Guarda una respuesta bajo su clave exacta y (si hay) su vector. */
  async store_(scope: string, query: string, response: CachedResponse): Promise<void> {
    const payload = JSON.stringify(response);

    try {
      await this.store.set(this.exactKey(scope, query), payload, this.ttl);
    } catch {
      return; // sin caché, la app sigue
    }

    if (!this.embeddings) return;

    try {
      const vector = await this.embeddings.embed(query);
      // Vector todo-ceros = proveedor sin API key: no sirve para similitud.
      if (vector.every((v) => v === 0)) return;

      await this.store.set(
        `${this.vectorPrefix(scope)}${hash(query)}`,
        JSON.stringify({ ...response, vector }),
        this.ttl
      );
    } catch {
      // La entrada exacta ya quedó guardada; la semántica es un extra.
    }
  }

  /** Invalida todo un scope (p.ej. al cambiar el system prompt de un agente). */
  async invalidate(scope: string): Promise<number> {
    try {
      const keys = [
        ...(await this.store.keys(`llmcache:${scope}:x:*`)),
        ...(await this.store.keys(`llmcache:${scope}:v:*`)),
      ];
      for (const key of keys) await this.store.del(key);
      return keys.length;
    } catch {
      return 0;
    }
  }

  getStats(): CacheStats & { hitRate: number } {
    const hits = this.stats.exactHits + this.stats.semanticHits;
    return {
      ...this.stats,
      hitRate: this.stats.lookups > 0 ? Number((hits / this.stats.lookups).toFixed(4)) : 0,
    };
  }

  resetStats(): void {
    this.stats = { lookups: 0, exactHits: 0, semanticHits: 0, misses: 0, tokensSaved: 0 };
  }
}

/** Store en memoria — para tests y para degradar sin Valkey. */
export function memoryStore(): CacheStore {
  const map = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key) {
      const entry = map.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        map.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async keys(pattern) {
      const prefix = pattern.replace(/\*$/, "");
      return Array.from(map.keys()).filter((k) => k.startsWith(prefix));
    },
    async del(key) {
      map.delete(key);
    },
  };
}
