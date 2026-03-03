/**
 * Gremio CMS — Tags Module Routes
 * 
 * REST API for content tagging (genres, features, topics, series)
 */

import { Hono } from "hono";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../../../apps/api/src/db";
import { tags, gamesToTags, games } from "../grimoire-games/games.schema";

export const tagsRoutes = new Hono();

// ── List Tags ──
tagsRoutes.get("/", async (c) => {
  const category = c.req.query("category");
  const withCount = c.req.query("withCount") === "true";

  let query = db.select().from(tags);

  if (category) {
    query = query.where(eq(tags.category, category as any)) as any;
  }

  const docs = await query.orderBy(asc(tags.name));

  // Optionally include game count per tag
  if (withCount) {
    const counts = await db
      .select({
        tagId: gamesToTags.tagId,
        count: sql<number>`count(*)`,
      })
      .from(gamesToTags)
      .groupBy(gamesToTags.tagId);

    const countMap = new Map(counts.map((c) => [c.tagId, Number(c.count)]));

    return c.json({
      docs: docs.map((tag) => ({
        ...tag,
        gameCount: countMap.get(tag.id) || 0,
      })),
      totalDocs: docs.length,
    });
  }

  return c.json({ docs, totalDocs: docs.length });
});

// ── Get Tag by Slug ──
tagsRoutes.get("/slug/:slug", async (c) => {
  const { slug } = c.req.param();

  const result = await db
    .select()
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);

  if (!result.length) return c.json({ error: "Tag not found" }, 404);

  // Get games with this tag
  const tagGames = await db
    .select({ game: games })
    .from(gamesToTags)
    .innerJoin(games, eq(gamesToTags.gameId, games.id))
    .where(eq(gamesToTags.tagId, result[0].id))
    .limit(50);

  return c.json({
    ...result[0],
    games: tagGames.map((r) => r.game),
  });
});

// ── Get Tag by ID ──
tagsRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  if (id === "slug") return c.json({ error: "Invalid ID" }, 400);

  const result = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1);

  if (!result.length) return c.json({ error: "Tag not found" }, 404);

  return c.json(result[0]);
});

// ── Create Tag ──
tagsRoutes.post("/", async (c) => {
  const body = await c.req.json();

  const [tag] = await db
    .insert(tags)
    .values({
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      color: body.color,
      category: body.category,
    })
    .returning();

  return c.json(tag, 201);
});

// ── Update Tag ──
tagsRoutes.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const [updated] = await db
    .update(tags)
    .set(body)
    .where(eq(tags.id, id))
    .returning();

  if (!updated) return c.json({ error: "Tag not found" }, 404);

  return c.json(updated);
});

// ── Delete Tag ──
tagsRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  const [deleted] = await db
    .delete(tags)
    .where(eq(tags.id, id))
    .returning({ id: tags.id });

  if (!deleted) return c.json({ error: "Tag not found" }, 404);

  return c.json({ deleted: true, id: deleted.id });
});
