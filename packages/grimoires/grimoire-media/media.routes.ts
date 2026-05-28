// @ts-nocheck

/**
 * Media Library Routes
 * 
 * REST API endpoints for file uploads and media management.
 * 
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 * Example: `/folders` must come before `/:id`
 */

import { Hono } from "hono";
import { eq, and, desc, like, sql } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import type { StorageConfig } from "./config.schema";
import { media, mediaFolders } from "./media.schema";
import { testStorageConnection } from "./storage.adapter";
import { MediaGrimoireConfig, defaultMediaConfig, validateMediaConfig } from "./config.schema";

/**
 * Create Media router with DI
 */
export function createMediaRouter(ctx: GrimoireContext): Hono {
  const app = new Hono();

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST & BROWSE (specific routes first)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET / - List all media files
   */
  app.get("/", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const offset = Number(c.req.query("offset")) || 0;
    const folderId = c.req.query("folderId");
    const search = c.req.query("search");
    const type = c.req.query("type"); // image, video, document

    let query = ctx.db.instance
      .select()
      .from(media)
      .orderBy(desc(media.createdAt))
      .limit(limit)
      .offset(offset);

    // Filter by folder
    if (folderId) {
      query = query.where(eq(media.folderId, folderId));
    }

    // Filter by type
    if (type) {
      query = query.where(like(media.mimeType, `${type}/%`));
    }

    // Search by filename
    if (search) {
      query = query.where(like(media.filename, `%${search}%`));
    }

    const docs = await query;
    
    // Generate signed URLs for private files
    const docsWithUrls = await Promise.all(
      docs.map(async (doc) => {
        let url = doc.publicUrl;
        
        // If no public URL, generate signed URL
        if (!url) {
          try {
            url = await ctx.storage.getSignedDownloadUrl(doc.key, 3600);
          } catch {
            url = null;
          }
        }

        return {
          ...doc,
          url,
        };
      })
    );

    return c.json({ docs: docsWithUrls, totalDocs: docs.length });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPLOAD (specific route before /:id)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /upload - Upload file(s)
   */
  app.post("/upload", ctx.auth.requireAuth, async (c) => {
    const folderId = c.req.query("folderId");
    const generateThumbnails = c.req.query("thumbnails") !== "false";

    try {
      const body = await c.req.parseBody({ all: true });
      const files = body.files;

      if (!files) {
        return c.json({ error: "No files provided" }, 400);
      }

      const uploadedFiles = Array.isArray(files) ? files : [files];
      const results = [];

      for (const file of uploadedFiles) {
        if (!(file instanceof File)) continue;

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
          results.push({
            filename: file.name,
            success: false,
            error: "File too large (max 10MB)",
          });
          continue;
        }

        // Generate unique key
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `uploads/${timestamp}_${safeName}`;

        try {
          // Get signed upload URL
          const uploadUrl = await ctx.storage.getSignedUploadUrl(
            key,
            file.type,
            3600
          );

          // Upload to S3/MinIO
          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          });

          if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${uploadRes.statusText}`);
          }

          // Get dimensions for images
          let width: number | undefined;
          let height: number | undefined;
          
          if (file.type.startsWith("image/")) {
            // Note: In production, you'd use a library like sharp or image-size
            // For now, we'll skip dimensions
          }

          // Save to database
          const [doc] = await ctx.db.instance
            .insert(media)
            .values({
              filename: safeName,
              originalName: file.name,
              mimeType: file.type,
              size: file.size,
              key,
              bucket: ctx.config.siteName || "gremius",
              folderId: folderId || null,
              width,
              height,
              status: "active",
            })
            .returning();

          // Generate thumbnails for images (async)
          if (generateThumbnails && file.type.startsWith("image/")) {
            // This would trigger a background job in production
            ctx.logger.info(`Thumbnail generation queued for ${doc.id}`);
          }

          results.push({
            id: doc.id,
            filename: doc.filename,
            mimeType: doc.mimeType,
            size: doc.size,
            success: true,
          });
        } catch (err: any) {
          results.push({
            filename: file.name,
            success: false,
            error: err.message,
          });
        }
      }

      const allSuccess = results.every((r) => r.success);
      
      return c.json(
        {
          success: allSuccess,
          files: results,
        },
        allSuccess ? 201 : 207 // 207 Multi-Status if partial failures
      );
    } catch (err: any) {
      ctx.logger.error("Upload failed:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLDERS (specific routes before /:id)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /folders - List folders
   */
  app.get("/folders", async (c) => {
    const docs = await ctx.db.instance
      .select()
      .from(mediaFolders)
      .orderBy(mediaFolders.path);

    return c.json({ docs });
  });

  /**
   * POST /folders - Create folder
   */
  app.post("/folders", ctx.auth.requireAuth, async (c) => {
    const body = await c.req.json();

    if (!body.name) {
      return c.json({ error: "Name is required" }, 400);
    }

    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const path = body.parentId 
      ? `${body.parentPath || ""}/${slug}`
      : `/${slug}`;

    const [doc] = await ctx.db.instance
      .insert(mediaFolders)
      .values({
        name: body.name,
        slug,
        parentId: body.parentId || null,
        path,
        description: body.description,
      })
      .returning();

    return c.json(doc, 201);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION (specific routes before /:id)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /config - Get grimoire configuration
   */
  app.get("/config", ctx.auth.requireAuth, async (c) => {
    try {
      // Load from database or return default
      const config = await loadConfig(ctx) || defaultMediaConfig;
      return c.json({ config });
    } catch (err: any) {
      ctx.logger.error("Failed to load config:", err);
      return c.json({ config: defaultMediaConfig });
    }
  });

  /**
   * POST /config - Save grimoire configuration
   */
  app.post("/config", ctx.auth.requireAuth, async (c) => {
    try {
      const body = await c.req.json();
      const config = body.config as MediaGrimoireConfig;

      // Validate config
      const validation = validateMediaConfig(config);
      if (!validation.valid) {
        return c.json({ error: validation.error }, 400);
      }

      // Save to database
      await saveConfig(ctx, config);

      ctx.logger.info("[Media] Configuration updated");
      return c.json({ success: true, config });
    } catch (err: any) {
      ctx.logger.error("Failed to save config:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * POST /config/test-storage - Test storage connection
   */
  app.post("/config/test-storage", ctx.auth.requireAuth, async (c) => {
    try {
      const body = await c.req.json();
      const storage = body.storage as StorageConfig;

      const result = await testStorageConnection(storage);
      
      return c.json(result);
    } catch (err: any) {
      ctx.logger.error("Storage test failed:", err);
      return c.json({ 
        success: false, 
        message: err.message || "Connection test failed" 
      }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PARAMETERIZED ROUTES (must come AFTER all specific routes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /:id - Get single media file
   */
  app.get("/:id", async (c) => {
    const id = c.req.param("id");

    const [doc] = await ctx.db.instance
      .select()
      .from(media)
      .where(eq(media.id, id))
      .limit(1);

    if (!doc) {
      return c.json({ error: "Media not found" }, 404);
    }

    // Generate signed URL
    let url = doc.publicUrl;
    if (!url) {
      try {
        url = await ctx.storage.getSignedDownloadUrl(doc.key, 3600);
      } catch {
        url = null;
      }
    }

    // Generate thumbnail URLs
    const thumbnails: Record<string, string> = {};
    if (doc.thumbnails) {
      for (const [size, info] of Object.entries(doc.thumbnails as Record<string, { key: string }>)) {
        try {
          thumbnails[size] = await ctx.storage.getSignedDownloadUrl(info.key, 3600);
        } catch {
          // Thumbnail not available
        }
      }
    }

    return c.json({
      ...doc,
      url,
      thumbnails,
    });
  });

  /**
   * PATCH /:id - Update media metadata
   */
  app.patch("/:id", ctx.auth.requireAuth, async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();

    const [existing] = await ctx.db.instance
      .select()
      .from(media)
      .where(eq(media.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Media not found" }, 404);
    }

    const [updated] = await ctx.db.instance
      .update(media)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(media.id, id))
      .returning();

    return c.json(updated);
  });

  /**
   * DELETE /:id - Delete media file
   */
  app.delete("/:id", ctx.auth.requireAuth, async (c) => {
    const id = c.req.param("id");

    const [existing] = await ctx.db.instance
      .select()
      .from(media)
      .where(eq(media.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Media not found" }, 404);
    }

    // Delete from storage
    try {
      await ctx.storage.delete(existing.key);
      
      // Delete thumbnails
      if (existing.thumbnails) {
        for (const [size, info] of Object.entries(existing.thumbnails as Record<string, { key: string }>)) {
          try {
            await ctx.storage.delete(info.key);
          } catch {
            // Thumbnail might not exist
          }
        }
      }
    } catch (err: any) {
      ctx.logger.error("Failed to delete from storage:", err);
      // Continue to delete from DB anyway
    }

    // Delete from database
    await ctx.db.instance.delete(media).where(eq(media.id, id));

    return c.json({ success: true });
  });

  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function loadConfig(ctx: GrimoireContext): Promise<MediaGrimoireConfig | null> {
  try {
    // Try to load from gremius_config table (if exists)
    const result = await ctx.db.instance.execute(sql`
      SELECT value FROM gremius_config 
      WHERE key = 'grimoire-media' 
      LIMIT 1
    `);
    
    if (result.rows?.[0]) {
      return JSON.parse((result.rows[0] as any).value);
    }
  } catch {
    // Table might not exist yet
  }
  return null;
}

async function saveConfig(ctx: GrimoireContext, config: MediaGrimoireConfig): Promise<void> {
  // Ensure gremius_config table exists
  await ctx.db.instance.execute(sql`
    CREATE TABLE IF NOT EXISTS gremius_config (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Upsert config
  await ctx.db.instance.execute(sql`
    INSERT INTO gremius_config (key, value, updated_at)
    VALUES ('grimoire-media', ${JSON.stringify(config)}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  `);
}
