/**
 * Realm Lifecycle Manager
 *
 * Handles realm activation, seeding, and deactivation.
 * - Reads realm.json for seed configuration
 * - Executes seed.sql if present and not already run
 * - Tracks seed execution to prevent duplicates (runOnce default)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface RealmSeedConfig {
  sql?: string;       // relative path to seed sql file (default: "seed.sql")
  datasets?: string;  // relative path to seed datasets json
  runOnce?: boolean;  // if true (default), seed only runs once per realm
}

interface RealmManifest {
  id: string;
  name: string;
  grimoires: string[];
  seed?: RealmSeedConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED TRACKER
// ═══════════════════════════════════════════════════════════════════════════

const SEED_TRACKER_TABLE = "realm_seed_tracker";

async function ensureSeedTrackerTable(): Promise<void> {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${SEED_TRACKER_TABLE} (
        realm_id TEXT PRIMARY KEY,
        seeded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `));
  } catch {
    // Table may already exist
  }
}

async function isRealmSeeded(realmId: string): Promise<boolean> {
  try {
    const result = await db.execute(sql.raw(`
      SELECT seeded_at FROM ${SEED_TRACKER_TABLE}
      WHERE realm_id = '${realmId}'
    `));
    const rows = result.rows as Array<{ seeded_at: string }>;
    return rows.length > 0 && rows[0].seeded_at != null;
  } catch {
    return false;
  }
}

async function markRealmSeeded(realmId: string): Promise<void> {
  await ensureSeedTrackerTable();
  await db.execute(sql.raw(`
    INSERT INTO ${SEED_TRACKER_TABLE} (realm_id)
    VALUES ('${realmId}')
    ON CONFLICT (realm_id) DO UPDATE SET seeded_at = NOW()
  `));
}

// ═══════════════════════════════════════════════════════════════════════════
// REALM MANIFEST LOADER
// ═══════════════════════════════════════════════════════════════════════════

function getPackagesRoot(): string {
  const cwdCheck = join(process.cwd(), "packages", "grimoires", "package.json");
  const root = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
  return join(root, "packages");
}

async function loadRealmManifest(realmId: string): Promise<RealmManifest | null> {
  const realmsDir = join(getPackagesRoot(), "realms");

  for (const fileName of ["realm.json", "gremius.json"]) {
    const path = join(realmsDir, realmId, fileName);
    const file = Bun.file(path);
    if (await file.exists()) {
      try {
        return (await file.json()) as RealmManifest;
      } catch {
        // ignore parse errors
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a seed SQL file for a realm.
 */
async function executeSeedSql(realmId: string, sqlPath: string): Promise<boolean> {
  const file = Bun.file(sqlPath);
  if (!(await file.exists())) {
    console.log(`[Realm] No seed file found at ${sqlPath}`);
    return false;
  }

  const content = await file.text();
  if (!content.trim()) {
    console.log(`[Realm] Seed file is empty: ${sqlPath}`);
    return false;
  }

  console.log(`[Realm] Executing seed for ${realmId}...`);
  try {
    await db.execute(sql.raw(content));
    console.log(`[Realm] Seed executed successfully for ${realmId}`);
    return true;
  } catch (err: any) {
    console.error(`[Realm] Seed failed for ${realmId}:`, err.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Activate a realm: load its manifest and run seed if configured.
 * Safe to call multiple times — respects runOnce setting.
 */
export async function activateRealm(realmId: string): Promise<void> {
  const manifest = await loadRealmManifest(realmId);
  if (!manifest) {
    console.warn(`[Realm] Manifest not found for realm: ${realmId}`);
    return;
  }

  const seedConfig = manifest.seed;
  if (!seedConfig) {
    console.log(`[Realm] No seed configured for ${realmId}`);
    return;
  }

  const runOnce = seedConfig.runOnce !== false;

  if (runOnce) {
    await ensureSeedTrackerTable();
    if (await isRealmSeeded(realmId)) {
      console.log(`[Realm] ${realmId} already seeded (runOnce=true). Skipping.`);
      return;
    }
  }

  const realmsDir = join(getPackagesRoot(), "realms", realmId);

  // Execute SQL seed if configured
  const sqlFile = seedConfig.sql || "seed.sql";
  const sqlPath = join(realmsDir, sqlFile);
  const seeded = await executeSeedSql(realmId, sqlPath);

  if (seeded && runOnce) {
    await markRealmSeeded(realmId);
  }
}

/**
 * Check if a realm has seed configuration.
 */
export async function realmHasSeed(realmId: string): Promise<boolean> {
  const manifest = await loadRealmManifest(realmId);
  return !!manifest?.seed;
}

/**
 * Reset seed tracking for a realm (useful for dev/testing).
 */
export async function resetRealmSeed(realmId: string): Promise<void> {
  await ensureSeedTrackerTable();
  await db.execute(sql.raw(`
    DELETE FROM ${SEED_TRACKER_TABLE} WHERE realm_id = '${realmId}'
  `));
  console.log(`[Realm] Seed tracking reset for ${realmId}`);
}
