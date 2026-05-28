/**
 * Migration Script: Workers + Webhooks → Actions
 *
 * Run this script to migrate existing data from:
 * - gremius_functions table → actions table
 * - webhooks table → actions table (if webhooks table exists)
 *
 * Usage:
 *   bun run apps/api/src/db/migrations/migrate-to-actions.ts
 *
 * This is idempotent - running it multiple times won't create duplicates
 * because it tracks legacyId and legacyType.
 */
interface MigrationStats {
    functionsMigrated: number;
    webhooksMigrated: number;
    errors: string[];
}
declare function runMigration(): Promise<MigrationStats>;
export { runMigration };
//# sourceMappingURL=migrate-to-actions.d.ts.map