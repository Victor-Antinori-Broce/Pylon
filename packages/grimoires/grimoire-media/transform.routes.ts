import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
import { eq } from "drizzle-orm";
import { media } from "./media.schema";
import { ImageTransformer, transformPresets } from "./src/transformer.js";
import path from "path";
import fs from "fs/promises";

/**
 * Create transform routes for on-the-fly image transformation
 * 
 * Routes:
 * - GET /transform/:id?w=800&h=600&fit=cover&f=webp
 * - GET /preset/:id/:preset (thumbnail, small, medium, large, hero)
 * - POST /focal-point/:id (set focal point for smart cropping)
 */
export function createTransformRouter(ctx: GrimoireContext): Hono {
  const app = new Hono();

  /**
   * GET /transform/:id - Transform image on-the-fly
   * 
   * Query params:
   * - w, width: Target width
   * - h, height: Target height
   * - fit: resize fit (cover, contain, fill, inside, outside)
   * - pos, position: crop position (center, top, right, bottom, left)
   * - f, format: output format (jpeg, png, webp, avif)
   * - q, quality: quality 1-100
   * - fp: focal point (format: "x,y" where x,y are 0-1)
   */
  app.get("/transform/:id", async (c) => {
    const id = c.req.param("id");
    const query = c.req.query();

    try {
      // Get media from database
      const [doc] = await ctx.db.instance
        .select()
        .from(media)
        .where(eq(media.id, id))
        .limit(1);

      if (!doc) {
        return c.json({ error: "Media not found" }, 404);
      }

      // Check if it's an image
      if (!doc.mimeType?.startsWith("image/")) {
        return c.json({ error: "Not an image file" }, 400);
      }

      // Parse transform options
      const options = parseTransformOptions(query, doc.metadata);

      // Generate cache key
      const cacheKey = ImageTransformer.generateKey(options);
      const transformFilename = `${path.parse(doc.filename).name}_${cacheKey}.webp`;
      const transformKey = `transforms/${doc.id}/${transformFilename}`;

      // Check if transform already exists in storage
      try {
        const existingUrl = await ctx.storage.getSignedDownloadUrl(transformKey, 3600);
        if (existingUrl) {
          return c.redirect(existingUrl);
        }
      } catch {
        // Transform doesn't exist, generate it
      }

      // Download original file
      const originalUrl = await ctx.storage.getSignedDownloadUrl(doc.key, 3600);
      const originalResponse = await fetch(originalUrl);
      
      if (!originalResponse.ok) {
        return c.json({ error: "Failed to fetch original file" }, 500);
      }

      const originalBuffer = Buffer.from(await originalResponse.arrayBuffer());

      // Save to temp file
      const tempPath = `/tmp/${doc.id}_${Date.now()}`;
      await fs.writeFile(tempPath, originalBuffer);

      try {
        // Transform image
        const transformer = new ImageTransformer(tempPath);
        const result = await transformer.transform(options);
        transformer.destroy();

        // Upload transformed image
        await ctx.storage.upload(transformKey, result.buffer, `image/${result.format}`);

        // Return the transformed image
        c.header("Content-Type", `image/${result.format}`);
        c.header("Cache-Control", "public, max-age=31536000"); // 1 year
        return c.body(result.buffer);

      } finally {
        // Cleanup temp file
        await fs.unlink(tempPath).catch(() => {});
      }

    } catch (err: any) {
      ctx.logger.error("Transform failed:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * GET /preset/:id/:preset - Apply named preset
   * 
   * Presets: thumbnail, small, medium, large, hero
   */
  app.get("/preset/:id/:preset", async (c) => {
    const id = c.req.param("id");
    const presetName = c.req.param("preset");

    const preset = transformPresets[presetName];
    if (!preset) {
      return c.json({ 
        error: "Unknown preset", 
        available: Object.keys(transformPresets) 
      }, 400);
    }

    // Forward to transform endpoint
    const queryParams = new URLSearchParams();
    if (preset.width) queryParams.set("w", String(preset.width));
    if (preset.height) queryParams.set("h", String(preset.height));
    if (preset.fit) queryParams.set("fit", preset.fit);
    if (preset.format) queryParams.set("f", preset.format);
    if (preset.quality) queryParams.set("q", String(preset.quality));

    return c.redirect(`/api/media/transform/${id}?${queryParams.toString()}`);
  });

  /**
   * POST /focal-point/:id - Set focal point for smart cropping
   * 
   * Body: { x: number, y: number } (0-1)
   */
  app.post("/focal-point/:id", ctx.auth.requireAuth, async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();

    if (typeof body.x !== "number" || typeof body.y !== "number") {
      return c.json({ error: "x and y must be numbers" }, 400);
    }

    if (body.x < 0 || body.x > 1 || body.y < 0 || body.y > 1) {
      return c.json({ error: "x and y must be between 0 and 1" }, 400);
    }

    try {
      const [doc] = await ctx.db.instance
        .select()
        .from(media)
        .where(eq(media.id, id))
        .limit(1);

      if (!doc) {
        return c.json({ error: "Media not found" }, 404);
      }

      // Update metadata with focal point
      const metadata = {
        ...doc.metadata,
        focalPoint: { x: body.x, y: body.y },
      };

      await ctx.db.instance
        .update(media)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(media.id, id));

      return c.json({ 
        success: true, 
        focalPoint: metadata.focalPoint 
      });

    } catch (err: any) {
      ctx.logger.error("Failed to set focal point:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  /**
   * GET /focal-point/:id - Get focal point
   */
  app.get("/focal-point/:id", async (c) => {
    const id = c.req.param("id");

    const [doc] = await ctx.db.instance
      .select()
      .from(media)
      .where(eq(media.id, id))
      .limit(1);

    if (!doc) {
      return c.json({ error: "Media not found" }, 404);
    }

    return c.json({
      focalPoint: doc.metadata?.focalPoint || { x: 0.5, y: 0.5 },
    });
  });

  /**
   * DELETE /cache/:id - Clear all transforms for an image
   */
  app.delete("/cache/:id", ctx.auth.requireAuth, async (c) => {
    const id = c.req.param("id");

    try {
      // List all transforms for this image
      const transforms = await ctx.storage.list(`transforms/${id}/`);

      // Delete all transforms
      for (const transform of transforms) {
        await ctx.storage.delete(transform.key);
      }

      return c.json({ 
        success: true, 
        cleared: transforms.length 
      });

    } catch (err: any) {
      ctx.logger.error("Failed to clear cache:", err);
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}

/**
 * Parse transform options from query params
 */
function parseTransformOptions(
  query: Record<string, string>,
  metadata?: Record<string, any>
): import("./src/transformer.js").TransformOptions {
  const options: import("./src/transformer.js").TransformOptions = {};

  // Parse dimensions
  if (query.w || query.width) {
    options.width = parseInt(query.w || query.width!, 10);
  }
  if (query.h || query.height) {
    options.height = parseInt(query.h || query.height!, 10);
  }

  // Parse fit
  if (query.fit) {
    options.fit = query.fit as any;
  }

  // Parse position
  if (query.pos || query.position) {
    options.position = (query.pos || query.position) as any;
  }

  // Parse format
  if (query.f || query.format) {
    options.format = (query.f || query.format) as any;
  }

  // Parse quality
  if (query.q || query.quality) {
    options.quality = parseInt(query.q || query.quality!, 10);
  }

  // Parse focal point
  if (query.fp) {
    const [x, y] = query.fp.split(",").map(Number);
    options.focalPoint = { x, y };
  } else if (metadata?.focalPoint) {
    // Use stored focal point
    options.focalPoint = metadata.focalPoint;
  }

  return options;
}
