/**
 * GremiusCMS — Valkey Caching Layer for Postgres Queries
 *
 * Wraps `cacheGet`/`cacheSet` from valkey.ts into a convenient
 * `cachedQuery` helper. Falls through to Postgres when Valkey is down.
 *
 * Usage:
 *   const data = await cachedQuery("blog:list:1", 60, () => db.select()...);
 */
import { cacheGet, cacheSet, isValkeyAvailable, getValkeyClient } from "./valkey";
// ── Cached Query ───────────────────────────────────────────────
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
export async function cachedQuery(key, ttl, queryFn) {
    try {
        const available = await isValkeyAvailable();
        if (available) {
            const cached = await cacheGet(key);
            if (cached) {
                return JSON.parse(cached);
            }
        }
    }
    catch {
        // Valkey down — fall through
    }
    // Cache miss or Valkey unavailable → query Postgres
    const result = await queryFn();
    // Store in Valkey (fire-and-forget, don't block response)
    try {
        const available = await isValkeyAvailable();
        if (available) {
            await cacheSet(key, JSON.stringify(result), ttl);
        }
    }
    catch {
        // Valkey write failed — non-critical
    }
    return result;
}
// ── Cache Invalidation ─────────────────────────────────────────
/**
 * Delete all cache keys matching given prefixes.
 * Uses SCAN + DEL for pattern-based deletion.
 *
 * @param patterns  Key patterns (e.g. "blog:*", "collections:*")
 */
export async function invalidateCache(...patterns) {
    try {
        const available = await isValkeyAvailable();
        if (!available)
            return;
        const client = await getValkeyClient();
        for (const pattern of patterns) {
            // Use SCAN to find matching keys (safe for production, non-blocking)
            const keys = [];
            // @ts-ignore - scanIterator types are complex in redis client
            const iterator = client.scanIterator({ MATCH: pattern, COUNT: 100 });
            for await (const key of iterator) {
                keys.push(key);
            }
            if (keys.length > 0) {
                // Delete keys one by one to avoid type issues with spread
                for (const key of keys) {
                    await client.del(key);
                }
            }
        }
    }
    catch {
        // Cache invalidation is non-critical
    }
}
//# sourceMappingURL=cache.js.map