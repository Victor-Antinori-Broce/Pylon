/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DRIZZLE-INTEGRATED TEST SANDBOX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sandbox optimized for Bun + Drizzle + Hono stack
 * Uses REAL Drizzle ORM with pg-mem or PostgreSQL transactions
 */
import type { SandboxConfig, TestSandbox } from "./types.js";
export interface DrizzleSandboxConfig extends SandboxConfig {
    /** Database strategy - defaults to pg-mem for speed */
    database?: "pg-mem" | "postgres" | "postgres-transaction";
    /** PostgreSQL connection string (for postgres strategy) */
    databaseUrl?: string;
    /** Drizzle schema definition */
    schema: Record<string, any>;
    /** Migrations folder path */
    migrationsFolder?: string;
}
/**
 * Create a test sandbox with REAL Drizzle ORM
 *
 * Usage:
 * ```typescript
 * import { createDrizzleSandbox } from "@gremius/testing/sandbox-drizzle";
 *
 * const sandbox = await createDrizzleSandbox({
 *   grimoires: ["grimoire-blog"],
 *   database: "pg-mem",  // or "postgres-transaction"
 *   schema: { postsTable, usersTable },
 *   fixtures: { users: [...] }
 * });
 *
 * // Real Drizzle ORM
 * const posts = await sandbox.drizzle
 *   .select()
 *   .from(postsTable)
 *   .where(eq(postsTable.status, "published"));
 * ```
 */
export declare function createDrizzleSandbox(config: DrizzleSandboxConfig): Promise<TestSandbox & {
    drizzle: any;
    transaction: <T>(fn: (db: any) => Promise<T>) => Promise<T>;
}>;
declare const _default: {
    createDrizzleSandbox: typeof createDrizzleSandbox;
};
export default _default;
//# sourceMappingURL=sandbox-drizzle.d.ts.map