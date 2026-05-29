import { drizzle } from "drizzle-orm/node-postgres";
// @ts-ignore - NodePgTransaction is the correct export name but TS complains
import type { NodePgDatabase, NodePgTransaction, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import pg from "pg";
import * as coreSchema from "./schema-core";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://gremius:gremiuspassword@localhost:5432/gremius_dev";

let _db: NodePgDatabase<any>;
let _mergedSchema: any;

async function initDb() {
  const isTest = process.env.NODE_ENV === "test";
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: isTest ? 1000 : 2000,
  });

  if (isTest) {
    try {
      await pool.query("SELECT 1");
    } catch {
      // PostgreSQL not available in test → fall back to pg-mem
      console.log("📋 PostgreSQL not available, using pg-mem for tests...");
      const { getPgMemDb } = await import("../tests/pg-mem-db");
      _db = await getPgMemDb();
      _mergedSchema = coreSchema;
      return;
    }
  }

  // Normal path (dev / prod / test with real PG)
  const { buildMergedSchema } = await import("../lib/schema-merger");
  console.log("📋 Building merged schema...");
  _mergedSchema = await buildMergedSchema();
  _db = drizzle(pool, { schema: _mergedSchema as Record<string, unknown> });
}

await initDb();

export const db = _db;
export { _mergedSchema as mergedSchema };

export type Database = typeof db;

// Type for database transactions
// @ts-ignore - NodePgTransaction type arguments vary by drizzle-orm version
export type DatabaseTransaction = NodePgTransaction<
  NodePgQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;
