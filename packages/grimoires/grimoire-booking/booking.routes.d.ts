/**
 * Gremio CMS — Booking Engine Routes (DI Version)
 *
 * REST API for room reservations with conflict detection,
 * availability checking, and booking management.
 *
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * - db → ctx.dbInstance.instance
 * - cachedQuery/invalidateCache → ctx.cache
 * - requireAuth/requireRole → ctx.auth
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Factory function that creates Booking routes with dependency injection
 */
export declare function createBookingRouter(ctx: GrimoireContext): Hono;
export { createBookingRouter as bookingRoutes };
//# sourceMappingURL=booking.routes.d.ts.map