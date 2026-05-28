// @ts-nocheck
/**
 * GremiusCMS — Dynamic Schema Merger (The Arcane Schema Weaver)
 *
 * Reads realm.json manifests and dynamically imports each grimoire's
 * Drizzle schema file, merging all exports into a single object
 * alongside the core schema.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Schema sources:
 *   1. Core schema: ./src/db/schema.ts
 *   2. Grimoire schemas: packages/grimoires/{grimoire}/{grimoire}.schema.ts
 *   3. Legacy theme modules: packages/realms/{realm}/grimoires/... (fallback)
 *
 * Used by db/index.ts to pass a complete schema to drizzle().
 * NOTE: schema-all.ts (static) is kept for drizzle-kit code generation.
 */
import * as coreSchema from "../db/schema";
import { staticConfig as gremiusConfig } from "../../gremius.config";
import { join } from "node:path";
import { existsSync } from "node:fs";
/**
 * Grimoires that handle their own migrations (SQL files)
 * These are excluded from schema merging to avoid conflicts
 */
const SELF_MIGRATING_GRIMOIRES = new Set([
    "grimoire-academy-lms",
    "grimoire-booking",
    "academy",
    "booking",
    "agents",
]);
/**
 * Get the currently active realm from environment (sync version for startup).
 * Falls back to null if not available.
 */
async function getActiveRealmSync() {
    try {
        // Support both old and new env vars
        return process.env.GREMIUS_ACTIVE_REALM ||
            process.env.GREMIUS_ACTIVE_THEME ||
            null;
    }
    catch {
        return null;
    }
}
/**
 * Get bundled grimoires for a realm by reading its realm.json manifest.
 */
async function getRealmGrimoires(realmId) {
    // Resolve workspace root
    const cwdCheck = join(process.cwd(), "packages", "grimoires", "package.json");
    const root = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
    try {
        const realmJsonPath = join(root, "packages/realms", realmId, "realm.json");
        if (existsSync(realmJsonPath)) {
            const file = Bun.file(realmJsonPath);
            const manifest = await file.json();
            return manifest.grimoires || [];
        }
        const legacyPath = join(root, "packages/realms", realmId, "gremius.json");
        if (existsSync(legacyPath)) {
            const file = Bun.file(legacyPath);
            const manifest = await file.json();
            return manifest.grimoires || manifest.bundled_modules || [];
        }
        return [];
    }
    catch {
        return [];
    }
}
/**
 * Dynamically build a merged schema object from core + active grimoires + realm grimoires.
 * Uses Bun's native dynamic import().
 */
export async function buildMergedSchema() {
    // Start with all core schema exports
    const merged = { ...coreSchema };
    const configGrimoires = gremiusConfig.grimoires ?? gremiusConfig.modules ?? [];
    const activeRealm = await getActiveRealmSync();
    const realmGrimoires = activeRealm
        ? await getRealmGrimoires(activeRealm)
        : [];
    const allGrimoires = new Set([...configGrimoires, ...realmGrimoires]);
    // Resolve workspace root (same logic as module-loader)
    const cwdCheck = join(process.cwd(), "packages", "grimoires", "package.json");
    const workspaceRoot = existsSync(cwdCheck)
        ? process.cwd() // Docker: /app/packages/grimoires exists
        : join(process.cwd(), "../../"); // Dev: apps/api/../../
    const grimoiresPath = join(workspaceRoot, "packages/grimoires");
    const legacyModulesPath = join(process.cwd(), "src/modules");
    const GRIMOIRE_DIR_MAP = {
        "academy": "grimoire-academy-lms",
        "gremius-crm": "grimoire-crm",
        "ai-memories": "ai-memories",
    };
    for (const name of allGrimoires) {
        // Skip grimoires that handle their own migrations
        if (SELF_MIGRATING_GRIMOIRES.has(name)) {
            console.log(`  ⏩ ${name} → self-managing (skipped)`);
            continue;
        }
        let schemaLoaded = false;
        // Try grimoires path first (new location)
        try {
            const cleanName = name.replace(/^grimoire-/, "");
            const dirName = GRIMOIRE_DIR_MAP[name] || GRIMOIRE_DIR_MAP[cleanName] || `grimoire-${cleanName}`;
            const possiblePaths = [
                join(grimoiresPath, name, `${name}.schema.ts`),
                join(grimoiresPath, name, `${cleanName}.schema.ts`),
                join(grimoiresPath, name, `schema.ts`),
                join(grimoiresPath, name, `src`, `schema.ts`),
                join(grimoiresPath, name, `src`, `${name}.schema.ts`),
                join(grimoiresPath, name, `src`, `${cleanName}.schema.ts`),
                join(grimoiresPath, dirName, `${cleanName}.schema.ts`),
                join(grimoiresPath, dirName, `${name}.schema.ts`),
                join(grimoiresPath, dirName, `${dirName}.schema.ts`),
                join(grimoiresPath, dirName, `schema.ts`),
                join(grimoiresPath, dirName, `src`, `schema.ts`),
                join(grimoiresPath, dirName, `src`, `${cleanName}.schema.ts`),
                join(grimoiresPath, dirName, `src`, `${dirName}.schema.ts`),
            ];
            let targetPath = null;
            for (const p of possiblePaths) {
                if (existsSync(p)) {
                    targetPath = p;
                    break;
                }
            }
            if (targetPath) {
                const mod = await import(targetPath);
                for (const [key, value] of Object.entries(mod)) {
                    if (key === "default")
                        continue;
                    merged[key] = value;
                }
                console.log(`  📜 ${name} → schema merged (grimoire)`);
                schemaLoaded = true;
            }
        }
        catch {
            // Try legacy modules path
        }
        // Try legacy core modules path if not found
        if (!schemaLoaded) {
            try {
                const schemaPath = join(legacyModulesPath, name, `${name}.schema.ts`);
                if (existsSync(schemaPath)) {
                    const mod = await import(schemaPath);
                    for (const [key, value] of Object.entries(mod)) {
                        if (key === "default")
                            continue;
                        merged[key] = value;
                    }
                    console.log(`  📜 ${name} → schema merged (legacy module)`);
                    schemaLoaded = true;
                }
            }
            catch {
                // Grimoire may not have a schema file
            }
        }
        // If still not loaded, it's okay — grimoire might use core schema only
        if (!schemaLoaded) {
            console.log(`  ⚠️  ${name} → no schema file found`);
        }
    }
    return merged;
}
/**
 * @deprecated Use buildMergedSchema instead
 */
export const buildDynamicSchema = buildMergedSchema;
//# sourceMappingURL=schema-merger.js.map