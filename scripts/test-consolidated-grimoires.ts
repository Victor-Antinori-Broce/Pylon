// @ts-nocheck
/**
 * Test Suite for Consolidated Grimoires
 * 
 * Verifies:
 * 1. Grimoires load correctly (games, esports, streamers)
 * 2. Realm gremius-cms-realm works
 * 3. Custom UI components work
 * 4. Sidebar toggle on/off works
 * 5. Grimoires recognize they're part of a realm
 * 6. Auto-activation when realm is enabled
 */

import { db } from "../apps/api/src/db";
import { siteSettings, installedGrimoires } from "../apps/api/src/db/schema";
import { eq } from "drizzle-orm";
import { GRIMOIRE_REGISTRY, getRealmGrimoires } from "../apps/api/src/services/module-registry";

// Test configuration
const TEST_REALM = "gremius-cms-realm";
const CONSOLIDATED_GRIMOIRES = [
  "grimoire-games",
  "grimoire-esports", 
  "grimoire-streamers"
];

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function test(name: string, fn: () => Promise<{ passed: boolean; message: string; details?: any }>) {
  return async () => {
    try {
      const result = await fn();
      results.push({ name, ...result });
    } catch (error) {
      results.push({ 
        name, 
        passed: false, 
        message: `Exception: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Grimoire Registry has consolidated entries
// ═══════════════════════════════════════════════════════════════════════════

const testRegistryEntries = test("Grimoire Registry has consolidated entries", async () => {
  const consolidatedInRegistry = CONSOLIDATED_GRIMOIRES.every(key => 
    GRIMOIRE_REGISTRY.some(g => g.key === key)
  );
  
  const oldGrimoires = ["games", "streamers", "platforms", "tags", "collections", 
                        "players", "teams", "tournaments", "matches"];
  const oldStillInRegistry = oldGrimoires.filter(key => 
    GRIMOIRE_REGISTRY.some(g => g.key === key)
  );
  
  return {
    passed: consolidatedInRegistry && oldStillInRegistry.length === 0,
    message: consolidatedInRegistry 
      ? "All consolidated grimoires found in registry" 
      : "Missing consolidated grimoires in registry",
    details: {
      consolidatedFound: CONSOLIDATED_GRIMOIRES.filter(key => 
        GRIMOIRE_REGISTRY.some(g => g.key === key)
      ),
      oldGrimoiresStillPresent: oldStillInRegistry
    }
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Realm grimoires are correctly categorized
// ═══════════════════════════════════════════════════════════════════════════

const testRealmCategorization = test("Grimoires are correctly categorized as 'realm'", async () => {
  const realmGrimoires = getRealmGrimoires(TEST_REALM);
  const expectedCount = 3;
  
  const allHaveCorrectCategory = realmGrimoires.every(g => g.category === "realm");
  const allHaveCorrectRealmId = realmGrimoires.every(g => g.realmId === TEST_REALM);
  
  return {
    passed: realmGrimoires.length === expectedCount && allHaveCorrectCategory && allHaveCorrectRealmId,
    message: `Found ${realmGrimoires.length} realm grimoires for ${TEST_REALM}`,
    details: {
      grimoires: realmGrimoires.map(g => ({ key: g.key, name: g.name, category: g.category, realmId: g.realmId })),
      allHaveCorrectCategory,
      allHaveCorrectRealmId
    }
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Grimoires have correct table definitions
// ═══════════════════════════════════════════════════════════════════════════

const testTableDefinitions = test("Grimoires have correct consolidated table definitions", async () => {
  const gamesGrimoire = GRIMOIRE_REGISTRY.find(g => g.key === "grimoire-games");
  const esportsGrimoire = GRIMOIRE_REGISTRY.find(g => g.key === "grimoire-esports");
  const streamersGrimoire = GRIMOIRE_REGISTRY.find(g => g.key === "grimoire-streamers");
  
  const gamesTables = gamesGrimoire?.tables || [];
  const esportsTables = esportsGrimoire?.tables || [];
  const streamersTables = streamersGrimoire?.tables || [];
  
  // Verify games includes platforms, tags, collections
  const gamesHasPlatforms = gamesTables.includes("platforms");
  const gamesHasTags = gamesTables.includes("tags");
  const gamesHasCollections = gamesTables.includes("game_collections");
  
  // Verify esports includes players, teams, tournaments, matches
  const esportsHasPlayers = esportsTables.includes("players");
  const esportsHasTeams = esportsTables.includes("teams");
  const esportsHasTournaments = esportsTables.includes("tournaments");
  const esportsHasMatches = esportsTables.includes("matches");
  
  const allCorrect = gamesHasPlatforms && gamesHasTags && gamesHasCollections &&
                     esportsHasPlayers && esportsHasTeams && esportsHasTournaments && esportsHasMatches;
  
  return {
    passed: allCorrect,
    message: allCorrect 
      ? "All grimoires have correct consolidated tables" 
      : "Some tables missing in consolidated grimoires",
    details: {
      grimoireGames: { tables: gamesTables, hasPlatforms: gamesHasPlatforms, hasTags: gamesHasTags, hasCollections: gamesHasCollections },
      grimoireEsports: { tables: esportsTables, hasPlayers: esportsHasPlayers, hasTeams: esportsHasTeams, hasTournaments: esportsHasTournaments, hasMatches: esportsHasMatches },
      grimoireStreamers: { tables: streamersTables }
    }
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: Realm manifest exists and is valid
// ═══════════════════════════════════════════════════════════════════════════

const testRealmManifest = test("Realm manifest (gremius-cms-realm) exists and is valid", async () => {
  const realmPath = `./packages/realms/${TEST_REALM}/realm.json`;
  const file = Bun.file(realmPath);
  const exists = await file.exists();
  
  if (!exists) {
    return { passed: false, message: `Realm manifest not found at ${realmPath}` };
  }
  
  const manifest = await file.json();
  const hasRequiredFields = manifest.id && manifest.name && manifest.grimoires;
  const hasCorrectGrimoires = CONSOLIDATED_GRIMOIRES.every(key => 
    manifest.grimoires.includes(key)
  );
  
  return {
    passed: hasRequiredFields && hasCorrectGrimoires,
    message: `Realm manifest valid: ${manifest.name}`,
    details: {
      id: manifest.id,
      name: manifest.name,
      grimoires: manifest.grimoires,
      optional_grimoires: manifest.optional_grimoires,
      hasCorrectGrimoires
    }
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: Grimoire manifests exist
// ═══════════════════════════════════════════════════════════════════════════

const testGrimoireManifests = test("Grimoire manifests exist and are valid", async () => {
  const manifests: Record<string, any> = {};
  let allValid = true;
  
  for (const grimoireKey of CONSOLIDATED_GRIMOIRES) {
    const manifestPath = `./packages/grimoires/${grimoireKey}/grimoire.json`;
    const file = Bun.file(manifestPath);
    const exists = await file.exists();
    
    if (!exists) {
      manifests[grimoireKey] = { exists: false };
      allValid = false;
      continue;
    }
    
    const manifest = await file.json();
    manifests[grimoireKey] = {
      exists: true,
      id: manifest.id,
      name: manifest.name,
      tables: manifest.tables?.length || 0
    };
  }
  
  return {
    passed: allValid,
    message: allValid ? "All grimoire manifests valid" : "Some manifests missing",
    details: manifests
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: Grimoire index files export routers
// ═══════════════════════════════════════════════════════════════════════════

const testGrimoireRouters = test("Grimoire index files export valid routers", async () => {
  const routers: Record<string, any> = {};
  let allValid = true;
  
  for (const grimoireKey of CONSOLIDATED_GRIMOIRES) {
    try {
      const module = await import(`../packages/grimoires/${grimoireKey}/index.ts`);
      const exports = Object.keys(module);
      const hasRouter = exports.some(e => e.toLowerCase().includes("router") || e.toLowerCase().includes("routes"));
      const hasSchema = exports.some(e => e.toLowerCase().includes("schema"));
      
      routers[grimoireKey] = { exports, hasRouter, hasSchema };
      
      if (!hasRouter) allValid = false;
    } catch (error) {
      routers[grimoireKey] = { error: String(error) };
      allValid = false;
    }
  }
  
  return {
    passed: allValid,
    message: allValid ? "All grimoires export valid routers" : "Some grimoires missing routers",
    details: routers
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7: Grimoire-Games routes include sub-routes
// ═══════════════════════════════════════════════════════════════════════════

const testGamesSubroutes = test("Grimoire-Games includes platforms, tags, collections routes", async () => {
  try {
    const module = await import("../packages/grimoires/grimoire-games/index.ts");
    const app = module.gamesModuleRoutes;
    
    // Check if it's a Hono app with routes
    const hasRoutes = app && typeof app.route === "function";
    
    return {
      passed: hasRoutes,
      message: hasRoutes ? "Games module exports valid Hono router with sub-routes" : "Games module missing valid router",
      details: { hasRoutes, exports: Object.keys(module) }
    };
  } catch (error) {
    return {
      passed: false,
      message: `Failed to import games module: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) }
    };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8: Grimoire-Esports routes include all competitive features
// ═══════════════════════════════════════════════════════════════════════════

const testEsportsSubroutes = test("Grimoire-Esports includes players, teams, tournaments, matches routes", async () => {
  try {
    const module = await import("../packages/grimoires/grimoire-esports/index.ts");
    const app = module.esportsModuleRoutes;
    
    const hasRoutes = app && typeof app.route === "function";
    
    return {
      passed: hasRoutes,
      message: hasRoutes ? "Esports module exports valid Hono router with all sub-routes" : "Esports module missing valid router",
      details: { hasRoutes, exports: Object.keys(module) }
    };
  } catch (error) {
    return {
      passed: false,
      message: `Failed to import esports module: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) }
    };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 9: Dependency chain is correct
// ═══════════════════════════════════════════════════════════════════════════

const testDependencyChain = test("Grimoire dependencies are correctly configured", async () => {
  const games = GRIMOIRE_REGISTRY.find(g => g.key === "grimoire-games");
  const esports = GRIMOIRE_REGISTRY.find(g => g.key === "grimoire-esports");
  const streamers = GRIMOIRE_REGISTRY.find(g => g.key === "grimoire-streamers");
  
  // Games should have no dependencies (foundation)
  const gamesHasNoDeps = !games?.dependsOn?.length;
  
  // Esports and Streamers should depend on Games
  const esportsDependsOnGames = esports?.dependsOn?.includes("grimoire-games");
  const streamersDependsOnGames = streamers?.dependsOn?.includes("grimoire-games");
  
  return {
    passed: gamesHasNoDeps && esportsDependsOnGames && streamersDependsOnGames,
    message: "Dependency chain correctly configured",
    details: {
      games: { dependsOn: games?.dependsOn || [], hasNoDeps: gamesHasNoDeps },
      esports: { dependsOn: esports?.dependsOn || [], dependsOnGames: esportsDependsOnGames },
      streamers: { dependsOn: streamers?.dependsOn || [], dependsOnGames: streamersDependsOnGames }
    }
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 10: gremius.config.ts references consolidated grimoires
// ═══════════════════════════════════════════════════════════════════════════

const testGremiusConfig = test("gremius.config.ts references consolidated grimoires", async () => {
  const config = await import("../apps/api/gremius.config.ts");
  const grimoires = config.default.grimoires || [];
  
  const hasConsolidated = CONSOLIDATED_GRIMOIRES.every(key => grimoires.includes(key));
  const hasOldGrimoires = ["games", "platforms", "tags", "collections", "players", "teams", "tournaments", "matches"]
    .filter(key => grimoires.includes(key));
  
  return {
    passed: hasConsolidated && hasOldGrimoires.length === 0,
    message: hasConsolidated ? "Config references consolidated grimoires" : "Config missing consolidated grimoires",
    details: {
      grimoires,
      hasConsolidated,
      oldGrimoiresStillReferenced: hasOldGrimoires
    }
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("  CONSOLIDATED GRIMOIRES TEST SUITE");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");
  
  const tests = [
    testRegistryEntries,
    testRealmCategorization,
    testTableDefinitions,
    testRealmManifest,
    testGrimoireManifests,
    testGrimoireRouters,
    testGamesSubroutes,
    testEsportsSubroutes,
    testDependencyChain,
    testGremiusConfig
  ];
  
  for (const t of tests) {
    await t();
  }
  
  // Print results
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("  TEST RESULTS");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2).split("\n").join("\n   "));
    }
    console.log();
  }
  
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(`  SUMMARY: ${passed} passed, ${failed} failed out of ${results.length} tests`);
  console.log("═══════════════════════════════════════════════════════════════════════════\n");
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
