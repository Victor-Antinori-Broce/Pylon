/**
 * GremiusCMS — Cron Scheduler for Actions
 *
 * Uses `croner` (lightweight, no native deps) to schedule
 * cron-triggered actions. On startup, loads all active cron
 * actions from the DB and schedules them.
 *
 * Features:
 *   - Auto-loads cron actions on init
 *   - Dynamically adds/removes cron jobs when actions are updated
 *   - Graceful shutdown (stops all scheduled jobs)
 *   - Logs each cron execution to action_executions
 *
 * Phase 3: Updated to use the unified actions table instead of gremius_functions.
 */
import { actions } from "../db/schema";
/**
 * Initialize the cron scheduler: load all active cron actions from DB.
 */
export declare function initCronScheduler(): Promise<void>;
/**
 * Refresh a single action's cron schedule.
 * Call this after an action is created/updated/deleted.
 */
export declare function refreshCronJob(action: typeof actions.$inferSelect): void;
/**
 * Remove an action's cron schedule.
 */
export declare function removeCronJob(actionId: string): void;
/**
 * Stop all cron jobs (for graceful shutdown).
 */
export declare function stopAllCronJobs(): void;
/**
 * Get status of all active cron jobs.
 */
export declare function getCronJobStatus(): Array<{
    actionId: string;
    isRunning: boolean;
    nextRun: Date | null;
}>;
import { gremiusFunctions } from "../db/schema";
/**
 * @deprecated Use refreshCronJob with actions table instead
 */
export declare function refreshCronJobLegacy(fn: typeof gremiusFunctions.$inferSelect): void;
//# sourceMappingURL=cron-scheduler.d.ts.map