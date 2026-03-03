/**
 * GremiusCMS — Function Dispatcher
 *
 * Bridges the EventEmitter system to Gremius Workers.
 * When a data event fires (entry:created, entry:updated, etc.),
 * this dispatcher finds matching active functions and executes them
 * inside sandboxed Workers.
 *
 * Also provides:
 *   - Manual execution API
 *   - Execution logging to `function_executions` table
 *   - Error tracking on the function record
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { gremiusFunctions, functionExecutions } from "../db/schema";
import { events } from "./events";
import { executeSandbox, type SandboxResult } from "./worker-sandbox";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Map EventEmitter names → function trigger enum values */
const EVENT_TRIGGER_MAP: Record<string, string> = {
  "entry:created": "on_entry_created",
  "entry:updated": "on_entry_updated",
  "entry:deleted": "on_entry_deleted",
  "post:published": "on_post_published",
};

type FunctionRecord = typeof gremiusFunctions.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// Core: Execute a function and log the result
// ═══════════════════════════════════════════════════════════════

export async function executeFunction(
  fn: FunctionRecord,
  triggerEvent: string,
  payload: Record<string, unknown>
): Promise<SandboxResult> {
  // Create execution record (pending)
  const [execution] = await db.insert(functionExecutions).values({
    functionId: fn.id,
    status: "running",
    triggerEvent,
    triggerPayload: payload,
    startedAt: new Date(),
  }).returning();

  // Run in sandbox
  const result = await executeSandbox({
    code: fn.code,
    payload,
    envVars: (fn.envVars as Record<string, string>) || {},
    timeoutMs: fn.timeoutMs,
    memoryLimitMb: fn.memoryLimitMb,
  });

  // Map exit reason to status
  const statusMap: Record<string, "success" | "error" | "timeout" | "killed"> = {
    success: "success",
    error: "error",
    timeout: "timeout",
    killed: "killed",
  };

  const execStatus = statusMap[result.exitReason] || "error";

  // Update execution record
  await db.update(functionExecutions).set({
    status: execStatus,
    logs: result.logs || null,
    result: result.result,
    errorMessage: result.error || null,
    durationMs: result.durationMs,
    memoryUsedBytes: result.memoryUsedBytes,
    finishedAt: new Date(),
  }).where(eq(functionExecutions.id, execution.id));

  // Update function metadata
  const updates: Record<string, any> = {
    lastExecutedAt: new Date(),
    executionCount: fn.executionCount + 1,
  };

  if (!result.success) {
    updates.errorCount = fn.errorCount + 1;
    updates.lastError = result.error;
    // Auto-disable after 10 consecutive errors
    if (fn.errorCount + 1 >= 10) {
      updates.status = "error";
      console.warn(`  ⚡ [GREMIUS] Function "${fn.name}" auto-disabled after 10 errors`);
    }
  } else {
    // Reset error state on success
    updates.lastError = null;
    if (fn.status === "error") {
      updates.status = "active";
    }
  }

  await db.update(gremiusFunctions).set(updates).where(eq(gremiusFunctions.id, fn.id));

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Event Dispatch — Listen for data events and trigger functions
// ═══════════════════════════════════════════════════════════════

async function dispatchFunctions(
  eventName: string,
  data: { datasetId?: string; entry?: Record<string, unknown>; [key: string]: unknown }
) {
  const triggerType = EVENT_TRIGGER_MAP[eventName];
  if (!triggerType) return;

  try {
    // Find matching active functions
    const conditions = [
      eq(gremiusFunctions.status, "active" as any),
      eq(gremiusFunctions.trigger, triggerType as any),
    ];

    // For entry events, also match by dataset
    if (data.datasetId && triggerType.startsWith("on_entry_")) {
      conditions.push(eq(gremiusFunctions.watchDatasetId, data.datasetId));
    }

    const functions = await db.select().from(gremiusFunctions)
      .where(and(...conditions));

    if (functions.length === 0) return;

    console.log(`  ⚡ [WORKERS] ${eventName} → dispatching ${functions.length} function(s)`);

    // Execute all matching functions concurrently (fire-and-forget from event loop)
    const payload: Record<string, unknown> = {
      event: eventName,
      trigger: triggerType,
      datasetId: data.datasetId,
      entry: data.entry,
      timestamp: new Date().toISOString(),
    };

    for (const fn of functions) {
      // Don't await — fire and forget
      executeFunction(fn, triggerType, payload).catch((err) => {
        console.error(`  ⚡ [WORKERS] Execution error for "${fn.name}":`, err.message);
      });
    }
  } catch (err: any) {
    console.error(`  ⚡ [WORKERS] Dispatch error for ${eventName}:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Manual Execution
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a function manually (from the admin UI "Run" button).
 */
export async function executeManually(
  functionId: string,
  customPayload?: Record<string, unknown>
): Promise<SandboxResult> {
  const [fn] = await db.select().from(gremiusFunctions)
    .where(eq(gremiusFunctions.id, functionId))
    .limit(1);

  if (!fn) throw new Error("Function not found");

  const payload = customPayload || {
    event: "manual",
    trigger: "manual",
    timestamp: new Date().toISOString(),
  };

  return executeFunction(fn, "manual", payload);
}

// ═══════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════

/**
 * Register event listeners for Gremius Workers.
 * Call once at server startup (after webhooks init).
 */
export function initFunctionDispatcher() {
  for (const eventName of Object.keys(EVENT_TRIGGER_MAP)) {
    events.on(eventName, (data) => {
      dispatchFunctions(eventName, data).catch(() => {});
    });
  }

  console.log("  ⚡ Gremius Workers dispatcher initialized (on_entry_created, on_entry_updated, on_entry_deleted, on_post_published)");
}
