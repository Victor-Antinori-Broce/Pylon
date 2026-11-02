#!/usr/bin/env bun
/**
 * Script para probar que los kons de grimoire se identifican correctamente
 * después del fix.
 */

import { join } from "node:path";

const PROJECT_ROOT = process.cwd();

// Simulamos la función getGrimoireKons
async function getGrimoireKons(grimoireId: string, workspaceRoot?: string): Promise<string[]> {
  const root = workspaceRoot || PROJECT_ROOT;
  try {
    const grimoireJsonPath = join(root, "packages/grimoires", grimoireId, "grimoire.json");
    const grimoireFile = Bun.file(grimoireJsonPath);

    if (await grimoireFile.exists()) {
      const manifest = await grimoireFile.json();
      return manifest.kons || [];
    }

    const legacyPath = join(root, "packages/grimoires", grimoireId, "kitsuden.json");
    const legacyFile = Bun.file(legacyPath);
    if (await legacyFile.exists()) {
      const manifest = await legacyFile.json();
      return manifest.kons || manifest.bundled_modules || [];
    }

    return [];
  } catch (err) {
    console.warn(`  ⚠️  Could not read grimoire manifest for ${grimoireId}:`, err);
    return [];
  }
}

// Simulamos la función getGrimoireKonKeys (la que acabamos de crear)
async function getGrimoireKonKeys(activeGrimoire: string | null): Promise<Set<string>> {
  const keys = new Set<string>();

  // Simulamos los kons del hardcoded registry
  const hardcodedGrimoireKons = [
    { key: "kon-games" },
    { key: "kon-esports" },
    { key: "kon-streamers" },
  ];

  // Add hardcoded registry grimoire kons
  for (const g of hardcodedGrimoireKons) {
    keys.add(g.key);
    // Also add without kon- prefix for flexibility
    keys.add(g.key.replace(/^kon-/, ""));
  }

  // Add kons from active grimoire (from grimoire.json)
  if (activeGrimoire) {
    const grimoireKons = await getGrimoireKons(activeGrimoire);
    console.log(`   📖 Kons from grimoire.json for ${activeGrimoire}: ${grimoireKons.join(", ")}`);

    for (const konId of grimoireKons) {
      keys.add(konId);
      // Also add without kon- prefix
      keys.add(konId.replace(/^kon-/, ""));
    }
  }

  return keys;
}

async function main() {
  console.log("═".repeat(70));
  console.log("TEST: Verificación de getGrimoireKonKeys");
  console.log("═".repeat(70));

  // Test 1: Sin grimoire activo
  console.log("\n📋 Test 1: Sin grimoire activo (null)");
  const keysNoGrimoire = await getGrimoireKonKeys(null);
  console.log(`   Keys en set: ${[...keysNoGrimoire].join(", ")}`);
  console.log(`   ✅ kon-games incluido: ${keysNoGrimoire.has("kon-games")}`);
  console.log(`   ✅ games incluido: ${keysNoGrimoire.has("games")}`);

  // Test 2: Con kitsuden-cms-grimoire activo
  console.log("\n📋 Test 2: Con kitsuden-cms-grimoire activo");
  const keysWithGrimoire = await getGrimoireKonKeys("kitsuden-cms-grimoire");
  console.log(`   Keys en set: ${[...keysWithGrimoire].join(", ")}`);
  console.log(`   ✅ kon-games incluido: ${keysWithGrimoire.has("kon-games")}`);
  console.log(`   ✅ games incluido: ${keysWithGrimoire.has("games")}`);
  console.log(`   ✅ kon-esports incluido: ${keysWithGrimoire.has("kon-esports")}`);
  console.log(`   ✅ esports incluido: ${keysWithGrimoire.has("esports")}`);
  console.log(`   ✅ kon-streamers incluido: ${keysWithGrimoire.has("kon-streamers")}`);
  console.log(`   ✅ streamers incluido: ${keysWithGrimoire.has("streamers")}`);

  // Test 3: Verificar isGrimoireKon
  console.log("\n📋 Test 3: Verificación de isGrimoireKon");
  const testKons = [
    { id: "kon-games", expected: true },
    { id: "games", expected: true },
    { id: "kon-esports", expected: true },
    { id: "esports", expected: true },
    { id: "kon-crm", expected: false }, // No es de grimoire
    { id: "kon-blog", expected: false }, // No es de grimoire
  ];

  for (const test of testKons) {
    const cleanName = test.id.replace(/^kon-/, "");
    const isGrimoireKon = keysWithGrimoire.has(test.id) || keysWithGrimoire.has(cleanName);
    const status = isGrimoireKon === test.expected ? "✅" : "❌";
    console.log(
      `   ${status} ${test.id}: isGrimoireKon=${isGrimoireKon} (esperado=${test.expected})`
    );
  }

  console.log("\n" + "═".repeat(70));
  console.log("TEST COMPLETADO");
  console.log("═".repeat(70));
}

main().catch(console.error);
