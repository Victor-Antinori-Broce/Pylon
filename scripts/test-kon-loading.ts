/**
 * Test Script: Kon Loading Verification
 *
 * Verifica que los kons se carguen correctamente.
 *
 * Usage: bun run scripts/test-kon-loading.ts
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Get project root (assuming script is in ./scripts/)
const projectRoot = join(process.cwd());

// Verificar que los kons modernos exportan correctamente
async function testModernKons() {
  console.log("\n🧪 Testing Modern Kons (Dependency Injection)\n");

  const modernKons = [{ name: "blog", path: "packages/kons/kon-blog/index.ts" }];

  for (const { name, path: konPath } of modernKons) {
    try {
      const fullPath = pathToFileURL(join(projectRoot, konPath)).href;
      const mod = await import(fullPath);

      // Verificar que exporta 'kon'
      if (mod.kon || mod.default) {
        const kon = mod.kon || mod.default;
        console.log(`✅ ${name}`);
        console.log(`   ID: ${kon.id || "unknown"}`);
        console.log(`   Name: ${kon.name}`);
        console.log(`   Version: ${kon.version}`);
        console.log(`   Has createRouter: ${typeof kon.createRouter === "function"}`);
        console.log(`   Tables: ${kon.tables?.join(", ") || "none"}`);
        console.log(`   Mount: ${kon.mountPath || "/api/{id}"}`);

        // Verificar que createRouter es una función
        if (typeof kon.createRouter !== "function") {
          console.error(`   ❌ ERROR: createRouter is not a function!`);
          return false;
        }
      } else {
        console.error(`❌ ERROR: ${name} does not export 'kon'`);
        return false;
      }
    } catch (err: any) {
      console.error(`❌ ERROR loading ${name}:`, err.message);
      return false;
    }
  }

  return true;
}

// Verificar que los kons legacy siguen funcionando
async function testLegacyKons() {
  console.log("\n🧪 Testing Legacy Kons (Backward Compatibility)\n");

  const legacyKons = [{ name: "games", path: "packages/kons/kon-games/index.ts" }];

  for (const { name, path: konPath } of legacyKons) {
    try {
      const fullPath = pathToFileURL(join(projectRoot, konPath)).href;
      const mod = await import(fullPath);

      // Verificar que exporta un router o init
      const hasRouter = Object.values(mod).some(
        (v: any) =>
          typeof v === "object" &&
          v !== null &&
          typeof v.fetch === "function" &&
          typeof v.route === "function"
      );

      const hasInit = Object.entries(mod).some(
        ([k, v]: [string, any]) => k.startsWith("init") && typeof v === "function"
      );

      if (hasRouter || hasInit) {
        console.log(`✅ ${name} (legacy mode)`);
        console.log(`   Has router: ${hasRouter}`);
        console.log(`   Has init: ${hasInit}`);
      } else {
        console.error(`❌ ERROR: ${name} has no router or init function`);
        return false;
      }
    } catch (err: any) {
      console.error(`❌ ERROR loading ${name}:`, err.message);
      return false;
    }
  }

  return true;
}

// Verificar que los schemas se exportan correctamente
async function testSchemaExports() {
  console.log("\n🧪 Testing Schema Exports\n");

  const schemaTests = [
    {
      name: "blog",
      path: "packages/kons/kon-blog/src/schema.ts",
      expectedTables: ["blogPosts", "blogPostsToTags", "blogPostsToGames"],
    },
  ];

  for (const { name, path: schemaPath, expectedTables } of schemaTests) {
    try {
      const fullPath = pathToFileURL(join(projectRoot, schemaPath)).href;
      const mod = await import(fullPath);

      for (const table of expectedTables) {
        if (mod[table]) {
          console.log(`✅ ${name} schema exports '${table}'`);
        } else {
          console.error(`❌ ERROR: ${name} schema does not export '${table}'`);
          return false;
        }
      }
    } catch (err: any) {
      console.error(`❌ ERROR loading ${name} schema:`, err.message);
      return false;
    }
  }

  return true;
}

// Run all tests
async function runTests() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Kon Loading Test Suite                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const results = [];

  results.push(await testModernKons());
  results.push(await testLegacyKons());
  results.push(await testSchemaExports());

  if (results.every((r) => r)) {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║     ✅ ALL TESTS PASSED                                    ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
    process.exit(0);
  } else {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║     ❌ SOME TESTS FAILED                                   ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
    process.exit(1);
  }
}

runTests();
