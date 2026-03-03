/**
 * Webhooks Engine — Service Layer
 *
 * CRUD operations for webhook configurations.
 * Event listener that bridges the in-process EventEmitter to the BullMQ queue.
 */

import { eq, desc } from "drizzle-orm";
import { db } from "../../db";
import { webhooksConfig, webhooksLog } from "./webhooks.schema";
import { webhookQueue, type WebhookJobData } from "./webhooks.queue";
import { events } from "../../lib/events";
import { isValkeyAvailable, valkeyConnection } from "../../lib/valkey";
import { Queue } from "bullmq";

// ═══════════════════════════════════════════════
// CRUD — Webhook Configs
// ═══════════════════════════════════════════════

export async function listWebhooks(datasetId?: string) {
    if (datasetId) {
        return db
            .select()
            .from(webhooksConfig)
            .where(eq(webhooksConfig.datasetId, datasetId))
            .orderBy(desc(webhooksConfig.createdAt));
    }
    return db
        .select()
        .from(webhooksConfig)
        .orderBy(desc(webhooksConfig.createdAt));
}

export async function getWebhook(id: string) {
    const [row] = await db
        .select()
        .from(webhooksConfig)
        .where(eq(webhooksConfig.id, id))
        .limit(1);
    return row || null;
}

export async function createWebhook(data: {
    name: string;
    datasetId: string;
    event: "on_create" | "on_update" | "on_delete";
    targetUrl: string;
    secret?: string;
    enabled?: boolean;
}) {
    const [row] = await db
        .insert(webhooksConfig)
        .values({
            name: data.name,
            datasetId: data.datasetId,
            event: data.event,
            targetUrl: data.targetUrl,
            secret: data.secret || null,
            enabled: data.enabled ?? true,
        })
        .returning();
    return row;
}

export async function updateWebhook(
    id: string,
    data: Partial<{
        name: string;
        event: "on_create" | "on_update" | "on_delete";
        targetUrl: string;
        secret: string | null;
        enabled: boolean;
    }>
) {
    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.event !== undefined) updates.event = data.event;
    if (data.targetUrl !== undefined) updates.targetUrl = data.targetUrl;
    if (data.secret !== undefined) updates.secret = data.secret;
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    const [row] = await db
        .update(webhooksConfig)
        .set(updates)
        .where(eq(webhooksConfig.id, id))
        .returning();
    return row || null;
}

export async function deleteWebhook(id: string) {
    const [row] = await db
        .delete(webhooksConfig)
        .where(eq(webhooksConfig.id, id))
        .returning();
    return row || null;
}

// ═══════════════════════════════════════════════
// Logs
// ═══════════════════════════════════════════════

export async function getWebhookLogs(webhookId: string, limit = 50) {
    return db
        .select()
        .from(webhooksLog)
        .where(eq(webhooksLog.webhookId, webhookId))
        .orderBy(desc(webhooksLog.attemptedAt))
        .limit(Math.min(limit, 200));
}

// ═══════════════════════════════════════════════
// Test Ping
// ═══════════════════════════════════════════════

export async function sendTestPing(id: string) {
    const webhook = await getWebhook(id);
    if (!webhook) return null;

    const testPayload = {
        _test: true,
        event: webhook.event,
        timestamp: new Date().toISOString(),
        message: "GremiusCMS webhook test ping",
    };

    await webhookQueue.add(`test:${webhook.event}`, {
        webhookId: webhook.id,
        targetUrl: webhook.targetUrl,
        secret: webhook.secret,
        event: `test:${webhook.event}`,
        payload: testPayload,
    });

    return { queued: true, webhook: webhook.name };
}

// ═══════════════════════════════════════════════
// Event Listener — Bridge EventEmitter → Queue
// ═══════════════════════════════════════════════

/** Map emitter event names to webhook_event enum values */
const EVENT_MAP: Record<string, "on_create" | "on_update" | "on_delete"> = {
    "entry:created": "on_create",
    "entry:updated": "on_update",
    "entry:deleted": "on_delete",
};

