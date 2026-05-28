/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST DATABASE HELPERS
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { TestDatabase, TestGrimoireContext } from "./types.js";
/**
 * Create database helpers for testing
 *
 * In the minimal version, this uses the context's db instance.
 * In a full implementation, this would provide more sophisticated
 * query building and assertions.
 */
export declare function createTestDatabase(context: TestGrimoireContext): TestDatabase;
declare const _default: {
    createTestDatabase: typeof createTestDatabase;
};
export default _default;
//# sourceMappingURL=database.d.ts.map