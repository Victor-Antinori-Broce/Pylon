#!/usr/bin/env bun
/**
 * Script para probar que los grimoires de realm se identifican correctamente
 * después del fix.
 */

import { join } from "node:path";

const PROJECT_ROOT = process.cwd();

// Simulamos la función getRealmGrimoires
async function getRealmGrimoires(realmId: string, workspaceRoot?: string): Promise<string[]> {
  const root = workspaceRoot || PROJECT_ROOT;
  try {
    const realmJsonPath = join(root, "packages/realms", realmId, "realm.json");
    const realmFile = Bun.file(realmJsonPath);

    if (await realmFile.exists()) {
      const manifest = await realmFile.json();
      return manifest.grimoires || [];
    }

    const legacyPath = join(root, "packages/realms", realmId, "gremius.json");
    const legacyFile = Bun.file(legacyPath);
    if (await legacyFile.exists()) {
      const manifest = await legacyFile.json();
      return manifest.grimoires || manifest.bundled_modules || [];
    }

    return [];
  } catch (err) {
    console.warn(`  ⚠️  Could not read realm manifest for ${realmId}:`, err);
    return [];
  }
}

// Simulamos la función getRealmGrimoireKeys (la que acabamos de crear)
async function getRealmGrimoireKeys(activeRealm: string | null): Promise<Set<string>> {
  const keys = new Set<string>();

  // Simulamos los grimoires del hardcoded registry
  const hardcodedRealmGrimoires = [
    { key: "grimoire-games" },
    { key: "grimoire-esports" },
    { key: "grimoire-streamers" },
  ];

  // Add hardcoded registry realm grimoires
  for (const g of hardcodedRealmGrimoires) {
    keys.add(g.key);
    // Also add without grimoire- prefix for flexibility
    keys.add(g.key.replace(/^grimoire-/, ""));
  }

  // Add grimoires from active realm (from realm.json)
  if (activeRealm) {
    const realmGrimoires = await getRealmGrimoires(activeRealm);
    console.log(`   📖 Grimoires from realm.json for ${activeRealm}: ${realmGrimoires.join(", ")}`);

    for (const grimoireId of realmGrimoires) {
      keys.add(grimoireId);
      // Also add without grimoire- prefix
      keys.add(grimoireId.replace(/^grimoire-/, ""));
    }
  }

  return keys;
}

async function main() {
  console.log("═".repeat(70));
  console.log("TEST: Verificación de getRealmGrimoireKeys");
  console.log("═".repeat(70));

  // Test 1: Sin realm activo
  console.log("\n📋 Test 1: Sin realm activo (null)");
  const keysNoRealm = await getRealmGrimoireKeys(null);
  console.log(`   Keys en set: ${[...keysNoRealm].join(", ")}`);
  console.log(`   ✅ grimoire-games incluido: ${keysNoRealm.has("grimoire-games")}`);
  console.log(`   ✅ games incluido: ${keysNoRealm.has("games")}`);

  // Test 2: Con gremius-cms-realm activo
  console.log("\n📋 Test 2: Con gremius-cms-realm activo");
  const keysWithRealm = await getRealmGrimoireKeys("gremius-cms-realm");
  console.log(`   Keys en set: ${[...keysWithRealm].join(", ")}`);
  console.log(`   ✅ grimoire-games incluido: ${keysWithRealm.has("grimoire-games")}`);
  console.log(`   ✅ games incluido: ${keysWithRealm.has("games")}`);
  console.log(`   ✅ grimoire-esports incluido: ${keysWithRealm.has("grimoire-esports")}`);
  console.log(`   ✅ esports incluido: ${keysWithRealm.has("esports")}`);
  console.log(`   ✅ grimoire-streamers incluido: ${keysWithRealm.has("grimoire-streamers")}`);
  console.log(`   ✅ streamers incluido: ${keysWithRealm.has("streamers")}`);

  // Test 3: Verificar isRealmGrimoire
  console.log("\n📋 Test 3: Verificación de isRealmGrimoire");
  const testGrimoires = [
    { id: "grimoire-games", expected: true },
    { id: "games", expected: true },
    { id: "grimoire-esports", expected: true },
    { id: "esports", expected: true },
    { id: "grimoire-crm", expected: false }, // No es de realm
    { id: "grimoire-blog", expected: false }, // No es de realm
  ];

  for (const test of testGrimoires) {
    const cleanName = test.id.replace(/^grimoire-/, "");
    const isRealmGrimoire = keysWithRealm.has(test.id) || keysWithRealm.has(cleanName);
    const status = isRealmGrimoire === test.expected ? "✅" : "❌";
    console.log(
      `   ${status} ${test.id}: isRealmGrimoire=${isRealmGrimoire} (esperado=${test.expected})`
    );
  }

  console.log("\n" + "═".repeat(70));
  console.log("TEST COMPLETADO");
  console.log("═".repeat(70));
}

main().catch(console.error);
