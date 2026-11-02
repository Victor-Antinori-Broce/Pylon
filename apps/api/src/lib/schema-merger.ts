/**
 * Kitsuden — Dynamic Schema Merger (The Arcane Schema Weaver)
 *
 * Reads grimoire.json manifests and dynamically imports each kon's
 * Drizzle schema file, merging all exports into a single object
 * alongside the core schema.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Kitsuden
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Schema sources:
 *   1. Core schema: ./src/db/schema.ts
 *   2. Kon schemas: packages/kons/{kon}/{kon}.schema.ts
 *   3. Legacy theme modules: packages/grimoires/{grimoire}/kons/... (fallback)
 *
 * Used by db/index.ts to pass a complete schema to drizzle().
 * NOTE: schema-all.ts (static) is kept for drizzle-kit code generation.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { staticConfig as kitsudenConfig } from "../../kitsuden.config";
// `import type`, NO `import`: TypeScript lo borra al compilar, asi que no deja
// arista de ejecucion hacia `../db`. Esa arista era el ciclo que bloqueaba el
// arranque entero de la API (ver el comentario de `buildMergedSchema`).
import type { Database } from "../db";
import * as coreSchema from "../db/schema-core";
import { installedKons } from "../db/schema-core";

import { leerKonsDelGrimoire } from "./grimoire-manifest";
import { rutaDeKon } from "./kons-instalados";

/**
 * Kons that handle their own migrations (SQL files)
 * These are excluded from schema merging to avoid conflicts
 */
const SELF_MIGRATING_KONS = new Set(["kon-academy-lms", "kon-booking", "academy", "booking"]);

/**
 * Get the currently active grimoire from environment (sync version for startup).
 * Falls back to null if not available.
 */
async function getActiveGrimoireSync(): Promise<string | null> {
  try {
    // Support both old and new env vars
    return process.env.KITSUDEN_ACTIVE_GRIMOIRE || process.env.KITSUDEN_ACTIVE_THEME || null;
  } catch {
    return null;
  }
}

/**
 * Grimoire manifest interface (grimoire.json)
 */
interface GrimoireManifest {
  id: string;
  name: string;
  kons: string[];
  optional_kons?: string[];
  bundled_modules?: string[]; // Legacy support
}

/**
 * Get bundled kons for a grimoire by reading its grimoire.json manifest.
 */
async function getGrimoireKons(grimoireId: string): Promise<string[]> {
  // Resolve workspace root
  const cwdCheck = join(process.cwd(), "packages", "kons", "package.json");
  const root = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");

  // El respaldo a kitsuden.json y la comprobación de que lo leído sea un
  // grimoire (y no el TEMA que vive en el mismo directorio) están en
  // leerKonsDelGrimoire.
  return leerKonsDelGrimoire(join(root, "packages/grimoires", grimoireId));
}

/**
 * Dynamically build a merged schema object from core + active kons + grimoire kons.
 * Uses Bun's native dynamic import().
 */
/**
 * `consultas` es el acceso a base, y va como PARAMETRO en vez de importarse.
 *
 * Esto no es estilo: `apps/api/src/db/index.ts` termina con
 * `export const db = await getDbInstance()` —un await de nivel superior— y esa
 * inicializacion llama aqui. Si este modulo importara `db`, habria un ciclo con
 * await de nivel superior, y en ESM eso se bloquea o no SEGUN POR DONDE ENTRES:
 * entrando por `db` funcionaba, entrando por cualquier modulo que alcanzara
 * este antes se colgaba para siempre, al 0% de CPU y sin un solo error.
 *
 * Se omite cuando lo llama la propia inicializacion de la base —ahi todavia no
 * hay base— y se pasa desde `routes/graphql.ts`, que reconstruye el esquema en
 * caliente y si la tiene.
 *
 * Antes esto funcionaba por accidente: durante la inicializacion, `db` estaba
 * en zona muerta, la consulta lanzaba un ReferenceError y el `catch` de abajo
 * —comentado como "la tabla puede no existir"— se lo tragaba. El efecto real
 * era que los kons instalados por base NUNCA se tenian en cuenta al arrancar, y
 * nadie podia verlo. Ahora eso es explicito.
 */
