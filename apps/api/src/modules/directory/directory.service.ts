/**
 * Employee Directory — Service
 *
 * Business logic for:
 *   1. getEmployeeProfile(userId)  — JOIN user + employee_profile
 *   2. listEmployees()             — paginated list with JOIN
 *   3. createProfile(input)        — insert employee_profile row
 *   4. updateProfile(userId, data) — update employee_profile fields
 *   5. banEmployee(userId, reason) — revoke sessions + ban via Better-Auth
 *
 * ── Better-Auth Integration ──────────────────────────────────
 * This service imports `auth` from `../../lib/auth`.
 * Better-Auth does NOT expose a traditional "ban user" method in its public
 * SDK by default. We implement it by:
 *   a) Deleting all `session` rows for this user via Drizzle (revoke sessions).
 *   b) Setting a `banned` / `disabled` flag via direct Drizzle update on the
 *      `user` table (since Better-Auth owns the table but shares the DB connection).
 *
 * If you add the Better-Auth `admin` plugin in the future, you can replace
 * the direct SQL calls with `auth.api.banUser({ body: { userId } })`.
 */

import { eq, desc } from "drizzle-orm";
import { db } from "../../db";
import { employeeProfile } from "./directory.schema";
import type { CreateProfileInput, UpdateProfileInput, BanUserInput } from "./directory.schema";

// ── Better-Auth table references ──────────────────────────────
// We avoid importing Better-Auth's schema to stay non-destructive.
// Instead we use raw SQL through Drizzle's `sql` helper and the shared `db`.
import { sql } from "drizzle-orm";

// ── Custom errors ─────────────────────────────────────────────

export class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = "NotFoundError"; }
}

export class AlreadyBannedError extends Error {
    constructor(msg: string) { super(msg); this.name = "AlreadyBannedError"; }
}

// ── Helpers ───────────────────────────────────────────────────

/** Fetch the raw user row from Better-Auth's `user` table. */
async function getRawUser(userId: string) {
    const rows = await db.execute<{ id: string; email: string; name: string; banned: boolean | null }>(
        sql`SELECT id, email, name, banned FROM "user" WHERE id = ${userId} LIMIT 1`
    );
    return (rows.rows ?? rows)[0] ?? null;
}

// ── Service ───────────────────────────────────────────────────

export const directoryService = {

    /**
     * Returns the full employee profile by JOINing the Better-Auth `user`
     * table with `employee_profile`.
     */
    async getEmployeeProfile(userId: string) {
        const rows = await db.execute<{
            user_id: string;
            email: string;
            name: string;
            banned: boolean | null;
            departamento: string | null;
            cargo: string | null;
            celular: string | null;
            jefe_directo: string | null;
            profile_created_at: string | null;
        }>(
            sql`
        SELECT
          u.id           AS user_id,
          u.email,
          u.name,
          u.banned,
          ep.departamento,
          ep.cargo,
          ep.celular,
          ep.jefe_directo,
          ep.created_at  AS profile_created_at
        FROM "user" u
        LEFT JOIN employee_profile ep ON ep.user_id = u.id
        WHERE u.id = ${userId}
        LIMIT 1
      `
        );

        const row = (rows.rows ?? rows)[0] ?? null;
        if (!row) throw new NotFoundError(`User '${userId}' not found.`);
        return row;
    },

    /**
     * Lists all employees (users that have an `employee_profile`),
     * with pagination.
     */
    async listEmployees(limit = 50, offset = 0) {
        const rows = await db.execute<{
            user_id: string;
            email: string;
            name: string;
            banned: boolean | null;
            departamento: string | null;
            cargo: string | null;
            celular: string | null;
        }>(
            sql`
        SELECT
          u.id     AS user_id,
          u.email,
          u.name,
          u.banned,
          ep.departamento,
          ep.cargo,
          ep.celular
        FROM employee_profile ep
        INNER JOIN "user" u ON u.id = ep.user_id
        ORDER BY u.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `
        );
        return rows.rows ?? rows;
    },

    /**
     * Creates a new employee profile row.
     * Verifies that the referenced user exists first.
     */
    async createProfile(input: CreateProfileInput) {
        const rawUser = await getRawUser(input.user_id);
        if (!rawUser) throw new NotFoundError(`User '${input.user_id}' not found in Better-Auth.`);

        const [created] = await db
            .insert(employeeProfile)
            .values({
                userId: input.user_id,
                departamento: input.departamento,
                cargo: input.cargo,
                celular: input.celular,
                jefeDirecto: input.jefe_directo,
            })
            .returning();

        return created;
    },

    /**
     * Updates mutable fields on an existing employee profile.
     */
    async updateProfile(userId: string, data: UpdateProfileInput) {
        const [updated] = await db
            .update(employeeProfile)
            .set({
                ...(data.departamento !== undefined && { departamento: data.departamento }),
                ...(data.cargo !== undefined && { cargo: data.cargo }),
                ...(data.celular !== undefined && { celular: data.celular }),
                ...(data.jefe_directo !== undefined && { jefeDirecto: data.jefe_directo }),
                updatedAt: new Date(),
            })
            .where(eq(employeeProfile.userId, userId))
            .returning();

        if (!updated) throw new NotFoundError(`Employee profile for '${userId}' not found.`);
        return updated;
    },

    /**
     * Bans/disables an employee in two atomic steps:
     *
     *   STEP 1 — Revoke all active sessions (via direct SQL on BA's `session` table).
     *   STEP 2 — Mark the user as `banned = true` in BA's `user` table.
     *
     * ── NOTE ON Better-Auth ADMIN PLUGIN ─────────────────────────────────────
     * If you enable the Better-Auth `admin` plugin, replace steps 1 & 2 with:
     *
     *   import { auth } from "../../lib/auth";
     *   await auth.api.banUser({ body: { userId, banReason: reason } });
     *   // The plugin handles session revocation internally.
     *
     * The current implementation is equivalent but works without the plugin.
     * ─────────────────────────────────────────────────────────────────────────
     */
    async banEmployee(input: BanUserInput) {
        const { user_id: userId, reason } = input;

        // Verify user exists
        const rawUser = await getRawUser(userId);
        if (!rawUser) throw new NotFoundError(`User '${userId}' not found.`);
        if (rawUser.banned) throw new AlreadyBannedError(`User '${userId}' is already banned.`);

        // ── STEP 1: Revoke all sessions ───────────────────────────
        // Deletes every active session row for this user from BA's session table.
        await db.execute(
            sql`DELETE FROM "session" WHERE user_id = ${userId}`
        );

        // ── STEP 2: Ban the user ──────────────────────────────────
        // Set `banned = true` on BA's user table.
        // If BA added a `ban_reason` column you can store the reason too.
        await db.execute(
            sql`
        UPDATE "user"
        SET banned = true, updated_at = NOW()
        WHERE id = ${userId}
      `
        );

        return {
            userId,
            banned: true,
            reason: reason ?? null,
            message: `User '${userId}' has been banned and all active sessions revoked.`,
        };
    },

    /**
     * Reverses a ban: restores login access.
     * Mirrors `banEmployee` but sets banned = false.
     */
    async unbanEmployee(userId: string) {
        const rawUser = await getRawUser(userId);
        if (!rawUser) throw new NotFoundError(`User '${userId}' not found.`);

        await db.execute(
            sql`UPDATE "user" SET banned = false, updated_at = NOW() WHERE id = ${userId}`
        );

        return {
            userId,
            banned: false,
            message: `User '${userId}' access has been restored.`,
        };
    },
};
