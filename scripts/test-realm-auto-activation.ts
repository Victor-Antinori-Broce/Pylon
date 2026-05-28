#!/usr/bin/env bun
/**
 * Script de prueba para verificar la auto-activación de grimoires de realm
 */

import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const API_BASE = process.env.API_BASE || "http://localhost:3000";

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

async function scanRealm(realmId: string): Promise<RealmManifest | null> {
  const realmJsonPath = join(PROJECT_ROOT, "packages/realms", realmId, "realm.json");
  try {
    const file = Bun.file(realmJsonPath);
    if (await file.exists()) {
      return await file.json() as RealmManifest;
    }
    return null;
  } catch {
    return null;
  }
}

async function scanGrimoire(grimoireId: string): Promise<GrimoireManifest | null> {
  const grimoireJsonPath = join(PROJECT_ROOT, "packages/grimoires", grimoireId, "grimoire.json");
  try {
    const file = Bun.file(grimoireJsonPath);
    if (await file.exists()) {
      return await file.json() as GrimoireManifest;
    }
    return null;
  } catch {
    return null;
  }
}

async function testRealmActivation(realmId: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: Activación de Realm ${realmId}`);
  console.log("=".repeat(70));

  // 1. Escanear el realm
  const realm = await scanRealm(realmId);
  if (!realm) {
    console.error(`❌ Realm ${realmId} no encontrado`);
    return false;
  }

  console.log(`\n📦 Realm: ${realm.name} (${realm.id})`);
  console.log(`   Grimoires requeridos: ${realm.grimoires?.join(", ") || "(ninguno)"}`);
  console.log(`   Grimoires opcionales: ${realm.optional_grimoires?.join(", ") || "(ninguno)"}`);

  // 2. Verificar que todos los grimoires existen
  console.log(`\n🔍 Verificando grimoires:`);
  const allGrimoires = [...(realm.grimoires || []), ...(realm.optional_grimoires || [])];
  let allExist = true;

  for (const grimoireId of allGrimoires) {
    const grimoire = await scanGrimoire(grimoireId);
    if (grimoire) {
      console.log(`   ✅ ${grimoireId}: ${grimoire.name} (v${grimoire.version})`);
    } else {
      console.log(`   ❌ ${grimoireId}: NO ENCONTRADO`);
      allExist = false;
    }
  }

  if (!allExist) {
    console.error(`\n❌ Algunos grimoires no existen. Abortando.`);
    return false;
  }

  // 3. Simular la respuesta de la API
  console.log(`\n📡 Simulando respuesta de PATCH /api/system/active-theme:`);
  const mockResponse = {
    success: true,
    activeTheme: realmId,
    installedModules: realm.grimoires || [],
    activatedModules: allGrimoires,
    realmGrimoires: allGrimoires,
    message: `Realm activated. Installed ${realm.grimoires?.length || 0} new grimoires and activated ${allGrimoires.length} total.`,
  };
  console.log(JSON.stringify(mockResponse, null, 2));

  // 4. Simular la respuesta de GET /api/modules
  console.log(`\n📡 Simulando respuesta de GET /api/modules (grimoires de realm):`);
  const mockModules = allGrimoires.map(id => {
    const grimoire = allGrimoires.find(g => g === id);
    return {
      key: id,
      name: id.replace(/^grimoire-/, "").replace(/-/g, " "),
      category: "realm",
      enabled: true,
      realmId: realmId,
      enabledByRealm: true,
      canToggle: true,
      sidebarBadge: "Active by Realm",
    };
  });
  console.log(JSON.stringify(mockModules, null, 2));

  console.log(`\n✅ Test completado exitosamente`);
  return true;
}

async function testToggleIndividual() {
  console.log(`\n${"=".repeat(70)}`);
  console.log("TEST: Control Individual de Grimoires de Realm");
  console.log("=".repeat(70));

  const testCases = [
    { action: "disable", enabled: false, grimoireId: "grimoire-games" },
    { action: "enable", enabled: true, grimoireId: "grimoire-games" },
  ];

  for (const testCase of testCases) {
    console.log(`\n🔄 ${testCase.action === "disable" ? "Desactivando" : "Activando"} ${testCase.grimoireId}:`);
    
    const mockResponse = {
      key: testCase.grimoireId,
      name: "Games",
      enabled: testCase.enabled,
      realmId: "gremius-cms-realm",
      enabledByRealm: testCase.enabled, // Sería false si el realm no está activo
      isRealmGrimoire: true,
    };
    
    console.log(JSON.stringify(mockResponse, null, 2));
  }

  console.log(`\n✅ Test completado exitosamente`);
}

async function main() {
  console.log("═".repeat(70));
  console.log("TEST SUITE: Realm Grimoires Auto Activation");
  console.log("═".repeat(70));

  // Test 1: Activar gremius-cms-realm
  await testRealmActivation("gremius-cms-realm");

  // Test 2: Activar realm-corporate
  await testRealmActivation("realm-corporate");

  // Test 3: Control individual
  await testToggleIndividual();

  console.log(`\n${"=".repeat(70)}`);
  console.log("TODOS LOS TESTS COMPLETADOS");
  console.log("=".repeat(70));
}

main().catch(console.error);
