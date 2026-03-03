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
import gremiusConfig from "../../gremius.config";
import { join } from "node:path";
import { existsSync } from "node:fs";

/**
 * Get the currently active realm from environment (sync version for startup).
 * Falls back to null if not available.
 */
async function getActiveRealmSync(): Promise<string | null> {
    try {
        // Support both old and new env vars
        return process.env.GREMIUS_ACTIVE_REALM ||
            process.env.GREMIUS_ACTIVE_THEME ||
            null;
    } catch {
        return null;
    }
}

/**
 * Realm manifest interface (realm.json)
 */
interface RealmManifest {
    id: string;
    name: string;
    grimoires: string[];
    optional_grimoires?: string[];
    bundled_modules?: string[]; // Legacy support
}

/**
 * Get bundled grimoires for a realm by reading its realm.json manifest.
 */
async function getRealmGrimoires(realmId: string): Promise<string[]> {
    try {
        // Try new realm.json format first
        const realmJsonPath = join(
            process.cwd(),
            "../../packages/realms",
            realmId,
            "realm.json"
        );

        if (existsSync(realmJsonPath)) {
            const file = Bun.file(realmJsonPath);
            const manifest: RealmManifest = await file.json();
            return manifest.grimoires || [];
        }

        // Fallback to legacy gremius.json
        const legacyPath = join(
            process.cwd(),
            "../../packages/realms",
            realmId,
            "gremius.json"
        );

        if (existsSync(legacyPath)) {
            const file = Bun.file(legacyPath);
            const manifest = await file.json();
            return manifest.grimoires || manifest.bundled_modules || [];
        }

        return [];
    } catch {
        return [];
    }
}

/**
 * Dynamically build a merged schema object from core + active grimoires + realm grimoires.
 * Uses Bun's native dynamic import().
 */
export async function buildMergedSchema(): Promise<Record<string, unknown>> {
    // Start with all core schema exports
    const merged: Record<string, unknown> = { ...coreSchema };

    const { modules } = gremiusConfig;
    const activeRealm = await getActiveRealmSync();
    const realmGrimoires = activeRealm
        ? await getRealmGrimoires(activeRealm)
        : [];

    // Merge unique grimoires from both sources
    // Note: modules are legacy, will be phased out in favor of realm.json
    const allGrimoires = new Set([...modules, ...realmGrimoires]);

    const grimoiresPath = join(process.cwd(), "../../packages/grimoires");
    const legacyModulesPath = join(process.cwd(), "src/modules");

    for (const name of allGrimoires) {
        let schemaLoaded = false;

        // Try grimoires path first (new location)
        try {
            const cleanName = name.replace(/^grimoire-/, "");
            const schemaPath1 = join(grimoiresPath, name, `${name}.schema.ts`);
            const schemaPath2 = join(grimoiresPath, name, `${cleanName}.schema.ts`);

            let targetPath = existsSync(schemaPath1) ? schemaPath1 :
                existsSync(schemaPath2) ? schemaPath2 : null;

            if (targetPath) {
                const mod = await import(targetPath);
                for (const [key, value] of Object.entries(mod)) {
                    if (key === "default") continue;
                    merged[key] = value;
                }
                console.log(`  📜 ${name} → schema merged (grimoire)`);
                schemaLoaded = true;
            }
        } catch {
            // Try legacy modules path
        }

        // Try legacy core modules path if not found
        if (!schemaLoaded) {
            try {
                const schemaPath = join(legacyModulesPath, name, `${name}.schema.ts`);
                if (existsSync(schemaPath)) {
                    const mod = await import(schemaPath);
                    for (const [key, value] of Object.entries(mod)) {
                        if (key === "default") continue;
                        merged[key] = value;
                    }
                    console.log(`  📜 ${name} → schema merged (legacy module)`);
                    schemaLoaded = true;
                }
            } catch {
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
