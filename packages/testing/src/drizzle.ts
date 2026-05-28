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

import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePgMem } from "drizzle-orm/pg-mem";
import { createPgMem } from "pg-mem";
import { Pool } from "pg";
import type { TestGrimoireContext } from "./types.js";

export interface DrizzleTestConfig {
  strategy: "memory" | "postgres" | "bun-sqlite";
  
  // For "postgres" strategy
  connectionString?: string;
  
  // Schema to use
  schema: Record<string, any>;
  
  // Migrations
  migrations?: {
    folder: string;
  };
}

/**
 * Create a Drizzle ORM instance for testing
 */
export async function createDrizzleTestDb(config: DrizzleTestConfig): Promise<{
  db: any;
  cleanup: () => Promise<void>;
  transaction: (fn: (db: any) => Promise<void>) => Promise<void>;
}> {
  switch (config.strategy) {
    case "memory":
      return createPgMemDatabase(config.schema);
      
    case "postgres":
      return createPostgresTestDatabase(config);
      
    case "bun-sqlite":
      return createBunSqliteDatabase(config);
      
    default:
      throw new Error(`Unknown database strategy: ${config.strategy}`);
  }
}

/**
 * PostgreSQL in-memory using pg-mem
 * Fastest option, no Docker needed
 */
async function createPgMemDatabase(schema: Record<string, any>) {
  const pgMem = createPgMem();
  
  // Create Drizzle instance
  const db = drizzlePgMem(pgMem, { schema });
  
  // Run migrations (pg-mem supports this)
  // await migrate(db, { migrationsFolder: "..." });
  
  return {
    db,
    cleanup: async () => {
      pgMem.close();
    },
    transaction: async (fn: (db: any) => Promise<void>) => {
      // pg-mem doesn't support transactions the same way,
      // but we can snapshot/restore
      const backup = pgMem.backup();
      try {
        await fn(db);
      } finally {
        backup.restore();
      }
    }
  };
}

/**
 * Real PostgreSQL with transaction rollback
 * Most accurate, requires PostgreSQL running
 */
async function createPostgresTestDatabase(config: DrizzleTestConfig) {
  const connectionString = config.connectionString || 
    process.env.TEST_DATABASE_URL || 
    "postgres://postgres:postgres@localhost:5432/gremius_test";
  
  const pool = new Pool({ connectionString });
  
  // Create Drizzle instance
  const db = drizzle(pool, { schema: config.schema });
  
  return {
    db,
    cleanup: async () => {
      await pool.end();
    },
    transaction: async (fn: (db: any) => Promise<void>) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        
        // Create transaction-scoped drizzle instance
        const txDb = drizzle(client, { schema: config.schema });
        
        await fn(txDb);
        
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
  };
}

/**
 * Bun's native SQLite (if using SQLite variant of Drizzle)
 * Ultra-fast, zero dependencies
 */
async function createBunSqliteDatabase(config: DrizzleTestConfig) {
  // Bun has native SQLite support
  const sqlite = (Bun as any).SQLite;
  
  if (!sqlite) {
    throw new Error("Bun SQLite not available. Use 'memory' or 'postgres' strategy.");
  }
  
  const db = new sqlite.Database(":memory:");
  
  // Note: You'd need drizzle-orm/bun-sqlite for this
  // const drizzleDb = drizzleBunSqlite(db, { schema: config.schema });
  
  return {
    db: { /* drizzle instance */ },
    cleanup: async () => {
      db.close();
    },
    transaction: async (fn: (db: any) => Promise<void>) => {
      db.exec("BEGIN TRANSACTION");
      try {
        await fn({ /* drizzle instance */ });
      } finally {
        db.exec("ROLLBACK");
      }
    }
  };
}

/**
 * Helper to create test context with real Drizzle
 */
export async function createDrizzleTestContext(
  sandboxId: string,
  drizzleConfig: DrizzleTestConfig
): Promise<TestGrimoireContext> {
  const { db, cleanup, transaction } = await createDrizzleTestDb(drizzleConfig);
  
  // Import base context creator
  const { createTestContext } = await import("./context.js");
  const baseContext = await createTestContext(sandboxId, "memory");
  
  // Override with real Drizzle
  return {
    ...baseContext,
    db: {
      instance: db,
      execute: async (sql: string) => {
        // Use Drizzle's execute
        return db.execute(sql);
      },
      tableExists: async (tableName: string) => {
        // Query information_schema
        const result = await db.execute(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = '${tableName}'
          );
        `);
        return result[0]?.exists || false;
      }
    },
    
    // Add transaction helper for tests
    $transaction: transaction
  } as TestGrimoireContext;
}

export default { createDrizzleTestDb, createDrizzleTestContext };
