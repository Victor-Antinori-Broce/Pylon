/**
 * DMS — Controller (Hono Router)
 *
 * Implements the three required endpoints and enforces role-based access
 * at the controller layer (Scenario 5), delegating business logic to dms.service.ts.
 *
 * Endpoints:
 *   POST  /docs/:id/new-version  — Scenario 2 (Black Box versioning)
 *   GET   /docs/:id/download     — Scenario 1 (department ACL)
 *   POST  /docs/:id/approve      — Scenario 3, 4, 5 (approval + BullMQ)
 *
 * ── Mount when ready (ONE line in your main router): ─────────
 *   import { dmsRoutes } from "./modules/dms";
 *   app.route("/api/custom", dmsRoutes);
 * ─────────────────────────────────────────────────────────────
 *
 * ── User context ─────────────────────────────────────────────
 * This controller expects the authenticated user's context to be
 * available on the Hono context variable `c.var.user`.
 *
 * If you use Better-Auth middleware that sets c.var.session / c.var.user,
 * adapt the `extractUser()` helper below to match your middleware's shape.
 * ─────────────────────────────────────────────────────────────
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { dmsService, NotFoundError, ForbiddenError, ConflictError } from "./dms.service";
import { newVersionSchema } from "./dms.schema";
import type { UserContext } from "./dms.schema";

// ── Helpers ───────────────────────────────────────────────────

/**
 * Extracts the UserContext from the Hono context.
 *
 * ADAPT THIS to your actual auth middleware. For example:
 *   - Better-Auth sets: c.var.session?.user
 *   - Your employee_profile join might be done in a middleware
 *     and attached as c.var.employeeProfile
 *
 * The function below reads from `c.var.user` as a convention.
 * Returns null if no authenticated user is found (causes 401).
 */
function extractUser(c: any): UserContext | null {
    const u = c.var?.user ?? c.get?.("user");
    if (!u || !u.userId || !u.role || !u.department) return null;
    return u as UserContext;
}

function handleError(err: unknown, c: any) {
    if (err instanceof ForbiddenError) {
        return c.json({ error: "Forbidden", message: err.message }, 403);
    }
    if (err instanceof NotFoundError) {
        return c.json({ error: "Not Found", message: err.message }, 404);
    }
    if (err instanceof ConflictError) {
        return c.json({ error: "Conflict", message: err.message }, 409);
    }
    console.error("[DmsController] Unhandled error:", err);
    return c.json(
        { error: "Internal Server Error", message: "An unexpected error occurred." },
        500
    );
}

/** Roles allowed to approve documents (Scenario 5) */
const APPROVER_ROLES: UserContext["role"][] = ["manager", "admin"];

// ── Router ────────────────────────────────────────────────────

export const dmsRoutes = new Hono();

// ── POST /docs/:id/new-version ────────────────────────────────
// Scenario 2: Creates new version, marks previous as superseded.
dmsRoutes.post(
    "/docs/:id/new-version",
    zValidator("json", newVersionSchema, (result, c) => {
        if (!result.success) {
            return c.json(
                { error: "Validation Error", details: result.error.flatten().fieldErrors },
                400
            );
        }
    }),
    async (c) => {
        const user = extractUser(c);
        if (!user) return c.json({ error: "Unauthorized" }, 401);

        const docId = c.req.param("id");
        const body = c.req.valid("json");

        try {
            const version = await dmsService.newVersion(docId, body, user);
            return c.json(
                { message: "New version created successfully.", data: version },
                201
            );
        } catch (err) {
            return handleError(err, c);
        }
    }
);

// ── GET /docs/:id/download ────────────────────────────────────
// Scenario 1: Returns file URL; 403 if department mismatch.
dmsRoutes.get("/docs/:id/download", async (c) => {
    const user = extractUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const docId = c.req.param("id");

    try {
        const downloadUrl = await dmsService.getDownloadUrl(docId, user);
        return c.json({ data: { download_url: downloadUrl } });
    } catch (err) {
        return handleError(err, c);
    }
});

// ── POST /docs/:id/approve ────────────────────────────────────
// Scenario 3: DRAFT → APPROVED + BullMQ event.
// Scenario 4: 409 if already APPROVED.
// Scenario 5: 403 if role is not manager/admin.
dmsRoutes.post("/docs/:id/approve", async (c) => {
    const user = extractUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // ── Scenario 5: Role-based authorization ──────────────────
    if (!APPROVER_ROLES.includes(user.role)) {
        return c.json(
            {
                error: "Forbidden",
                message: `Role '${user.role}' is not authorized to approve documents.`,
            },
            403
        );
    }

    const docId = c.req.param("id");

    try {
        const document = await dmsService.approveDocument(docId, user);
        return c.json(
            {
                message: "Document approved successfully.",
                data: document,
            },
            200
        );
    } catch (err) {
        return handleError(err, c);
    }
});
