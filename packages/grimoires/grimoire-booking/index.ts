// @ts-nocheck
/**
 * @gremius/grimoire-booking — Booking Engine (Modern Grimoire)
 *
 * Room and resource reservation system with conflict detection.
 *
 * Layer: Grimoire (Nivel 3 — loaded via module-loader)
 * Mount: /api/booking
 */

import { defineGrimoire } from "@gremius/shared";
import type { GrimoireContext } from "@gremius/shared";
import { Hono } from "hono";

import { createBookingRouter } from "./booking.routes";
import * as schema from "./booking.schema";

// Re-export schema for external use
export * from "./booking.schema";
export { createBookingRouter };

/**
 * Ejecuta una sentencia SQL individual con manejo de errores
 */
async function executeSQL(
  ctx: GrimoireContext,
  sql: string,
  description: string
): Promise<boolean> {
  try {
    await ctx.db.execute(sql);
    ctx.logger.info(`✅ Booking: ${description}`);
    return true;
  } catch (err: any) {
    // Errores que indican que ya existe (ignorables)
    const ignoreCodes = ["42P07", "42710", "23505", "42P16"];
    const ignoreMessages = ["already exists", "duplicate", "ya existe"];

    const shouldIgnore =
      ignoreCodes.includes(err.code) ||
      ignoreMessages.some((m) => err.message?.toLowerCase().includes(m));

    if (shouldIgnore) {
      ctx.logger.info(`⏩ Booking: ${description} (already exists)`);
      return true;
    }

    ctx.logger.error(`❌ Booking: ${description} failed - ${err.message}`);
    return false;
  }
}

/**
 * Run migrations on startup - versión robusta
 */
