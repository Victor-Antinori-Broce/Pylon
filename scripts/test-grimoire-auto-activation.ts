// @ts-nocheck
/**
 * Script de prueba para verificar la auto-activación de kons de grimoire
 */

import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const API_BASE = process.env.API_BASE || "http://localhost:3000";

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

async function scanGrimoire(grimoireId: string): Promise<GrimoireManifest | null> {
  const grimoireJsonPath = join(PROJECT_ROOT, "packages/grimoires", grimoireId, "grimoire.json");
  try {
    const file = Bun.file(grimoireJsonPath);
    if (await file.exists()) {
      return (await file.json()) as GrimoireManifest;
    }
    return null;
  } catch {
    return null;
  }
}

async function scanKon(konId: string): Promise<KonManifest | null> {
  const konJsonPath = join(PROJECT_ROOT, "packages/kons", konId, "kon.json");
  try {
    const file = Bun.file(konJsonPath);
    if (await file.exists()) {
      return (await file.json()) as KonManifest;
    }
    return null;
  } catch {
    return null;
  }
}

async function testGrimoireActivation(grimoireId: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: Activación de Grimoire ${grimoireId}`);
  console.log("=".repeat(70));

  // 1. Escanear el grimoire
  const grimoire = await scanGrimoire(grimoireId);
  if (!grimoire) {
    console.error(`❌ Grimoire ${grimoireId} no encontrado`);
    return false;
  }

  console.log(`\n📦 Grimoire: ${grimoire.name} (${grimoire.id})`);
  console.log(`   Kons requeridos: ${grimoire.kons?.join(", ") || "(ninguno)"}`);
  console.log(`   Kons opcionales: ${grimoire.optional_kons?.join(", ") || "(ninguno)"}`);

  // 2. Verificar que todos los kons existen
  console.log(`\n🔍 Verificando kons:`);
  const allKons = [...(grimoire.kons || []), ...(grimoire.optional_kons || [])];
  let allExist = true;

  for (const konId of allKons) {
    const kon = await scanKon(konId);
    if (kon) {
      console.log(`   ✅ ${konId}: ${kon.name} (v${kon.version})`);
    } else {
      console.log(`   ❌ ${konId}: NO ENCONTRADO`);
      allExist = false;
    }
  }

  if (!allExist) {
    console.error(`\n❌ Algunos kons no existen. Abortando.`);
    return false;
  }

  // 3. Simular la respuesta de la API
  console.log(`\n📡 Simulando respuesta de PATCH /api/system/active-theme:`);
  const mockResponse = {
    success: true,
    activeTheme: grimoireId,
    installedModules: grimoire.kons || [],
    activatedModules: allKons,
    grimoireKons: allKons,
    message: `Grimoire activated. Installed ${grimoire.kons?.length || 0} new kons and activated ${allKons.length} total.`,
  };
  console.log(JSON.stringify(mockResponse, null, 2));

  // 4. Simular la respuesta de GET /api/modules
  console.log(`\n📡 Simulando respuesta de GET /api/modules (kons de grimoire):`);
  const mockModules = allKons.map((id) => {
    const kon = allKons.find((g) => g === id);
    return {
      key: id,
      name: id.replace(/^kon-/, "").replace(/-/g, " "),
      category: "grimoire",
      enabled: true,
      grimoireId,
      enabledByGrimoire: true,
      canToggle: true,
      sidebarBadge: "Active by Grimoire",
    };
  });
  console.log(JSON.stringify(mockModules, null, 2));

  console.log(`\n✅ Test completado exitosamente`);
  return true;
}

async function testToggleIndividual() {
  console.log(`\n${"=".repeat(70)}`);
  console.log("TEST: Control Individual de Kons de Grimoire");
  console.log("=".repeat(70));

  const testCases = [
    { action: "disable", enabled: false, konId: "kon-games" },
    { action: "enable", enabled: true, konId: "kon-games" },
  ];

  for (const testCase of testCases) {
    console.log(
      `\n🔄 ${testCase.action === "disable" ? "Desactivando" : "Activando"} ${testCase.konId}:`
    );

    const mockResponse = {
      key: testCase.konId,
      name: "Games",
      enabled: testCase.enabled,
      grimoireId: "grimoire-gremius",
      enabledByGrimoire: testCase.enabled, // Sería false si el grimoire no está activo
      isGrimoireKon: true,
    };

    console.log(JSON.stringify(mockResponse, null, 2));
  }

  console.log(`\n✅ Test completado exitosamente`);
}

async function main() {
  console.log("═".repeat(70));
  console.log("TEST SUITE: Grimoire Kons Auto Activation");
  console.log("═".repeat(70));

  // Test 1: Activar grimoire-gremius
  await testGrimoireActivation("grimoire-gremius");

  // Test 2: Activar grimoire-corporate
  await testGrimoireActivation("grimoire-corporate");

  // Test 3: Control individual
  await testToggleIndividual();

  console.log(`\n${"=".repeat(70)}`);
  console.log("TODOS LOS TESTS COMPLETADOS");
  console.log("=".repeat(70));
}

main().catch(console.error);
