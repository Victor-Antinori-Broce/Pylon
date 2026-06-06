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

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { db } from "../db";
import { installedGrimoires } from "../db/schema";

/** Grimoire/Realm manifest structure */
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
  category?: "core" | "grimoire-core" | "optional" | "realm" | string;
  realmId?: string;
  // Realm-specific
  css_entry?: string; // defaults to variables.css
  preview_image?: string; // relative path to screenshot
  grimoires?: string[]; // grimoires this realm requires (new)
  requires_modules?: string[]; // legacy: modules this theme is designed for
  optional_modules?: string[]; // legacy: modules that unlock extra features
  optional_grimoires?: string[]; // grimoires that unlock extra features (new)
  realm_type?: string; // e.g. "blog", "lms", "portfolio", "gaming", "corporate"
  theme_type?: string; // legacy alias
  components?: Record<string, string>; // named component overrides
  // Internal
  source?: "filesystem" | "npm" | "marketplace" | "local";
  hasMigrations?: boolean;
  // For installed grimoires
  installed?: boolean;
  enabled?: boolean;
  installPath?: string;
  // For realm manifests
  tables?: (string | TableConfig)[];
  /** Per-grimoire admin overrides when this realm is active */
  grimoireConfig?: Record<
    string,
    {
      displayName?: string;
      hiddenTables?: string[];
      extraViews?: Array<{
        id: string;
        type: "grid" | "kanban" | "calendar" | "custom";
        title: string;
        table?: string;
      }>;
      defaultView?: string;
    }
  >;
  /** Seed configuration */
  seed?: {
    sql?: string; // relative path to seed.sql (default: seed.sql)
    datasets?: string; // relative path to seed-datasets.json
    runOnce?: boolean; // default: true
  };
}

/** Table configuration in grimoire manifest */
interface TableConfig {
  name: string;
  table?: string;
  label?: string;
  icon?: string;
  description?: string;
  primaryKey?: string;
  searchableFields?: string[];
  filterableFields?: string[];
  readonly?: boolean;
}

// Resolve workspace root (Docker vs dev)
function getPackagesRoot(): string {
  const cwdCheck = join(process.cwd(), "packages", "grimoires", "package.json");
  const root = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
  return join(root, "packages");
}

// Resolve node_modules paths
async function getNodeModulesPaths(): Promise<string[]> {
  const paths: string[] = [];
  const root = existsSync(join(process.cwd(), "apps", "api"))
    ? process.cwd()
    : join(process.cwd(), "../../");

  // Check multiple possible locations
  paths.push(join(root, "node_modules"));
  paths.push(join(root, "apps", "api", "node_modules"));
  paths.push(join(process.cwd(), "node_modules"));

  return paths.filter((p) => existsSync(p));
}

// Cache entry structure
interface CacheEntry {
  data: GremiusManifest[];
  timestamp: number;
}

// Simple in-memory cache to avoid disk thrashing on frequent refreshes
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Scan grimoires from node_modules (installed via npm)
 */
