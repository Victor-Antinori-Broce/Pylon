/**
 * Verification Script: Actions Integration Test
 *
 * Run this script after Phase 3 deployment to verify everything works:
 *   bun run apps/api/src/db/migrations/verify-actions-integration.ts
 *
 * This tests:
 *   1. Database connectivity and schema
 *   2. ActionEngine initialization
 *   3. CRUD operations
 *   4. Action execution (code and webhook_out)
 *   5. Event dispatch
 */
declare function runAllTests(): Promise<void>;
export { runAllTests };
//# sourceMappingURL=verify-actions-integration.d.ts.map