async function dispatchWebhooks(
    eventName: string,
    data: { datasetId: string; entry: Record<string, unknown> }
) {
    const webhookEvent = EVENT_MAP[eventName];
    if (!webhookEvent) return;

    try {
        // Find all enabled webhooks for this dataset + event
        const hooks = await db
            .select()
            .from(webhooksConfig)
            .where(eq(webhooksConfig.datasetId, data.datasetId));

        const matching = hooks.filter(
            (h) => h.enabled && h.event === webhookEvent
        );

        for (const hook of matching) {
            await webhookQueue.add(webhookEvent, {
                webhookId: hook.id,
                targetUrl: hook.targetUrl,
                secret: hook.secret,
                event: webhookEvent,
                payload: {
                    event: webhookEvent,
                    datasetId: data.datasetId,
                    entry: data.entry,
                    timestamp: new Date().toISOString(),
                },
            });
        }

        if (matching.length > 0) {
            console.log(
                `  🪝 [DISPATCH] ${eventName} → ${matching.length} webhook(s) enqueued`
            );
        }
    } catch (err: any) {
        // Non-fatal — webhook dispatch should never break the main flow
        console.error(
            `  🪝 [DISPATCH ERROR] ${eventName}: ${err.message}`
        );
    }
}

/**
 * Initialize webhook event listeners.
 * Call once at startup to bridge EventEmitter → BullMQ queue.
 */
export function initWebhookListeners() {
    for (const eventName of Object.keys(EVENT_MAP)) {
        events.on(eventName, (data) => {
            // Fire-and-forget — never await in an event listener
            dispatchWebhooks(eventName, data).catch(() => { });
        });
    }
    console.log("  🪝 Webhook listeners registered (on_create, on_update, on_delete)");
}

// ═══════════════════════════════════════════════
// Failed Jobs — BullMQ Queue Inspection
// ═══════════════════════════════════════════════

interface FailedJobInfo {
    id: string;
    name: string;
    failedReason: string;
    stacktrace: string[];
    data: WebhookJobData;
    failedAt: number;
    attemptsMade: number;
    webhookId: string;
    targetUrl: string;
    event: string;
}

let _queueInstance: Queue<WebhookJobData> | null = null;

function getQueueInstance(): Queue<WebhookJobData> | null {
    if (_queueInstance) return _queueInstance;
    if (!isValkeyAvailable()) return null;
    
    try {
        _queueInstance = new Queue<WebhookJobData>("gremius-webhooks", {
            connection: valkeyConnection,
        });
        return _queueInstance;
    } catch {
        return null;
    }
}

export async function getFailedJobs(limit = 50): Promise<FailedJobInfo[]> {
    const available = await isValkeyAvailable();
    if (!available) return [];

    const queue = getQueueInstance();
    if (!queue) return [];

    try {
        const jobs = await queue.getFailed(0, limit);
        return jobs.map((job) => ({
            id: job.id || "unknown",
            name: job.name,
            failedReason: job.failedReason || "Unknown error",
            stacktrace: job.stacktrace || [],
            data: job.data,
            failedAt: job.processedOn || Date.now(),
            attemptsMade: job.attemptsMade || 0,
            webhookId: job.data.webhookId,
            targetUrl: job.data.targetUrl,
            event: job.data.event,
        }));
    } catch (err: any) {
        console.error(`  🪝 [FAILED JOBS] Error fetching: ${err.message}`);
        return [];
    }
}

export async function retryFailedJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    const available = await isValkeyAvailable();
    if (!available) return { success: false, error: "Valkey unavailable" };

    const queue = getQueueInstance();
    if (!queue) return { success: false, error: "Queue not available" };

    try {
        const job = await queue.getJob(jobId);
        if (!job) return { success: false, error: "Job not found" };
        
        await job.retry();
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
