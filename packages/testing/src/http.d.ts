/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HTTP TEST CLIENT - Make requests to grimoire routers
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import type { TestHttpClient, TestGrimoireContext } from "./types.js";
import type { TestGrimoire } from "./types.js";
/**
 * Create HTTP test client for making requests to grimoires
 */
export declare function createTestHttpClient(grimoires: Record<string, TestGrimoire>, context: TestGrimoireContext): TestHttpClient;
declare const _default: {
    createTestHttpClient: typeof createTestHttpClient;
};
export default _default;
//# sourceMappingURL=http.d.ts.map