/**
 * Gremio CMS — Players Module Routes
 */

import { Hono } from "hono";
import { eq, desc, ilike } from "drizzle-orm";

// App context injections
import { db } from "../../../apps/api/src/db";
import { players } from "./players.schema";

export const playersRoutes = new Hono();

playersRoutes.get("/", async (c) => {
    const search = c.req.query("search");

    let query = db.select().from(players).orderBy(desc(players.createdAt));

    if (search) {
        query = db.select().from(players).where(ilike(players.alias, `%${search}%`)).orderBy(desc(players.createdAt)) as any;
    }

    const results = await query;
    return c.json(results);
});

playersRoutes.get("/:id", async (c) => {
    const { id } = c.req.param();
    const [player] = await db.select().from(players).where(eq(players.id, id)).limit(1);

    if (!player) return c.json({ error: "Player not found" }, 404);

    return c.json(player);
});

playersRoutes.post("/", async (c) => {
    const body = await c.req.json();

    const [player] = await db
        .insert(players)
        .values({
            alias: body.alias,
            avatarUrl: body.avatarUrl,
            bio: body.bio,
            socialLinks: body.socialLinks,
            coreUserId: body.coreUserId,
        })
        .returning();

    return c.json(player, 201);
});

playersRoutes.patch("/:id", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();

    const [updated] = await db
        .update(players)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(players.id, id))
        .returning();

    if (!updated) return c.json({ error: "Player not found" }, 404);

    return c.json(updated);
});

playersRoutes.delete("/:id", async (c) => {
    const { id } = c.req.param();
    const [deleted] = await db.delete(players).where(eq(players.id, id)).returning({ id: players.id });

    if (!deleted) return c.json({ error: "Player not found" }, 404);

    return c.json({ deleted: true, id: deleted.id });
});
