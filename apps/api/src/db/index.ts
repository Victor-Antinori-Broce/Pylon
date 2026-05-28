import { drizzle } from "drizzle-orm/node-postgres";
// @ts-ignore - NodePgTransaction is the correct export name but TS complains
import type { NodePgTransaction, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import pg from "pg";
import { buildMergedSchema } from "../lib/schema-merger";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://gremius:gremiuspassword@localhost:5432/gremius_dev";

// Connection pool
const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ── Dynamic Schema Merger ──
// Merges core schema + active module schemas from gremius.config.ts
console.log("📋 Building merged schema...");
const mergedSchema = await buildMergedSchema();

export const db = drizzle(pool, { schema: mergedSchema as Record<string, unknown> });
export { mergedSchema };

export type Database = typeof db;

// Type for database transactions
// @ts-ignore - NodePgTransaction type arguments vary by drizzle-orm version
export type DatabaseTransaction = NodePgTransaction<
  NodePgQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;
