/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DRIZZLE ORM INTEGRATION - Real database testing
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This provides real Drizzle ORM instances for testing, not mocks.
 *
 * Options:
 * 1. "memory" - pg-mem (PostgreSQL in-memory, fastest)
 * 2. "postgres" - Real PostgreSQL with transaction rollback
 * 3. "bun-sqlite" - Bun's native SQLite (if using drizzle-sqlite)
 */
import type { TestGrimoireContext } from "./types.js";
export interface DrizzleTestConfig {
    strategy: "memory" | "postgres" | "bun-sqlite";
    connectionString?: string;
    schema: Record<string, any>;
    migrations?: {
        folder: string;
    };
}
/**
 * Create a Drizzle ORM instance for testing
 */
export declare function createDrizzleTestDb(config: DrizzleTestConfig): Promise<{
    db: any;
    cleanup: () => Promise<void>;
    transaction: (fn: (db: any) => Promise<void>) => Promise<void>;
}>;
/**
 * Helper to create test context with real Drizzle
 */
export declare function createDrizzleTestContext(sandboxId: string, drizzleConfig: DrizzleTestConfig): Promise<TestGrimoireContext>;
declare const _default: {
    createDrizzleTestDb: typeof createDrizzleTestDb;
    createDrizzleTestContext: typeof createDrizzleTestContext;
};
export default _default;
//# sourceMappingURL=drizzle.d.ts.map