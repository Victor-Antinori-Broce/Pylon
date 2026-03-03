/**
 * Gremio CMS — Collections Module Routes
 * 
 * REST API for curated game collections (featured sections, best of, etc.)
 */

import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { db } from "../../../apps/api/src/db";
import { media } from "../../../apps/api/src/db/schema";
import { cachedQuery, invalidateCache } from "../../../apps/api/src/lib/cache";
import { gameCollections, gameCollectionEntries, games } from "../grimoire-games/games.schema";

export const collectionsRoutes = new Hono();

// ── List all collections (with games) ──
collectionsRoutes.get("/", async (c) => {
    const result = await cachedQuery("collections:list", 120, async () => {
        const collections = await db
            .select()
            .from(gameCollections)
            .orderBy(asc(gameCollections.displayOrder));

        // Fetch entries + games for each collection
        return await Promise.all(
            collections.map(async (col) => {
                const entries = await db
                    .select({
                        sortOrder: gameCollectionEntries.sortOrder,
                        game: games,
                    })
                    .from(gameCollectionEntries)
                    .innerJoin(games, eq(gameCollectionEntries.gameId, games.id))
                    .where(eq(gameCollectionEntries.collectionId, col.id))
                    .orderBy(asc(gameCollectionEntries.sortOrder));

                // Attach cover art URL
                const gamesWithCovers = await Promise.all(
                    entries.map(async (e) => {
                        let coverArtUrl: string | null = null;
                        if (e.game.coverArtId) {
                            const [img] = await db
                                .select({ url: media.url })
                                .from(media)
                                .where(eq(media.id, e.game.coverArtId))
                                .limit(1);
                            if (img) coverArtUrl = img.url;
                        }
                        return {
                            ...e.game,
                            coverArt: coverArtUrl ? { url: coverArtUrl } : null,
                            _sortOrder: e.sortOrder,
                        };
                    })
                );

                return { ...col, games: gamesWithCovers };
            })
        );
    });

    return c.json({ docs: result, totalDocs: result.length });
});

// ── Get single collection ──
collectionsRoutes.get("/:id", async (c) => {
    const { id } = c.req.param();

    const [col] = await db
        .select()
        .from(gameCollections)
        .where(eq(gameCollections.id, id))
        .limit(1);

    if (!col) return c.json({ error: "Collection not found" }, 404);

    const entries = await db
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
                    const [g] = await db
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
collectionsRoutes.post("/", async (c) => {
    const body = await c.req.json();
    const slug =
        body.slug ||
        body.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

    const [row] = await db
        .insert(gameCollections)
        .values({
            title: body.title,
            slug,
            description: body.description,
            displayOrder: body.displayOrder ?? 0,
            isActive: body.isActive ?? true,
        })
        .returning();

    // Add games if provided
    if (body.gameIds?.length) {
        await db.insert(gameCollectionEntries).values(
            body.gameIds.map((gameId: string, i: number) => ({
                collectionId: row.id,
                gameId,
                sortOrder: i,
            }))
        );
    }

    await invalidateCache("collections:*");
    return c.json(row, 201);
});

// ── Update collection ──
collectionsRoutes.patch("/:id", async (c) => {
    const body = await c.req.json();
    const id = c.req.param("id");

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.description !== undefined) updates.description = body.description;
    if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
        .update(gameCollections)
        .set(updates)
        .where(eq(gameCollections.id, id))
        .returning();

    if (!updated) return c.json({ error: "Collection not found" }, 404);

    // Replace games if provided
    if (body.gameIds !== undefined) {
        await db
            .delete(gameCollectionEntries)
            .where(eq(gameCollectionEntries.collectionId, id));

        if (body.gameIds.length > 0) {
            await db.insert(gameCollectionEntries).values(
                body.gameIds.map((gameId: string, i: number) => ({
                    collectionId: id,
                    gameId,
                    sortOrder: i,
                }))
            );
        }
    }

    await invalidateCache("collections:*");
    return c.json(updated);
});

// ── Delete collection ──
collectionsRoutes.delete("/:id", async (c) => {
    const [deleted] = await db
        .delete(gameCollections)
        .where(eq(gameCollections.id, c.req.param("id")))
        .returning();
    if (!deleted) return c.json({ error: "Collection not found" }, 404);
    await invalidateCache("collections:*");
    return c.json({ success: true, id: deleted.id });
});
