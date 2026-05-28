/**
 * Filesystem Scanner Service (The Lore Refactor Edition)
 *
 * Scans /packages/grimoires, /packages/realms, and node_modules for manifests.
 * Uses Bun's native optimized I/O APIs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GRIMOIRES: Individual magical code blocks (formerly "modules")
 *   Location: packages/grimoires/
 *   Manifest: grimoire.json or gremius.json
 *
 * REALMS: Business ecosystems grouping grimoires (formerly "themes")
 *   Location: packages/realms/
 *   Manifest: realm.json or gremius.json
 *
 * INSTALLED: Grimoires installed via npm/marketplace
 *   Location: node_modules/
 *   Registry: installed_grimoires table
 */
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db";
import { installedGrimoires } from "../db/schema";
import { eq } from "drizzle-orm";
// Resolve workspace root (Docker vs dev)
function getPackagesRoot() {
    const cwdCheck = join(process.cwd(), "packages", "grimoires", "package.json");
    const root = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
    return join(root, "packages");
}
// Resolve node_modules paths
async function getNodeModulesPaths() {
    const paths = [];
    const root = existsSync(join(process.cwd(), "apps", "api"))
        ? process.cwd()
        : join(process.cwd(), "../../");
    // Check multiple possible locations
    paths.push(join(root, "node_modules"));
    paths.push(join(root, "apps", "api", "node_modules"));
    paths.push(join(process.cwd(), "node_modules"));
    return paths.filter((p) => existsSync(p));
}
// Simple in-memory cache to avoid disk thrashing on frequent refreshes
const cache = new Map();
const CACHE_TTL_MS = 30_000; // 30 seconds
/**
 * Scan grimoires from node_modules (installed via npm)
 */
export async function scanInstalledGrimoires() {
    const cacheKey = "installed";
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }
    const manifests = [];
    const nodeModulesPaths = await getNodeModulesPaths();
    // First, get installed grimoires from database
    try {
        const dbGrimoires = await db
            .select()
            .from(installedGrimoires)
            .where(eq(installedGrimoires.enabled, true));
        for (const g of dbGrimoires) {
            const manifest = g.manifest;
            manifests.push({
                id: g.grimoireId,
                name: g.name,
                description: g.description || manifest?.description,
                version: g.version,
                type: "grimoire",
                source: g.source,
                installed: true,
                enabled: g.enabled,
                installPath: g.path,
                ...manifest,
            });
        }
    }
    catch {
        // Table might not exist yet, continue with filesystem scan
    }
    // Also scan node_modules for @gremius packages
    for (const nmPath of nodeModulesPaths) {
        // Check @gremius scope
        const gremiusScope = join(nmPath, "@gremius");
        if (existsSync(gremiusScope)) {
            try {
                const entries = await readdir(gremiusScope, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory())
                        continue;
                    // Check if it's a grimoire
                    if (entry.name.startsWith("grimoire-")) {
                        const grimoirePath = join(gremiusScope, entry.name);
                        const manifest = await readGrimoireManifest(grimoirePath);
                        if (manifest && !manifests.some(m => m.id === manifest.id)) {
                            manifests.push({
                                ...manifest,
                                source: "npm",
                                installed: true,
                                enabled: true,
                                installPath: grimoirePath,
                            });
                        }
                    }
                }
            }
            catch {
                // Ignore errors
            }
        }
        // Check for grimoire-* packages in root
        try {
            const entries = await readdir(nmPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                if (entry.name.startsWith("grimoire-")) {
                    const grimoirePath = join(nmPath, entry.name);
                    const manifest = await readGrimoireManifest(grimoirePath);
                    if (manifest && !manifests.some(m => m.id === manifest.id)) {
                        manifests.push({
                            ...manifest,
                            source: "npm",
                            installed: true,
                            enabled: true,
                            installPath: grimoirePath,
                        });
                    }
                }
            }
        }
        catch {
            // Ignore errors
        }
    }
    cache.set(cacheKey, { data: manifests, timestamp: Date.now() });
    return manifests;
}
/**
 * Read grimoire.json or package.json from a directory
 */
