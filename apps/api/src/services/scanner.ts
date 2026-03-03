/**
 * Filesystem Scanner Service (The Lore Refactor Edition)
 * 
 * Scans /packages/grimoires and /packages/realms for manifests.
 * Uses Bun's native optimized I/O APIs.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * GRIMOIRES: Individual magical code blocks (formerly "modules")
 *   Location: packages/grimoires/
 *   Manifest: gremius.json (legacy) or grimoire.json
 * 
 * REALMS: Business ecosystems grouping grimoires (formerly "themes")
 *   Location: packages/realms/
 *   Manifest: realm.json (new) or gremius.json (legacy)
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface GremiusManifest {
    id: string;
    name: string;
    description?: string;
    version: string;
    type: "grimoire" | "realm" | "module" | "theme"; // module/theme are legacy
    icon?: string;
    author?: string;
    // Grimoire-specific
    admin_route?: string;
    // Realm-specific
    css_entry?: string;             // defaults to variables.css
    preview_image?: string;         // relative path to screenshot
    grimoires?: string[];           // grimoires this realm requires (new)
    requires_modules?: string[];    // legacy: modules this theme is designed for
    optional_modules?: string[];    // legacy: modules that unlock extra features
    optional_grimoires?: string[];  // grimoires that unlock extra features (new)
    realm_type?: string;            // e.g. "blog", "lms", "portfolio", "gaming", "corporate"
    theme_type?: string;            // legacy alias
    components?: Record<string, string>; // named component overrides
    // Internal
    source?: "filesystem";
    hasMigrations?: boolean;
}

const PACKAGES_ROOT = join(process.cwd(), "../../packages");

// Simple in-memory cache to avoid disk thrashing on frequent refreshes
const cache = new Map<string, { data: GremiusManifest[]; timestamp: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Scan grimoires or realms directories
 * @param type "grimoires" | "realms" (legacy: "modules" | "themes")
 */
export async function scanPackages(type: "grimoires" | "realms" | "modules" | "themes"): Promise<GremiusManifest[]> {
    // Normalize legacy types
    const dirName = type === "modules" ? "grimoires" : 
                    type === "themes" ? "realms" : 
                    type;
    
    const cacheKey = dirName;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    const dirPath = join(PACKAGES_ROOT, dirName);
    const manifests: GremiusManifest[] = [];

    try {
        // Check if directory exists
        const dirExists = await Bun.file(dirPath).exists() || await isDirectory(dirPath);
        if (!dirExists) {
            return [];
        }

        const entries = await readdir(dirPath, { withFileTypes: true });
        const subdirs = entries.filter((e) => e.isDirectory());

        for (const subdir of subdirs) {
            // Try new manifest formats first, then legacy
            const manifestPaths = [
                join(dirPath, subdir.name, dirName === "grimoires" ? "grimoire.json" : "realm.json"),
                join(dirPath, subdir.name, "gremius.json"), // Legacy fallback
            ];

            for (const manifestPath of manifestPaths) {
                const file = Bun.file(manifestPath);

                if (await file.exists()) {
                    try {
                        const json = await file.json();
                        // Basic validation
                        if (json.id && json.name && json.version) {
                            const migrationPath = join(dirPath, subdir.name, "migrations", "init.sql");
                            const hasMigrations = await Bun.file(migrationPath).exists();

                            // Determine type from manifest or directory
                            const manifestType = json.type || 
                                                 (dirName === "grimoires" ? "grimoire" : "realm");

                            manifests.push({
                                ...json,
                                source: "filesystem",
                                type: manifestType,
                                hasMigrations
                            });
                        }
                        break; // Found a valid manifest, stop checking other paths
                    } catch (err) {
                        console.error(`[Scanner] Failed to parse ${manifestPath}`, err);
                    }
                }
            }
        }
    } catch (err) {
        console.warn(`[Scanner] Error scanning ${dirPath}:`, err);
    }

    cache.set(cacheKey, { data: manifests, timestamp: Date.now() });
    return manifests;
}

// Helper to check if path is dir using Bun
async function isDirectory(path: string) {
    try {
        const stat = await import("node:fs/promises").then(m => m.stat(path));
        return stat.isDirectory();
    } catch {
        return false;
    }
};

// ── Run Migrations ──
export async function runGrimoireMigrations(grimoireId: string) {
    const manifest = (await scanPackages("grimoires")).find(m => m.id === grimoireId);
    if (!manifest || !manifest.hasMigrations) return;

    const migrationFile = join(PACKAGES_ROOT, "grimoires", grimoireId, "migrations", "init.sql");
    const file = Bun.file(migrationFile);

    if (await file.exists()) {
        const sqlContent = await file.text();
        console.log(`[Scanner] Running migrations for grimoire ${grimoireId}...`);

        try {
            const { db } = await import("../db");
            const { sql } = await import("drizzle-orm");

            await db.execute(sql.raw(sqlContent));
            console.log(`[Scanner] Migrations for ${grimoireId} completed.`);
        } catch (err) {
            console.error(`[Scanner] Migration failed for ${grimoireId}:`, err);
            throw err;
        }
    }
}

/**
 * @deprecated Use runGrimoireMigrations instead
 */
export const runModuleMigrations = runGrimoireMigrations;

/**
 * @deprecated Use scanPackages("grimoires") instead
 */
export async function scanModules(): Promise<GremiusManifest[]> {
    return scanPackages("grimoires");
}

/**
 * @deprecated Use scanPackages("realms") instead
 */
export async function scanThemes(): Promise<GremiusManifest[]> {
    return scanPackages("realms");
}
