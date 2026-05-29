/**
 * pg-mem Test Database Helper
 *
 * Provides an in-memory PostgreSQL instance for tests when
 * a real PostgreSQL server is not available.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { newDb, DataType } from "pg-mem";
import * as coreSchema from "../db/schema-core";

let memDbInstance: ReturnType<typeof drizzle> | null = null;
let pgMemInstance: ReturnType<typeof newDb> | null = null;

/**
 * Custom Pool wrapper for pg-mem compatible with drizzle-orm/node-postgres.
 * pg-mem's built-in createPg() adapter lacks features drizzle 0.45.x needs.
 */
function createPgMemPool(pgMemDb: ReturnType<typeof newDb>) {
  const schema = pgMemDb.public;

  const client = {
    async query(queryConfig: any, params?: any[]) {
      const sqlText = typeof queryConfig === "string" ? queryConfig : queryConfig.text;
      const values = params ?? [];
      const hadRowMode = typeof queryConfig === "object" && queryConfig.rowMode === "array";

      const prepared = schema.prepare(sqlText);
      const bound = prepared.bind(values);
      const result = bound.executeAll();

      const pgResult = Array.isArray(result) ? result.at(-1)! : result;

      let rows = pgResult.rows;
      if (hadRowMode && Array.isArray(pgResult.fields)) {
        const fieldNames = pgResult.fields.map((f: any) => f.name);
        rows = rows.map((row: any) => fieldNames.map((name: string) => row[name]));
      }

      return {
        rows,
        fields: pgResult.fields ?? [],
        rowCount: pgResult.rowCount ?? rows.length,
        command: pgResult.command ?? "",
      };
    },

    async connect() {
      return client;
    },
    release() {},
    end() {},
  };

  return {
    query: client.query.bind(client),
    connect: async () => client,
    end: async () => {},
  };
}

const CORE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  image TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(10),
  schema JSONB NOT NULL DEFAULT '[]',
  display_config JSONB,
  policy_json JSONB,
  workflow_json JSONB,
  content_config JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS data_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  data_set_id UUID NOT NULL,
  owner_id TEXT,
  data JSONB NOT NULL,
  thumbnail_id UUID,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  type TEXT NOT NULL,
  trigger TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' NOT NULL,
  last_executed_at TIMESTAMP,
  last_error TEXT,
  execution_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_by_id TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS gremius_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  code TEXT,
  trigger TEXT,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' NOT NULL,
  created_by_id TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  key_hash TEXT NOT NULL,
  scopes JSONB DEFAULT '[]',
  rate_limit INTEGER DEFAULT 60,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_by_id TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  type TEXT,
  size INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(200) NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
`;

/**
 * Initialize pg-mem with core schema.
 */
export async function initPgMemDb() {
  if (memDbInstance) return memDbInstance;

  const pgMem = newDb();
  pgMemInstance = pgMem;

  pgMem.registerExtension("uuid-ossp", (schema) => {
    schema.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
    });
  });

  // Create core tables
  for (const stmt of CORE_SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    try {
      pgMem.public.none(stmt + ";");
    } catch (e) {
      // Some statements may fail on re-runs or unsupported features; ignore for now
      console.warn("[pg-mem] SQL init warning:", (e as Error).message);
    }
  }

  const pool = createPgMemPool(pgMem);
  memDbInstance = drizzle(pool as any, { schema: coreSchema });
  return memDbInstance;
}

/**
 * Get the pg-mem drizzle instance (creates on first call).
 */
export async function getPgMemDb() {
  return initPgMemDb();
}

/**
 * Clean up pg-mem instance.
 */
export function cleanupPgMemDb() {
  if (pgMemInstance) {
    // pg-mem has no explicit close; memory is freed on GC
    pgMemInstance = null;
    memDbInstance = null;
  }
}
