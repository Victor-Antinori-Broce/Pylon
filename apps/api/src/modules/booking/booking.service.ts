/**
 * Booking Engine — Service
 *
 * Business logic:
 *   1. Validate that the requested time window does not overlap with any existing
 *      reservation for the same room using the strict interval overlap formula:
 *         (newStart < existingEnd) AND (newEnd > existingStart)
 *   2. Insert the new reservation.
 *   3. Enqueue an email notification job.
 */

import { and, lt, gt, eq, ne } from "drizzle-orm";
import { db } from "../../db";
import { reservations, type NewReservation, type Reservation } from "./booking.schema";
import { enqueueReservationConfirmation } from "./booking.queue";

// ── Custom error ──────────────────────────────────────────────

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConflictError";
    }
}

// ── Request DTO ───────────────────────────────────────────────

export interface CreateReservationInput {
    room_id: string;
    user_id: string;
    start_time: string; // ISO 8601 string
    end_time: string;   // ISO 8601 string
}

// ── Service ───────────────────────────────────────────────────

export const bookingService = {
    /**
     * Creates a reservation after verifying there is no time overlap.
     *
     * Overlap formula:
     *   newStart < existingEnd  AND  newEnd > existingStart
     *
     * @throws ConflictError   if the room is already booked for that window.
     * @throws Error           on unexpected DB / queue failures.
     */
    async createReservation(input: CreateReservationInput): Promise<Reservation> {
        const newStart = new Date(input.start_time);
        const newEnd = new Date(input.end_time);

        // ── Basic temporal sanity check ───────────────────────────
        if (newStart >= newEnd) {
            throw new RangeError("start_time must be earlier than end_time.");
        }

        // ── 1. Overlap detection ──────────────────────────────────
        const overlapping = await db
            .select({ id: reservations.id })
            .from(reservations)
            .where(
                and(
                    eq(reservations.roomId, input.room_id),
                    // Exclude cancelled reservations from conflict check
                    ne(reservations.status, "cancelled"),
                    // Strict overlap: newStart < existingEnd AND newEnd > existingStart
                    lt(reservations.startTime, newEnd),
                    gt(reservations.endTime, newStart)
                )
            )
            .limit(1);

        if (overlapping.length > 0) {
            throw new ConflictError(
                `Room ${input.room_id} is already reserved during the requested time window ` +
                `(${input.start_time} – ${input.end_time}). ` +
                `Conflicting reservation id: ${overlapping[0].id}.`
            );
        }

        // ── 2. Insert reservation ─────────────────────────────────
        const newReservation: NewReservation = {
            roomId: input.room_id,
            userId: input.user_id,
            startTime: newStart,
            endTime: newEnd,
            status: "confirmed",
        };

        const [created] = await db
            .insert(reservations)
            .values(newReservation)
            .returning();

        // ── 3. Enqueue email notification (fire-and-forget, non-blocking) ──
        enqueueReservationConfirmation({
            reservationId: created.id,
            userId: created.userId,
            roomId: created.roomId,
            startTime: created.startTime.toISOString(),
            endTime: created.endTime.toISOString(),
        }).catch((err) => {
            // Log but do NOT fail the request — the reservation was already saved.
            console.error("[BookingService] Failed to enqueue notification job:", err);
        });

        return created;
    },
};
