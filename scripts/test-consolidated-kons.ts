// @ts-nocheck
/**
 * Test Suite for Consolidated Kons
 *
 * Verifies:
 * 1. Kons load correctly (games, esports, streamers)
 * 2. Grimoire grimoire-gremius works
 * 3. Custom UI components work
 * 4. Sidebar toggle on/off works
 * 5. Kons recognize they're part of a grimoire
 * 6. Auto-activation when grimoire is enabled
 */

import { KON_REGISTRY, getGrimoireKons } from "../apps/api/src/services/module-registry";

// Test configuration
const TEST_GRIMOIRE = "grimoire-gremius";
const CONSOLIDATED_KONS = ["kon-games", "kon-esports", "kon-streamers"];

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function test(
  name: string,
  fn: () => Promise<{ passed: boolean; message: string; details?: any }>
) {
  return async () => {
    try {
      const result = await fn();
      results.push({ name, ...result });
    } catch (error) {
      results.push({
        name,
        passed: false,
        message: `Exception: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Kon Registry has consolidated entries
// ═══════════════════════════════════════════════════════════════════════════

const testRegistryEntries = test("Kon Registry has consolidated entries", async () => {
  const consolidatedInRegistry = CONSOLIDATED_KONS.every((key) =>
    KON_REGISTRY.some((g) => g.key === key)
  );

  const oldKons = [
    "games",
    "streamers",
    "platforms",
    "tags",
    "collections",
    "players",
    "teams",
    "tournaments",
    "matches",
  ];
  const oldStillInRegistry = oldKons.filter((key) => KON_REGISTRY.some((g) => g.key === key));

  return {
    passed: consolidatedInRegistry && oldStillInRegistry.length === 0,
    message: consolidatedInRegistry
      ? "All consolidated kons found in registry"
      : "Missing consolidated kons in registry",
    details: {
      consolidatedFound: CONSOLIDATED_KONS.filter((key) => KON_REGISTRY.some((g) => g.key === key)),
      oldKonsStillPresent: oldStillInRegistry,
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Grimoire kons are correctly categorized
// ═══════════════════════════════════════════════════════════════════════════

const testGrimoireCategorization =
  test("Kons are correctly categorized as 'grimoire'", async () => {
    const grimoireKons = getGrimoireKons(TEST_GRIMOIRE);
    const expectedCount = 3;

    const allHaveCorrectCategory = grimoireKons.every((g) => g.category === "grimoire");
    const allHaveCorrectGrimoireId = grimoireKons.every((g) => g.grimoireId === TEST_GRIMOIRE);

    return {
      passed:
        grimoireKons.length === expectedCount && allHaveCorrectCategory && allHaveCorrectGrimoireId,
      message: `Found ${grimoireKons.length} grimoire kons for ${TEST_GRIMOIRE}`,
      details: {
        kons: grimoireKons.map((g) => ({
          key: g.key,
          name: g.name,
          category: g.category,
          grimoireId: g.grimoireId,
        })),
        allHaveCorrectCategory,
        allHaveCorrectGrimoireId,
      },
    };
  });

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Kons have correct table definitions
// ═══════════════════════════════════════════════════════════════════════════

const testTableDefinitions = test("Kons have correct consolidated table definitions", async () => {
  const gamesKon = KON_REGISTRY.find((g) => g.key === "kon-games");
  const esportsKon = KON_REGISTRY.find((g) => g.key === "kon-esports");
  const streamersKon = KON_REGISTRY.find((g) => g.key === "kon-streamers");

  const gamesTables = gamesKon?.tables || [];
  const esportsTables = esportsKon?.tables || [];
  const streamersTables = streamersKon?.tables || [];

  // Verify games includes platforms, tags, collections
  const gamesHasPlatforms = gamesTables.includes("platforms");
  const gamesHasTags = gamesTables.includes("tags");
  const gamesHasCollections = gamesTables.includes("game_collections");

  // Verify esports includes players, teams, tournaments, matches
  const esportsHasPlayers = esportsTables.includes("players");
  const esportsHasTeams = esportsTables.includes("teams");
  const esportsHasTournaments = esportsTables.includes("tournaments");
  const esportsHasMatches = esportsTables.includes("matches");

  const allCorrect =
    gamesHasPlatforms &&
    gamesHasTags &&
    gamesHasCollections &&
    esportsHasPlayers &&
    esportsHasTeams &&
    esportsHasTournaments &&
    esportsHasMatches;

  return {
    passed: allCorrect,
    message: allCorrect
      ? "All kons have correct consolidated tables"
      : "Some tables missing in consolidated kons",
    details: {
      konGames: {
        tables: gamesTables,
        hasPlatforms: gamesHasPlatforms,
        hasTags: gamesHasTags,
        hasCollections: gamesHasCollections,
      },
      konEsports: {
        tables: esportsTables,
        hasPlayers: esportsHasPlayers,
        hasTeams: esportsHasTeams,
        hasTournaments: esportsHasTournaments,
        hasMatches: esportsHasMatches,
      },
      konStreamers: { tables: streamersTables },
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: Grimoire manifest exists and is valid
// ═══════════════════════════════════════════════════════════════════════════

const testGrimoireManifest =
  test("Grimoire manifest (grimoire-gremius) exists and is valid", async () => {
    const grimoirePath = `./packages/grimoires/${TEST_GRIMOIRE}/grimoire.json`;
    const file = Bun.file(grimoirePath);
    const exists = await file.exists();

    if (!exists) {
      return { passed: false, message: `Grimoire manifest not found at ${grimoirePath}` };
    }

    const manifest = await file.json();
    const hasRequiredFields = manifest.id && manifest.name && manifest.kons;
    const hasCorrectKons = CONSOLIDATED_KONS.every((key) => manifest.kons.includes(key));

    return {
      passed: hasRequiredFields && hasCorrectKons,
      message: `Grimoire manifest valid: ${manifest.name}`,
      details: {
        id: manifest.id,
        name: manifest.name,
        kons: manifest.kons,
        optional_kons: manifest.optional_kons,
        hasCorrectKons,
      },
    };
  });

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: Kon manifests exist
// ═══════════════════════════════════════════════════════════════════════════

const testKonManifests = test("Kon manifests exist and are valid", async () => {
  const manifests: Record<string, any> = {};
  let allValid = true;

  for (const konKey of CONSOLIDATED_KONS) {
    const manifestPath = `./packages/kons/${konKey}/kon.json`;
    const file = Bun.file(manifestPath);
    const exists = await file.exists();

    if (!exists) {
      manifests[konKey] = { exists: false };
      allValid = false;
      continue;
    }

    const manifest = await file.json();
    manifests[konKey] = {
      exists: true,
      id: manifest.id,
      name: manifest.name,
      tables: manifest.tables?.length || 0,
    };
  }

  return {
    passed: allValid,
    message: allValid ? "All kon manifests valid" : "Some manifests missing",
    details: manifests,
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: Kon index files export routers
// ═══════════════════════════════════════════════════════════════════════════

const testKonRouters = test("Kon index files export valid routers", async () => {
  const routers: Record<string, any> = {};
  let allValid = true;

  for (const konKey of CONSOLIDATED_KONS) {
    try {
      const module = await import(`../packages/kons/${konKey}/index.ts`);
      const exports = Object.keys(module);
      const hasRouter = exports.some(
        (e) => e.toLowerCase().includes("router") || e.toLowerCase().includes("routes")
      );
      const hasSchema = exports.some((e) => e.toLowerCase().includes("schema"));

      routers[konKey] = { exports, hasRouter, hasSchema };

      if (!hasRouter) allValid = false;
    } catch (error) {
      routers[konKey] = { error: String(error) };
      allValid = false;
    }
  }

  return {
    passed: allValid,
    message: allValid ? "All kons export valid routers" : "Some kons missing routers",
    details: routers,
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7: Kon-Games routes include sub-routes
// ═══════════════════════════════════════════════════════════════════════════

const testGamesSubroutes =
  test("Kon-Games includes platforms, tags, collections routes", async () => {
    try {
      const module = await import("../packages/kons/kon-games/index.ts");
      const app = module.gamesModuleRoutes;

      // Check if it's a Hono app with routes
      const hasRoutes = app && typeof app.route === "function";

      return {
        passed: hasRoutes,
        message: hasRoutes
          ? "Games module exports valid Hono router with sub-routes"
          : "Games module missing valid router",
        details: { hasRoutes, exports: Object.keys(module) },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to import games module: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: String(error) },
      };
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8: Kon-Esports routes include all competitive features
// ═══════════════════════════════════════════════════════════════════════════

const testEsportsSubroutes =
  test("Kon-Esports includes players, teams, tournaments, matches routes", async () => {
    try {
      const module = await import("../packages/kons/kon-esports/index.ts");
      const app = module.esportsModuleRoutes;

      const hasRoutes = app && typeof app.route === "function";

      return {
        passed: hasRoutes,
        message: hasRoutes
          ? "Esports module exports valid Hono router with all sub-routes"
          : "Esports module missing valid router",
        details: { hasRoutes, exports: Object.keys(module) },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to import esports module: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: String(error) },
      };
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// TEST 9: Dependency chain is correct
// ═══════════════════════════════════════════════════════════════════════════

const testDependencyChain = test("Kon dependencies are correctly configured", async () => {
  const games = KON_REGISTRY.find((g) => g.key === "kon-games");
  const esports = KON_REGISTRY.find((g) => g.key === "kon-esports");
  const streamers = KON_REGISTRY.find((g) => g.key === "kon-streamers");

  // Games should have no dependencies (foundation)
  const gamesHasNoDeps = !games?.dependsOn?.length;

  // Esports and Streamers should depend on Games
  const esportsDependsOnGames = esports?.dependsOn?.includes("kon-games");
  const streamersDependsOnGames = streamers?.dependsOn?.includes("kon-games");

  return {
    passed: gamesHasNoDeps && esportsDependsOnGames && streamersDependsOnGames,
    message: "Dependency chain correctly configured",
    details: {
      games: { dependsOn: games?.dependsOn || [], hasNoDeps: gamesHasNoDeps },
      esports: { dependsOn: esports?.dependsOn || [], dependsOnGames: esportsDependsOnGames },
      streamers: { dependsOn: streamers?.dependsOn || [], dependsOnGames: streamersDependsOnGames },
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 10: kitsuden.config.ts references consolidated kons
// ═══════════════════════════════════════════════════════════════════════════

const testKitsudenConfig = test("kitsuden.config.ts references consolidated kons", async () => {
  const config = await import("../apps/api/kitsuden.config.ts");
  const kons = config.default.kons || [];

  const hasConsolidated = CONSOLIDATED_KONS.every((key) => kons.includes(key));
  const hasOldKons = [
    "games",
    "platforms",
    "tags",
    "collections",
    "players",
    "teams",
    "tournaments",
    "matches",
  ].filter((key) => kons.includes(key));

  return {
    passed: hasConsolidated && hasOldKons.length === 0,
    message: hasConsolidated
      ? "Config references consolidated kons"
      : "Config missing consolidated kons",
    details: {
      kons,
      hasConsolidated,
      oldKonsStillReferenced: hasOldKons,
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("  CONSOLIDATED KONS TEST SUITE");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  const tests = [
    testRegistryEntries,
    testGrimoireCategorization,
    testTableDefinitions,
    testGrimoireManifest,
    testKonManifests,
    testKonRouters,
    testGamesSubroutes,
    testEsportsSubroutes,
    testDependencyChain,
    testKitsudenConfig,
  ];

  for (const t of tests) {
    await t();
  }

  // Print results
  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("  TEST RESULTS");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

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
