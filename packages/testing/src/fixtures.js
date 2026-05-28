/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIXTURE LOADING - Setup test data
 * ═══════════════════════════════════════════════════════════════════════════════
 */
/**
 * Load fixtures into the test context
 */
export async function loadFixtures(fixtures, context) {
    // If fixtures is an object, use it directly
    if (typeof fixtures !== "string") {
        return fixtures;
    }
    // Try to load from file
    try {
        const fixtureModule = await import(`./fixtures/${fixtures}.js`);
        const fixture = fixtureModule.default || fixtureModule;
        if (typeof fixture.setup === "function") {
            return await fixture.setup(context);
        }
        // If it's just a plain object
        return fixture;
    }
    catch (error) {
        console.warn(`[Test] Could not load fixture "${fixtures}":`, error);
        return {};
    }
}
/**
 * Define a fixture with dependencies
 */
export function defineFixture(fixture) {
    return fixture;
}
/**
 * Helper to create simple data fixtures
 */
export function createDataFixture(data) {
    return data;
}
export default { loadFixtures, defineFixture, createDataFixture };
//# sourceMappingURL=fixtures.js.map