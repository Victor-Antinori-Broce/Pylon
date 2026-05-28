/**
 * GremiusCMS — Valkey Connection Layer
 *
 * Centralized connection management for Valkey (Redis-compatible fork).
 * Provides:
 *   1. Shared BullMQ connection options
 *   2. Direct Valkey client for cache / sorted-set operations
 *   3. Leaderboard helpers (ZADD, ZREVRANGE, ZRANK)
 *   4. Pub/Sub for Real-time Layer
 *
 * ENV: VALKEY_URL > REDIS_URL > redis://localhost:6379
 */
import { createClient } from "redis";
// ── URL Resolution ─────────────────────────────────────────────
export const VALKEY_URL = process.env.VALKEY_URL ||
    process.env.REDIS_URL ||
    "redis://localhost:6379";
// ── BullMQ Connection (shared by all queues/workers) ───────────
function parseUrl(url) {
    try {
        const parsed = new URL(url);
        return {
            host: parsed.hostname || "localhost",
            port: Number(parsed.port) || 6379,
            password: parsed.password || undefined,
            username: parsed.username || undefined,
        };
    }
    catch {
        return { host: "localhost", port: 6379 };
    }
}
/**
 * BullMQ-compatible connection options.
 */
export const valkeyConnection = {
    ...parseUrl(VALKEY_URL),
    // @ts-ignore - maxRetriesPerRequest can be null in ioredis but types differ
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
        if (times > 3)
            return null;
        return Math.min(times * 500, 3000);
    },
};
// ── Direct Client (for cache, leaderboards) ────────────────────
let _client = null;
/**
 * Returns a connected Valkey client (lazy singleton).
 */
export async function getValkeyClient() {
    if (_client && _client.isOpen)
        return _client;
    _client = createClient({ url: VALKEY_URL });
    _client.on("error", (err) => {
        console.warn(`[Valkey] Connection error: ${err.message}`);
    });
    await _client.connect();
    return _client;
}
// ── Availability Check ─────────────────────────────────────────
let _available = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 30_000;
export async function isValkeyAvailable() {
    const now = Date.now();
    if (_available !== null && now - _lastCheck < CHECK_INTERVAL) {
        return _available;
    }
    try {
        const client = await getValkeyClient();
        await client.ping();
        _available = true;
    }
    catch {
        _available = false;
    }
    _lastCheck = Date.now();
    return _available ?? false;
}
// ═══════════════════════════════════════════════════════════════
// PUB/SUB — Real-time Layer
// ═══════════════════════════════════════════════════════════════
let _pubClient = null;
let _subClient = null;
/**
 * Get dedicated PUBLISH client.
 * Separate from main client because pub/sub requires dedicated connections.
 */
export async function getPublisher() {
    if (_pubClient && _pubClient.isOpen)
        return _pubClient;
    _pubClient = createClient({ url: VALKEY_URL });
    _pubClient.on("error", (err) => {
        console.warn(`[Valkey:PUB] Error: ${err.message}`);
    });
    await _pubClient.connect();
    return _pubClient;
}
/**
 * Get dedicated SUBSCRIBE client.
 */
export async function getSubscriber() {
    if (_subClient && _subClient.isOpen)
        return _subClient;
    _subClient = createClient({ url: VALKEY_URL });
    _subClient.on("error", (err) => {
        console.warn(`[Valkey:SUB] Error: ${err.message}`);
    });
    await _subClient.connect();
    return _subClient;
}
/**
 * Publish a message to a channel.
 * Used by the data layer to broadcast mutations.
 *
 * @param channel Channel name (e.g., "table:matches", "entry:abc123")
 * @param message JSON-serializable payload
 */
export async function publish(channel, message) {
    try {
        const pub = await getPublisher();
        await pub.publish(channel, JSON.stringify(message));
    }
    catch (err) {
        const message_err = err instanceof Error ? err.message : String(err);
        console.warn(`[Valkey:PUB] Failed to publish to ${channel}: ${message_err}`);
    }
}
/**
 * Subscribe to a channel pattern.
 * Returns an unsubscribe function.
 *
 * @param pattern Channel pattern (supports wildcards: "table:*")
 * @param callback Function to call when message received
 */
export async function subscribe(pattern, callback) {
    const sub = await getSubscriber();
    if (pattern.includes("*")) {
        await sub.pSubscribe(pattern, (message, channel) => {
            callback(channel, message);
        });
        return async () => {
            await sub.pUnsubscribe(pattern);
        };
    }
    else {
        await sub.subscribe(pattern, (message, channel) => {
            callback(channel, message);
        });
        return async () => {
            await sub.unsubscribe(pattern);
        };
    }
}
// ═══════════════════════════════════════════════════════════════
// Leaderboard Helpers (Sorted Sets)
// ═══════════════════════════════════════════════════════════════
export async function updateLeaderboardScore(leaderboard, userId, score) {
    const client = await getValkeyClient();
    await client.zAdd(leaderboard, [{ score, value: userId }], { GT: true });
}
export async function getLeaderboardTop(leaderboard, count = 10) {
    const client = await getValkeyClient();
    const results = await client.zRangeWithScores(leaderboard, 0, count - 1, {
        REV: true,
    });
    return results.map((entry, idx) => ({
        userId: entry.value,
        score: entry.score,
        rank: idx + 1,
    }));
}
export async function getLeaderboardRank(leaderboard, userId) {
    const client = await getValkeyClient();
    const rank = await client.zRevRank(leaderboard, userId);
    if (rank === null)
        return null;
    const score = await client.zScore(leaderboard, userId);
    return { rank: rank + 1, score: score ?? 0 };
}
// ── Cache Helpers ──────────────────────────────────────────────
export async function cacheGet(key) {
    const client = await getValkeyClient();
    const value = await client.get(key);
    return value;
}
export async function cacheSet(key, value, ttlSeconds = 300) {
    const client = await getValkeyClient();
    await client.set(key, value, { EX: ttlSeconds });
}
// ── Shutdown ───────────────────────────────────────────────────
export async function closeValkey() {
    const closes = [];
    if (_client?.isOpen)
        closes.push(_client.quit().then(() => { _client = null; }));
    if (_pubClient?.isOpen)
        closes.push(_pubClient.quit().then(() => { _pubClient = null; }));
    if (_subClient?.isOpen)
        closes.push(_subClient.quit().then(() => { _subClient = null; }));
    await Promise.all(closes);
}
//# sourceMappingURL=valkey.js.map