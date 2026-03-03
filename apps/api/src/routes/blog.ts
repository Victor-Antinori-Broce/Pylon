/**
 * Blog Posts API Routes
 */

import { Hono } from "hono";
import { eq, desc, sql, and, ilike } from "drizzle-orm";
import { db } from "../db";
import { blogPosts, authUsers as user, media, blogPostsToTags, blogPostsToGames, tags, games } from "../db/schema";
import { cachedQuery, invalidateCache } from "../lib/cache";
import { broadcastContentUpdate } from "../lib/realtime";
import { events } from "../lib/events";

export const blogRoutes = new Hono();

blogRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 12, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const status = c.req.query("status") || "published";

  const result = await cachedQuery(`blog:list:${page}:${limit}:${status}`, 60, async () => {
    const where = eq(blogPosts.status, status as any);

    const [docs, countResult] = await Promise.all([
      db
        .select()
        .from(blogPosts)
        .leftJoin(user, eq(blogPosts.authorId, user.id))
        .leftJoin(media, eq(blogPosts.featuredImageId, media.id))
        .where(where)
        .orderBy(desc(blogPosts.publishedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(blogPosts).where(where),
    ]);

    const totalDocs = Number(countResult[0]?.count ?? 0);

    return {
      docs: docs.map((row) => ({
        ...row.blog_posts,
        author: row.auth_users ? { id: row.auth_users.id, displayName: row.auth_users.name } : null,
        featuredImage: row.media,
      })),
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
      hasNextPage: page < Math.ceil(totalDocs / limit),
      hasPrevPage: page > 1,
    };
  });

  return c.json(result);
});

blogRoutes.get("/slug/:slug", async (c) => {
  const { slug } = c.req.param();

  const result = await db
    .select()
    .from(blogPosts)
    .leftJoin(user, eq(blogPosts.authorId, user.id))
    .leftJoin(media, eq(blogPosts.featuredImageId, media.id))
    .where(eq(blogPosts.slug, slug))
    .limit(1);

  if (!result.length) return c.json({ error: "Post not found" }, 404);

  const post = result[0];

  const [postTags, postGames] = await Promise.all([
    db.select({ tag: tags }).from(blogPostsToTags)
      .innerJoin(tags, eq(blogPostsToTags.tagId, tags.id))
      .where(eq(blogPostsToTags.postId, post.blog_posts.id)),
    db.select({ game: games }).from(blogPostsToGames)
      .innerJoin(games, eq(blogPostsToGames.gameId, games.id))
      .where(eq(blogPostsToGames.postId, post.blog_posts.id)),
  ]);

  return c.json({
    ...post.blog_posts,
    author: post.auth_users ? { id: post.auth_users.id, displayName: post.auth_users.name } : null,
    featuredImage: post.media,
    tags: postTags.map((r) => r.tag),
    relatedGames: postGames.map((r) => r.game),
  });
});

// ── Create Post (includes blocks) ──
blogRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const [post] = await db.insert(blogPosts).values({
    title: body.title,
    slug: body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    content: body.content,
    excerpt: body.excerpt,
    status: body.status || "draft",
    publishedAt: body.status === "published" ? new Date() : body.publishedAt,
    authorId: body.authorId,
    featuredImageId: body.featuredImageId,
    readingTime: body.readingTime,
    seoOverrides: body.seoOverrides,
    blocks: body.blocks || [],
  } as any).returning();

  // Handle tag relations
  if (body.tagIds?.length) {
    await db.insert(blogPostsToTags).values(
      body.tagIds.map((tagId: string) => ({ postId: post.id, tagId }))
    );
  }

  // Handle game relations
  if (body.gameIds?.length) {
    await db.insert(blogPostsToGames).values(
      body.gameIds.map((gameId: string) => ({ postId: post.id, gameId }))
    );
  }

  return c.json(post, 201);
});

// ── Update Post (PATCH includes blocks via spread) ──
blogRoutes.patch("/:id", async (c) => {
  const body = await c.req.json();

  // Separate relation updates from column updates
  const { tagIds, gameIds, ...columnUpdates } = body;

  const [updated] = await db.update(blogPosts)
    .set({ ...columnUpdates, updatedAt: new Date() })
    .where(eq(blogPosts.id, c.req.param("id")))
    .returning();

  if (!updated) return c.json({ error: "Post not found" }, 404);

  // Sync tag relations if provided
  if (tagIds !== undefined) {
    await db.delete(blogPostsToTags).where(eq(blogPostsToTags.postId, updated.id));
    if (tagIds.length > 0) {
      await db.insert(blogPostsToTags).values(
        tagIds.map((tagId: string) => ({ postId: updated.id, tagId }))
      );
    }
  }

  // Sync game relations if provided
  if (gameIds !== undefined) {
    await db.delete(blogPostsToGames).where(eq(blogPostsToGames.postId, updated.id));
    if (gameIds.length > 0) {
      await db.insert(blogPostsToGames).values(
        gameIds.map((gameId: string) => ({ postId: updated.id, gameId }))
      );
    }
  }

  await invalidateCache("blog:*");

  // Broadcast content update via Valkey Pub/Sub for real-time consumers
  broadcastContentUpdate(updated.id, "update", {
    title: updated.title,
    slug: updated.slug,
    blocks: updated.blocks,
    status: updated.status,
    content: updated.content,
  }).catch(() => { });

  // Emit post:published for Gremius Workers trigger
  if (updated.status === "published" && body.status === "published") {
    events.emit("post:published", { postId: updated.id, post: updated });
  }

  return c.json(updated);
});

blogRoutes.delete("/:id", async (c) => {
  const [deleted] = await db.delete(blogPosts).where(eq(blogPosts.id, c.req.param("id")))
    .returning({ id: blogPosts.id });
  if (!deleted) return c.json({ error: "Post not found" }, 404);
  await invalidateCache("blog:*");
  return c.json({ deleted: true, id: deleted.id });
});
