/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIXTURE LOADING - Setup test data
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { TestGrimoireContext, Fixture } from "./types.js";
/**
 * Load fixtures into the test context
 */
export declare function loadFixtures(fixtures: string | Record<string, any>, context: TestGrimoireContext): Promise<Record<string, any>>;
/**
 * Define a fixture with dependencies
 */
export declare function defineFixture(fixture: Fixture): Fixture;
/**
 * Helper to create simple data fixtures
 */
export declare function createDataFixture<T extends Record<string, any>>(data: T): T;
declare const _default: {
    loadFixtures: typeof loadFixtures;
    defineFixture: typeof defineFixture;
    createDataFixture: typeof createDataFixture;
};
export default _default;
//# sourceMappingURL=fixtures.d.ts.map