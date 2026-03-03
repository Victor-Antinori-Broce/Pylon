/**
 * Webhooks Engine — Queue (Safe Proxy)
 *
 * Follows the same fail-safe pattern as emailQueue in lib/queue.ts.
 * If Valkey is down, jobs are logged and dropped — never crashes.
 */

import { Queue } from "bullmq";
import { valkeyConnection, isValkeyAvailable } from "../../lib/valkey";

// ═══════════════════════════════════════════════════════════
// Job Data Type
// ═══════════════════════════════════════════════════════════

export interface WebhookJobData {
    webhookId: string;
    targetUrl: string;
    secret: string | null;
    event: string;
    payload: Record<string, unknown>;
}

// ── Lazy Queue Instance ──────────────────────────────────────

let _queue: Queue<WebhookJobData> | null = null;

function getQueue(): Queue<WebhookJobData> {
    if (_queue) return _queue;

    _queue = new Queue<WebhookJobData>("gremius-webhooks", {
        connection: valkeyConnection,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 500 },
        },
    });

    _queue.on("error", () => {
        // Silenced — availability handled via isValkeyAvailable()
    });

    return _queue;
}

// ── Safe Queue Proxy ─────────────────────────────────────────

export const webhookQueue = {
    async add(event: string, data: WebhookJobData) {
        const available = await isValkeyAvailable();
        if (!available) {
            console.warn(
                `  🪝 [QUEUE OFFLINE] Valkey unavailable — skipping webhook "${event}" → ${data.targetUrl}`
            );
            return null;
        }
        try {
            const queue = getQueue();
            return await queue.add(event, data);
        } catch (err: any) {
            console.warn(
                `  🪝 [QUEUE ERROR] Could not enqueue webhook "${event}": ${err.message}`
            );
            return null;
        }
    },

    async getWaitingCount() {
        const available = await isValkeyAvailable();
        if (!available) return 0;
        try {
            return await getQueue().getWaitingCount();
        } catch {
            return 0;
        }
    },

    async getActiveCount() {
        const available = await isValkeyAvailable();
        if (!available) return 0;
        try {
            return await getQueue().getActiveCount();
        } catch {
            return 0;
        }
    },
};
