/**
 * Filesystem Scanner Service (The Lore Refactor Edition)
 *
 * Scans /packages/kons, /packages/grimoires, and node_modules for manifests.
 * Uses Bun's native optimized I/O APIs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Kitsuden
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * KONS: Individual magical code blocks (formerly "modules")
 *   Location: packages/kons/
 *   Manifest: kon.json or kitsuden.json
 *
 * GRIMOIRES: Business ecosystems grouping kons (formerly "themes")
 *   Location: packages/grimoires/
 *   Manifest: grimoire.json or kitsuden.json
 *
 * INSTALLED: Kons installed via npm/marketplace
 *   Location: node_modules/
 *   Registry: installed_kons table
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { db } from "../db";
import { installedKons } from "../db/schema";
import { manifiestoEsDeTipo } from "../lib/grimoire-manifest";
import { konsInstalados } from "../lib/kons-instalados";
import { fichero } from "../lib/fichero";

/** Kon/Grimoire manifest structure */
export interface KitsudenManifest {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: "kon" | "grimoire" | "module" | "theme"; // module/theme are legacy
  icon?: string;
  author?: string;
  // Kon-specific
  admin_route?: string;
  category?: "core" | "core-den" | "optional" | "grimoire" | string;
  grimoireId?: string;
  // Grimoire-specific
  css_entry?: string; // defaults to variables.css
  preview_image?: string; // relative path to screenshot
  kons?: string[]; // kons this grimoire requires (new)
  requires_modules?: string[]; // legacy: modules this theme is designed for
  optional_modules?: string[]; // legacy: modules that unlock extra features
  optional_kons?: string[]; // kons that unlock extra features (new)
  grimoire_type?: string; // e.g. "blog", "lms", "portfolio", "gaming", "corporate"
  theme_type?: string; // legacy alias
  components?: Record<string, string>; // named component overrides
  // Internal
  source?: "filesystem" | "npm" | "marketplace" | "local";
  hasMigrations?: boolean;
  // For installed kons
  installed?: boolean;
  enabled?: boolean;
  installPath?: string;
  // For grimoire manifests
  tables?: (string | TableConfig)[];
  /** Per-kon admin overrides when this grimoire is active */
  konConfig?: Record<
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

/** Table configuration in kon manifest */
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
  const cwdCheck = join(process.cwd(), "packages", "kons", "package.json");
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
  data: KitsudenManifest[];
  timestamp: number;
}

// Simple in-memory cache to avoid disk thrashing on frequent refreshes
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Scan kons from node_modules (installed via npm)
 */
