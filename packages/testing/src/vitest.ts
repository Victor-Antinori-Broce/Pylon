/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VITEST INTEGRATION - Helpers for using with Vitest
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { SandboxConfig, TestSandbox } from "./types.js";
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
export function describeGrimoire(
  name: string,
  config: SandboxConfig,
  fn: (sandbox: TestSandbox) => void
): void {
  // This is a helper that should be called inside a describe block
  // It handles setup/teardown automatically
  
  let sandbox: TestSandbox;
  
  // Note: This expects to be run in a Vitest environment
  // where describe/beforeAll/afterAll/afterEach are available
  
  (globalThis as any).describe(name, () => {
    (globalThis as any).beforeAll(async () => {
      sandbox = await createTestSandbox(config);
      await sandbox.setup();
    });
    
    (globalThis as any).afterAll(async () => {
      await sandbox.teardown();
    });
    
    (globalThis as any).afterEach(async () => {
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
export function createGrimoireTest<T extends Record<string, any>>(
  grimoireId: string,
  options: {
    fixtures?: string;
    beforeEach?: (sandbox: TestSandbox) => Promise<void>;
  } = {}
) {
  return {
    describe: (name: string, fn: (helpers: {
      sandbox: TestSandbox;
      http: TestSandbox["http"];
      db: TestSandbox["db"];
      assert: TestSandbox["assert"];
      fixtures: T;
    }) => void) => {
      let sandbox: TestSandbox;
      
      (globalThis as any).describe(`${grimoireId} - ${name}`, () => {
        (globalThis as any).beforeAll(async () => {
          sandbox = await createTestSandbox({
            grimoires: [grimoireId],
            fixtures: options.fixtures
          });
          await sandbox.setup();
        });
        
        (globalThis as any).afterAll(async () => {
          await sandbox.teardown();
        });
        
        (globalThis as any).beforeEach(async () => {
          if (options.beforeEach) {
            await options.beforeEach(sandbox);
          }
        });
        
        (globalThis as any).afterEach(async () => {
          await sandbox.reset();
        });
        
        fn({
          sandbox,
          http: sandbox.http,
          db: sandbox.db,
          assert: sandbox.assert,
          fixtures: sandbox.fixtures as T
        });
      });
    }
  };
}

export default { describeGrimoire, gremiusTesting, createGrimoireTest };
