/**
 * Cleanup Script: Remove Legacy Tables After Migration Verification
 *
 * ⚠️ WARNING: This script PERMANENTLY DELETES the old tables.
 * Only run this after:
 *   1. Successfully migrating data to actions table
 *   2. Running in production for a while without issues
 *   3. Verifying all functionality works with new actions table
 *   4. Creating a fresh backup
 *
 * Usage:
 *   bun run apps/api/src/db/migrations/cleanup-legacy-actions.ts --dry-run
 *   bun run apps/api/src/db/migrations/cleanup-legacy-actions.ts --execute
 */
export {};
//# sourceMappingURL=cleanup-legacy-actions.d.ts.map