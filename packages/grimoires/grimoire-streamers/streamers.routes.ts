
/**
 * Gremio CMS — Streamers Module Routes (DI Version)
 * 
 * REST API for streamer management with Twitch/YouTube/Kick sync.
 * 
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * 
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 */

import { Hono } from "hono";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import { streamers, gamesToStreamers } from "./streamers.schema";

/**
 * Factory function that creates Streamers routes with dependency injection
 */
export function createStreamersRouter(ctx: GrimoireContext): Hono {
  const streamersRoutes = new Hono();
  const { db, auth } = ctx;
  
  const dbInstance = db.instance;
  const requireAuth = auth.requireAuth;

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC/SPECIFIC ROUTES (must come before parameterized routes)
  // ═══════════════════════════════════════════════════════════════════════════

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
      dbInstance
        .select()
        .from(streamers)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      dbInstance
        .select({ count: sql<number>`count(*)` })
        .from(streamers)
        .where(where),
    ]);

    const totalDocs = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(totalDocs / limit);

    return c.json({
      docs,
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
    const docs = await dbInstance
      .select()
      .from(streamers)
      .where(eq(streamers.isLive, true))
      .orderBy(desc(streamers.viewerCount))
      .limit(20);

    return c.json({
      docs,
      totalDocs: docs.length,
    });
  });

  // ── Get Streamer by Slug ──
  streamersRoutes.get("/slug/:slug", async (c) => {
    const { slug } = c.req.param();

    const result = await dbInstance
      .select()
      .from(streamers)
      .where(eq(streamers.slug, slug))
      .limit(1);

    if (!result.length) return c.json({ error: "Streamer not found" }, 404);

    const streamer = result[0];

    // Get associated games
    const streamerGames = await dbInstance
      .select({ gameId: gamesToStreamers.gameId, isPrimary: gamesToStreamers.isPrimary })
      .from(gamesToStreamers)
      .where(eq(gamesToStreamers.streamerId, streamer.id));

    return c.json({
      ...streamer,
      games: streamerGames,
    });
  });

  // ── Bulk Update Live Status (for sync jobs) ──
  // SPECIFIC ROUTE: must come before /:id
  streamersRoutes.post("/sync/status", requireAuth, async (c) => {
    const body = await c.req.json();
    const { updates } = body;

    if (!Array.isArray(updates)) {
      return c.json({ error: "updates must be an array" }, 400);
    }

    let updated = 0;

    for (const update of updates) {
      const result = await dbInstance
        .update(streamers)
        .set({
          isLive: update.isLive ?? false,
          viewerCount: update.viewerCount ?? 0,
          currentStreamTitle: update.currentStreamTitle || null,
          thumbnailId: update.thumbnailId || null,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PARAMETERIZED ROUTES (must come AFTER specific routes)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Get Streamer by ID ──
  streamersRoutes.get("/:id", async (c) => {
    const { id } = c.req.param();

    const result = await dbInstance
      .select()
      .from(streamers)
      .where(eq(streamers.id, id))
      .limit(1);

    if (!result.length) return c.json({ error: "Streamer not found" }, 404);

    return c.json(result[0]);
  });

  // ── Create Streamer ──
  streamersRoutes.post("/", requireAuth, async (c) => {
    const body = await c.req.json();

    const [streamer] = await dbInstance
      .insert(streamers)
      .values({
        displayName: body.displayName,
        slug: body.slug || body.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        platform: body.platform,
        channelId: body.channelId,
        channelUrl: body.channelUrl,
        bio: body.bio,
        avatarId: body.avatarId,
        thumbnailId: body.thumbnailId,
        socialLinks: body.socialLinks ? JSON.stringify(body.socialLinks) : null,
      })
      .returning();

    // Handle game associations
    if (body.gameIds?.length) {
      await dbInstance.insert(gamesToStreamers).values(
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
  streamersRoutes.patch("/:id", requireAuth, async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();

    const { gameIds, ...columnUpdates } = body;

    // Handle socialLinks serialization
    if (columnUpdates.socialLinks && typeof columnUpdates.socialLinks === "object") {
      columnUpdates.socialLinks = JSON.stringify(columnUpdates.socialLinks);
    }

    const [updated] = await dbInstance
      .update(streamers)
      .set({ ...columnUpdates, updatedAt: new Date() })
      .where(eq(streamers.id, id))
      .returning();

    if (!updated) return c.json({ error: "Streamer not found" }, 404);

    // Sync game associations if provided
    if (gameIds !== undefined) {
      await dbInstance.delete(gamesToStreamers).where(eq(gamesToStreamers.streamerId, id));
      if (gameIds.length > 0) {
        await dbInstance.insert(gamesToStreamers).values(
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
  streamersRoutes.delete("/:id", requireAuth, async (c) => {
    const { id } = c.req.param();

    const [deleted] = await dbInstance
      .delete(streamers)
      .where(eq(streamers.id, id))
      .returning({ id: streamers.id });

    if (!deleted) return c.json({ error: "Streamer not found" }, 404);

    return c.json({ deleted: true, id: deleted.id });
  });

  // Return the configured router
  return streamersRoutes;
}

// Legacy export for backward compatibility
export { createStreamersRouter as streamersRoutes };
