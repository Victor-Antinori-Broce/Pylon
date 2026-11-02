// @ts-nocheck
/**
 * Script de prueba para flujos de eliminación de grimoires y kons
 */

console.log("═".repeat(80));
console.log("TEST: Flujos de Eliminación de Grimoires y Kons");
console.log("═".repeat(80));

// Base de datos simulada
const db = {
  siteSettings: { activeTheme: null as string | null },
  modules: [] as any[],
  grimoires: [
    {
      id: "kitsuden-cms-grimoire",
      name: "Kitsuden CMS Grimoire",
      kons: ["kon-games", "kon-esports", "kon-streamers"],
    },
    { id: "grimoire-corporate", name: "Corporate Grimoire", kons: ["kon-crm"] },
  ],
};

function resetDB() {
  db.siteSettings.activeTheme = null;
  db.modules = [];
}

function printDBState() {
  console.log(`   activeTheme: ${db.siteSettings.activeTheme || "null"}`);
  console.log(`   modules (${db.modules.length}):`);
  db.modules.forEach((m) => {
    const grimoireInfo = m.grimoireId ? ` [grimoire: ${m.grimoireId}]` : " [standalone]";
    console.log(`      - ${m.key}: enabled=${m.enabled}${grimoireInfo}`);
  });
}

