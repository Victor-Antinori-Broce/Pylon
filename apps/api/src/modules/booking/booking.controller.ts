/**
 * Booking Engine — Controller (Hono Router)
 *
 * Exported routes:
 *   POST /api/custom/reservations
 *
 * Mount example (in your main router, whenever you're ready):
 *   import { bookingRoutes } from "./modules/booking";
 *   app.route("/api/custom", bookingRoutes);
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { bookingService, ConflictError } from "./booking.service";

// ── Validation schema ─────────────────────────────────────────

const createReservationSchema = z.object({
    room_id: z.string().uuid({ message: "room_id must be a valid UUID." }),
    user_id: z.string().min(1, { message: "user_id is required." }),
    start_time: z.string().datetime({ message: "start_time must be a valid ISO 8601 datetime." }),
    end_time: z.string().datetime({ message: "end_time must be a valid ISO 8601 datetime." }),
});

// ── Router ────────────────────────────────────────────────────

export const bookingRoutes = new Hono();

/**
 * POST /reservations
 *
 * Creates a new room reservation.
 *
 * Body:
 *   { room_id, user_id, start_time, end_time }
 *
 * Responses:
 *   201 Created  — reservation object
 *   400 Bad Request — validation failure or invalid time range
 *   409 Conflict — overlapping reservation exists
 *   500 Internal Server Error — unexpected failure
 */
bookingRoutes.post(
    "/reservations",
    zValidator("json", createReservationSchema, (result, c) => {
        if (!result.success) {
            return c.json(
                {
                    error: "Validation Error",
                    details: result.error.flatten().fieldErrors,
                },
                400
            );
        }
    }),
    async (c) => {
        const body = c.req.valid("json");

        try {
            const reservation = await bookingService.createReservation({
                room_id: body.room_id,
                user_id: body.user_id,
                start_time: body.start_time,
                end_time: body.end_time,
            });

            return c.json(
                {
                    message: "Reservation created successfully.",
                    data: {
                        id: reservation.id,
                        room_id: reservation.roomId,
                        user_id: reservation.userId,
                        start_time: reservation.startTime,
                        end_time: reservation.endTime,
                        status: reservation.status,
                        created_at: reservation.createdAt,
                    },
                },
                201
            );
        } catch (err) {
            if (err instanceof ConflictError) {
                return c.json(
                    {
                        error: "Conflict",
                        message: err.message,
                    },
                    409
                );
            }

            if (err instanceof RangeError) {
                return c.json(
                    {
                        error: "Bad Request",
                        message: err.message,
                    },
                    400
                );
            }

            // Unexpected error — log server-side, return generic message
            console.error("[BookingController] Unhandled error:", err);
            return c.json(
                {
                    error: "Internal Server Error",
                    message: "An unexpected error occurred. Please try again later.",
                },
                500
            );
        }
    }
);
