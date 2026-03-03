/**
 * Booking Engine — Schema
 *
 * Isolated Drizzle ORM table definitions.
 * Import these tables within this module only; do NOT add them
 * to apps/api/src/db/schema.ts.
 */

import {
    pgTable,
    uuid,
    varchar,
    integer,
    timestamp,
    pgEnum,
    primaryKey,
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────

export const reservationStatusEnum = pgEnum("reservation_status", [
    "pending",
    "confirmed",
    "cancelled",
]);

// ── Tables ────────────────────────────────────────────────────

export const rooms = pgTable("rooms", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    capacity: integer("capacity").notNull().default(1),
});

export const amenities = pgTable("amenities", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
});

export const roomAmenities = pgTable(
    "room_amenities",
    {
        roomId: uuid("room_id")
            .notNull()
            .references(() => rooms.id, { onDelete: "cascade" }),
        amenityId: uuid("amenity_id")
            .notNull()
            .references(() => amenities.id, { onDelete: "cascade" }),
    },
    (t) => [primaryKey({ columns: [t.roomId, t.amenityId] })]
);

export const reservations = pgTable("reservations", {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
        .notNull()
        .references(() => rooms.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    status: reservationStatusEnum("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
});

// ── Types ─────────────────────────────────────────────────────

export type Room = typeof rooms.$inferSelect;
export type Amenity = typeof amenities.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
