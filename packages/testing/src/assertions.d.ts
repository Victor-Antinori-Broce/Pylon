/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST ASSERTIONS - Helper functions for common assertions
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { TestAssertions, TestDatabase, TestEvents } from "./types.js";
/**
 * Create test assertions
 *
 * These helpers throw descriptive errors when assertions fail.
 * They work with any test runner (Vitest, Jest, etc.)
 */
export declare function createTestAssertions(db: TestDatabase, events: TestEvents): TestAssertions;
declare const _default: {
    createTestAssertions: typeof createTestAssertions;
};
export default _default;
//# sourceMappingURL=assertions.d.ts.map