async function runMigrations(ctx: GrimoireContext): Promise<void> {
  ctx.logger.info("🔄 Booking: Starting migrations...");

  // Crear enums individualmente
  const enums = [
    {
      name: "booking_status",
      values:
        "'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'rejected', 'no_show'",
    },
    {
      name: "booking_room_type",
      values:
        "'meeting_room', 'conference_room', 'office', 'desk', 'studio', 'event_space', 'classroom', 'auditorium', 'other'",
    },
    {
      name: "booking_room_status",
      values: "'available', 'maintenance', 'closed', 'reserved'",
    },
    {
      name: "booking_recurrence_type",
      values: "'none', 'daily', 'weekly', 'monthly'",
    },
  ];

  for (const enumDef of enums) {
    await executeSQL(
      ctx,
      `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${enumDef.name}') THEN
          CREATE TYPE ${enumDef.name} AS ENUM (${enumDef.values});
        END IF;
      END $$;
    `,
      `Enum ${enumDef.name}`
    );
  }

  // Crear tablas individualmente
  const tables = [
    {
      name: "booking_rooms",
      sql: `
        CREATE TABLE IF NOT EXISTS booking_rooms (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name varchar(200) NOT NULL,
          slug varchar(200) NOT NULL UNIQUE,
          description text,
          type booking_room_type DEFAULT 'meeting_room' NOT NULL,
          status booking_room_status DEFAULT 'available' NOT NULL,
          capacity integer DEFAULT 4 NOT NULL,
          location varchar(500),
          floor varchar(50),
          images jsonb DEFAULT '[]'::jsonb,
          cover_image_id uuid,
          hourly_rate decimal(10, 2),
          daily_rate decimal(10, 2),
          min_booking_hours integer DEFAULT 1,
          max_booking_hours integer DEFAULT 8,
          advance_booking_days integer DEFAULT 30,
          available_from time,
          available_until time,
          available_days jsonb DEFAULT '[1, 2, 3, 4, 5]'::jsonb,
          features jsonb DEFAULT '{}'::jsonb,
          requires_approval boolean DEFAULT false,
          is_active boolean DEFAULT true NOT NULL,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          updated_at timestamp with time zone DEFAULT now() NOT NULL
        )`,
    },
    {
      name: "booking_amenities",
      sql: `
        CREATE TABLE IF NOT EXISTS booking_amenities (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name varchar(100) NOT NULL,
          icon varchar(50),
          description text,
          category varchar(50),
          is_active boolean DEFAULT true NOT NULL,
          created_at timestamp with time zone DEFAULT now() NOT NULL
        )`,
    },
    {
      name: "booking_room_amenities",
      sql: `
        CREATE TABLE IF NOT EXISTS booking_room_amenities (
          room_id uuid NOT NULL REFERENCES booking_rooms(id) ON DELETE CASCADE,
          amenity_id uuid NOT NULL REFERENCES booking_amenities(id) ON DELETE CASCADE,
          quantity integer DEFAULT 1,
          notes text,
          PRIMARY KEY (room_id, amenity_id)
        )`,
    },
    {
      name: "booking_reservations",
      sql: `
        CREATE TABLE IF NOT EXISTS booking_reservations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          room_id uuid NOT NULL REFERENCES booking_rooms(id) ON DELETE CASCADE,
          user_id uuid,
          booked_for_name varchar(200),
          booked_for_email varchar(255),
          booked_for_phone varchar(50),
          organization_id uuid,
          department_id uuid,
          title varchar(500) NOT NULL,
          description text,
          event_type varchar(100),
          start_time timestamp with time zone NOT NULL,
          end_time timestamp with time zone NOT NULL,
          timezone varchar(50) DEFAULT 'UTC',
          status booking_status DEFAULT 'pending' NOT NULL,
          recurrence booking_recurrence_type DEFAULT 'none' NOT NULL,
          recurrence_end_date date,
          parent_booking_id uuid,
          expected_attendees integer DEFAULT 1,
          max_attendees integer,
          attendees jsonb DEFAULT '[]'::jsonb,
          requested_amenities jsonb DEFAULT '[]'::jsonb,
          special_requests text,
          hourly_rate decimal(10, 2),
          total_hours decimal(5, 2),
          total_amount decimal(10, 2),
          approved_by_id uuid,
          approved_at timestamp with time zone,
          rejection_reason text,
          checked_in_at timestamp with time zone,
          checked_in_by_id uuid,
          checked_out_at timestamp with time zone,
          reminder_sent_at timestamp with time zone,
          cancelled_at timestamp with time zone,
          cancelled_by_id uuid,
          cancellation_reason text,
          source varchar(50) DEFAULT 'web',
          external_calendar_id varchar(255),
          metadata jsonb DEFAULT '{}'::jsonb,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          updated_at timestamp with time zone DEFAULT now() NOT NULL
        )`,
    },
    {
      name: "booking_notes",
      sql: `
        CREATE TABLE IF NOT EXISTS booking_notes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          booking_id uuid NOT NULL REFERENCES booking_reservations(id) ON DELETE CASCADE,
          user_id uuid,
          note text NOT NULL,
          is_internal boolean DEFAULT false,
          created_at timestamp with time zone DEFAULT now() NOT NULL
        )`,
    },
    {
      name: "booking_blackout_dates",
      sql: `
        CREATE TABLE IF NOT EXISTS booking_blackout_dates (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          room_id uuid NOT NULL REFERENCES booking_rooms(id) ON DELETE CASCADE,
          start_date timestamp with time zone NOT NULL,
          end_date timestamp with time zone NOT NULL,
          reason varchar(500),
          is_recurring boolean DEFAULT false,
          created_by_id uuid,
          created_at timestamp with time zone DEFAULT now() NOT NULL
        )`,
    },
  ];

  for (const table of tables) {
    await executeSQL(ctx, table.sql, `Table ${table.name}`);
  }

  // Crear índices
  const indexes = [
    {
      name: "booking_rooms_slug_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_rooms_slug_idx ON booking_rooms(slug)",
    },
    {
      name: "booking_rooms_type_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_rooms_type_idx ON booking_rooms(type)",
    },
    {
      name: "booking_rooms_status_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_rooms_status_idx ON booking_rooms(status)",
    },
    {
      name: "booking_rooms_capacity_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_rooms_capacity_idx ON booking_rooms(capacity)",
    },
    {
      name: "booking_rooms_active_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_rooms_active_idx ON booking_rooms(is_active)",
    },
    {
      name: "booking_amenities_category_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_amenities_category_idx ON booking_amenities(category)",
    },
    {
      name: "booking_reservations_room_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_room_idx ON booking_reservations(room_id)",
    },
    {
      name: "booking_reservations_user_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_user_idx ON booking_reservations(user_id)",
    },
    {
      name: "booking_reservations_status_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_status_idx ON booking_reservations(status)",
    },
    {
      name: "booking_reservations_time_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_time_idx ON booking_reservations(start_time, end_time)",
    },
    {
      name: "booking_reservations_start_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_start_idx ON booking_reservations(start_time)",
    },
    {
      name: "booking_reservations_end_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_end_idx ON booking_reservations(end_time)",
    },
    {
      name: "booking_reservations_recurrence_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_recurrence_idx ON booking_reservations(parent_booking_id)",
    },
    {
      name: "booking_reservations_organization_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_reservations_organization_idx ON booking_reservations(organization_id)",
    },
    {
      name: "booking_notes_booking_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_notes_booking_idx ON booking_notes(booking_id)",
    },
    {
      name: "booking_blackout_room_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_blackout_room_idx ON booking_blackout_dates(room_id)",
    },
    {
      name: "booking_blackout_dates_idx",
      sql: "CREATE INDEX IF NOT EXISTS booking_blackout_dates_idx ON booking_blackout_dates(start_date, end_date)",
    },
  ];

  for (const idx of indexes) {
    await executeSQL(ctx, idx.sql, `Index ${idx.name}`);
  }

  ctx.logger.info("✅ Booking: Migrations completed");
}

