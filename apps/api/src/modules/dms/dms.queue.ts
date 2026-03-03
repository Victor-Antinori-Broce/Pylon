/**
 * DMS — BullMQ Queue Producer
 *
 * Pushes document-related notification jobs to the `email-notifications` queue.
 * Connection centralized via valkey.ts.
 */

import { Queue } from "bullmq";
import { valkeyConnection } from "../../lib/valkey";

const QUEUE_NAME = "email-notifications";

let _queue: Queue | null = null;

function getQueue(): Queue {
    if (!_queue) {
        _queue = new Queue(QUEUE_NAME, {
            connection: valkeyConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 5_000 },
                removeOnComplete: { count: 500 },
                removeOnFail: { count: 200 },
            },
        });
    }
    return _queue;
}

// ── Job payload ───────────────────────────────────────────────

export interface NewManualPublishedPayload {
    type: "NEW_MANUAL_PUBLISHED";
    documentId: string;
    title: string;
    targetDepartment: string;
}

// ── Producer ──────────────────────────────────────────────────

/**
 * Enqueues a NEW_MANUAL_PUBLISHED event after a document is approved.
 * This is a fire-and-forget call — callers must handle the rejected Promise.
 */
export async function enqueueManualPublished(
    payload: Omit<NewManualPublishedPayload, "type">
): Promise<void> {
    const q = getQueue();
    await q.add("new-manual-published", {
        type: "NEW_MANUAL_PUBLISHED" as const,
        ...payload,
    }, {
        jobId: `manual-published:${payload.documentId}`,
    });
}

export async function closeDmsQueue(): Promise<void> {
    if (_queue) { await _queue.close(); _queue = null; }
}
