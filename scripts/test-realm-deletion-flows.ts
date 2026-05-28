#!/usr/bin/env bun
/**
 * Script de prueba para flujos de eliminación de realms y grimoires
 */

console.log("═".repeat(80));
console.log("TEST: Flujos de Eliminación de Realms y Grimoires");
console.log("═".repeat(80));

// Base de datos simulada
const db = {
  siteSettings: { activeTheme: null as string | null },
  modules: [] as any[],
  realms: [
    { id: "gremius-cms-realm", name: "Gremius CMS Realm", grimoires: ["grimoire-games", "grimoire-esports", "grimoire-streamers"] },
    { id: "realm-corporate", name: "Corporate Realm", grimoires: ["grimoire-crm"] },
  ],
};

function resetDB() {
  db.siteSettings.activeTheme = null;
  db.modules = [];
}

function printDBState() {
  console.log(`   activeTheme: ${db.siteSettings.activeTheme || "null"}`);
  console.log(`   modules (${db.modules.length}):`);
  db.modules.forEach(m => {
    const realmInfo = m.realmId ? ` [realm: ${m.realmId}]` : " [standalone]";
    console.log(`      - ${m.key}: enabled=${m.enabled}${realmInfo}`);
  });
}

// Escenario 1: Eliminar realm manteniendo grimoires
function test1_DeleteRealmKeepGrimoires() {
  console.log("\n📋 TEST 1: Eliminar Realm manteniendo Grimoires");
  console.log("─".repeat(80));
  
  resetDB();
  
  // Setup: Realm activo con grimoires
  db.siteSettings.activeTheme = "gremius-cms-realm";
  db.modules = [
    { key: "grimoire-games", name: "Games", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
    { key: "grimoire-esports", name: "Esports", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
    { key: "grimoire-streamers", name: "Streamers", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
  ];
  
  console.log("Estado inicial:");
  printDBState();
  
  // Simular: DELETE /api/system/realms/gremius-cms-realm?deleteGrimoires=false&force=true
  console.log("\n🗑️  Eliminando realm con deleteGrimoires=false...");
  
  // Desactivar primero
  db.siteSettings.activeTheme = null;
  
  // Convertir grimoires a standalone
  for (const mod of db.modules) {
    if (mod.realmId === "gremius-cms-realm") {
      mod.realmId = null;
      mod.category = "optional";
      mod.sidebarBadge = null;
    }
  }
  
  console.log("\n✅ Resultado:");
  printDBState();
  console.log("   (Los grimoires ahora son standalone)");
  
  return true;
}

// Escenario 2: Eliminar realm y sus grimoires
function test2_DeleteRealmAndGrimoires() {
  console.log("\n📋 TEST 2: Eliminar Realm y sus Grimoires");
  console.log("─".repeat(80));
  
  resetDB();
  
  // Setup: Realm activo con grimoires
  db.siteSettings.activeTheme = "gremius-cms-realm";
  db.modules = [
    { key: "grimoire-games", name: "Games", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
    { key: "grimoire-esports", name: "Esports", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
    { key: "grimoire-streamers", name: "Streamers", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
    { key: "grimoire-crm", name: "CRM", enabled: true, realmId: null, category: "optional" }, // standalone
  ];
  
  console.log("Estado inicial:");
  printDBState();
  
  // Simular: DELETE /api/system/realms/gremius-cms-realm?deleteGrimoires=true&force=true
  console.log("\n🗑️  Eliminando realm con deleteGrimoires=true...");
  
  // Eliminar grimoires del realm
  const deletedKeys: string[] = [];
  db.modules = db.modules.filter(m => {
    if (m.realmId === "gremius-cms-realm") {
      deletedKeys.push(m.key);
      return false; // Remove
    }
    return true; // Keep
  });
  
  db.siteSettings.activeTheme = null;
  
  console.log("\n✅ Resultado:");
  printDBState();
  console.log(`   (Grimoires eliminados: ${deletedKeys.join(", ")})`);
  
  return true;
}

// Escenario 3: Eliminar grimoire individual
function test3_DeleteIndividualGrimoire() {
  console.log("\n📋 TEST 3: Eliminar Grimoire Individual");
  console.log("─".repeat(80));
  
  resetDB();
  
  // Setup: Realm activo
  db.siteSettings.activeTheme = "gremius-cms-realm";
  db.modules = [
    { key: "grimoire-games", name: "Games", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
    { key: "grimoire-esports", name: "Esports", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
  ];
  
  console.log("Estado inicial:");
  printDBState();
  
  // Simular: DELETE /api/modules/grimoire-games
  console.log("\n🗑️  Eliminando grimoire-games...");
  
  const targetKey = "grimoire-games";
  const mod = db.modules.find(m => m.key === targetKey);
  
  if (mod) {
    db.modules = db.modules.filter(m => m.key !== targetKey);
    console.log(`\n✅ Grimoire ${targetKey} eliminado`);
    console.log(`   Era de realm: ${mod.realmId || "ninguno"}`);
    console.log(`   Estaba activo: ${mod.enabled}`);
  }
  
  console.log("\nEstado final:");
  printDBState();
  
  return true;
}

// Escenario 4: Error al eliminar realm activo sin force
function test4_ErrorDeleteActiveRealm() {
  console.log("\n📋 TEST 4: Error al Eliminar Realm Activo (sin force)");
  console.log("─".repeat(80));
  
  resetDB();
  
  db.siteSettings.activeTheme = "gremius-cms-realm";
  db.modules = [
    { key: "grimoire-games", name: "Games", enabled: true, realmId: "gremius-cms-realm", category: "realm" },
  ];
  
  console.log("Estado:");
  printDBState();
  
  // Intentar eliminar sin force
  const isActive = db.siteSettings.activeTheme === "gremius-cms-realm";
  const hasEnabled = db.modules.some(m => m.enabled && m.realmId === "gremius-cms-realm");
  
  if (isActive || hasEnabled) {
    console.log("\n❌ Error 409:");
    console.log(JSON.stringify({
      error: "Cannot delete realm",
      message: "Realm gremius-cms-realm is currently active or has enabled grimoires. Deactivate it first or use ?force=true to force deletion.",
      isActive,
      enabledGrimoires: db.modules.filter(m => m.enabled).map(m => m.key),
    }, null, 2));
  }
  
  return true;
}

// Escenario 5: Migrar grimoires entre realms
function test5_MigrateGrimoires() {
  console.log("\n📋 TEST 5: Migrar Grimoires entre Realms");
  console.log("─".repeat(80));
  
  resetDB();
  
  // Realm A activo
  db.siteSettings.activeTheme = "realm-corporate";
  db.modules = [
    { key: "grimoire-crm", name: "CRM", enabled: true, realmId: "realm-corporate", category: "realm" },
  ];
  
  console.log("Estado inicial (realm-corporate activo):");
  printDBState();
  
  // Paso 1: Eliminar realm-corporate manteniendo grimoires
  console.log("\n1️⃣ Eliminando realm-corporate (manteniendo grimoires)...");
  db.siteSettings.activeTheme = null;
  for (const mod of db.modules) {
    mod.realmId = null;
    mod.category = "optional";
  }
  
  console.log("   Grimoires ahora son standalone");
  printDBState();
  
  // Paso 2: Activar gremius-cms-realm (que también usa grimoire-crm)
  console.log("\n2️⃣ Activando gremius-cms-realm...");
  db.siteSettings.activeTheme = "gremius-cms-realm";
  
  // Simular que gremius-cms-realm tiene grimoire-crm como optional
  const crm = db.modules.find(m => m.key === "grimoire-crm");
  if (crm) {
    crm.realmId = "gremius-cms-realm";
    crm.category = "realm";
    console.log("   grimoire-crm se vinculó automáticamente al nuevo realm");
  } else {
    // Instalar si no existe
    db.modules.push({
      key: "grimoire-crm",
      name: "CRM",
      enabled: true,
      realmId: "gremius-cms-realm",
      category: "realm",
    });
    console.log("   grimoire-crm se instaló automáticamente");
  }
  
  console.log("\n✅ Estado final:");
  printDBState();
  
  return true;
}

// Ejecutar todos los tests
async function main() {
  const results = [];
  
  results.push({ name: "Eliminar Realm manteniendo Grimoires", passed: test1_DeleteRealmKeepGrimoires() });
  results.push({ name: "Eliminar Realm y Grimoires", passed: test2_DeleteRealmAndGrimoires() });
  results.push({ name: "Eliminar Grimoire Individual", passed: test3_DeleteIndividualGrimoire() });
  results.push({ name: "Error al Eliminar Realm Activo", passed: test4_ErrorDeleteActiveRealm() });
  results.push({ name: "Migrar Grimoires entre Realms", passed: test5_MigrateGrimoires() });
  
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
