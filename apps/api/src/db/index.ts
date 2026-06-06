import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
// @ts-ignore - NodePgTransaction is the correct export name but TS complains
import type {
  NodePgDatabase,
  NodePgTransaction,
  NodePgQueryResultHKT,
} from "drizzle-orm/node-postgres";
import pg from "pg";

import * as coreSchema from "./schema-core";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || "postgres://gremius:gremiuspassword@localhost:5432/gremius_dev";

let _mergedSchema: any;
let _dbInstance: NodePgDatabase<any> | null = null;
export let isPgMem = false;

/**
 * Determine which database backend to use for tests.
 *
 * - GREMIUS_TEST_DB=postgres (default) → Real PostgreSQL
 * - GREMIUS_TEST_DB=memory          → pg-mem in-memory
 */
function getTestDbMode(): "postgres" | "memory" {
  const mode = process.env.GREMIUS_TEST_DB?.toLowerCase();
  if (mode === "memory") return "memory";
  return "postgres";
}

async function initDb(): Promise<NodePgDatabase<any>> {
  const isTest = process.env.NODE_ENV === "test";

  if (isTest) {
    const mode = getTestDbMode();

    if (mode === "memory") {
      console.log("📋 Test mode: GREMIUS_TEST_DB=memory — using pg-mem");
      const { getPgMemDb } = await import("../tests/pg-mem-db");
      isPgMem = true;
      return await getPgMemDb();
    }

    // --- PostgreSQL real (default for tests) ---
    const testPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 3000,
    });

    try {
      await testPool.query("SELECT 1");
      console.log("📋 Test mode: GREMIUS_TEST_DB=postgres — using real PostgreSQL");
      const { buildMergedSchema } = await import("../lib/schema-merger");
      _mergedSchema = await buildMergedSchema();
      return drizzle(testPool, { schema: _mergedSchema as Record<string, unknown> });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("⚠️  PostgreSQL test database not reachable, falling back to pg-mem");
      console.warn("   Expected at:", connectionString);
      console.warn("   Error:", message);
      console.warn(
        "   Tip: Run 'pnpm test:db:up' for real PostgreSQL, or set GREMIUS_TEST_DB=memory explicitly"
      );
    }

    // Fallback to pg-mem when PostgreSQL is unavailable
    console.log("📋 Test mode: fallback — using pg-mem");
    const { getPgMemDb } = await import("../tests/pg-mem-db");
    isPgMem = true;
    return await getPgMemDb();
  }

  // --- Normal path (dev / prod) ---
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  const { buildMergedSchema } = await import("../lib/schema-merger");
  console.log("📋 Building merged schema...");
  _mergedSchema = await buildMergedSchema();
  return drizzle(pool, { schema: _mergedSchema as Record<string, unknown> });
}

/**
 * Lazily initialize the database singleton.
 * This avoids re-initialization when multiple test files import `../db`.
 */
async function getDbInstance(): Promise<NodePgDatabase<any>> {
  if (!_dbInstance) {
    _dbInstance = await initDb();
  }
  return _dbInstance;
}

export const db = await getDbInstance();
export const mergedSchema = _mergedSchema ?? coreSchema;

export type Database = typeof db;

// Type for database transactions
// @ts-ignore - NodePgTransaction type arguments vary by drizzle-orm version
export type DatabaseTransaction = NodePgTransaction<
  NodePgQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;
