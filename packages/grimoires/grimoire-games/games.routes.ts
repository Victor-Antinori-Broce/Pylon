// @ts-nocheck

/**
 * Gremio CMS — Games Module Routes (DI Version)
 * 
 * REST API for game library management with IGDB sync support.
 * 
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * ENHANCED: Now includes grimoire-media transform URLs for cover art and screenshots
 * 
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 */

import { Hono } from "hono";
import { eq, desc, asc, sql, ilike, and } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";

import {
  games,
  gamesToPlatforms,
  gamesToTags,
  platforms,
  tags,
  gameCollections,
  gameCollectionEntries,
} from "./games.schema";

import {
  buildCoverArtUrls,
  buildScreenshotUrls,
  type FocalPoint,
} from "./games.schema";



/**
 * Factory function that creates Games routes with dependency injection
 */
export function createGamesRouter(ctx: GrimoireContext): Hono {
  const gamesRoutes = new Hono();
  const { db, auth } = ctx;
  
  // Helper to get db instance
  const dbInstance = db.instance;
  
  // Helper for auth
  const requireAuth = auth.requireAuth;



  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC/SPECIFIC ROUTES (must come before parameterized routes)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── List Games ──
  gamesRoutes.get("/", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 24, 100);
    const page = Math.max(Number(c.req.query("page")) || 1, 1);
    const offset = (page - 1) * limit;
    const sort = c.req.query("sort") || "-metacriticScore";
    const status = c.req.query("status") || "published";
    const search = c.req.query("search");
    const featured = c.req.query("featured");
    // Query param to include media transform URLs
    const includeMedia = c.req.query("includeMedia") !== "false";

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
      dbInstance
        .select()
        .from(games)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      dbInstance
        .select({ count: sql<number>`count(*)` })
        .from(games)
        .where(where),
    ]);

    const totalDocs = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(totalDocs / limit);

    // Enrich with media transform URLs if requested
    const enrichedDocs = includeMedia
      ? docs.map((game) => enrichGameWithMediaUrls(game))
      : docs;

    return c.json({
      docs: enrichedDocs,
      totalDocs,
      totalPages,
      page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    });
  });

  // ── Get Game by Slug ──
  // SPECIFIC ROUTE: must come before /:id
  gamesRoutes.get("/slug/:slug", async (c) => {
    const { slug } = c.req.param();
    // Query param to include media transform URLs
    const includeMedia = c.req.query("includeMedia") !== "false";

    const result = await dbInstance
      .select()
      .from(games)
      .where(eq(games.slug, slug))
      .limit(1);

    if (!result.length) return c.json({ error: "Game not found" }, 404);

    const game = result[0];

    const [gamePlatforms, gameTags] = await Promise.all([
      dbInstance
        .select({ platform: platforms })
        .from(gamesToPlatforms)
        .innerJoin(platforms, eq(gamesToPlatforms.platformId, platforms.id))
        .where(eq(gamesToPlatforms.gameId, game.id)),
      dbInstance
        .select({ tag: tags })
        .from(gamesToTags)
        .innerJoin(tags, eq(gamesToTags.tagId, tags.id))
        .where(eq(gamesToTags.gameId, game.id)),
    ]);

    // Build response
    const response: any = {
      ...game,
      platforms: gamePlatforms.map((r) => r.platform),
      tags: gameTags.map((r) => r.tag),
    };

    // Enrich with media URLs if requested
    if (includeMedia) {
      response.media = buildGameMediaUrls(game);
    }

    return c.json(response);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PARAMETERIZED ROUTES (must come AFTER specific routes)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Get Game by ID ──
  gamesRoutes.get("/:id", async (c) => {
    const { id } = c.req.param();
    // Query param to include media transform URLs
    const includeMedia = c.req.query("includeMedia") !== "false";

    const result = await dbInstance
      .select()
      .from(games)
      .where(eq(games.id, id))
      .limit(1);

    if (!result.length) return c.json({ error: "Game not found" }, 404);

    const game = result[0];
    
    // Build response
    const response: any = { ...game };
    
    // Enrich with media URLs if requested
    if (includeMedia) {
      response.media = buildGameMediaUrls(game);
    }

    return c.json(response);
  });

  // ── Create Game ──
  gamesRoutes.post("/", requireAuth, async (c) => {
    const body = await c.req.json();

    const [game] = await dbInstance
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
        coverFocalPoint: body.coverFocalPoint,
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
      await dbInstance.insert(gamesToPlatforms).values(
        body.platformIds.map((platformId: string) => ({
          gameId: game.id,
          platformId,
        }))
      );
    }

    // Handle tag relations
    if (body.tagIds?.length) {
      await dbInstance.insert(gamesToTags).values(
        body.tagIds.map((tagId: string) => ({
          gameId: game.id,
          tagId,
        }))
      );
    }

    return c.json(game, 201);
  });

  // ── Update Game ──
  gamesRoutes.patch("/:id", requireAuth, async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();

    const { platformIds, tagIds, ...columnUpdates } = body;

    const [updated] = await dbInstance
      .update(games)
      .set({ ...columnUpdates, updatedAt: new Date() })
      .where(eq(games.id, id))
      .returning();

    if (!updated) return c.json({ error: "Game not found" }, 404);

    // Sync platform relations if provided
    if (platformIds !== undefined) {
      await dbInstance.delete(gamesToPlatforms).where(eq(gamesToPlatforms.gameId, id));
      if (platformIds.length > 0) {
        await dbInstance.insert(gamesToPlatforms).values(
          platformIds.map((platformId: string) => ({ gameId: id, platformId }))
        );
      }
    }

    // Sync tag relations if provided
    if (tagIds !== undefined) {
      await dbInstance.delete(gamesToTags).where(eq(gamesToTags.gameId, id));
      if (tagIds.length > 0) {
        await dbInstance.insert(gamesToTags).values(
          tagIds.map((tagId: string) => ({ gameId: id, tagId }))
        );
      }
    }

    return c.json(updated);
  });

  // ── Delete Game ──
  gamesRoutes.delete("/:id", requireAuth, async (c) => {
    const { id } = c.req.param();

    const [deleted] = await dbInstance
      .delete(games)
      .where(eq(games.id, id))
      .returning({ id: games.id });

    if (!deleted) return c.json({ error: "Game not found" }, 404);

    return c.json({ deleted: true, id: deleted.id });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTIONS CRUD (migrated from apps/api/src/routes/collections.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── List all collections (with games) ──
  gamesRoutes.get("/collections", async (c) => {
    const cacheKey = "collections:list";
    const cached = await ctx.cache.get(cacheKey);
    if (cached) return c.json(cached);

    const collections = await dbInstance
      .select()
      .from(gameCollections)
      .orderBy(asc(gameCollections.displayOrder));

    // Fetch entries + games for each collection
    const result = await Promise.all(
      collections.map(async (col) => {
        const entries = await dbInstance
          .select({
            sortOrder: gameCollectionEntries.sortOrder,
            game: games,
          })
          .from(gameCollectionEntries)
          .innerJoin(games, eq(gameCollectionEntries.gameId, games.id))
          .where(eq(gameCollectionEntries.collectionId, col.id))
          .orderBy(asc(gameCollectionEntries.sortOrder));

        const gamesWithCovers = entries.map((e) => ({
          ...e.game,
          _sortOrder: e.sortOrder,
        }));

        return { ...col, games: gamesWithCovers };
      })
    );

    const response = { docs: result, totalDocs: result.length };
    await ctx.cache.set(cacheKey, response, 120);
    return c.json(response);
  });

  // ── Get single collection ──
  gamesRoutes.get("/collections/:id", async (c) => {
    const [col] = await dbInstance
      .select()
      .from(gameCollections)
      .where(eq(gameCollections.id, c.req.param("id")))
      .limit(1);

    if (!col) return c.json({ error: "Collection not found" }, 404);

    const entries = await dbInstance
      .select({
        sortOrder: gameCollectionEntries.sortOrder,
        gameId: gameCollectionEntries.gameId,
      })
      .from(gameCollectionEntries)
      .where(eq(gameCollectionEntries.collectionId, col.id))
      .orderBy(asc(gameCollectionEntries.sortOrder));

    // Fetch full game data for each entry
    const gameIds = entries.map((e) => e.gameId);
    const gameRows =
      gameIds.length > 0
        ? await Promise.all(
            gameIds.map(async (gid) => {
              const [g] = await dbInstance
                .select()
                .from(games)
                .where(eq(games.id, gid))
                .limit(1);
              return g || null;
            })
          )
        : [];

    return c.json({
      ...col,
      games: gameRows.filter(Boolean),
      entries: entries,
    });
  });

  // ── Create collection ──
  gamesRoutes.post("/collections", requireAuth, async (c) => {
    const body = await c.req.json();
    const slug =
      body.slug ||
      body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const [row] = await dbInstance
      .insert(gameCollections)
      .values({
        title: body.title,
        slug,
        displayOrder: body.displayOrder ?? 0,
      })
      .returning();

    // Add games if provided
    if (body.gameIds?.length) {
      await dbInstance.insert(gameCollectionEntries).values(
        body.gameIds.map((gameId: string, i: number) => ({
          collectionId: row.id,
          gameId,
          sortOrder: i,
        }))
      );
    }

    await ctx.cache.invalidate("collections:*");
    return c.json(row, 201);
  });

  // ── Update collection ──
  gamesRoutes.patch("/collections/:id", requireAuth, async (c) => {
    const body = await c.req.json();
    const id = c.req.param("id");

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;

    const [updated] = await dbInstance
      .update(gameCollections)
      .set(updates)
      .where(eq(gameCollections.id, id))
      .returning();

    if (!updated) return c.json({ error: "Collection not found" }, 404);

    // Replace games if provided
    if (body.gameIds !== undefined) {
      await dbInstance
        .delete(gameCollectionEntries)
        .where(eq(gameCollectionEntries.collectionId, id));

      if (body.gameIds.length > 0) {
        await dbInstance.insert(gameCollectionEntries).values(
          body.gameIds.map((gameId: string, i: number) => ({
            collectionId: id,
            gameId,
            sortOrder: i,
          }))
        );
      }
    }

    await ctx.cache.invalidate("collections:*");
    return c.json(updated);
  });

  // ── Delete collection ──
  gamesRoutes.delete("/collections/:id", requireAuth, async (c) => {
    const [deleted] = await dbInstance
      .delete(gameCollections)
      .where(eq(gameCollections.id, c.req.param("id")))
      .returning();
    if (!deleted) return c.json({ error: "Collection not found" }, 404);
    await ctx.cache.invalidate("collections:*");
    return c.json({ success: true, id: deleted.id });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORMS & TAGS CRUD (migrated from apps/api/src/routes/crud.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── List Platforms ──
  gamesRoutes.get("/platforms", async (c) => {
    const docs = await dbInstance.select().from(platforms).orderBy(platforms.name);
    return c.json({ docs, totalDocs: docs.length });
  });

  // ── Create Platform ──
  gamesRoutes.post("/platforms", requireAuth, async (c) => {
    const body = await c.req.json();
    const [row] = await dbInstance.insert(platforms).values({
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      shortName: body.shortName,
      manufacturer: body.manufacturer,
      iconId: body.iconId,
    }).returning();
    return c.json(row, 201);
  });

  // ── List Tags ──
  gamesRoutes.get("/tags", async (c) => {
    const docs = await dbInstance.select().from(tags).orderBy(tags.name);
    return c.json({ docs, totalDocs: docs.length });
  });

  // ── Create Tag ──
  gamesRoutes.post("/tags", requireAuth, async (c) => {
    const body = await c.req.json();
    const [row] = await dbInstance.insert(tags).values({
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      color: body.color,
      category: body.category,
    }).returning();
    return c.json(row, 201);
  });

  // Return the configured router
  return gamesRoutes;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA URL HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrich a game record with media transform URLs
 */
function enrichGameWithMediaUrls(game: any): any {
  return {
    ...game,
    media: buildGameMediaUrls(game),
  };
}

/**
 * Build all media URLs for a game
 */
function buildGameMediaUrls(game: any): {
  cover: {
    hero: string | null;
    card: string | null;
    thumbnail: string | null;
    original: string | null;
  };
  screenshots: Array<{
    mediaId: string;
    caption?: string;
    urls: {
      gallery: string | null;
      thumbnail: string | null;
      original: string | null;
    };
  }> | null;
} {
  // Build cover art URLs with focal point support
  const coverFocalPoint = game.coverFocalPoint as { x: number; y: number } | undefined;
  
  const cover = {
    hero: buildCoverArtUrl(game.coverArtId, "hero", coverFocalPoint),
    card: buildCoverArtUrl(game.coverArtId, "card", coverFocalPoint),
    thumbnail: buildCoverArtUrl(game.coverArtId, "thumbnail", coverFocalPoint),
    original: buildCoverArtUrl(game.coverArtId, "original", coverFocalPoint),
  };

  // Build screenshot URLs
  const screenshots = game.screenshots?.map((screenshot: any) => ({
    mediaId: screenshot.mediaId,
    caption: screenshot.caption,
    urls: {
      gallery: buildScreenshotUrl(screenshot.mediaId, "gallery", screenshot.focalPoint),
      thumbnail: buildScreenshotUrl(screenshot.mediaId, "thumbnail", screenshot.focalPoint),
      original: buildScreenshotUrl(screenshot.mediaId, "original", screenshot.focalPoint),
    },
  })) || null;

  return { cover, screenshots };
}

/**
 * Build cover art transform URL
 * Uses grimoire-media preset endpoint: /api/media/preset/{id}/{preset}
 */
function buildCoverArtUrl(
  mediaId: string | null | undefined,
  preset: "hero" | "card" | "thumbnail" | "original",
  focalPoint?: { x: number; y: number }
): string | null {
  if (!mediaId) return null;

  // For original, use transform endpoint without preset
  if (preset === "original") {
    const params = new URLSearchParams();
    if (focalPoint) {
      params.append("fpx", focalPoint.x.toString());
      params.append("fpy", focalPoint.y.toString());
    }
    const query = params.toString();
    return query 
      ? `/api/media/transform/${mediaId}?${query}`
      : `/api/media/transform/${mediaId}`;
  }

  // Use preset endpoint for transforms
  // Note: Focal point would be handled by grimoire-media if configured
  return `/api/media/preset/${mediaId}/${preset}`;
}

/**
 * Build screenshot transform URL
 * Uses grimoire-media preset endpoint: /api/media/preset/{id}/{preset}
 */
function buildScreenshotUrl(
  mediaId: string | null | undefined,
  preset: "gallery" | "thumbnail" | "original",
  focalPoint?: { x: number; y: number }
): string | null {
  if (!mediaId) return null;

  // For original, use transform endpoint
  if (preset === "original") {
    const params = new URLSearchParams();
    if (focalPoint) {
      params.append("fpx", focalPoint.x.toString());
      params.append("fpy", focalPoint.y.toString());
    }
    const query = params.toString();
    return query 
      ? `/api/media/transform/${mediaId}?${query}`
      : `/api/media/transform/${mediaId}`;
  }

  // Use preset endpoint for transforms
  return `/api/media/preset/${mediaId}/${preset}`;
}

// Legacy export for backward compatibility
export { createGamesRouter as gamesRoutes };