export async function buildMergedSchema(consultas?: Database): Promise<Record<string, unknown>> {
  // Start with all core schema exports
  const merged: Record<string, unknown> = { ...coreSchema };

  const configKons = kitsudenConfig.kons ?? kitsudenConfig.modules ?? [];
  const activeGrimoire = await getActiveGrimoireSync();
  const grimoireKons = activeGrimoire ? await getGrimoireKons(activeGrimoire) : [];

  // Get kons installed via npm/marketplace from installed_kons table
  let dbInstalledIds: string[] = [];
  if (consultas) {
    try {
      const rows = await consultas
        .select({ konId: installedKons.konId })
        .from(installedKons)
        .where(eq(installedKons.enabled, true));
      dbInstalledIds = rows.map((r) => r.konId);
    } catch {
      // La tabla puede no existir todavia: en un arranque limpio, el esquema se
      // construye antes de que las migraciones la hayan creado.
    }
  }

  const allKons = new Set([...configKons, ...grimoireKons, ...dbInstalledIds]);

  // Resolve workspace root (same logic as module-loader)
  const cwdCheck = join(process.cwd(), "packages", "kons", "package.json");
  const workspaceRoot = existsSync(cwdCheck)
    ? process.cwd() // Docker: /app/packages/kons exists
    : join(process.cwd(), "../../"); // Dev: apps/api/../../

  const konsPath = join(workspaceRoot, "packages/kons");
  const legacyModulesPath = join(process.cwd(), "src/modules");

  const KON_DIR_MAP: Record<string, string> = {
    academy: "kon-academy-lms",
    "kitsuden-crm": "kon-crm",
    "ai-memories": "ai-memories",
  };

  for (const name of allKons) {
    // Skip kons that handle their own migrations
    if (SELF_MIGRATING_KONS.has(name)) {
      console.log(`  ⏩ ${name} → self-managing (skipped)`);
      continue;
    }

    let schemaLoaded = false;

    // Try kons path first (new location)
    try {
      const cleanName = name.replace(/^kon-/, "");
      const dirName = KON_DIR_MAP[name] || KON_DIR_MAP[cleanName] || `kon-${cleanName}`;

      // Primero la carpeta del kon INSTALADO (kons-instalados.ts): puede no
      // estar en packages/kons (enlazado desde kitsuden-kons, node_modules…).
      const instalada = rutaDeKon(name);
      const possiblePaths = [
        ...(instalada
          ? [
              join(instalada, `${cleanName}.schema.ts`),
              join(instalada, `${dirName}.schema.ts`),
              join(instalada, `schema.ts`),
              join(instalada, `src`, `schema.ts`),
              join(instalada, `src`, `${cleanName}.schema.ts`),
            ]
          : []),
        join(konsPath, name, `${name}.schema.ts`),
        join(konsPath, name, `${cleanName}.schema.ts`),
        join(konsPath, name, `schema.ts`),
        join(konsPath, name, `src`, `schema.ts`),
        join(konsPath, name, `src`, `${name}.schema.ts`),
        join(konsPath, name, `src`, `${cleanName}.schema.ts`),
        join(konsPath, dirName, `${cleanName}.schema.ts`),
        join(konsPath, dirName, `${name}.schema.ts`),
        join(konsPath, dirName, `${dirName}.schema.ts`),
        join(konsPath, dirName, `schema.ts`),
        join(konsPath, dirName, `src`, `schema.ts`),
        join(konsPath, dirName, `src`, `${cleanName}.schema.ts`),
        join(konsPath, dirName, `src`, `${dirName}.schema.ts`),
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
          if (key === "default") continue;
          merged[key] = value;
        }
        console.log(`  📜 ${name} → schema merged (kon)`);
        schemaLoaded = true;
      }
    } catch {
      // Try legacy modules path
    }

    // Try node_modules (npm-installed kons)
    if (!schemaLoaded) {
      try {
        const cleanName = name.replace(/^kon-/, "");
        const nodeModulesPaths = [
          join(workspaceRoot, "node_modules"),
          join(process.cwd(), "node_modules"),
          join(workspaceRoot, "apps", "api", "node_modules"),
        ];

        for (const nmPath of nodeModulesPaths) {
          const npmPaths = [
            // Scoped official
            join(nmPath, "@kitsuden", `kon-${cleanName}`, `${cleanName}.schema.ts`),
            join(nmPath, "@kitsuden", `kon-${cleanName}`, `schema.ts`),
            join(nmPath, "@kitsuden", `kon-${cleanName}`, `src`, `schema.ts`),
            join(nmPath, "@kitsuden", name, `${cleanName}.schema.ts`),
            join(nmPath, "@kitsuden", name, `schema.ts`),
            join(nmPath, "@kitsuden", name, `src`, `schema.ts`),
            // Community
            join(nmPath, `kon-${cleanName}`, `${cleanName}.schema.ts`),
            join(nmPath, `kon-${cleanName}`, `schema.ts`),
            join(nmPath, `kon-${cleanName}`, `src`, `schema.ts`),
            join(nmPath, name, `${cleanName}.schema.ts`),
            join(nmPath, name, `schema.ts`),
            join(nmPath, name, `src`, `schema.ts`),
          ];

          for (const p of npmPaths) {
            if (existsSync(p)) {
              const mod = await import(p);
              for (const [key, value] of Object.entries(mod)) {
                if (key === "default") continue;
                merged[key] = value;
              }
              console.log(`  📜 ${name} → schema merged (npm)`);
              schemaLoaded = true;
              break;
            }
          }
          if (schemaLoaded) break;
        }

        // Fallback: use installed_kons.sourceUrl to resolve schema path
        if (!schemaLoaded) {
          try {
            const dbRows = consultas
              ? await consultas
                  .select({ sourceUrl: installedKons.sourceUrl, path: installedKons.path })
                  .from(installedKons)
                  .where(eq(installedKons.konId, name))
              : [];

            for (const row of dbRows) {
              const pkgName = row.sourceUrl;
              if (!pkgName) continue;

              for (const nmPath of nodeModulesPaths) {
                const resolvedPkgPath = join(nmPath, pkgName);
                if (!existsSync(resolvedPkgPath)) continue;

                const sourceUrlPaths = [
                  join(resolvedPkgPath, `${name.replace(/^kon-/, "")}.schema.ts`),
                  join(resolvedPkgPath, `schema.ts`),
                  join(resolvedPkgPath, `src`, `schema.ts`),
                  join(resolvedPkgPath, `${name}.schema.ts`),
                ];

                for (const p of sourceUrlPaths) {
                  if (existsSync(p)) {
                    const mod = await import(p);
                    for (const [key, value] of Object.entries(mod)) {
                      if (key === "default") continue;
                      merged[key] = value;
                    }
                    console.log(`  📜 ${name} → schema merged (npm via sourceUrl)`);
                    schemaLoaded = true;
                    break;
                  }
                }
                if (schemaLoaded) break;
              }
              if (schemaLoaded) break;
            }
          } catch {
            // Ignore
          }
        }
      } catch {
        // Continue to legacy fallback
      }
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
        // Kon may not have a schema file
      }
    }

    // If still not loaded, it's okay — kon might use core schema only
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
