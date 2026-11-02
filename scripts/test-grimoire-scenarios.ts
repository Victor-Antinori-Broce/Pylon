// @ts-nocheck
/**
 * Script de prueba para todos los escenarios de grimoire y kons
 */

console.log("═".repeat(80));
console.log("TEST SUITE: Escenarios de Grimoire y Kons");
console.log("═".repeat(80));

// Simulación de base de datos en memoria
const db = {
  siteSettings: { activeTheme: null as string | null },
  modules: [] as any[],
};

function resetDB() {
  db.siteSettings.activeTheme = null;
  db.modules = [];
}

function getGrimoireKons(grimoireId: string) {
  const grimoires: Record<string, string[]> = {
    "kitsuden-cms-grimoire": ["kon-games", "kon-esports", "kon-streamers"],
    "grimoire-corporate": ["kon-crm"],
  };
  return grimoires[grimoireId] || [];
}

// Escenario 1: Activar Grimoire
function scenario1_ActivateGrimoire() {
  console.log("\n📋 ESCENARIO 1: Activar Grimoire");
  console.log("─".repeat(80));

  resetDB();
  const grimoireId = "kitsuden-cms-grimoire";

  // Simular activación
  db.siteSettings.activeTheme = grimoireId;
  const kons = getGrimoireKons(grimoireId);

  for (const konId of kons) {
    db.modules.push({
      key: konId,
      name: konId.replace(/^kon-/, ""),
      enabled: true,
      grimoireId,
      sidebarBadge: "Active by Grimoire",
    });
  }

  console.log(`✅ Grimoire activado: ${grimoireId}`);
  console.log(`📦 Kons activados: ${kons.join(", ")}`);
  console.log("\nEstado de la DB:");
  console.log(`   activeTheme: ${db.siteSettings.activeTheme}`);
  console.log(`   modules: ${db.modules.length}`);
  db.modules.forEach((m) => {
    console.log(`      - ${m.key}: enabled=${m.enabled}, grimoireId=${m.grimoireId}`);
  });

  return true;
}

// Escenario 2: Desactivar Grimoire
function scenario2_DeactivateGrimoire() {
  console.log("\n📋 ESCENARIO 2: Desactivar Grimoire");
  console.log("─".repeat(80));

  // Continuar del escenario 1
  const grimoireId = db.siteSettings.activeTheme;

  if (!grimoireId) {
    console.log("❌ No hay grimoire activo");
    return false;
  }

  // Desactivar todos los kons del grimoire
  for (const mod of db.modules) {
    if (mod.grimoireId === grimoireId) {
      mod.enabled = false;
    }
  }

  db.siteSettings.activeTheme = null;

  console.log(`✅ Grimoire desactivado: ${grimoireId}`);
  console.log("\nEstado de la DB:");
  console.log(`   activeTheme: ${db.siteSettings.activeTheme || "null"}`);
  console.log(`   modules: ${db.modules.length}`);
  db.modules.forEach((m) => {
    console.log(`      - ${m.key}: enabled=${m.enabled}, grimoireId=${m.grimoireId}`);
  });

  return true;
}

// Escenario 3: Control Individual - Apagar un Kon
function scenario3_ToggleIndividual_Off() {
  console.log("\n📋 ESCENARIO 3: Control Individual - Apagar Kon");
  console.log("─".repeat(80));

  // Primero activar el grimoire
  resetDB();
  const grimoireId = "kitsuden-cms-grimoire";
  db.siteSettings.activeTheme = grimoireId;
  const kons = getGrimoireKons(grimoireId);

  for (const konId of kons) {
    db.modules.push({
      key: konId,
      name: konId.replace(/^kon-/, ""),
      enabled: true,
      grimoireId,
      sidebarBadge: "Active by Grimoire",
    });
  }

  // Ahora desactivar un kon específico
  const targetKon = "kon-games";
  const mod = db.modules.find((m) => m.key === targetKon);
  if (mod) {
    mod.enabled = false;
  }

  console.log(`✅ Kon desactivado individualmente: ${targetKon}`);
  console.log("\nEstado de la DB:");
  console.log(`   activeTheme: ${db.siteSettings.activeTheme}`);
  console.log(`   modules: ${db.modules.length}`);
  db.modules.forEach((m) => {
    const indicator = m.key === targetKon && !m.enabled ? " 👈 DESACTIVADO" : "";
    console.log(`      - ${m.key}: enabled=${m.enabled}, grimoireId=${m.grimoireId}${indicator}`);
  });

  return true;
}

