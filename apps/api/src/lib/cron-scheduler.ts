/**
 * GremiusCMS — Cron Scheduler for Gremius Workers
 *
 * Uses `croner` (lightweight, no native deps) to schedule
 * cron-triggered functions. On startup, loads all active cron
 * functions from the DB and schedules them.
 *
 * Features:
 *   - Auto-loads cron functions on init
 *   - Dynamically adds/removes cron jobs when functions are updated
 *   - Graceful shutdown (stops all scheduled jobs)
 *   - Logs each cron execution to function_executions
 */

import { Cron } from "croner";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { gremiusFunctions } from "../db/schema";
import { executeFunction } from "./function-dispatcher";

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

/** Active cron jobs keyed by function ID */
const cronJobs = new Map<string, Cron>();

// ═══════════════════════════════════════════════════════════════
// Core
// ═══════════════════════════════════════════════════════════════

/**
 * Schedule a single cron function.
 */
function scheduleCronJob(fn: typeof gremiusFunctions.$inferSelect): void {
  if (!fn.cronExpression) {
    console.warn(`  ⏰ [CRON] Function "${fn.name}" has no cron expression, skipping`);
    return;
  }

  // Remove existing job if re-scheduling
  unscheduleCronJob(fn.id);

  try {
    const job = new Cron(fn.cronExpression, {
      name: `gremius-fn:${fn.slug}`,
      catch: (err) => {
        console.error(`  ⏰ [CRON] Error in "${fn.name}":`, err);
      },
    }, async () => {
      console.log(`  ⏰ [CRON] Firing "${fn.name}" (${fn.cronExpression})`);

      // Re-fetch function to get latest code/status
      const [latest] = await db.select().from(gremiusFunctions)
        .where(eq(gremiusFunctions.id, fn.id))
        .limit(1);

      if (!latest || latest.status !== "active") {
        console.log(`  ⏰ [CRON] Function "${fn.name}" is no longer active, skipping execution`);
        return;
      }

      const payload = {
        event: "cron",
        trigger: "cron",
        cronExpression: fn.cronExpression,
        scheduledAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      await executeFunction(latest, "cron", payload);
    });

    cronJobs.set(fn.id, job);

    const nextRun = job.nextRun();
    console.log(`  ⏰ [CRON] Scheduled "${fn.name}" (${fn.cronExpression}) → next: ${nextRun?.toISOString() || "N/A"}`);

  } catch (err: any) {
    console.error(`  ⏰ [CRON] Invalid cron expression for "${fn.name}": ${fn.cronExpression} — ${err.message}`);
  }
}

/**
 * Remove a scheduled cron job.
 */
function unscheduleCronJob(functionId: string): void {
  const existing = cronJobs.get(functionId);
  if (existing) {
    existing.stop();
    cronJobs.delete(functionId);
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize the cron scheduler: load all active cron functions from DB.
 */
export async function initCronScheduler(): Promise<void> {
  try {
    const cronFunctions = await db.select().from(gremiusFunctions)
      .where(and(
        eq(gremiusFunctions.trigger, "cron" as any),
        eq(gremiusFunctions.status, "active" as any),
      ));

    for (const fn of cronFunctions) {
      scheduleCronJob(fn);
    }

    console.log(`  ⏰ Cron Scheduler initialized: ${cronFunctions.length} job(s) loaded`);
  } catch (err: any) {
    console.warn(`  ⏰ Cron Scheduler: Failed to load — ${err.message}`);
  }
}

/**
 * Refresh a single function's cron schedule.
 * Call this after a function is created/updated/deleted.
 */
export function refreshCronJob(fn: typeof gremiusFunctions.$inferSelect): void {
  if (fn.trigger === "cron" && fn.status === "active" && fn.cronExpression) {
    scheduleCronJob(fn);
  } else {
    unscheduleCronJob(fn.id);
  }
}

/**
 * Remove a function's cron schedule.
 */
export function removeCronJob(functionId: string): void {
  unscheduleCronJob(functionId);
}

/**
 * Stop all cron jobs (for graceful shutdown).
 */
export function stopAllCronJobs(): void {
  for (const [id, job] of cronJobs) {
    job.stop();
  }
  cronJobs.clear();
  console.log("  ⏰ All cron jobs stopped");
}

/**
 * Get status of all active cron jobs.
 */
export function getCronJobStatus(): Array<{
  functionId: string;
  isRunning: boolean;
  nextRun: Date | null;
}> {
  const result = [];
  for (const [id, job] of cronJobs) {
    result.push({
      functionId: id,
      isRunning: job.isRunning(),
      nextRun: job.nextRun(),
    });
  }
  return result;
}
