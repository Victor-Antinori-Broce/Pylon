/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BUN TEST RUNNER INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Usage with Bun's native test runner (faster than Vitest for Bun projects)
 *
 * ```typescript
 * import { describe, it, beforeAll, afterAll } from "bun:test";
 * import { createTestSandbox } from "@gremius/testing/bun";
 *
 * const sandbox = createTestSandbox({
 *   grimoires: ["grimoire-blog"],
 *   database: "postgres" // Uses real PostgreSQL with transactions
 * });
 *
 * beforeAll(() => sandbox.setup());
 * afterAll(() => sandbox.teardown());
 * ```
 */
import type { SandboxConfig, TestSandbox } from "./types.js";
/**
 * Create sandbox optimized for Bun runtime
 */
export declare function createTestSandbox(config: SandboxConfig): Promise<TestSandbox>;
/**
 * Helper for Bun's test runner
 */
export declare function createBunTest(config: SandboxConfig): {
    sandbox: () => TestSandbox;
    setup: () => Promise<void>;
    teardown: () => Promise<void>;
    reset: () => Promise<void>;
};
export { createTestSandbox };
export * from "./types.js";
//# sourceMappingURL=bun.d.ts.map