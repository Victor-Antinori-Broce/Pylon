/**
 * Employee Directory — Controller (Hono Router)
 *
 * Endpoints exposed:
 *   GET     /directorio              — list employees (paginated)
 *   GET     /directorio/:user_id     — full profile (user + employee_profile JOIN)
 *   POST    /directorio              — create profile for an existing user
 *   PATCH   /directorio/:user_id     — update profile fields
 *   POST    /directorio/ban          — revoke sessions + ban user via Better-Auth
 *   POST    /directorio/unban        — restore user access
 *
 * Mount example (whenever you're ready, add ONE line to your main router):
 *
 *   import { directoryRoutes } from "./modules/directory";
 *   app.route("/api/custom", directoryRoutes);
 *
 * This will expose all the routes above under /api/custom/directorio/...
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
    directoryService,
    NotFoundError,
    AlreadyBannedError,
} from "./directory.service";
import {
    banUserSchema,
    createProfileSchema,
    updateProfileSchema,
} from "./directory.schema";

// ── Helpers ───────────────────────────────────────────────────

function handleServiceError(err: unknown, c: any) {
    if (err instanceof NotFoundError) {
        return c.json({ error: "Not Found", message: err.message }, 404);
    }
    if (err instanceof AlreadyBannedError) {
        return c.json({ error: "Conflict", message: err.message }, 409);
    }
    console.error("[DirectoryController] Unhandled error:", err);
    return c.json(
        { error: "Internal Server Error", message: "An unexpected error occurred." },
        500
    );
}

// ── Router ────────────────────────────────────────────────────

export const directoryRoutes = new Hono();

// ── GET /directorio — list ────────────────────────────────────
directoryRoutes.get("/directorio", async (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);

    try {
        const employees = await directoryService.listEmployees(limit, offset);
        return c.json({ data: employees, limit, offset });
    } catch (err) {
        return handleServiceError(err, c);
    }
});

// ── POST /directorio/ban — ban user ───────────────────────────
// NOTE: Declared BEFORE /:user_id to avoid route shadowing.
directoryRoutes.post(
    "/directorio/ban",
    zValidator("json", banUserSchema, (result, c) => {
        if (!result.success) {
            return c.json(
                { error: "Validation Error", details: result.error.flatten().fieldErrors },
                400
            );
        }
    }),
    async (c) => {
        const body = c.req.valid("json");
        try {
            const result = await directoryService.banEmployee(body);
            return c.json({ data: result }, 200);
        } catch (err) {
            return handleServiceError(err, c);
        }
    }
);

// ── POST /directorio/unban — restore access ───────────────────
directoryRoutes.post(
    "/directorio/unban",
    zValidator("json", z.object({ user_id: z.string().min(1) }), (result, c) => {
        if (!result.success) {
            return c.json(
                { error: "Validation Error", details: result.error.flatten().fieldErrors },
                400
            );
        }
    }),
    async (c) => {
        const { user_id } = c.req.valid("json");
        try {
            const result = await directoryService.unbanEmployee(user_id);
            return c.json({ data: result }, 200);
        } catch (err) {
            return handleServiceError(err, c);
        }
    }
);

// ── GET /directorio/:user_id — full profile ───────────────────
directoryRoutes.get("/directorio/:user_id", async (c) => {
    const userId = c.req.param("user_id");
    try {
        const profile = await directoryService.getEmployeeProfile(userId);
        return c.json({ data: profile });
    } catch (err) {
        return handleServiceError(err, c);
    }
});

// ── POST /directorio — create profile ────────────────────────
directoryRoutes.post(
    "/directorio",
    zValidator("json", createProfileSchema, (result, c) => {
        if (!result.success) {
            return c.json(
                { error: "Validation Error", details: result.error.flatten().fieldErrors },
                400
            );
        }
    }),
    async (c) => {
        const body = c.req.valid("json");
        try {
            const profile = await directoryService.createProfile(body);
            return c.json({ data: profile }, 201);
        } catch (err) {
            return handleServiceError(err, c);
        }
    }
);

// ── PATCH /directorio/:user_id — update profile ───────────────
directoryRoutes.patch(
    "/directorio/:user_id",
    zValidator("json", updateProfileSchema, (result, c) => {
        if (!result.success) {
            return c.json(
                { error: "Validation Error", details: result.error.flatten().fieldErrors },
                400
            );
        }
    }),
    async (c) => {
        const userId = c.req.param("user_id");
        const body = c.req.valid("json");
        try {
            const updated = await directoryService.updateProfile(userId, body);
            return c.json({ data: updated });
        } catch (err) {
            return handleServiceError(err, c);
        }
    }
);
