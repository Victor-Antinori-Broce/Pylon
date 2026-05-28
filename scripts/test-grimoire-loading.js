/**
 * Test Script: Grimoire Loading Verification
 *
 * Verifica que los grimoires se carguen correctamente.
 *
 * Usage: bun run scripts/test-grimoire-loading.ts
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";
// Get project root (assuming script is in ./scripts/)
const projectRoot = join(process.cwd());
// Verificar que los grimoires modernos exportan correctamente
async function testModernGrimoires() {
    console.log("\n🧪 Testing Modern Grimoires (Dependency Injection)\n");
    const modernGrimoires = [
        { name: "blog", path: "packages/grimoires/grimoire-blog/index.ts" },
    ];
    for (const { name, path: grimoirePath } of modernGrimoires) {
        try {
            const fullPath = pathToFileURL(join(projectRoot, grimoirePath)).href;
            const mod = await import(fullPath);
            // Verificar que exporta 'grimoire'
            if (mod.grimoire || mod.default) {
                const grimoire = mod.grimoire || mod.default;
                console.log(`✅ ${name}`);
                console.log(`   ID: ${grimoire.id || 'unknown'}`);
                console.log(`   Name: ${grimoire.name}`);
                console.log(`   Version: ${grimoire.version}`);
                console.log(`   Has createRouter: ${typeof grimoire.createRouter === 'function'}`);
                console.log(`   Tables: ${grimoire.tables?.join(', ') || 'none'}`);
                console.log(`   Mount: ${grimoire.mountPath || '/api/{id}'}`);
                // Verificar que createRouter es una función
                if (typeof grimoire.createRouter !== 'function') {
                    console.error(`   ❌ ERROR: createRouter is not a function!`);
                    return false;
                }
            }
            else {
                console.error(`❌ ERROR: ${name} does not export 'grimoire'`);
                return false;
            }
        }
        catch (err) {
            console.error(`❌ ERROR loading ${name}:`, err.message);
            return false;
        }
    }
    return true;
}
// Verificar que los grimoires legacy siguen funcionando
async function testLegacyGrimoires() {
    console.log("\n🧪 Testing Legacy Grimoires (Backward Compatibility)\n");
    const legacyGrimoires = [
        { name: "games", path: "packages/grimoires/grimoire-games/index.ts" },
    ];
    for (const { name, path: grimoirePath } of legacyGrimoires) {
        try {
            const fullPath = pathToFileURL(join(projectRoot, grimoirePath)).href;
            const mod = await import(fullPath);
            // Verificar que exporta un router o init
            const hasRouter = Object.values(mod).some((v) => typeof v === 'object' && v !== null &&
                typeof v.fetch === 'function' && typeof v.route === 'function');
            const hasInit = Object.entries(mod).some(([k, v]) => k.startsWith('init') && typeof v === 'function');
            if (hasRouter || hasInit) {
                console.log(`✅ ${name} (legacy mode)`);
                console.log(`   Has router: ${hasRouter}`);
                console.log(`   Has init: ${hasInit}`);
            }
            else {
                console.error(`❌ ERROR: ${name} has no router or init function`);
                return false;
            }
        }
        catch (err) {
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
            path: "packages/grimoires/grimoire-blog/src/schema.ts",
            expectedTables: ["blogPosts", "blogPostsToTags", "blogPostsToGames"]
        },
    ];
    for (const { name, path: schemaPath, expectedTables } of schemaTests) {
        try {
            const fullPath = pathToFileURL(join(projectRoot, schemaPath)).href;
            const mod = await import(fullPath);
            for (const table of expectedTables) {
                if (mod[table]) {
                    console.log(`✅ ${name} schema exports '${table}'`);
                }
                else {
                    console.error(`❌ ERROR: ${name} schema does not export '${table}'`);
                    return false;
                }
            }
        }
        catch (err) {
            console.error(`❌ ERROR loading ${name} schema:`, err.message);
            return false;
        }
    }
    return true;
}
// Run all tests
async function runTests() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║     Grimoire Loading Test Suite                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    const results = [];
    results.push(await testModernGrimoires());
    results.push(await testLegacyGrimoires());
    results.push(await testSchemaExports());
    if (results.every(r => r)) {
        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║     ✅ ALL TESTS PASSED                                    ║");
        console.log("╚════════════════════════════════════════════════════════════╝\n");
        process.exit(0);
    }
    else {
        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║     ❌ SOME TESTS FAILED                                   ║");
        console.log("╚════════════════════════════════════════════════════════════╝\n");
        process.exit(1);
    }
}
runTests();
//# sourceMappingURL=test-grimoire-loading.js.map