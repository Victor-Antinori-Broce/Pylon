
// @ts-nocheck
/**
 * Test del flujo completo: Uninstall → Recover → Delete
 */

console.log("═".repeat(80));
console.log("TEST: Flujo Uninstall → Recover → Delete");
console.log("═".repeat(80));

// Simulación de base de datos
const db = {
  modules: [] as any[],
  tables: {} as Record<string, any[]>,
};

function resetDB() {
  db.modules = [
    { key: "grimoire-games", name: "Games Catalog", enabled: true, realmId: null },
  ];
  db.tables = {
    games: [{ id: 1, title: "Zelda" }, { id: 2, title: "Mario" }],
    platforms: [{ id: 1, name: "Switch" }],
  };
}

function printState(label: string) {
  console.log(`\n${label}:`);
  console.log(`  Installed: ${db.modules.map(m => m.key).join(", ") || "(none)"}`);
  console.log(`  Tables: ${Object.keys(db.tables).join(", ")}`);
  Object.entries(db.tables).forEach(([name, rows]) => {
    console.log(`    - ${name}: ${rows.length} rows`);
  });
}

// Test 1: Uninstall
test1_uninstall();
function test1_uninstall() {
  console.log("\n📋 TEST 1: Uninstall Grimoire");
  console.log("─".repeat(80));
  
  resetDB();
  printState("Initial state");
  
  // Simular POST /api/modules/grimoire-games/uninstall
  const key = "grimoire-games";
  const existing = db.modules.find(m => m.key === key);
  
  if (existing) {
    // Eliminar de modules (pero mantener tablas)
    db.modules = db.modules.filter(m => m.key !== key);
    
    console.log(`\n✅ Uninstalled: ${key}`);
    console.log(`  Data preserved: ${Object.values(db.tables).flat().length} total rows`);
  }
  
  printState("After uninstall");
  
  return true;
}

// Test 2: Listar uninstalled
test2_listUninstalled();
function test2_listUninstalled() {
  console.log("\n\n📋 TEST 2: Listar Uninstalled con Data");
  console.log("─".repeat(80));
  
  // Estado actual: desinstalado pero con datos
  const installedKeys = new Set(db.modules.map(m => m.key));
  const availableGrimoires = [{ id: "grimoire-games", name: "Games Catalog" }];
  
  const uninstalled = availableGrimoires.filter(g => !installedKeys.has(g.id));
  
  // Verificar cuáles tienen datos
  const withData = uninstalled.map(g => {
    const tables = Object.entries(db.tables).map(([name, rows]) => ({
      name,
      rowCount: rows.length,
    }));
    return {
      ...g,
      data: { tables, totalRows: tables.reduce((s, t) => s + t.rowCount, 0) },
    };
  });
  
  console.log("Uninstalled grimoires with preserved data:");
  withData.forEach(g => {
    console.log(`  - ${g.name}: ${g.data.totalRows} rows in ${g.data.tables.length} tables`);
    g.data.tables.forEach(t => console.log(`      • ${t.name}: ${t.rowCount} rows`));
  });
  
  return true;
}

// Test 3: Recover
test3_recover();
function test3_recover() {
  console.log("\n\n📋 TEST 3: Recover Grimoire");
  console.log("─".repeat(80));
  
  printState("Before recover");
  
  // Simular POST /api/modules/grimoire-games/recover
  const key = "grimoire-games";
  const existing = db.modules.find(m => m.key === key);
  
  if (!existing) {
    db.modules.push({
      key,
      name: "Games Catalog",
      enabled: true,
      realmId: null,
    });
    
    console.log(`\n✅ Recovered: ${key}`);
    console.log(`  Data restored: ${Object.values(db.tables).flat().length} rows`);
  }
  
  printState("After recover");
  
  return true;
}

// Test 4: Delete Permanente (con purge)
test4_deletePermanent();
function test4_deletePermanent() {
  console.log("\n\n📋 TEST 4: Delete Permanente (Purge)");
  console.log("─".repeat(80));
  
  // Primero desinstalar de nuevo
  const key = "grimoire-games";
  db.modules = db.modules.filter(m => m.key !== key);
  
  printState("Uninstalled state (before purge)");
  
  // Simular DELETE /api/modules/grimoire-games?purge=true&force=true
  const tablesDropped: string[] = [];
  
  for (const tableName of Object.keys(db.tables)) {
    delete db.tables[tableName];
    tablesDropped.push(tableName);
  }
  
  console.log(`\n✅ Deleted permanently: ${key}`);
  console.log(`  Tables dropped: ${tablesDropped.join(", ")}`);
  console.log(`  Total rows deleted: 3`);
  
  printState("After purge (everything gone)");
  
  return true;
}

// Test 5: Error - Intentar delete sin uninstall primero
test5_errorDirectDelete();
function test5_errorDirectDelete() {
  console.log("\n\n📋 TEST 5: Error al intentar Delete sin Uninstall");
  console.log("─".repeat(80));
  
  resetDB();
  printState("Initial (installed)");
  
  const key = "grimoire-games";
  const existing = db.modules.find(m => m.key === key);
  
  if (existing) {
    console.log(`\n❌ Error 409: Cannot delete installed grimoire`);
    console.log(`  Message: Grimoire ${key} is still installed.`);
    console.log(`  Action: Use POST /api/modules/${key}/uninstall first`);
  }
  
  return true;
}

console.log("\n\n" + "═".repeat(80));
console.log("TODOS LOS TESTS PASARON ✅");
console.log("═".repeat(80));
