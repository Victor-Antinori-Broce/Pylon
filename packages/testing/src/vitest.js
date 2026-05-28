/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VITEST INTEGRATION - Helpers for using with Vitest
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { createTestSandbox } from "./sandbox.js";
/**
 * Create a Vitest test suite with sandbox lifecycle
 *
 * Usage:
 * ```typescript
 * import { describeGrimoire } from "@gremius/testing/vitest";
 *
 * describeGrimoire("grimoire-blog", {
 *   grimoires: ["grimoire-blog"],
 *   fixtures: "blog-seed"
 * }, (sandbox) => {
 *
 *   it("creates posts", async () => {
 *     const response = await sandbox.http.post("/api/blog/posts", {...});
 *     expect(response.status).toBe(201);
 *   });
 *
 * });
 * ```
 */
export function describeGrimoire(name, config, fn) {
    // This is a helper that should be called inside a describe block
    // It handles setup/teardown automatically
    let sandbox;
    // Note: This expects to be run in a Vitest environment
    // where describe/beforeAll/afterAll/afterEach are available
    globalThis.describe(name, () => {
        globalThis.beforeAll(async () => {
            sandbox = await createTestSandbox(config);
            await sandbox.setup();
        });
        globalThis.afterAll(async () => {
            await sandbox.teardown();
        });
        globalThis.afterEach(async () => {
            if (config.autoReset !== false) {
                await sandbox.reset();
            }
        });
        fn(sandbox);
    });
}
/**
 * Setup function for Vitest config
 *
 * Usage in vitest.config.ts:
 * ```typescript
 * import { defineConfig } from "vitest/config";
 * import { gremiusTesting } from "@gremius/testing/vitest";
 *
 * export default defineConfig({
 *   plugins: [gremiusTesting()]
 * });
 * ```
 */
export function gremiusTesting() {
    return {
        name: "gremius-testing",
        config: () => ({
            test: {
                // Global setup for Gremius testing
                globalSetup: [],
                // Environment setup
                setupFiles: [],
                // Alias for @gremius/testing
                alias: {
                    "@gremius/testing": "@gremius/testing/dist/index.js"
                }
            }
        })
    };
}
/**
 * Type-safe helper for writing grimoire tests
 */
export function createGrimoireTest(grimoireId, options = {}) {
    return {
        describe: (name, fn) => {
            let sandbox;
            globalThis.describe(`${grimoireId} - ${name}`, () => {
                globalThis.beforeAll(async () => {
                    sandbox = await createTestSandbox({
                        grimoires: [grimoireId],
                        fixtures: options.fixtures
                    });
                    await sandbox.setup();
                });
                globalThis.afterAll(async () => {
                    await sandbox.teardown();
                });
                globalThis.beforeEach(async () => {
                    if (options.beforeEach) {
                        await options.beforeEach(sandbox);
                    }
                });
                globalThis.afterEach(async () => {
                    await sandbox.reset();
                });
                fn({
                    sandbox,
                    http: sandbox.http,
                    db: sandbox.db,
                    assert: sandbox.assert,
                    fixtures: sandbox.fixtures
                });
            });
        }
    };
}
export default { describeGrimoire, gremiusTesting, createGrimoireTest };
//# sourceMappingURL=vitest.js.map