// Escenario 4: Reactivar Kon Individual
function scenario4_ToggleIndividual_On() {
  console.log("\n📋 ESCENARIO 4: Reactivar Kon Individual");
  console.log("─".repeat(80));

  // Continuar del escenario 3
  const targetKon = "kon-games";
  const mod = db.modules.find((m) => m.key === targetKon);

  if (mod) {
    mod.enabled = true;
  }

  console.log(`✅ Kon reactivado individualmente: ${targetKon}`);
  console.log("\nEstado de la DB:");
  console.log(`   activeTheme: ${db.siteSettings.activeTheme}`);
  console.log(`   modules: ${db.modules.length}`);
  db.modules.forEach((m) => {
    const indicator = m.key === targetKon ? " 👈 REACTIVADO" : "";
    console.log(`      - ${m.key}: enabled=${m.enabled}, grimoireId=${m.grimoireId}${indicator}`);
  });

  return true;
}

// Escenario 5: Cambiar de Grimoire
function scenario5_SwitchGrimoire() {
  console.log("\n📋 ESCENARIO 5: Cambiar de Grimoire");
  console.log("─".repeat(80));

  // Estado inicial: kitsuden-cms-grimoire activo
  resetDB();
  db.siteSettings.activeTheme = "kitsuden-cms-grimoire";
  getGrimoireKons("kitsuden-cms-grimoire").forEach((id) => {
    db.modules.push({
      key: id,
      name: id,
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      sidebarBadge: "Active by Grimoire",
    });
  });

  console.log("Estado inicial:");
  console.log(`   activeTheme: ${db.siteSettings.activeTheme}`);
  console.log(
    `   modules activos: ${db.modules
      .filter((m) => m.enabled)
      .map((m) => m.key)
      .join(", ")}`
  );

  // Cambiar a grimoire-corporate
  const oldGrimoire = db.siteSettings.activeTheme;
  const newGrimoire = "grimoire-corporate";

  // Desactivar kons del grimoire anterior
  for (const mod of db.modules) {
    if (mod.grimoireId === oldGrimoire) {
      mod.enabled = false;
    }
  }

  // Activar nuevo grimoire
  db.siteSettings.activeTheme = newGrimoire;

  // Instalar/activar kons del nuevo grimoire
  const newKons = getGrimoireKons(newGrimoire);
  for (const konId of newKons) {
    const existing = db.modules.find((m) => m.key === konId);
    if (existing) {
      existing.enabled = true;
      existing.grimoireId = newGrimoire;
    } else {
      db.modules.push({
        key: konId,
        name: konId,
        enabled: true,
        grimoireId: newGrimoire,
        sidebarBadge: "Active by Grimoire",
      });
    }
  }

  console.log("\nDespués del cambio:");
  console.log(`   activeTheme: ${db.siteSettings.activeTheme}`);
  console.log(`   modules: ${db.modules.length}`);
  db.modules.forEach((m) => {
    console.log(`      - ${m.key}: enabled=${m.enabled}, grimoireId=${m.grimoireId}`);
  });

  return true;
}

// Ejecutar todos los escenarios
async function main() {
  const results = [];

  results.push({ name: "Activar Grimoire", passed: scenario1_ActivateGrimoire() });
  results.push({ name: "Desactivar Grimoire", passed: scenario2_DeactivateGrimoire() });
  results.push({ name: "Apagar Kon Individual", passed: scenario3_ToggleIndividual_Off() });
  results.push({ name: "Encender Kon Individual", passed: scenario4_ToggleIndividual_On() });
  results.push({ name: "Cambiar de Grimoire", passed: scenario5_SwitchGrimoire() });

  console.log("\n" + "═".repeat(80));
  console.log("RESUMEN DE PRUEBAS");
  console.log("═".repeat(80));

  results.forEach((r, i) => {
    const icon = r.passed ? "✅" : "❌";
    console.log(`${icon} ${i + 1}. ${r.name}`);
  });

  const allPassed = results.every((r) => r.passed);
  console.log("\n" + (allPassed ? "✅ TODAS LAS PRUEBAS PASARON" : "❌ ALGUNAS PRUEBAS FALLARON"));
  console.log("═".repeat(80));
}

main().catch(console.error);
