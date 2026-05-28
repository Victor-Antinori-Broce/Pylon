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
import { type ConnectionOptions } from "bullmq";
import { type RedisClientType } from "redis";
export declare const VALKEY_URL: string;
/**
 * BullMQ-compatible connection options.
 */
export declare const valkeyConnection: ConnectionOptions;
/**
 * Returns a connected Valkey client (lazy singleton).
 */
export declare function getValkeyClient(): Promise<RedisClientType>;
export declare function isValkeyAvailable(): Promise<boolean>;
/**
 * Get dedicated PUBLISH client.
 * Separate from main client because pub/sub requires dedicated connections.
 */
export declare function getPublisher(): Promise<RedisClientType>;
/**
 * Get dedicated SUBSCRIBE client.
 */
export declare function getSubscriber(): Promise<RedisClientType>;
/**
 * Publish a message to a channel.
 * Used by the data layer to broadcast mutations.
 *
 * @param channel Channel name (e.g., "table:matches", "entry:abc123")
 * @param message JSON-serializable payload
 */
export declare function publish(channel: string, message: unknown): Promise<void>;
/**
 * Subscribe to a channel pattern.
 * Returns an unsubscribe function.
 *
 * @param pattern Channel pattern (supports wildcards: "table:*")
 * @param callback Function to call when message received
 */
export declare function subscribe(pattern: string, callback: (channel: string, message: string) => void): Promise<() => Promise<void>>;
export declare function updateLeaderboardScore(leaderboard: string, userId: string, score: number): Promise<void>;
export declare function getLeaderboardTop(leaderboard: string, count?: number): Promise<Array<{
    userId: string;
    score: number;
    rank: number;
}>>;
export declare function getLeaderboardRank(leaderboard: string, userId: string): Promise<{
    rank: number;
    score: number;
} | null>;
export declare function cacheGet(key: string): Promise<string | null>;
export declare function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void>;
export declare function closeValkey(): Promise<void>;
//# sourceMappingURL=valkey.d.ts.map