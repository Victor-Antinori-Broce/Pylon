/**
 * Exhaustive Grimoires Test
 * Verifies that every single grimoire router is properly mounted and returns 200 or 401/404 (not 500 or 404 if it should be array).
 * Run: bun run test-grimoires-api.ts
 */
declare const API: string;
declare let passed: number;
declare let failed: number;
declare const endpoints: {
    name: string;
    path: string;
    expectArray: boolean;
}[];
//# sourceMappingURL=test-grimoires-api.d.ts.map