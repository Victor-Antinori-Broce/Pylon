/**
 * Employee Directory — Schema & Validators
 *
 * Drizzle ORM table definition for `employee_profile` (the 1-to-1 extension
 * of Better-Auth's `user` table) plus Zod schemas for request validation.
 *
 * NOTE: The `user` table is owned by Better-Auth and must NOT be redefined
 * here. We reference it only via Foreign Key.
 */

import {
    pgTable,
    text,
    varchar,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Table definition ──────────────────────────────────────────

/**
 * `employee_profile` — 1-to-1 extension of the Better-Auth `user` table.
 *
 * The `user_id` column is both the PK and FK so there is exactly one profile
 * per user account.
 */
export const employeeProfile = pgTable(
    "employee_profile",
    {
        /** References better-auth.user.id (text PK) */
        userId: text("user_id").primaryKey(),

        departamento: varchar("departamento", { length: 200 }),
        cargo: varchar("cargo", { length: 200 }),
        celular: varchar("celular", { length: 30 }),
        jefeDirecto: varchar("jefe_directo", { length: 255 }), // Could store user_id or display name

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex("employee_profile_user_id_idx").on(t.userId)]
);

// ── TypeScript types ──────────────────────────────────────────

export type EmployeeProfile = typeof employeeProfile.$inferSelect;
export type NewEmployeeProfile = typeof employeeProfile.$inferInsert;

// ── Zod validators ────────────────────────────────────────────

/**
 * Validates the `user_id` path/body parameter (Better-Auth uses text IDs).
 */
export const userIdSchema = z.object({
    user_id: z.string().min(1, "user_id is required"),
});

/**
 * Validates the `POST /ban` request body.
 */
export const banUserSchema = z.object({
    user_id: z.string().min(1, "user_id is required"),
    reason: z.string().optional(),
});

/**
 * Validates the `POST /directory` creation body.
 */
export const createProfileSchema = z.object({
    user_id: z.string().min(1, "user_id is required"),
    departamento: z.string().max(200).optional(),
    cargo: z.string().max(200).optional(),
    celular: z.string().max(30).optional(),
    jefe_directo: z.string().max(255).optional(),
});

/**
 * Validates the `PATCH /directory/:user_id` update body.
 */
export const updateProfileSchema = createProfileSchema.omit({ user_id: true }).partial();

export type BanUserInput = z.infer<typeof banUserSchema>;
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
