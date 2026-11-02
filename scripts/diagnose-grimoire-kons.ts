// @ts-nocheck
/**
 * Script de diagnóstico para verificar por qué los kons de grimoire
 * no se activan cuando se activa un grimoire.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const PACKAGES_ROOT = join(PROJECT_ROOT, "packages");

interface GrimoireManifest {
  id: string;
  name: string;
  kons: string[];
  optional_kons?: string[];
}

interface KonManifest {
  id: string;
  name: string;
  version: string;
}

async function scanGrimoires(): Promise<GrimoireManifest[]> {
  const grimoiresDir = join(PACKAGES_ROOT, "grimoires");
  const grimoires: GrimoireManifest[] = [];

  try {
    const entries = await readdir(grimoiresDir, { withFileTypes: true });
    const grimoireDirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules"
    );

    for (const dir of grimoireDirs) {
      const grimoireJsonPath = join(grimoiresDir, dir.name, "grimoire.json");
      const legacyPath = join(grimoiresDir, dir.name, "kitsuden.json");

      let manifest: GrimoireManifest | null = null;

      const grimoireFile = Bun.file(grimoireJsonPath);
      if (await grimoireFile.exists()) {
        try {
          manifest = (await grimoireFile.json()) as GrimoireManifest;
        } catch {
          console.warn(`  ⚠️ Failed to parse ${grimoireJsonPath}`);
        }
      }

      if (!manifest) {
        const legacyFile = Bun.file(legacyPath);
        if (await legacyFile.exists()) {
          try {
            manifest = (await legacyFile.json()) as GrimoireManifest;
          } catch {
            console.warn(`  ⚠️ Failed to parse ${legacyPath}`);
          }
        }
      }

      if (manifest && manifest.id) {
        grimoires.push({
          id: manifest.id,
          name: manifest.name || manifest.id,
          kons: manifest.kons || [],
          optional_kons: manifest.optional_kons || [],
        });
      }
    }
  } catch (err) {
    console.error("Error scanning grimoires:", err);
  }

  return grimoires;
}

async function scanKons(): Promise<KonManifest[]> {
  const konsDir = join(PACKAGES_ROOT, "kons");
  const kons: KonManifest[] = [];

  try {
    const entries = await readdir(konsDir, { withFileTypes: true });
    const konDirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules"
    );

    for (const dir of konDirs) {
      const konJsonPath = join(konsDir, dir.name, "kon.json");
      const file = Bun.file(konJsonPath);

      if (await file.exists()) {
        try {
          const manifest = (await file.json()) as KonManifest;
          if (manifest.id) {
            kons.push(manifest);
          }
        } catch {
          console.warn(`  ⚠️ Failed to parse ${konJsonPath}`);
        }
      }
    }
  } catch (err) {
    console.error("Error scanning kons:", err);
  }

  return kons;
}

async function main() {
  console.log("═".repeat(70));
  console.log("DIAGNÓSTICO: Kons de Grimoire");
  console.log("═".repeat(70));

  // Scan grimoires
  console.log("\n📦 Grimoires encontrados:");
  const grimoires = await scanGrimoires();
  for (const grimoire of grimoires) {
    console.log(`\n  🏰 ${grimoire.id} (${grimoire.name})`);
    console.log(`     Kons: ${grimoire.kons.join(", ") || "(ninguno)"}`);
    console.log(`     Opcionales: ${grimoire.optional_kons?.join(", ") || "(ninguno)"}`);
  }

  // Scan kons
  console.log("\n📚 Kons encontrados:");
  const kons = await scanKons();
  const konMap = new Map(kons.map((g) => [g.id, g]));
  for (const kon of kons) {
    console.log(`  📖 ${kon.id} (${kon.name}) - v${kon.version}`);
  }

  // Check for missing kons in grimoires
  console.log("\n🔍 Verificando kons de grimoires:");
  for (const grimoire of grimoires) {
    console.log(`\n  🏰 ${grimoire.id}:`);
    for (const konId of grimoire.kons) {
      const exists = konMap.has(konId);
      const dirExists = existsSync(join(PACKAGES_ROOT, "kons", konId));
      if (exists && dirExists) {
        console.log(`    ✅ ${konId} - encontrado`);
      } else if (!exists && dirExists) {
        console.log(`    ⚠️  ${konId} - directorio existe pero no tiene kon.json válido`);
      } else if (exists && !dirExists) {
        console.log(`    ⚠️  ${konId} - en manifest pero directorio no existe`);
      } else {
        console.log(`    ❌ ${konId} - NO ENCONTRADO`);
      }
    }
  }

  // Check hardcoded registry
  console.log("\n📋 Registro hardcodeado (KON_REGISTRY):");
  const { KON_REGISTRY } = await import("../apps/api/src/services/module-registry.ts");
  const grimoireKonsFromRegistry = KON_REGISTRY.filter((g) => g.category === "grimoire");
  console.log(`   Total kons de grimoire en registro: ${grimoireKonsFromRegistry.length}`);
  for (const g of grimoireKonsFromRegistry) {
    console.log(`   - ${g.key} (grimoireId: ${g.grimoireId})`);
  }

  // Compare
  console.log("\n📊 Comparación:");
  const grimoireKonsFromFile = new Set(grimoires.flatMap((r) => r.kons));
  const grimoireKonsFromRegistrySet = new Set(grimoireKonsFromRegistry.map((g) => g.key));

  console.log(`   Kons en grimoire.json: ${[...grimoireKonsFromFile].join(", ")}`);
  console.log(`   Kons en registry: ${[...grimoireKonsFromRegistrySet].join(", ")}`);

  const missingFromRegistry = [...grimoireKonsFromFile].filter(
    (id) => !grimoireKonsFromRegistrySet.has(id)
  );
  const missingFromGrimoires = [...grimoireKonsFromRegistrySet].filter(
    (id) => !grimoireKonsFromFile.has(id)
  );

  if (missingFromRegistry.length > 0) {
    console.log(
      `\n   ⚠️  Kons en grimoire.json pero NO en registry: ${missingFromRegistry.join(", ")}`
    );
  }
  if (missingFromGrimoires.length > 0) {
    console.log(
      `\n   ⚠️  Kons en registry pero NO en grimoire.json: ${missingFromGrimoires.join(", ")}`
    );
  }

  console.log("\n" + "═".repeat(70));
  console.log("DIAGNÓSTICO COMPLETADO");
  console.log("═".repeat(70));
}

main().catch(console.error);
