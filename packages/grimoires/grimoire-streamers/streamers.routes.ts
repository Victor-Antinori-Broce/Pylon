/**
 * Gremio CMS — Streamers Module Routes
 * 
 * REST API for streamer management with Twitch/YouTube/Kick sync.
 */

import { Hono } from "hono";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { db } from "../../../apps/api/src/db";
import { media } from "../../../apps/api/src/db/schema";
import { streamers, gamesToStreamers } from "./streamers.schema";
import { games } from "../grimoire-games/games.schema";

export const streamersRoutes = new Hono();

// ── List Streamers ──
streamersRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const platform = c.req.query("platform");
  const liveOnly = c.req.query("live") === "true";
  const sort = c.req.query("sort") || "-followerCount";

  const conditions = [];
  if (platform) {
    conditions.push(eq(streamers.platform, platform as any));
  }
  if (liveOnly) {
    conditions.push(eq(streamers.isLive, true));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy =
    sort.startsWith("-")
      ? desc(streamers[sort.slice(1) as keyof typeof streamers.$inferSelect] as any)
      : asc(streamers[sort as keyof typeof streamers.$inferSelect] as any);

  const [docs, countResult] = await Promise.all([
    db
      .select()
      .from(streamers)
      .leftJoin(media, eq(streamers.avatarId, media.id))
      .leftJoin(games, eq(streamers.currentGameId, games.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(streamers)
      .where(where),
  ]);

  const totalDocs = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.ceil(totalDocs / limit);

  return c.json({
    docs: docs.map((row) => ({
      ...row.streamers,
      avatar: row.media,
      currentGame: row.games,
    })),
    totalDocs,
    totalPages,
    page,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  });
});

// ── Get Live Streamers ──
streamersRoutes.get("/live", async (c) => {
  const docs = await db
    .select()
    .from(streamers)
    .leftJoin(media, eq(streamers.avatarId, media.id))
    .leftJoin(games, eq(streamers.currentGameId, games.id))
    .where(eq(streamers.isLive, true))
    .orderBy(desc(streamers.viewerCount))
    .limit(20);

  return c.json({
    docs: docs.map((row) => ({
      ...row.streamers,
      avatar: row.media,
      currentGame: row.games,
    })),
    totalDocs: docs.length,
  });
});

// ── Get Streamer by Slug ──
streamersRoutes.get("/slug/:slug", async (c) => {
  const { slug } = c.req.param();

  const result = await db
    .select()
    .from(streamers)
    .leftJoin(media, eq(streamers.avatarId, media.id))
    .leftJoin(games, eq(streamers.currentGameId, games.id))
    .where(eq(streamers.slug, slug))
    .limit(1);

  if (!result.length) return c.json({ error: "Streamer not found" }, 404);

  const streamer = result[0];

  // Get associated games
  const streamerGames = await db
    .select({ game: games, isPrimary: gamesToStreamers.isPrimary })
    .from(gamesToStreamers)
    .innerJoin(games, eq(gamesToStreamers.gameId, games.id))
    .where(eq(gamesToStreamers.streamerId, streamer.streamers.id));

  return c.json({
    ...streamer.streamers,
    avatar: streamer.media,
    currentGame: streamer.games,
    games: streamerGames.map((r) => ({ ...r.game, isPrimary: r.isPrimary })),
  });
});

// ── Get Streamer by ID ──
streamersRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  // Skip sub-routes
  if (id === "slug" || id === "live" || id === "sync") {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const result = await db
    .select()
    .from(streamers)
    .leftJoin(media, eq(streamers.avatarId, media.id))
    .where(eq(streamers.id, id))
    .limit(1);

  if (!result.length) return c.json({ error: "Streamer not found" }, 404);

  return c.json({
    ...result[0].streamers,
    avatar: result[0].media,
  });
});

// ── Create Streamer ──
streamersRoutes.post("/", async (c) => {
  const body = await c.req.json();

  const [streamer] = await db
    .insert(streamers)
    .values({
      displayName: body.displayName,
      slug: body.slug || body.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      platform: body.platform,
      channelId: body.channelId,
      channelUrl: body.channelUrl,
      bio: body.bio,
      avatarId: body.avatarId,
      socialLinks: body.socialLinks ? JSON.stringify(body.socialLinks) : null,
    })
    .returning();

  // Handle game associations
  if (body.gameIds?.length) {
    await db.insert(gamesToStreamers).values(
      body.gameIds.map((gameId: string, idx: number) => ({
        streamerId: streamer.id,
        gameId,
        isPrimary: idx === 0,
      }))
    );
  }

  return c.json(streamer, 201);
});

// ── Update Streamer ──
streamersRoutes.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const { gameIds, ...columnUpdates } = body;

  // Handle socialLinks serialization
  if (columnUpdates.socialLinks && typeof columnUpdates.socialLinks === "object") {
    columnUpdates.socialLinks = JSON.stringify(columnUpdates.socialLinks);
  }

  const [updated] = await db
    .update(streamers)
    .set({ ...columnUpdates, updatedAt: new Date() })
    .where(eq(streamers.id, id))
    .returning();

  if (!updated) return c.json({ error: "Streamer not found" }, 404);

  // Sync game associations if provided
  if (gameIds !== undefined) {
    await db.delete(gamesToStreamers).where(eq(gamesToStreamers.streamerId, id));
    if (gameIds.length > 0) {
      await db.insert(gamesToStreamers).values(
        gameIds.map((gameId: string, idx: number) => ({
          streamerId: id,
          gameId,
          isPrimary: idx === 0,
        }))
      );
    }
  }

  return c.json(updated);
});

// ── Delete Streamer ──
streamersRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  const [deleted] = await db
    .delete(streamers)
    .where(eq(streamers.id, id))
    .returning({ id: streamers.id });

  if (!deleted) return c.json({ error: "Streamer not found" }, 404);

  return c.json({ deleted: true, id: deleted.id });
});

// ── Bulk Update Live Status (for sync jobs) ──
streamersRoutes.post("/sync/status", async (c) => {
  const body = await c.req.json();
  const { updates } = body; // Array of { channelId, platform, isLive, viewerCount, currentStreamTitle }

  if (!Array.isArray(updates)) {
    return c.json({ error: "updates must be an array" }, 400);
  }

  let updated = 0;

  for (const update of updates) {
    const result = await db
      .update(streamers)
      .set({
        isLive: update.isLive ?? false,
        viewerCount: update.viewerCount ?? 0,
        currentStreamTitle: update.currentStreamTitle || null,
        thumbnailUrl: update.thumbnailUrl || null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(streamers.channelId, update.channelId),
          eq(streamers.platform, update.platform)
        )
      )
      .returning();

    if (result.length > 0) updated++;
  }

  return c.json({ synced: updated, total: updates.length });
});
