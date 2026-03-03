/**
 * Media API Routes — Upload to MinIO / S3
 * Features: CRUD, Signed URLs, Image Optimization (WebP), Valkey Caching
 */

import { Hono } from "hono";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { media } from "../db/schema";
import { uploadFile, deleteFile, generateSignedDownloadUrl, generateS3Key, uploadBuffer } from "../services/storage";
import { cachedQuery, invalidateCache } from "../lib/cache";
import { optimizeImage, getImageDimensions } from "../lib/image";

export const mediaRoutes = new Hono();

// ── List Media (cached) ──
mediaRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;

  const result = await cachedQuery(`media:list:${page}:${limit}`, 120, async () => {
    const [docs, countResult] = await Promise.all([
      db.select().from(media).orderBy(desc(media.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(media),
    ]);

    const totalDocs = Number(countResult[0]?.count ?? 0);

    return {
      docs,
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

// ── Upload Media (multipart/form-data → optimize → MinIO) ──
mediaRoutes.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "No file provided. Send as multipart/form-data with key 'file'" }, 400);
  }

  const alt = (formData.get("alt") as string) || "";
  const caption = (formData.get("caption") as string) || undefined;
  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // ── Try image optimization (WebP) ──
  let finalBuffer = rawBuffer;
  let finalMimeType = file.type;
  let finalFilename = file.name;
  let width: number | undefined;
  let height: number | undefined;

  const optimized = await optimizeImage(rawBuffer, file.type);
  if (optimized) {
    finalBuffer = optimized.buffer;
    finalMimeType = optimized.mimeType;
    // Replace extension with .webp
    finalFilename = file.name.replace(/\.[^.]+$/, ".webp");
    width = optimized.width;
    height = optimized.height;
    console.log(
      `[Media] Optimized ${file.name}: ${optimized.originalSize}B → ${optimized.optimizedSize}B (${Math.round((1 - optimized.optimizedSize / optimized.originalSize) * 100)}% savings)`
    );
  } else if (file.type.startsWith("image/")) {
    // Still extract dimensions for non-optimizable images (e.g., SVG, already WebP)
    const dims = await getImageDimensions(rawBuffer);
    if (dims) {
      width = dims.width;
      height = dims.height;
    }
  }

  // ── Upload to S3/MinIO ──
  const s3Key = generateS3Key(finalFilename);
  const uploaded = await uploadBuffer(finalBuffer, s3Key, finalMimeType);

  // ── Save to database ──
  const [record] = await db
    .insert(media)
    .values({
      filename: finalFilename,
      mimeType: finalMimeType,
      s3Key: uploaded.s3Key,
      url: uploaded.url,
      alt,
      caption,
      width,
      height,
      size: uploaded.size,
    })
    .returning();

  // Invalidate media list cache
  await invalidateCache("media:*");

  return c.json(record, 201);
});

// ── Get Media by ID ──
mediaRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  const result = await db
    .select()
    .from(media)
    .where(eq(media.id, id))
    .limit(1);

  if (!result.length) return c.json({ error: "Media not found" }, 404);

  return c.json(result[0]);
});

// ── Signed URL — Generate a time-limited secure download link ──
mediaRoutes.get("/:id/signed-url", async (c) => {
  const { id } = c.req.param();
  const expiresIn = Math.min(
    Math.max(Number(c.req.query("expires")) || 3600, 60),
    86400
  );

  const result = await db
    .select()
    .from(media)
    .where(eq(media.id, id))
    .limit(1);

  if (!result.length) return c.json({ error: "Media not found" }, 404);

  const signedUrl = await generateSignedDownloadUrl(result[0].s3Key, expiresIn);

  return c.json({
    signedUrl,
    expiresIn,
    filename: result[0].filename,
    mimeType: result[0].mimeType,
  });
});

// ── Delete Media ──
mediaRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  const result = await db
    .select()
    .from(media)
    .where(eq(media.id, id))
    .limit(1);

  if (!result.length) return c.json({ error: "Media not found" }, 404);

  // Delete from S3
  await deleteFile(result[0].s3Key);

  // Delete from DB
  await db.delete(media).where(eq(media.id, id));

  // Invalidate media list cache
  await invalidateCache("media:*");

  return c.json({ deleted: true, id });
});
