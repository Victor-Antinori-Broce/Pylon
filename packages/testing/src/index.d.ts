/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GREDIUS TESTING FRAMEWORK - Minimalist Grimoire Testing
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 * ```typescript
 * import { createTestSandbox, defineFixture } from "@gremius/testing";
 *
 * const sandbox = createTestSandbox({
 *   grimoires: ["grimoire-blog"],
 *   fixtures: "blog-seed"
 * });
 *
 * beforeAll(() => sandbox.setup());
 * afterAll(() => sandbox.teardown());
 * afterEach(() => sandbox.reset());
 *
 * describe("grimoire-blog", () => {
 *   it("creates posts", async () => {
 *     const response = await sandbox.http
 *       .asUser("admin")
 *       .post("/api/blog/posts", { title: "Test" });
 *
 *     expect(response.status).toBe(201);
 *     await sandbox.assert.database.has("posts", { title: "Test" });
 *   });
 * });
 * ```
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GREMius TESTING FRAMEWORK - Optimized for Bun + Drizzle + Hono
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * RECOMMENDED IMPORTS for your stack:
 *
 * 1. Full sandbox with Drizzle:
 *    import { createDrizzleSandbox } from "@gremius/testing/sandbox-drizzle"
 *
 * 2. Bun test runner helpers:
 *    import { createTestSandbox } from "@gremius/testing/bun"
 *
 * 3. Raw Drizzle test DB:
 *    import { createDrizzleTestDb } from "@gremius/testing/drizzle"
 */
export { createDrizzleSandbox, type DrizzleSandboxConfig } from "./sandbox-drizzle.js";
export { createTestSandbox } from "./sandbox.js";
export { createTestContext } from "./context.js";
export { createTestHttpClient } from "./http.js";
export { createTestDatabase } from "./database.js";
export { createTestEvents } from "./events.js";
export { createTestAssertions } from "./assertions.js";
export { loadFixtures, defineFixture, createDataFixture } from "./fixtures.js";
export type { SandboxConfig, TestSandbox, TestGrimoireContext, TestGrimoire, TestHttpClient, TestResponse, TestUser, TestDatabase, TestEvents, TestAssertions, Fixture } from "./types.js";
export declare const VERSION = "0.1.0";
/**
 * Bun users: import from "@gremius/testing/bun"
 *
 * Uses Bun's native test runner and fetch
 */
/**
 * Drizzle ORM users: import from "@gremius/testing/drizzle"
 *
 * Provides real Drizzle instances with:
 * - pg-mem (in-memory PostgreSQL)
 * - Transaction rollback for test isolation
 * - Schema migrations support
 */
//# sourceMappingURL=index.d.ts.map