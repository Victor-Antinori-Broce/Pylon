/**
 * Webhooks Engine — Background Worker
 *
 * Consumes jobs from the gremius-webhooks queue.
 * For each job:
 *   1. Signs the payload with HMAC-SHA256 if a secret is configured
 *   2. Sends an HTTP POST to the target URL
 *   3. Logs the result (status, duration, response) to webhooks_log
 */

import { createWorker } from "../../lib/queue";
import { db } from "../../db";
import { webhooksLog } from "./webhooks.schema";
import type { WebhookJobData } from "./webhooks.queue";
import type { Job } from "bullmq";
import { createHmac } from "crypto";

// ── HMAC Signing ─────────────────────────────────────────────

function signPayload(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
}

// ── Processor ────────────────────────────────────────────────

async function processWebhookJob(job: Job<WebhookJobData>) {
    const { webhookId, targetUrl, secret, event, payload } = job.data;
    const body = JSON.stringify(payload);
    const start = Date.now();

    let statusCode: number | null = null;
    let responseBody = "";
    let success = false;

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "GremiusCMS-Webhooks/1.0",
            "X-Gremius-Event": event,
        };

        if (secret) {
            headers["X-Gremius-Signature"] = signPayload(body, secret);
        }

        const res = await fetch(targetUrl, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(15_000), // 15s timeout
        });

        statusCode = res.status;
        responseBody = (await res.text()).slice(0, 2000); // Truncate large responses
        success = res.ok;

        if (!res.ok) {
            console.warn(
                `  🪝 [WEBHOOK] ${event} → ${targetUrl} returned ${res.status}`
            );
        } else {
            console.log(
                `  🪝 [WEBHOOK] ${event} → ${targetUrl} ✅ ${res.status} (${Date.now() - start}ms)`
            );
        }
    } catch (err: any) {
        responseBody = err.message.slice(0, 2000);
        console.error(
            `  🪝 [WEBHOOK] ${event} → ${targetUrl} ❌ ${err.message}`
        );
        // Re-throw so BullMQ retries the job
        throw err;
    } finally {
        // Always log the attempt, even on failure
        try {
            await db.insert(webhooksLog).values({
                webhookId,
                event,
                payload: payload as any,
                statusCode,
                responseBody,
                success,
                durationMs: Date.now() - start,
            });
        } catch (logErr: any) {
            console.error(
                `  🪝 [WEBHOOK LOG] Failed to write log: ${logErr.message}`
            );
        }
    }
}

// ── Registration ─────────────────────────────────────────────

export function registerWebhookWorker() {
    console.log("  🪝 Webhook Worker: starting...");
    return createWorker("gremius-webhooks", processWebhookJob, {
        concurrency: 5,
    });
}
