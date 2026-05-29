
// @ts-nocheck
/**
 * Script de diagnóstico para verificar por qué los grimoires de realm
 * no se activan cuando se activa un realm.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdir } from "node:fs/promises";

const PROJECT_ROOT = process.cwd();
const PACKAGES_ROOT = join(PROJECT_ROOT, "packages");

interface RealmManifest {
  id: string;
  name: string;
  grimoires: string[];
  optional_grimoires?: string[];
}

interface GrimoireManifest {
  id: string;
  name: string;
  version: string;
}

async function scanRealms(): Promise<RealmManifest[]> {
  const realmsDir = join(PACKAGES_ROOT, "realms");
  const realms: RealmManifest[] = [];

  try {
    const entries = await readdir(realmsDir, { withFileTypes: true });
    const realmDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules");

    for (const dir of realmDirs) {
      const realmJsonPath = join(realmsDir, dir.name, "realm.json");
      const legacyPath = join(realmsDir, dir.name, "gremius.json");

      let manifest: RealmManifest | null = null;

      const realmFile = Bun.file(realmJsonPath);
      if (await realmFile.exists()) {
        try {
          manifest = await realmFile.json() as RealmManifest;
        } catch {
          console.warn(`  ⚠️ Failed to parse ${realmJsonPath}`);
        }
      }

      if (!manifest) {
        const legacyFile = Bun.file(legacyPath);
        if (await legacyFile.exists()) {
          try {
            manifest = await legacyFile.json() as RealmManifest;
          } catch {
            console.warn(`  ⚠️ Failed to parse ${legacyPath}`);
          }
        }
      }

      if (manifest && manifest.id) {
        realms.push({
          id: manifest.id,
          name: manifest.name || manifest.id,
          grimoires: manifest.grimoires || [],
          optional_grimoires: manifest.optional_grimoires || [],
        });
      }
    }
  } catch (err) {
    console.error("Error scanning realms:", err);
  }

  return realms;
}

async function scanGrimoires(): Promise<GrimoireManifest[]> {
  const grimoiresDir = join(PACKAGES_ROOT, "grimoires");
  const grimoires: GrimoireManifest[] = [];

  try {
    const entries = await readdir(grimoiresDir, { withFileTypes: true });
    const grimoireDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules");

    for (const dir of grimoireDirs) {
      const grimoireJsonPath = join(grimoiresDir, dir.name, "grimoire.json");
      const file = Bun.file(grimoireJsonPath);

      if (await file.exists()) {
        try {
          const manifest = await file.json() as GrimoireManifest;
          if (manifest.id) {
            grimoires.push(manifest);
          }
        } catch {
          console.warn(`  ⚠️ Failed to parse ${grimoireJsonPath}`);
        }
      }
    }
  } catch (err) {
    console.error("Error scanning grimoires:", err);
  }

  return grimoires;
}

async function main() {
  console.log("═".repeat(70));
  console.log("DIAGNÓSTICO: Grimoires de Realm");
  console.log("═".repeat(70));

  // Scan realms
  console.log("\n📦 Realms encontrados:");
  const realms = await scanRealms();
  for (const realm of realms) {
    console.log(`\n  🏰 ${realm.id} (${realm.name})`);
    console.log(`     Grimoires: ${realm.grimoires.join(", ") || "(ninguno)"}`);
    console.log(`     Opcionales: ${realm.optional_grimoires?.join(", ") || "(ninguno)"}`);
  }

  // Scan grimoires
  console.log("\n📚 Grimoires encontrados:");
  const grimoires = await scanGrimoires();
  const grimoireMap = new Map(grimoires.map(g => [g.id, g]));
  for (const grimoire of grimoires) {
    console.log(`  📖 ${grimoire.id} (${grimoire.name}) - v${grimoire.version}`);
  }

  // Check for missing grimoires in realms
  console.log("\n🔍 Verificando grimoires de realms:");
  for (const realm of realms) {
    console.log(`\n  🏰 ${realm.id}:`);
    for (const grimoireId of realm.grimoires) {
      const exists = grimoireMap.has(grimoireId);
      const dirExists = existsSync(join(PACKAGES_ROOT, "grimoires", grimoireId));
      if (exists && dirExists) {
        console.log(`    ✅ ${grimoireId} - encontrado`);
      } else if (!exists && dirExists) {
        console.log(`    ⚠️  ${grimoireId} - directorio existe pero no tiene grimoire.json válido`);
      } else if (exists && !dirExists) {
        console.log(`    ⚠️  ${grimoireId} - en manifest pero directorio no existe`);
      } else {
        console.log(`    ❌ ${grimoireId} - NO ENCONTRADO`);
      }
    }
  }

  // Check hardcoded registry
  console.log("\n📋 Registro hardcodeado (GRIMOIRE_REGISTRY):");
  const { GRIMOIRE_REGISTRY } = await import("../apps/api/src/services/module-registry.ts");
  const realmGrimoiresFromRegistry = GRIMOIRE_REGISTRY.filter(g => g.category === "realm");
  console.log(`   Total grimoires de realm en registro: ${realmGrimoiresFromRegistry.length}`);
  for (const g of realmGrimoiresFromRegistry) {
    console.log(`   - ${g.key} (realmId: ${g.realmId})`);
  }

  // Compare
  console.log("\n📊 Comparación:");
  const realmGrimoiresFromFile = new Set(realms.flatMap(r => r.grimoires));
  const realmGrimoiresFromRegistrySet = new Set(realmGrimoiresFromRegistry.map(g => g.key));

  console.log(`   Grimoires en realm.json: ${[...realmGrimoiresFromFile].join(", ")}`);
  console.log(`   Grimoires en registry: ${[...realmGrimoiresFromRegistrySet].join(", ")}`);

  const missingFromRegistry = [...realmGrimoiresFromFile].filter(id => !realmGrimoiresFromRegistrySet.has(id));
  const missingFromRealms = [...realmGrimoiresFromRegistrySet].filter(id => !realmGrimoiresFromFile.has(id));

  if (missingFromRegistry.length > 0) {
    console.log(`\n   ⚠️  Grimoires en realm.json pero NO en registry: ${missingFromRegistry.join(", ")}`);
  }
  if (missingFromRealms.length > 0) {
    console.log(`\n   ⚠️  Grimoires en registry pero NO en realm.json: ${missingFromRealms.join(", ")}`);
  }

  console.log("\n" + "═".repeat(70));
  console.log("DIAGNÓSTICO COMPLETADO");
  console.log("═".repeat(70));
}

main().catch(console.error);
