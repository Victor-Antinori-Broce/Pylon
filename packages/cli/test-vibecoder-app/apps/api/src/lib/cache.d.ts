/**
 * GremiusCMS — Valkey Caching Layer for Postgres Queries
 *
 * Wraps `cacheGet`/`cacheSet` from valkey.ts into a convenient
 * `cachedQuery` helper. Falls through to Postgres when Valkey is down.
 *
 * Usage:
 *   const data = await cachedQuery("blog:list:1", 60, () => db.select()...);
 */
/**
 * Run a query with Valkey caching.
 *   1. Check Valkey for cached result
 *   2. On miss → run queryFn, cache result
 *   3. On Valkey error → fall through to Postgres (no crash)
 *
 * @param key     Cache key (e.g. "blog:list:1:published")
 * @param ttl     TTL in seconds (default 120)
 * @param queryFn Async function that hits Postgres and returns data
 */
export declare function cachedQuery<T>(key: string, ttl: number, queryFn: () => Promise<T>): Promise<T>;
/**
 * Delete all cache keys matching given prefixes.
 * Uses SCAN + DEL for pattern-based deletion.
 *
 * @param patterns  Key patterns (e.g. "blog:*", "collections:*")
 */
export declare function invalidateCache(...patterns: string[]): Promise<void>;
//# sourceMappingURL=cache.d.ts.map