export async function scanInstalledGrimoires(): Promise<GremiusManifest[]> {
  const cacheKey = "installed";
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const manifests: GremiusManifest[] = [];
  const nodeModulesPaths = await getNodeModulesPaths();

  // First, get installed grimoires from database
  try {
    const dbGrimoires = await db
      .select()
      .from(installedGrimoires)
      .where(eq(installedGrimoires.enabled, true));

    for (const g of dbGrimoires) {
      const manifest = g.manifest as GremiusManifest | undefined;
      manifests.push({
        id: g.grimoireId,
        name: g.name,
        description: g.description || manifest?.description,
        version: g.version,
        type: "grimoire",
        source: g.source as "npm" | "marketplace" | "local",
        installed: true,
        enabled: g.enabled,
        installPath: g.path,
        ...manifest,
      });
    }
  } catch {
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
          if (!entry.isDirectory()) continue;

          // Check if it's a grimoire
          if (entry.name.startsWith("grimoire-")) {
            const grimoirePath = join(gremiusScope, entry.name);
            const manifest = await readGrimoireManifest(grimoirePath);

            if (manifest && !manifests.some((m) => m.id === manifest.id)) {
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
      } catch {
        // Ignore errors
      }
    }

    // Check for grimoire-* packages in root
    try {
      const entries = await readdir(nmPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        if (entry.name.startsWith("grimoire-")) {
          const grimoirePath = join(nmPath, entry.name);
          const manifest = await readGrimoireManifest(grimoirePath);

          if (manifest && !manifests.some((m) => m.id === manifest.id)) {
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
    } catch {
      // Ignore errors
    }
  }

  cache.set(cacheKey, { data: manifests, timestamp: Date.now() });
  return manifests;
}

/**
 * Read grimoire.json or package.json from a directory
 */
async function readGrimoireManifest(dirPath: string): Promise<GremiusManifest | null> {
  // Try grimoire.json first
  const grimoireJsonPath = join(dirPath, "grimoire.json");
  const grimoireFile = Bun.file(grimoireJsonPath);

  if (await grimoireFile.exists()) {
    try {
      const json = (await grimoireFile.json()) as Record<string, unknown>;
      return {
        ...(json as unknown as GremiusManifest),
        type: (json.type as GremiusManifest["type"]) || "grimoire",
      };
    } catch {
      // Invalid JSON
    }
  }

  // Try package.json with gremius field
  const packageJsonPath = join(dirPath, "package.json");
  const packageFile = Bun.file(packageJsonPath);

  if (await packageFile.exists()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pkg = (await packageFile.json()) as Record<string, any>;
      if (pkg.gremius?.type === "grimoire") {
        return {
          id: pkg.gremius.id || pkg.name,
          name: pkg.gremius.name || pkg.name,
          description: pkg.description,
          version: pkg.version,
          type: "grimoire",
          author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name,
          ...pkg.gremius,
        } as GremiusManifest;
      }
    } catch {
      // Invalid JSON
    }
  }

  return null;
}

/**
 * Scan grimoires or realms directories
 * @param type "grimoires" | "realms" (legacy: "modules" | "themes")
 */
export async function scanPackages(
  type: "grimoires" | "realms" | "modules" | "themes"
): Promise<GremiusManifest[]> {
  // Normalize legacy types
  const dirName = type === "modules" ? "grimoires" : type === "themes" ? "realms" : type;

  const cacheKey = dirName;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const dirPath = join(getPackagesRoot(), dirName);
  const manifests: GremiusManifest[] = [];

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
            const json = (await file.json()) as Record<string, any>;
            // Basic validation
            if (json.id && json.name && json.version) {
              const migrationPath = join(dirPath, subdir.name, "migrations", "init.sql");
              const hasMigrations = await Bun.file(migrationPath).exists();

              // Determine type from manifest or directory
              const manifestType: GremiusManifest["type"] =
                json.type || (dirName === "grimoires" ? "grimoire" : "realm");

              manifests.push({
                ...(json as unknown as GremiusManifest),
                source: "filesystem",
                type: manifestType,
                hasMigrations,
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

/**
 * Get all available grimoires (local + installed)
 */
export async function getAllGrimoires(): Promise<GremiusManifest[]> {
  const [localGrimoires, installedGrimoires] = await Promise.all([
    scanPackages("grimoires"),
    scanInstalledGrimoires(),
  ]);

  // Merge, with installed taking precedence
  const all = new Map<string, GremiusManifest>();

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
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await import("node:fs/promises").then((m) => m.stat(path));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// ── Run Migrations ──
export async function runGrimoireMigrations(grimoireId: string): Promise<void> {
  const manifest = (await getAllGrimoires()).find((m) => m.id === grimoireId);
  if (!manifest || !manifest.hasMigrations) return;

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
