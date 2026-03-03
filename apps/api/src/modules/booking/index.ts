/**
 * Booking Engine — Public API
 *
 * Mount the routes in your main Hono app:
 *
 *   import { bookingRoutes } from "./modules/booking";
 *   app.route("/api/custom", bookingRoutes);
 *
 * This will expose:  POST /api/custom/reservations
 */

export { bookingRoutes } from "./booking.controller";
export { bookingService, ConflictError } from "./booking.service";
export { enqueueReservationConfirmation, closeEmailQueue } from "./booking.queue";
export type { CreateReservationInput } from "./booking.service";
export type { EmailJobPayload, EmailJobType } from "./booking.queue";
export type { Room, Amenity, Reservation, NewReservation } from "./booking.schema";
