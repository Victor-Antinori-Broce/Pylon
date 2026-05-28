/**
 * Actions Engine
 *
 * The core engine that routes and executes actions.
 * This is the unified replacement for function-dispatcher.ts and webhook handlers.
 */
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db";
import { actions, actionExecutions } from "../../db/schema";
import { events } from "../events";
import { randomUUID } from "crypto";
import { executeCodeAction, executeWebhookOutAction, executeWebhookInAction, executeAgentAction, } from "./handlers";
// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════
/** Map of event names to action triggers */
const EVENT_MAP = {
    "entry:created": { trigger: "event", eventName: "entry.created" },
    "entry:updated": { trigger: "event", eventName: "entry.updated" },
    "entry:deleted": { trigger: "event", eventName: "entry.deleted" },
    "post:published": { trigger: "event", eventName: "post.published" },
};
/** Auto-disable threshold for consecutive errors */
const ERROR_THRESHOLD = 10;
// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Execute an action by ID
 */
export async function executeActionById(actionId, triggerContext = {}) {
    const [action] = await db.select().from(actions).where(eq(actions.id, actionId)).limit(1);
    if (!action) {
        return {
            success: false,
            error: `Action not found: ${actionId}`,
            durationMs: 0,
        };
    }
    if (action.status !== "active") {
        return {
            success: false,
            error: `Action is ${action.status}`,
            durationMs: 0,
        };
    }
    return executeAction(action, triggerContext);
}
/**
 * Execute an action with full context
 */
