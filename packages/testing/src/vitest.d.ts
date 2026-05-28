/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VITEST INTEGRATION - Helpers for using with Vitest
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { SandboxConfig, TestSandbox } from "./types.js";
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
export declare function describeGrimoire(name: string, config: SandboxConfig, fn: (sandbox: TestSandbox) => void): void;
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
export declare function gremiusTesting(): {
    name: string;
    config: () => {
        test: {
            globalSetup: never[];
            setupFiles: never[];
            alias: {
                "@gremius/testing": string;
            };
        };
    };
};
/**
 * Type-safe helper for writing grimoire tests
 */
export declare function createGrimoireTest<T extends Record<string, any>>(grimoireId: string, options?: {
    fixtures?: string;
    beforeEach?: (sandbox: TestSandbox) => Promise<void>;
}): {
    describe: (name: string, fn: (helpers: {
        sandbox: TestSandbox;
        http: TestSandbox["http"];
        db: TestSandbox["db"];
        assert: TestSandbox["assert"];
        fixtures: T;
    }) => void) => void;
};
declare const _default: {
    describeGrimoire: typeof describeGrimoire;
    gremiusTesting: typeof gremiusTesting;
    createGrimoireTest: typeof createGrimoireTest;
};
export default _default;
//# sourceMappingURL=vitest.d.ts.map