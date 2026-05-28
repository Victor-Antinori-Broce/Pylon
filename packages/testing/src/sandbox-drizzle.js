/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DRIZZLE-INTEGRATED TEST SANDBOX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sandbox optimized for Bun + Drizzle + Hono stack
 * Uses REAL Drizzle ORM with pg-mem or PostgreSQL transactions
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePgMem } from "drizzle-orm/pg-mem";
import { createPgMem } from "pg-mem";
import { Pool } from "pg";
import { createTestHttpClient } from "./http.js";
import { createTestEvents } from "./events.js";
import { createTestAssertions } from "./assertions.js";
import { loadFixtures } from "./fixtures.js";
import { createTestContext as createBaseContext } from "./context.js";
let sandboxCounter = 0;
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
export async function createDrizzleSandbox(config) {
    const sandboxId = `drizzle-sandbox-${Date.now()}-${++sandboxCounter}`;
    const dbStrategy = config.database || "pg-mem";
    // 1. Create REAL Drizzle instance
    const { drizzle: drizzleInstance, cleanup, transaction } = await createDrizzleInstance(dbStrategy, config.schema, config.databaseUrl);
    // 2. Create base context with real Drizzle
    const baseContext = await createBaseContext(sandboxId, "memory");
    const context = {
        ...baseContext,
        db: {
            instance: drizzleInstance,
            execute: async (sql) => {
                return drizzleInstance.execute(sql);
            },
            tableExists: async (tableName) => {
                try {
                    const result = await drizzleInstance.execute(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_name = '${tableName}'
            );
          `);
                    return result[0]?.exists || false;
                }
                catch {
                    // pg-mem might not support information_schema
                    return true;
                }
            }
        }
    };
    // 3. Track events
    const events = createTestEvents();
    // 4. Database helpers using Drizzle
    const db = {
        has: async (table, where) => {
            const result = await drizzleInstance
                .select()
                .from(config.schema[table])
                .where(buildWhereClause(where))
                .limit(1);
            return result.length > 0;
        },
        get: async (table, where) => {
            const result = await drizzleInstance
                .select()
                .from(config.schema[table])
                .where(buildWhereClause(where))
                .limit(1);
            return result[0] || null;
        },
        count: async (table, where) => {
            const { sql } = await import("drizzle-orm");
            const result = await drizzleInstance
                .select({ count: sql `count(*)` })
                .from(config.schema[table])
                .where(where ? buildWhereClause(where) : undefined);
            return Number(result[0]?.count || 0);
        },
        truncate: async (...tables) => {
            for (const table of tables) {
                if (table === "*") {
                    // Truncate all tables in schema
                    for (const tableName of Object.keys(config.schema)) {
                        await drizzleInstance.delete(config.schema[tableName]);
                    }
                }
                else if (config.schema[table]) {
                    await drizzleInstance.delete(config.schema[table]);
                }
            }
        },
        query: async (sqlStr, params) => {
            return drizzleInstance.execute(sqlStr, params);
        },
        insert: async (table, data) => {
            const [result] = await drizzleInstance
                .insert(config.schema[table])
                .values(data)
                .returning();
            return result;
        }
    };
    // 5. Load grimoires
    const grimoires = {};
    for (const grimoireId of config.grimoires) {
        const grimoire = await loadGrimoire(grimoireId, context, events, drizzleInstance);
        if (grimoire) {
            grimoires[grimoireId] = grimoire;
        }
    }
    // 6. HTTP client
    const http = createTestHttpClient(grimoires, context);
    // 7. Assertions
    const assert = createTestAssertions(db, events);
    // 8. Sandbox instance
    const sandbox = {
        id: sandboxId,
        context,
        grimoires,
        fixtures: {},
        http,
        db,
        events,
        assert,
        drizzle: drizzleInstance,
        transaction,
        setup: async () => {
            // Load fixtures
            if (config.fixtures) {
                sandbox.fixtures = await loadFixtures(config.fixtures, context);
            }
            // Run grimoire startup hooks
            for (const grimoire of Object.values(grimoires)) {
                if (grimoire.definition.hooks?.onStartup) {
                    await grimoire.definition.hooks.onStartup(context);
                }
            }
        },
        teardown: async () => {
            for (const grimoire of Object.values(grimoires)) {
                if (grimoire.definition.hooks?.onDisable) {
                    await grimoire.definition.hooks.onDisable(context);
                }
            }
            await cleanup();
        },
        reset: async () => {
            events.clear();
            // Clear all tables
            for (const tableName of Object.keys(config.schema)) {
                await drizzleInstance.delete(config.schema[tableName]);
            }
            // Reload fixtures
            if (config.fixtures) {
                sandbox.fixtures = await loadFixtures(config.fixtures, context);
            }
        }
    };
    return sandbox;
}
/**
 * Create Drizzle instance based on strategy
 */
async function createDrizzleInstance(strategy, schema, databaseUrl) {
    switch (strategy) {
        case "pg-mem":
            return createPgMemInstance(schema);
        case "postgres":
        case "postgres-transaction":
            return createPostgresInstance(schema, databaseUrl);
        default:
            throw new Error(`Unknown database strategy: ${strategy}`);
    }
}
/**
 * Create pg-mem instance (fastest, in-memory)
 */
async function createPgMemInstance(schema) {
    const pgMem = createPgMem();
    // Register pg module
    pgMem.registerExtension("uuid-ossp", (schema) => {
        schema.registerFunction({
            name: "uuid_generate_v4",
            returns: DataType.uuid,
            implementation: () => crypto.randomUUID(),
        });
    });
    const db = drizzlePgMem(pgMem, { schema });
    return {
        drizzle: db,
        cleanup: async () => {
            pgMem.close();
        },
        transaction: async (fn) => {
            // pg-mem auto-commits, so we use backup/restore for isolation
            const backup = pgMem.backup();
            try {
                return await fn(db);
            }
            finally {
                backup.restore();
            }
        }
    };
}
/**
 * Create PostgreSQL instance with transaction support
 */
async function createPostgresInstance(schema, databaseUrl) {
    const url = databaseUrl || process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/gremius_test";
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    return {
        drizzle: db,
        cleanup: async () => {
            await pool.end();
        },
        transaction: async (fn) => {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                // Create transaction-scoped drizzle
                const txDb = drizzle(client, { schema });
                const result = await fn(txDb);
                await client.query("ROLLBACK");
                return result;
            }
            finally {
                client.release();
            }
        }
    };
}
/**
 * Load grimoire with real Drizzle
 */
async function loadGrimoire(grimoireId, context, events, drizzleInstance) {
    try {
        const path = `../../../packages/grimoires/${grimoireId}/index.ts`;
        const module = await import(path);
        const definition = module.grimoire || module.default;
        if (!definition) {
            console.warn(`Grimoire ${grimoireId} not found`);
            return null;
        }
        // Wrap context with event tracking
        const contextWithEvents = {
            ...context,
            events: {
                ...context.events,
                emit: (name, data) => {
                    events.all.push({ name, data, timestamp: new Date() });
                    return context.events.emit(name, data);
                }
            }
        };
        const router = definition.createRouter(contextWithEvents);
        return {
            definition,
            router,
            invoke: async (method, ...args) => {
                throw new Error(`Direct invocation not implemented: ${method}`);
            }
        };
    }
    catch (error) {
        console.warn(`Failed to load grimoire ${grimoireId}:`, error);
        return null;
    }
}
/**
 * Build Drizzle where clause from object
 */
function buildWhereClause(where) {
    const { eq, and } = require("drizzle-orm");
    const conditions = Object.entries(where).map(([key, value]) => {
        return eq((row) => row[key], value);
    });
    return conditions.length === 1 ? conditions[0] : and(...conditions);
}
// Import DataType for pg-mem
import { DataType } from "pg-mem";
export default { createDrizzleSandbox };
//# sourceMappingURL=sandbox-drizzle.js.map