/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST CONTEXT - Creates isolated GrimoireContext for testing
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { TestGrimoireContext } from "./types.js";
/**
 * Create a mock GrimoireContext for testing
 * This mimics the real context but with isolated/in-memory implementations
 */
export declare function createTestContext(sandboxId: string, databaseStrategy?: "memory" | "transaction" | "postgres"): Promise<TestGrimoireContext>;
declare const _default: {
    createTestContext: typeof createTestContext;
};
export default _default;
//# sourceMappingURL=context.d.ts.map