/**
 * Gremio CMS — Games Module Routes
 * 
 * REST API for game library management with IGDB sync support.
 * 
 * Note: This module is loaded by the Gremius module-loader at runtime,
 * so imports use the runtime context from apps/api.
 */

import { Hono } from "hono";
import { eq, desc, asc, sql, ilike, and } from "drizzle-orm";

// These are resolved at runtime by the module-loader context
import { db } from "../../../apps/api/src/db";
import { media } from "../../../apps/api/src/db/schema";

import {
  games,
  gamesToPlatforms,
  gamesToTags,
  platforms,
  tags,
} from "./games.schema";

export const gamesRoutes = new Hono();

// ── List Games ──
gamesRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 24, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const sort = c.req.query("sort") || "-metacriticScore";
  const status = c.req.query("status") || "published";
  const search = c.req.query("search");
  const featured = c.req.query("featured");

  const where = and(
    eq(games.status, status as any),
    search ? ilike(games.title, `%${search}%`) : undefined,
    featured === "true" ? eq(games.isFeaturedOnHome, true) : undefined
  );

  const orderBy =
    sort.startsWith("-")
      ? desc(games[sort.slice(1) as keyof typeof games.$inferSelect] as any)
      : asc(games[sort as keyof typeof games.$inferSelect] as any);

  const [docs, countResult] = await Promise.all([
    db
      .select()
      .from(games)
      .leftJoin(media, eq(games.coverArtId, media.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(games)
      .where(where),
  ]);

  const totalDocs = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.ceil(totalDocs / limit);

  return c.json({
    docs: docs.map((row) => ({
      ...row.games,
      coverArt: row.media,
    })),
    totalDocs,
    totalPages,
    page,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  });
});

// ── Get Game by Slug ──
gamesRoutes.get("/slug/:slug", async (c) => {
  const { slug } = c.req.param();

  const result = await db
    .select()
    .from(games)
    .leftJoin(media, eq(games.coverArtId, media.id))
    .where(eq(games.slug, slug))
    .limit(1);

  if (!result.length) return c.json({ error: "Game not found" }, 404);

  const game = result[0];

  const [gamePlatforms, gameTags] = await Promise.all([
    db
      .select({ platform: platforms })
      .from(gamesToPlatforms)
      .innerJoin(platforms, eq(gamesToPlatforms.platformId, platforms.id))
      .where(eq(gamesToPlatforms.gameId, game.games.id)),
    db
      .select({ tag: tags })
      .from(gamesToTags)
      .innerJoin(tags, eq(gamesToTags.tagId, tags.id))
      .where(eq(gamesToTags.gameId, game.games.id)),
  ]);

  return c.json({
    ...game.games,
    coverArt: game.media,
    platforms: gamePlatforms.map((r) => r.platform),
    tags: gameTags.map((r) => r.tag),
  });
});

// ── Get Game by ID ──
gamesRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  
  // Skip sub-routes
  if (id === "slug" || id === "collections") return c.json({ error: "Invalid ID" }, 400);

  const result = await db
    .select()
    .from(games)
    .leftJoin(media, eq(games.coverArtId, media.id))
    .where(eq(games.id, id))
    .limit(1);

  if (!result.length) return c.json({ error: "Game not found" }, 404);

  return c.json({
    ...result[0].games,
    coverArt: result[0].media,
  });
});

// ── Create Game ──
gamesRoutes.post("/", async (c) => {
  const body = await c.req.json();

  const [game] = await db
    .insert(games)
    .values({
      title: body.title,
      slug: body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      subtitle: body.subtitle,
      description: body.description,
      excerpt: body.excerpt,
      releaseDate: body.releaseDate,
      status: body.status || "draft",
      developer: body.developer,
      publisher: body.publisher,
      metacriticScore: body.metacriticScore,
      userRating: body.userRating,
      coverArtId: body.coverArtId,
      trailerUrl: body.trailerUrl,
      externalIds: body.externalIds,
      specs: body.specs,
      screenshots: body.screenshots,
      blocks: body.blocks || [],
      isFeaturedOnHome: body.isFeaturedOnHome ?? false,
    } as any)
    .returning();

  // Handle platform relations
  if (body.platformIds?.length) {
    await db.insert(gamesToPlatforms).values(
      body.platformIds.map((platformId: string) => ({
        gameId: game.id,
        platformId,
      }))
    );
  }

  // Handle tag relations
  if (body.tagIds?.length) {
    await db.insert(gamesToTags).values(
      body.tagIds.map((tagId: string) => ({
        gameId: game.id,
        tagId,
      }))
    );
  }

  return c.json(game, 201);
});

// ── Update Game ──
gamesRoutes.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const { platformIds, tagIds, ...columnUpdates } = body;

  const [updated] = await db
    .update(games)
    .set({ ...columnUpdates, updatedAt: new Date() })
    .where(eq(games.id, id))
    .returning();

  if (!updated) return c.json({ error: "Game not found" }, 404);

  // Sync platform relations if provided
  if (platformIds !== undefined) {
    await db.delete(gamesToPlatforms).where(eq(gamesToPlatforms.gameId, id));
    if (platformIds.length > 0) {
      await db.insert(gamesToPlatforms).values(
        platformIds.map((platformId: string) => ({ gameId: id, platformId }))
      );
    }
  }

  // Sync tag relations if provided
  if (tagIds !== undefined) {
    await db.delete(gamesToTags).where(eq(gamesToTags.gameId, id));
    if (tagIds.length > 0) {
      await db.insert(gamesToTags).values(
        tagIds.map((tagId: string) => ({ gameId: id, tagId }))
      );
    }
  }

  return c.json(updated);
});

// ── Delete Game ──
gamesRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  const [deleted] = await db
    .delete(games)
    .where(eq(games.id, id))
    .returning({ id: games.id });

  if (!deleted) return c.json({ error: "Game not found" }, 404);

  return c.json({ deleted: true, id: deleted.id });
});
