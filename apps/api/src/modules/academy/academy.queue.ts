/**
 * Gremius Academy — Queue (BullMQ)
 *
 * Async event queue for course completion / certificate generation.
 * Connection centralized via valkey.ts.
 */

import { Queue } from "bullmq";
import { valkeyConnection } from "../../lib/valkey";

// ── Types ─────────────────────────────────────────────────────

export type AcademyEventType = "course_completed" | "enrollment_created";

export interface AcademyEventPayload {
    type: AcademyEventType;
    userId: string;
    quizId?: string;
    attemptId?: string;
    courseId?: string;
    score?: number;
}

// ── Queue setup ───────────────────────────────────────────────

const QUEUE_NAME = "academy-events";

let academyQueue: Queue | null = null;

function getQueue(): Queue {
    if (!academyQueue) {
        academyQueue = new Queue(QUEUE_NAME, {
            connection: valkeyConnection,
            defaultJobOptions: {
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
                attempts: 3,
                backoff: { type: "exponential", delay: 2000 },
            },
        });
    }
    return academyQueue;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Enqueues an academy event for async processing (e.g. certificate generation).
 */
export async function enqueueAcademyEvent(payload: AcademyEventPayload): Promise<void> {
    const queue = getQueue();
    await queue.add(payload.type, payload);
    console.log(`[Academy Queue] Enqueued ${payload.type} for user ${payload.userId}`);
}

/**
 * Gracefully close the queue connection.
 */
export async function closeAcademyQueue(): Promise<void> {
    if (academyQueue) {
        await academyQueue.close();
        academyQueue = null;
    }
}