export async function executeAction(action, triggerContext = {}) {
    const executionId = randomUUID();
    const startedAt = new Date();
    // Build full context
    const context = {
        actionId: action.id,
        actionName: action.name,
        actionType: action.type,
        trigger: triggerContext.trigger || action.trigger,
        triggerEvent: triggerContext.triggerEvent,
        event: triggerContext.event,
        request: triggerContext.request,
        env: triggerContext.env || {},
        executionId,
        startedAt,
    };
    // Create execution record
    const [execution] = await db.insert(actionExecutions).values({
        actionId: action.id,
        status: "running",
        triggerType: context.trigger,
        triggerEvent: context.triggerEvent || context.event?.name,
        triggerPayload: triggerContext,
        httpRequest: context.request,
        startedAt,
    }).returning();
    // Execute based on type
    let result;
    try {
        switch (action.type) {
            case "code":
                result = await executeCodeAction(action, context);
                break;
            case "webhook_out":
                result = await executeWebhookOutAction(action, context);
                break;
            case "webhook_in": {
                // For webhook_in actions, we need to pass the request from context
                const webhookRequest = context.request;
                if (!webhookRequest) {
                    result = {
                        success: false,
                        error: "No webhook request provided for webhook_in action",
                        durationMs: Date.now() - startedAt.getTime(),
                    };
                }
                else {
                    result = await executeWebhookInAction(action, context, webhookRequest);
                }
                break;
            }
            case "agent":
                result = await executeAgentAction(action, context);
                break;
            default:
                result = {
                    success: false,
                    error: `Unknown action type: ${action.type}`,
                    durationMs: Date.now() - startedAt.getTime(),
                };
        }
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        result = {
            success: false,
            error: errorMessage,
            durationMs: Date.now() - startedAt.getTime(),
        };
    }
    // Update execution record
    const status = result.success ? "success" :
        result.error?.includes("timeout") ? "timeout" : "error";
    await db.update(actionExecutions).set({
        status,
        logs: result.logs || null,
        result: result.result,
        errorMessage: result.error || null,
        durationMs: result.durationMs,
        memoryUsedBytes: result.memoryUsedBytes,
        httpResponse: result.httpResponse,
        finishedAt: new Date(),
    }).where(eq(actionExecutions.id, execution.id));
    // Update action stats
    const updateData = {
        lastExecutedAt: new Date(),
        executionCount: action.executionCount + 1,
    };
    if (!result.success) {
        updateData.errorCount = action.errorCount + 1;
        updateData.lastError = result.error;
        // Auto-disable on too many errors
        if (updateData.errorCount >= ERROR_THRESHOLD) {
            updateData.status = "error";
            console.warn(`[Actions] Action "${action.name}" auto-disabled after ${ERROR_THRESHOLD} errors`);
        }
    }
    else {
        // Reset error count on success
        if (action.status === "error") {
            updateData.status = "active";
        }
        updateData.errorCount = 0;
        updateData.lastError = null;
    }
    await db.update(actions).set(updateData).where(eq(actions.id, action.id));
    return result;
}
// ═══════════════════════════════════════════════════════════════════════════
// CRUD Operations
// ═══════════════════════════════════════════════════════════════════════════
export async function listActions(options = {}) {
    const limit = Math.min(options.limit || 50, 200);
    let query = db.select({
        id: actions.id,
        name: actions.name,
        slug: actions.slug,
        description: actions.description,
        type: actions.type,
        trigger: actions.trigger,
        status: actions.status,
        lastExecutedAt: actions.lastExecutedAt,
        executionCount: actions.executionCount,
        errorCount: actions.errorCount,
        createdAt: actions.createdAt,
    }).from(actions).orderBy(desc(actions.updatedAt)).limit(limit);
    // Build conditions
    const conditions = [];
    if (options.type)
        conditions.push(eq(actions.type, options.type));
    if (options.trigger)
        conditions.push(eq(actions.trigger, options.trigger));
    if (options.status)
        conditions.push(eq(actions.status, options.status));
    if (conditions.length > 0) {
        const allActions = await db.select({
            id: actions.id,
            name: actions.name,
            slug: actions.slug,
            description: actions.description,
            type: actions.type,
            trigger: actions.trigger,
            status: actions.status,
            lastExecutedAt: actions.lastExecutedAt,
            executionCount: actions.executionCount,
            errorCount: actions.errorCount,
            createdAt: actions.createdAt,
        }).from(actions)
            .where(and(...conditions))
            .orderBy(desc(actions.updatedAt))
            .limit(limit);
        return allActions;
    }
    const allActions = await query;
    return allActions;
}
export async function getAction(id) {
    const [action] = await db.select().from(actions).where(eq(actions.id, id)).limit(1);
    return action || null;
}
export async function createAction(input) {
    const slug = input.slug || input.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    // Validate trigger config
    const triggerConfig = input.triggerConfig;
    if (input.trigger === "cron" && !triggerConfig?.cronExpression) {
        throw new Error("cronExpression required for cron trigger");
    }
    const [action] = await db.insert(actions).values({
        name: input.name,
        slug,
        description: input.description || null,
        type: input.type,
        trigger: input.trigger,
        triggerConfig: input.triggerConfig || {},
        config: input.config || {},
        status: input.status || "active",
    }).returning();
    // Schedule if it's a cron action
    if (action.trigger === "cron") {
        await refreshCronSchedule(action);
    }
    return action;
}
export async function updateAction(id, input) {
    const action = await getAction(id);
    if (!action)
        return null;
    const updates = {
        updatedAt: new Date(),
    };
    const allowedFields = [
        "name", "slug", "description", "trigger", "triggerConfig",
        "config", "status"
    ];
    for (const field of allowedFields) {
        if (input[field] !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            updates[field] = input[field];
        }
    }
    // Validate cron
    const triggerConfig = updates.triggerConfig;
    const existingTriggerConfig = action.triggerConfig;
    if (updates.trigger === "cron" && !triggerConfig?.cronExpression && !existingTriggerConfig?.cronExpression) {
        throw new Error("cronExpression required for cron trigger");
    }
    const [updated] = await db.update(actions)
        .set(updates)
        .where(eq(actions.id, id))
        .returning();
    // Refresh cron schedule
    if (updated.trigger === "cron") {
        await refreshCronSchedule(updated);
    }
    else {
        await removeCronSchedule(updated.id);
    }
    return updated;
}
export async function deleteAction(id) {
    await removeCronSchedule(id);
    const [deleted] = await db.delete(actions)
        .where(eq(actions.id, id))
        .returning({ id: actions.id });
    return !!deleted;
}
// ═══════════════════════════════════════════════════════════════════════════
// Cron Scheduling (placeholder - integrates with existing cron-scheduler.ts)
// ═══════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cronSchedules = new Map();
async function refreshCronSchedule(action) {
    // TODO: Integrate with existing cron-scheduler.ts
    // For now, just log
    console.log(`[Actions] Would schedule cron for action "${action.name}"`);
}
async function removeCronSchedule(actionId) {
    // TODO: Integrate with existing cron-scheduler.ts
    cronSchedules.delete(actionId);
}
export async function dispatchEvent(eventName, data) {
    const mapping = EVENT_MAP[eventName];
    if (!mapping)
        return;
    try {
        // Find matching actions
        const conditions = [
            eq(actions.status, "active"),
            eq(actions.trigger, "event"),
        ];
        const matchingActions = await db.select().from(actions)
            .where(and(...conditions));
        // Filter by event name in triggerConfig
        const filteredActions = matchingActions.filter(a => {
            const config = a.triggerConfig;
            if (config.eventName !== mapping.eventName)
                return false;
            // Filter by dataset if specified
            if (config.datasetId && data.datasetId !== config.datasetId) {
                return false;
            }
            return true;
        });
        if (filteredActions.length === 0)
            return;
        console.log(`[Actions] ${eventName} → dispatching ${filteredActions.length} action(s)`);
        // Execute all matching actions concurrently
        for (const action of filteredActions) {
            executeAction(action, {
                trigger: "event",
                triggerEvent: eventName,
                event: {
                    name: eventName,
                    data,
                    timestamp: new Date().toISOString(),
                },
            }).catch((err) => {
                console.error(`[Actions] Execution error for "${action.name}":`, err.message);
            });
        }
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Actions] Dispatch error for ${eventName}:`, errorMessage);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════
export function initActionsEngine() {
    // Register event listeners
    for (const eventName of Object.keys(EVENT_MAP)) {
        events.on(eventName, (data) => {
            dispatchEvent(eventName, data).catch(() => { });
        });
    }
    console.log("[Actions] Engine initialized");
}
//# sourceMappingURL=engine.js.map