/**
 * Create router with dependency injection
 */
function createBookingGrimoireRouter(ctx: GrimoireContext): Hono {
  return createBookingRouter(ctx);
}

/**
 * Definición del grimoire Booking (Modern)
 */
export const grimoire = defineGrimoire({
  id: "grimoire-booking",
  name: "Booking Engine",
  version: "1.0.0",
  description: "Sistema de reservas de salas y recursos con detección de conflictos",
  icon: "Calendar",

  // Factory que crea el router con contexto inyectado
  createRouter: createBookingGrimoireRouter,

  // Tablas que administra este grimoire
  tables: [
    "booking_rooms",
    "booking_amenities",
    "booking_room_amenities",
    "booking_reservations",
    "booking_notes",
    "booking_blackout_dates",
  ],

  // Hooks de ciclo de vida
  hooks: {
    onEnable: async (ctx) => {
      ctx.logger.info("✅ Booking grimoire enabled");
    },

    onDisable: async (ctx) => {
      ctx.logger.info("⛔ Booking grimoire disabled");
    },

    onStartup: async (ctx) => {
      // Ejecutar migraciones
      await runMigrations(ctx);

      // Verificar tablas
      const requiredTables = ["booking_rooms", "booking_reservations"];
      const missingTables: string[] = [];

      for (const table of requiredTables) {
        const exists = await ctx.db.tableExists(table);
        if (!exists) {
          missingTables.push(table);
        }
      }

      if (missingTables.length > 0) {
        ctx.logger.warn(`⚠️ Booking tables not found: ${missingTables.join(", ")}`);
      } else {
        ctx.logger.info("📅 Booking tables verified");
      }
    },
  },

  // Configuración de admin UI
  admin: {
    category: "enterprise",
    views: [
      { id: "dashboard", type: "custom", title: "Dashboard" },
      { id: "grid-rooms", type: "grid", title: "Salas", table: "booking_rooms" },
      { id: "grid-reservations", type: "grid", title: "Reservas", table: "booking_reservations" },
      { id: "grid-amenities", type: "grid", title: "Amenidades", table: "booking_amenities" },
    ],
  },

  // Dependencias
  dependencies: {
    grimoires: ["grimoire-media"],
    core: ["auth"],
  },

  // Mount point
  mountPath: "/api/booking",
});

// Export schema
export { schema };

// Export default para imports más simples
export default grimoire;
