/**
 * Gremio CMS — Platforms Module Routes
 * 
 * REST API for gaming platforms (PC, PlayStation, Xbox, Nintendo, etc.)
 */

import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { db } from "../../../apps/api/src/db";
import { media } from "../../../apps/api/src/db/schema";
import { platforms } from "../grimoire-games/games.schema";

export const platformsRoutes = new Hono();

// ── List Platforms ──
platformsRoutes.get("/", async (c) => {
  const docs = await db
    .select()
    .from(platforms)
    .leftJoin(media, eq(platforms.iconId, media.id))
    .orderBy(asc(platforms.name));

  return c.json({
    docs: docs.map((row) => ({
      ...row.platforms,
      icon: row.media,
    })),
    totalDocs: docs.length,
  });
});

// ── Get Platform by Slug ──
platformsRoutes.get("/slug/:slug", async (c) => {
  const { slug } = c.req.param();

  const result = await db
    .select()
    .from(platforms)
    .leftJoin(media, eq(platforms.iconId, media.id))
    .where(eq(platforms.slug, slug))
    .limit(1);

  if (!result.length) return c.json({ error: "Platform not found" }, 404);

  return c.json({
    ...result[0].platforms,
    icon: result[0].media,
  });
});

// ── Get Platform by ID ──
platformsRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  if (id === "slug") return c.json({ error: "Invalid ID" }, 400);

  const result = await db
    .select()
    .from(platforms)
    .leftJoin(media, eq(platforms.iconId, media.id))
    .where(eq(platforms.id, id))
    .limit(1);

  if (!result.length) return c.json({ error: "Platform not found" }, 404);

  return c.json({
    ...result[0].platforms,
    icon: result[0].media,
  });
});

// ── Create Platform ──
platformsRoutes.post("/", async (c) => {
  const body = await c.req.json();

  const [platform] = await db
    .insert(platforms)
    .values({
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      shortName: body.shortName,
      manufacturer: body.manufacturer,
      iconId: body.iconId,
    })
    .returning();

  return c.json(platform, 201);
});

// ── Update Platform ──
platformsRoutes.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const [updated] = await db
    .update(platforms)
    .set(body)
    .where(eq(platforms.id, id))
    .returning();

  if (!updated) return c.json({ error: "Platform not found" }, 404);

  return c.json(updated);
});

// ── Delete Platform ──
platformsRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  const [deleted] = await db
    .delete(platforms)
    .where(eq(platforms.id, id))
    .returning({ id: platforms.id });

  if (!deleted) return c.json({ error: "Platform not found" }, 404);

  return c.json({ deleted: true, id: deleted.id });
});
