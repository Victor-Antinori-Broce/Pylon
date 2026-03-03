/**
 * API Keys Routes
 * Endpoints for generating, listing, and revoking machine authentication keys.
 */

import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { db } from "../db";
import { apiKeys } from "../db/schema";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const apiKeysRoutes = new Hono<{
    Variables: {
        user: { id: string; role: string } | null;
    };
}>();

// Ensure only admins can manage keys
apiKeysRoutes.use("*", async (c, next) => {
    const user = c.get("user");
    if (!user || user.role !== "admin") {
        return c.json({ error: "Unauthorized. Admin role required." }, 403);
    }
    await next();
});

// ── GET /api/keys — List all API keys ──
apiKeysRoutes.get("/", async (c) => {
    const user = c.get("user")!;

    const keys = await db
        .select({
            id: apiKeys.id,
            name: apiKeys.name,
            hint: apiKeys.hint,
            lastUsedAt: apiKeys.lastUsedAt,
            expiresAt: apiKeys.expiresAt,
            createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .orderBy(desc(apiKeys.createdAt));

    return c.json(keys);
});

// ── POST /api/keys — Create a new API key ──
const createKeySchema = z.object({
    name: z.string().min(1, "Name is required").max(200),
    expiresInDays: z.number().optional().nullable(),
});

apiKeysRoutes.post("/", zValidator("json", createKeySchema), async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");

    // Generate a secure 256-bit token
    const rawToken = "gremius_sk_" + randomBytes(32).toString("hex");
    const keyHash = createHash("sha256").update(rawToken).digest("hex");
    const hint = "..." + rawToken.slice(-6);

    let expiresAt = null;
    if (body.expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
    }

    const [record] = await db.insert(apiKeys).values({
        name: body.name,
        keyHash,
        hint,
        expiresAt,
        createdById: user.id
    }).returning();

    return c.json({
        id: record.id,
        name: record.name,
        hint: record.hint,
        token: rawToken, // ONLY SHOWN ONCE
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
    }, 201);
});

// ── DELETE /api/keys/:id — Revoke an API key ──
apiKeysRoutes.delete("/:id", async (c) => {
    const { id } = c.req.param();

    const result = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning();

    if (!result.length) {
        return c.json({ error: "API Key not found" }, 404);
    }

    return c.json({ success: true, message: "API Key revoked successfully" });
});