export async function scanInstalledKons(): Promise<KitsudenManifest[]> {
  const cacheKey = "installed";
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const manifests: KitsudenManifest[] = [];
  const nodeModulesPaths = await getNodeModulesPaths();

  // First, get installed kons from database
  try {
    const dbKons = await db.select().from(installedKons).where(eq(installedKons.enabled, true));

    for (const g of dbKons) {
      const manifest = g.manifest as KitsudenManifest | undefined;
      manifests.push({
        id: g.konId,
        name: g.name,
        description: g.description || manifest?.description,
        version: g.version,
        type: "kon",
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

  // Y los DECLARADOS en la instalación que viven en node_modules (paquetes
  // publicados). Antes se recorría `node_modules/@kitsuden/kon-*` y
  // `node_modules/kon-*`: cualquier paquete con ese nombre aparecía como kon
  // instalado. Ahora solo lo que se instaló (`kitsuden kon add`, KITSUDEN_KONS).
  void nodeModulesPaths;
  for (const kon of konsInstalados()) {
    if (kon.origen === "nucleo" || !kon.ruta || !/[\\/]node_modules[\\/]/.test(kon.ruta)) continue;
    const manifest = await readKonManifest(kon.ruta);
    if (manifest && !manifests.some((m) => m.id === manifest.id)) {
      manifests.push({
        ...manifest,
        source: "npm",
        installed: true,
        enabled: true,
        installPath: kon.ruta,
      });
    }
  }

  cache.set(cacheKey, { data: manifests, timestamp: Date.now() });
  return manifests;
}

/**
 * Read kon.json or package.json from a directory
 */
async function readKonManifest(dirPath: string): Promise<KitsudenManifest | null> {
  // Try kon.json first
  const konJsonPath = join(dirPath, "kon.json");
  const konFile = fichero(konJsonPath);

  if (await konFile.exists()) {
    try {
      const json = (await konFile.json()) as Record<string, unknown>;
      return {
        ...(json as unknown as KitsudenManifest),
        type: (json.type as KitsudenManifest["type"]) || "kon",
      };
    } catch {
      // Invalid JSON
    }
  }

  // Try package.json with kitsuden field
  const packageJsonPath = join(dirPath, "package.json");
  const packageFile = fichero(packageJsonPath);

  if (await packageFile.exists()) {
    try {
      // Se declara SOLO lo que este bloque lee. Antes era `any`, que además de
      // apagar el comprobador ocultaba qué campos del package.json ajeno se
      // están dando por hechos — que es justo lo que hay que saber cuando uno
      // de ellos falta y el kon no aparece.
      type PkgKitsuden = { type?: string; id?: string; name?: string; [k: string]: unknown };
      type Pkg = {
        name?: string;
        description?: string;
        version?: string;
        author?: string | { name?: string };
        kitsuden?: PkgKitsuden;
      };

      const pkg = (await packageFile.json()) as Pkg;
      if (pkg.kitsuden?.type === "kon") {
        return {
          id: pkg.kitsuden.id || pkg.name,
          name: pkg.kitsuden.name || pkg.name,
          description: pkg.description,
          version: pkg.version,
          type: "kon",
          author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name,
          ...pkg.kitsuden,
        } as KitsudenManifest;
      }
    } catch {
      // Invalid JSON
    }
  }

  return null;
}

/**
 * Scan kons or grimoires directories
 * @param type "kons" | "grimoires" (legacy: "modules" | "themes")
 */
export async function scanPackages(
  type: "kons" | "grimoires" | "modules" | "themes"
): Promise<KitsudenManifest[]> {
  // Normalize legacy types
  const dirName = type === "modules" ? "kons" : type === "themes" ? "grimoires" : type;

  const cacheKey = dirName;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const dirPath = join(getPackagesRoot(), dirName);
  const manifests: KitsudenManifest[] = [];

  try {
    // Los KONS salen de la instalación (kitsuden.kons.json + KITSUDEN_KONS,
    // ver lib/kons-instalados.ts), no de recorrer packages/kons: desde la fase C
    // los kons viven en el repo kitsuden-kons y esa carpeta solo guarda las
    // copias instaladas. Los grimoires siguen en packages/grimoires.
    let carpetas: { nombre: string; ruta: string }[];
    if (dirName === "kons") {
      carpetas = konsInstalados()
        .filter((k) => k.origen !== "nucleo" && k.ruta)
        .map((k) => ({ nombre: k.id, ruta: k.ruta as string }));
    } else {
      const dirExists = (await fichero(dirPath).exists()) || (await isDirectory(dirPath));
      if (!dirExists) {
        return [];
      }
      const entries = await readdir(dirPath, { withFileTypes: true });
      carpetas = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({ nombre: e.name, ruta: join(dirPath, e.name) }));
    }

    for (const carpeta of carpetas) {
      // Try new manifest formats first, then legacy
      const manifestPaths = [
        join(carpeta.ruta, dirName === "kons" ? "kon.json" : "grimoire.json"),
        join(carpeta.ruta, "kitsuden.json"), // Legacy fallback
      ];

      for (const manifestPath of manifestPaths) {
        const file = fichero(manifestPath);

        if (await file.exists()) {
          try {
            const json = (await file.json()) as Record<string, unknown>;

            // El respaldo a kitsuden.json es legítimo para manifiestos
            // heredados, pero en packages/grimoires/<id>/ ese fichero es el
            // TEMA (type: "theme", con su propio id). Sin esta comprobación,
            // un grimoire.json ausente colaba el tema en la lista de
            // grimoires con el id equivocado y sin un solo kon.
            const esperado = dirName === "kons" ? "kon" : "grimoire";
            if (!manifiestoEsDeTipo(json, esperado)) {
              continue;
            }

            // Basic validation
            if (json.id && json.name && json.version) {
              // `hasMigrations` = la carpeta tiene algún `.sql`, no que exista un
              // fichero llamado `init.sql`.
              //
              // Comprobar `init.sql` era el mismo error que arrastraba
              // `runKonMigrations`: ningún kon usa ese nombre, así que TODOS los
              // kons se anunciaban como «sin migraciones» aunque trajeran cuatro.
              const migrationDir = join(carpeta.ruta, "migrations");
              let hasMigrations = false;
              try {
                hasMigrations = (await readdir(migrationDir)).some((f) => f.endsWith(".sql"));
              } catch {
                hasMigrations = false; // la carpeta no existe
              }

              // Determine type from manifest or directory
              const manifestType: KitsudenManifest["type"] =
                (json.type as KitsudenManifest["type"]) ||
                (dirName === "kons" ? "kon" : "grimoire");

              manifests.push({
                ...(json as unknown as KitsudenManifest),
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
 * Get all available kons (local + installed)
 */
export async function getAllKons(): Promise<KitsudenManifest[]> {
  const [localKons, installedKons] = await Promise.all([scanPackages("kons"), scanInstalledKons()]);

  // Merge, with installed taking precedence
  const all = new Map<string, KitsudenManifest>();

  for (const g of localKons) {
    all.set(g.id, g);
  }

  for (const g of installedKons) {
    // Installed kons override local ones
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

/**
 * Aplica las migraciones de un kon.
 *
 * ── LO QUE HACÍA ANTES ─────────────────────────────────────────────────────
 *
 * Buscaba UN fichero llamado `migrations/init.sql`. Ningún kon del repo se
 * llama así: todos usan el prefijo numérico (`0000_initial.sql`,
 * `0001_members.sql`). `fichero(...).exists()` daba false, la función salía en
 * silencio, y quien la llamaba daba por instalado un kon sin ninguna tabla.
 *
 * La implementación vive en `lib/migraciones-kon.ts` y es la MISMA que usa el
 * runner de arranque, con el mismo historial. Tener dos era la razón de que
 * esta se pudriera sin que nadie lo notara: solo se ejercitaba la otra.
 *
 * Se propaga el error a propósito. Quien active un kon tiene que enterarse de
 * que no se pudo instalar.
 */
export async function runKonMigrations(konId: string): Promise<void> {
  const manifest = (await getAllKons()).find((m) => m.id === konId);

  const { aplicarMigracionesDeKon } = await import("../lib/migraciones-kon");
  await aplicarMigracionesDeKon(konId, { rutaInstalacion: manifest?.installPath });
}

/**
 * @deprecated Use runKonMigrations instead
 */
export const runModuleMigrations = runKonMigrations;

/**
 * @deprecated Use scanPackages("kons") instead
 */
export async function scanModules(): Promise<KitsudenManifest[]> {
  return scanPackages("kons");
}

/**
 * @deprecated Use scanPackages("grimoires") instead
 */
export async function scanThemes(): Promise<KitsudenManifest[]> {
  return scanPackages("grimoires");
}