async function readGrimoireManifest(dirPath) {
    // Try grimoire.json first
    const grimoireJsonPath = join(dirPath, "grimoire.json");
    const grimoireFile = Bun.file(grimoireJsonPath);
    if (await grimoireFile.exists()) {
        try {
            const json = (await grimoireFile.json());
            return {
                ...json,
                type: json.type || "grimoire",
            };
        }
        catch {
            // Invalid JSON
        }
    }
    // Try package.json with gremius field
    const packageJsonPath = join(dirPath, "package.json");
    const packageFile = Bun.file(packageJsonPath);
    if (await packageFile.exists()) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pkg = (await packageFile.json());
            if (pkg.gremius?.type === "grimoire") {
                return {
                    id: pkg.gremius.id || pkg.name,
                    name: pkg.gremius.name || pkg.name,
                    description: pkg.description,
                    version: pkg.version,
                    type: "grimoire",
                    author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name,
                    ...pkg.gremius,
                };
            }
        }
        catch {
            // Invalid JSON
        }
    }
    return null;
}
/**
 * Scan grimoires or realms directories
 * @param type "grimoires" | "realms" (legacy: "modules" | "themes")
 */
export async function scanPackages(type) {
    // Normalize legacy types
    const dirName = type === "modules" ? "grimoires" : type === "themes" ? "realms" : type;
    const cacheKey = dirName;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }
    const dirPath = join(getPackagesRoot(), dirName);
    const manifests = [];
    try {
        // Check if directory exists
        const dirExists = (await Bun.file(dirPath).exists()) || (await isDirectory(dirPath));
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
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const json = (await file.json());
                        // Basic validation
                        if (json.id && json.name && json.version) {
                            const migrationPath = join(dirPath, subdir.name, "migrations", "init.sql");
                            const hasMigrations = await Bun.file(migrationPath).exists();
                            // Determine type from manifest or directory
                            const manifestType = json.type || (dirName === "grimoires" ? "grimoire" : "realm");
                            manifests.push({
                                ...json,
                                source: "filesystem",
                                type: manifestType,
                                hasMigrations,
                            });
                        }
                        break; // Found a valid manifest, stop checking other paths
                    }
                    catch (err) {
                        console.error(`[Scanner] Failed to parse ${manifestPath}`, err);
                    }
                }
            }
        }
    }
    catch (err) {
        console.warn(`[Scanner] Error scanning ${dirPath}:`, err);
    }
    cache.set(cacheKey, { data: manifests, timestamp: Date.now() });
    return manifests;
}
/**
 * Get all available grimoires (local + installed)
 */
export async function getAllGrimoires() {
    const [localGrimoires, installedGrimoires] = await Promise.all([
        scanPackages("grimoires"),
        scanInstalledGrimoires(),
    ]);
    // Merge, with installed taking precedence
    const all = new Map();
    for (const g of localGrimoires) {
        all.set(g.id, g);
    }
    for (const g of installedGrimoires) {
        // Installed grimoires override local ones
        all.set(g.id, { ...all.get(g.id), ...g });
    }
    return Array.from(all.values());
}
// Helper to check if path is dir using Bun
async function isDirectory(path) {
    try {
        const stat = await import("node:fs/promises").then((m) => m.stat(path));
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
// ── Run Migrations ──
export async function runGrimoireMigrations(grimoireId) {
    const manifest = (await getAllGrimoires()).find((m) => m.id === grimoireId);
    if (!manifest || !manifest.hasMigrations)
        return;
    const migrationFile = manifest.installPath
        ? join(manifest.installPath, "migrations", "init.sql")
        : join(getPackagesRoot(), "grimoires", grimoireId, "migrations", "init.sql");
    const file = Bun.file(migrationFile);
    if (await file.exists()) {
        const sqlContent = await file.text();
        console.log(`[Scanner] Running migrations for grimoire ${grimoireId}...`);
        try {
            const { sql } = await import("drizzle-orm");
            await db.execute(sql.raw(sqlContent));
            console.log(`[Scanner] Migrations for ${grimoireId} completed.`);
        }
        catch (err) {
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
export async function scanModules() {
    return scanPackages("grimoires");
}
/**
 * @deprecated Use scanPackages("realms") instead
 */
export async function scanThemes() {
    return scanPackages("realms");
}
//# sourceMappingURL=scanner.js.map