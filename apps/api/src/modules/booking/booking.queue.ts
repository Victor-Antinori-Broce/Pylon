/**
 * Booking Engine — Queue Producer
 *
 * Enqueues notification jobs into the `email-notifications` BullMQ queue.
 * Connection is centralized via valkey.ts (Valkey/Redis-compatible).
 */

import { Queue } from "bullmq";
import { valkeyConnection } from "../../lib/valkey";

// ── Queue config ──────────────────────────────────────────────

const QUEUE_NAME = "email-notifications";

// ── Singleton queue (lazy) ────────────────────────────────────

let _queue: Queue | null = null;

function getEmailQueue(): Queue {
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

// ── Job payload types ─────────────────────────────────────────

export type EmailJobType = "RESERVATION_CONFIRMATION" | "RESERVATION_CANCELLATION";

export interface EmailJobPayload {
    type: EmailJobType;
    reservationId: string;
    userId: string;
    roomId: string;
    startTime: string;
    endTime: string;
}

// ── Producer helpers ──────────────────────────────────────────

/**
 * Enqueue a reservation confirmation email job.
 */
export async function enqueueReservationConfirmation(
    payload: Omit<EmailJobPayload, "type">
): Promise<void> {
    const queue = getEmailQueue();
    const jobPayload: EmailJobPayload = { type: "RESERVATION_CONFIRMATION", ...payload };

    await queue.add("reservation-confirmation", jobPayload, {
        jobId: `confirm:${payload.reservationId}`,
    });
}

/**
 * Gracefully close the queue connection (for clean shutdowns).
 */
export async function closeEmailQueue(): Promise<void> {
    if (_queue) {
        await _queue.close();
        _queue = null;
    }
}