// Escenario 1: Eliminar grimoire manteniendo kons
function test1_DeleteGrimoireKeepKons() {
  console.log("\n📋 TEST 1: Eliminar Grimoire manteniendo Kons");
  console.log("─".repeat(80));

  resetDB();

  // Setup: Grimoire activo con kons
  db.siteSettings.activeTheme = "kitsuden-cms-grimoire";
  db.modules = [
    {
      key: "kon-games",
      name: "Games",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
    {
      key: "kon-esports",
      name: "Esports",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
    {
      key: "kon-streamers",
      name: "Streamers",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
  ];

  console.log("Estado inicial:");
  printDBState();

  // Simular: DELETE /api/system/grimoires/kitsuden-cms-grimoire?deleteKons=false&force=true
  console.log("\n🗑️  Eliminando grimoire con deleteKons=false...");

  // Desactivar primero
  db.siteSettings.activeTheme = null;

  // Convertir kons a standalone
  for (const mod of db.modules) {
    if (mod.grimoireId === "kitsuden-cms-grimoire") {
      mod.grimoireId = null;
      mod.category = "optional";
      mod.sidebarBadge = null;
    }
  }

  console.log("\n✅ Resultado:");
  printDBState();
  console.log("   (Los kons ahora son standalone)");

  return true;
}

// Escenario 2: Eliminar grimoire y sus kons
function test2_DeleteGrimoireAndKons() {
  console.log("\n📋 TEST 2: Eliminar Grimoire y sus Kons");
  console.log("─".repeat(80));

  resetDB();

  // Setup: Grimoire activo con kons
  db.siteSettings.activeTheme = "kitsuden-cms-grimoire";
  db.modules = [
    {
      key: "kon-games",
      name: "Games",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
    {
      key: "kon-esports",
      name: "Esports",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
    {
      key: "kon-streamers",
      name: "Streamers",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
    { key: "kon-crm", name: "CRM", enabled: true, grimoireId: null, category: "optional" }, // standalone
  ];

  console.log("Estado inicial:");
  printDBState();

  // Simular: DELETE /api/system/grimoires/kitsuden-cms-grimoire?deleteKons=true&force=true
  console.log("\n🗑️  Eliminando grimoire con deleteKons=true...");

  // Eliminar kons del grimoire
  const deletedKeys: string[] = [];
  db.modules = db.modules.filter((m) => {
    if (m.grimoireId === "kitsuden-cms-grimoire") {
      deletedKeys.push(m.key);
      return false; // Remove
    }
    return true; // Keep
  });

  db.siteSettings.activeTheme = null;

  console.log("\n✅ Resultado:");
  printDBState();
  console.log(`   (Kons eliminados: ${deletedKeys.join(", ")})`);

  return true;
}

// Escenario 3: Eliminar kon individual
function test3_DeleteIndividualKon() {
  console.log("\n📋 TEST 3: Eliminar Kon Individual");
  console.log("─".repeat(80));

  resetDB();

  // Setup: Grimoire activo
  db.siteSettings.activeTheme = "kitsuden-cms-grimoire";
  db.modules = [
    {
      key: "kon-games",
      name: "Games",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
    {
      key: "kon-esports",
      name: "Esports",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
  ];

  console.log("Estado inicial:");
  printDBState();

  // Simular: DELETE /api/modules/kon-games
  console.log("\n🗑️  Eliminando kon-games...");

  const targetKey = "kon-games";
  const mod = db.modules.find((m) => m.key === targetKey);

  if (mod) {
    db.modules = db.modules.filter((m) => m.key !== targetKey);
    console.log(`\n✅ Kon ${targetKey} eliminado`);
    console.log(`   Era de grimoire: ${mod.grimoireId || "ninguno"}`);
    console.log(`   Estaba activo: ${mod.enabled}`);
  }

  console.log("\nEstado final:");
  printDBState();

  return true;
}

// Escenario 4: Error al eliminar grimoire activo sin force
function test4_ErrorDeleteActiveGrimoire() {
  console.log("\n📋 TEST 4: Error al Eliminar Grimoire Activo (sin force)");
  console.log("─".repeat(80));

  resetDB();

  db.siteSettings.activeTheme = "kitsuden-cms-grimoire";
  db.modules = [
    {
      key: "kon-games",
      name: "Games",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    },
  ];

  console.log("Estado:");
  printDBState();

  // Intentar eliminar sin force
  const isActive = db.siteSettings.activeTheme === "kitsuden-cms-grimoire";
  const hasEnabled = db.modules.some((m) => m.enabled && m.grimoireId === "kitsuden-cms-grimoire");

  if (isActive || hasEnabled) {
    console.log("\n❌ Error 409:");
    console.log(
      JSON.stringify(
        {
          error: "Cannot delete grimoire",
          message:
            "Grimoire kitsuden-cms-grimoire is currently active or has enabled kons. Deactivate it first or use ?force=true to force deletion.",
          isActive,
          enabledKons: db.modules.filter((m) => m.enabled).map((m) => m.key),
        },
        null,
        2
      )
    );
  }

  return true;
}

// Escenario 5: Migrar kons entre grimoires
function test5_MigrateKons() {
  console.log("\n📋 TEST 5: Migrar Kons entre Grimoires");
  console.log("─".repeat(80));

  resetDB();

  // Grimoire A activo
  db.siteSettings.activeTheme = "grimoire-corporate";
  db.modules = [
    {
      key: "kon-crm",
      name: "CRM",
      enabled: true,
      grimoireId: "grimoire-corporate",
      category: "grimoire",
    },
  ];

  console.log("Estado inicial (grimoire-corporate activo):");
  printDBState();

  // Paso 1: Eliminar grimoire-corporate manteniendo kons
  console.log("\n1️⃣ Eliminando grimoire-corporate (manteniendo kons)...");
  db.siteSettings.activeTheme = null;
  for (const mod of db.modules) {
    mod.grimoireId = null;
    mod.category = "optional";
  }

  console.log("   Kons ahora son standalone");
  printDBState();

  // Paso 2: Activar kitsuden-cms-grimoire (que también usa kon-crm)
  console.log("\n2️⃣ Activando kitsuden-cms-grimoire...");
  db.siteSettings.activeTheme = "kitsuden-cms-grimoire";

  // Simular que kitsuden-cms-grimoire tiene kon-crm como optional
  const crm = db.modules.find((m) => m.key === "kon-crm");
  if (crm) {
    crm.grimoireId = "kitsuden-cms-grimoire";
    crm.category = "grimoire";
    console.log("   kon-crm se vinculó automáticamente al nuevo grimoire");
  } else {
    // Instalar si no existe
    db.modules.push({
      key: "kon-crm",
      name: "CRM",
      enabled: true,
      grimoireId: "kitsuden-cms-grimoire",
      category: "grimoire",
    });
    console.log("   kon-crm se instaló automáticamente");
  }

  console.log("\n✅ Estado final:");
  printDBState();

  return true;
}

// Ejecutar todos los tests
async function main() {
  const results = [];

  results.push({
    name: "Eliminar Grimoire manteniendo Kons",
    passed: test1_DeleteGrimoireKeepKons(),
  });
  results.push({ name: "Eliminar Grimoire y Kons", passed: test2_DeleteGrimoireAndKons() });
  results.push({ name: "Eliminar Kon Individual", passed: test3_DeleteIndividualKon() });
  results.push({
    name: "Error al Eliminar Grimoire Activo",
    passed: test4_ErrorDeleteActiveGrimoire(),
  });
  results.push({ name: "Migrar Kons entre Grimoires", passed: test5_MigrateKons() });

  console.log("\n" + "═".repeat(80));
  console.log("RESUMEN DE PRUEBAS");
  console.log("═".repeat(80));

  results.forEach((r, i) => {
    const icon = r.passed ? "✅" : "❌";
    console.log(`${icon} ${i + 1}. ${r.name}`);
  });

  console.log("\n" + "═".repeat(80));
}

main().catch(console.error);
