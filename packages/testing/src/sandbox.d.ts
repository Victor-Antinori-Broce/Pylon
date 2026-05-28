/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SANDBOX - Core of the Testing Framework
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { SandboxConfig, TestSandbox } from "./types.js";
/**
 * Create a test sandbox for grimoire testing
 *
 * Usage:
 * ```typescript
 * const sandbox = createTestSandbox({
 *   grimoires: ["grimoire-blog"],
 *   fixtures: "blog-seed"
 * });
 *
 * beforeAll(() => sandbox.setup());
 * afterAll(() => sandbox.teardown());
 * afterEach(() => sandbox.reset());
 * ```
 */
export declare function createTestSandbox(config: SandboxConfig): Promise<TestSandbox>;
declare const _default: {
    createTestSandbox: typeof createTestSandbox;
};
export default _default;
//# sourceMappingURL=sandbox.d.ts.map