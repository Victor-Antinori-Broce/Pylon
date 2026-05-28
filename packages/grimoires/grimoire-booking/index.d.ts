/**
 * @gremius/grimoire-booking — Booking Engine (Modern Grimoire)
 *
 * Room and resource reservation system with conflict detection.
 *
 * Layer: Grimoire (Nivel 3 — loaded via module-loader)
 * Mount: /api/booking
 */
import { createBookingRouter } from "./booking.routes";
import * as schema from "./booking.schema";
export * from "./booking.schema";
export { createBookingRouter };
/**
 * Definición del grimoire Booking (Modern)
 */
export declare const grimoire: import("@gremius/shared").GrimoireDefinition;
export { schema };
export default grimoire;
//# sourceMappingURL=index.d.ts.map