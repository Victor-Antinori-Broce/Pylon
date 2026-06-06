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

import { Cron } from "croner";
import { eq, and } from "drizzle-orm";

import { db } from "../db";
import { actions, gremiusFunctions } from "../db/schema";

import { executeActionById } from "./actions";

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

/** Active cron jobs keyed by action ID */
const cronJobs = new Map<string, Cron>();

// ═══════════════════════════════════════════════════════════════
// Core
// ═══════════════════════════════════════════════════════════════

/**
 * Schedule a single cron action.
 */
function scheduleCronJob(action: typeof actions.$inferSelect): void {
  const cronExpression = action.triggerConfig?.cronExpression;

  if (!cronExpression) {
    console.warn(`  ⏰ [CRON] Action "${action.name}" has no cron expression, skipping`);
    return;
  }

  // Validate cron expression format (5 or 6 space-separated parts)
  const cronParts = cronExpression.trim().split(/\s+/);
  if (cronParts.length !== 5 && cronParts.length !== 6) {
    console.error(
      `  ⏰ [CRON] Invalid cron expression for "${action.name}": "${cronExpression}" — expected 5 or 6 parts, got ${cronParts.length}. Skipping.`
    );
    return;
  }

  // Remove existing job if re-scheduling
  unscheduleCronJob(action.id);

  try {
    const job = new Cron(
      cronExpression,
      {
        name: `gremius-action:${action.slug}`,
        catch: (err) => {
          console.error(`  ⏰ [CRON] Error in "${action.name}":`, err);
        },
      },
      async () => {
        console.log(`  ⏰ [CRON] Firing "${action.name}" (${cronExpression})`);

        // Re-fetch action to get latest status
        const [latest] = await db.select().from(actions).where(eq(actions.id, action.id)).limit(1);

        if (!latest || latest.status !== "active") {
          console.log(
            `  ⏰ [CRON] Action "${action.name}" is no longer active, skipping execution`
          );
          return;
        }

        // Execute via ActionEngine
        await executeActionById(action.id, {
          trigger: "cron",
          triggerEvent: "cron",
        });
      }
    );

    cronJobs.set(action.id, job);

    const nextRun = job.nextRun();
    console.log(
      `  ⏰ [CRON] Scheduled "${action.name}" (${cronExpression}) → next: ${nextRun?.toISOString() || "N/A"}`
    );
  } catch (err: any) {
    console.error(
      `  ⏰ [CRON] Invalid cron expression for "${action.name}": ${cronExpression} — ${err.message}`
    );
  }
}

/**
 * Remove a scheduled cron job.
 */
function unscheduleCronJob(actionId: string): void {
  const existing = cronJobs.get(actionId);
  if (existing) {
    existing.stop();
    cronJobs.delete(actionId);
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize the cron scheduler: load all active cron actions from DB.
 */
export async function initCronScheduler(): Promise<void> {
  try {
    const cronActions = await db
      .select()
      .from(actions)
      .where(and(eq(actions.trigger, "cron"), eq(actions.status, "active")));

    for (const action of cronActions) {
      scheduleCronJob(action);
    }

    console.log(`  ⏰ Cron Scheduler initialized: ${cronActions.length} job(s) loaded`);
  } catch (err: any) {
    console.warn(`  ⏰ Cron Scheduler: Failed to load — ${err.message}`);
  }
}

/**
 * Refresh a single action's cron schedule.
 * Call this after an action is created/updated/deleted.
 */
export function refreshCronJob(action: typeof actions.$inferSelect): void {
  if (
    action.trigger === "cron" &&
    action.status === "active" &&
    action.triggerConfig?.cronExpression
  ) {
    scheduleCronJob(action);
  } else {
    unscheduleCronJob(action.id);
  }
}

/**
 * Remove an action's cron schedule.
 */
export function removeCronJob(actionId: string): void {
  unscheduleCronJob(actionId);
}

/**
 * Stop all cron jobs (for graceful shutdown).
 */
export function stopAllCronJobs(): void {
  for (const [, job] of cronJobs) {
    job.stop();
  }
  cronJobs.clear();
  console.log("  ⏰ All cron jobs stopped");
}

/**
 * Get status of all active cron jobs.
 */
export function getCronJobStatus(): Array<{
  actionId: string;
  isRunning: boolean;
  nextRun: Date | null;
}> {
  const result = [];
  for (const [id, job] of cronJobs) {
    result.push({
      actionId: id,
      isRunning: job.isRunning(),
      nextRun: job.nextRun(),
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Legacy Compatibility (to be removed in Phase 4)
// ═══════════════════════════════════════════════════════════════

/**
 * @deprecated Use refreshCronJob with actions table instead
 */
export function refreshCronJobLegacy(_fn: typeof gremiusFunctions.$inferSelect): void {
  console.warn("[DEPRECATED] refreshCronJobLegacy called, migrate to new actions table");
}
