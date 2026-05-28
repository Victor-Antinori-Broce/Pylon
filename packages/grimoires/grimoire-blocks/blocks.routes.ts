// @ts-nocheck

/**
 * Gremio CMS — Page Builder Routes (DI Version)
 * 
 * REST API for dynamic page layouts with block-based content.
 * Full CRUD for pages, blocks, and templates with render endpoint.
 * 
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * - db → ctx.dbInstance.instance
 * - cachedQuery/invalidateCache → ctx.cache
 * - requireAuth → ctx.auth.requireAuth
 */

import { Hono } from "hono";
import { eq, and, asc, desc, isNull, gt, lt, sql } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import { pages, blocks, blockTemplates, type BlockContent } from "./blocks.schema";

/**
 * Factory function that creates Blocks/Page Builder routes with dependency injection
 */
export function createBlocksRouter(ctx: GrimoireContext): Hono {
  const blocksRoutes = new Hono();
  const { db, cache, auth } = ctx;
  
  // Helper to get db instance
  const dbInstance = db.instance;
  
  // Helper for auth
  const requireAuth = auth.requireAuth;
  
  // Helper for cached query (adapt to GrimoireContext cache API)
  const cachedQuery = async <T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> => {
    const cached = await cache.get(key);
    if (cached) return cached as T;
    const result = await fn();
    await cache.set(key, result, ttl);
    return result;
  };
  
  // Helper for cache invalidation
  const invalidateCache = async (pattern: string) => {
    await cache.invalidate(pattern);
  };

  /**
   * Build transform URL for media using grimoire-media presets
   * 
   * Presets: thumbnail (150x150), small (400x300), medium (800x600), 
   *          large (1200x800), hero (1920x1080)
   */
  const buildTransformUrl = (
    mediaId: string, 
    preset: "thumbnail" | "small" | "medium" | "large" | "hero",
    focalPoint?: { x: number; y: number }
  ): string => {
    // Use preset endpoint for cleaner URLs
    let url = `/api/media/preset/${mediaId}/${preset}`;
    
    // Add focal point if provided (for smart cropping)
    if (focalPoint) {
      url += `?fp=${focalPoint.x.toFixed(2)},${focalPoint.y.toFixed(2)}`;
    }
    
    return url;
  };

  // Authentication applied inline to mutation routes only

// ═══════════════════════════════════════════════
// PAGES CRUD
// ═══════════════════════════════════════════════

// List all pages
blocksRoutes.get("/pages", async (c) => {
  const query = c.req.query();
  const status = query.status || "published";
  const limit = Math.min(parseInt(query.limit || "50"), 100);
  const offset = parseInt(query.offset || "0");
  
  const result = await cachedQuery(`pages:list:${status}:${limit}:${offset}`, 60, async () => {
    const whereConditions = [eq(pages.status, status as any)];
    
    // Filter by layout if provided
    if (query.layout) {
      whereConditions.push(eq(pages.layout, query.layout));
    }
    
    // Search by title
    if (query.search) {
      whereConditions.push(
        sql`${pages.title} ILIKE ${`%${query.search}%`}`
      );
    }
    
    const pageList = await dbInstance
      .select({
        id: pages.id,
        title: pages.title,
        slug: pages.slug,
        description: pages.description,
        status: pages.status,
        layout: pages.layout,
        isHomepage: pages.isHomepage,
        publishedAt: pages.publishedAt,
        updatedAt: pages.updatedAt,
      })
      .from(pages)
      .where(and(...whereConditions))
      .orderBy(desc(pages.updatedAt))
      .limit(limit)
      .offset(offset);
    
    const [{ count }] = await dbInstance
      .select({ count: sql<number>`count(*)::int` })
      .from(pages)
      .where(and(...whereConditions));
    
    return { docs: pageList, totalDocs: count, limit, offset };
  });
  
  return c.json(result);
});

// Get single page with blocks
blocksRoutes.get("/pages/:id", async (c) => {
  const { id } = c.req.param();
  const includeBlocks = c.req.query("include_blocks") !== "false";
  
  const pageData = await cachedQuery(`page:${id}:${includeBlocks}`, 120, async () => {
    // Get page
    const [page] = await dbInstance
      .select()
      .from(pages)
      .where(sql`${pages.id} = ${id} OR ${pages.slug} = ${id}`)
      .limit(1);
    
    if (!page) return null;
    
    // Get blocks if requested
    let pageBlocks: any[] = [];
    if (includeBlocks) {
      pageBlocks = await dbInstance
        .select()
        .from(blocks)
        .where(eq(blocks.pageId, page.id))
        .orderBy(asc(blocks.sortOrder));
      
      // Filter out invisible blocks based on visibility settings
      const now = new Date();
      pageBlocks = pageBlocks.filter((block) => {
        if (!block.isVisible) return false;
        if (block.visibleFrom && new Date(block.visibleFrom) > now) return false;
        if (block.visibleUntil && new Date(block.visibleUntil) < now) return false;
        return true;
      });
    }
    
    return { ...page, blocks: pageBlocks };
  });
  
  if (!pageData) {
    return c.json({ error: "Page not found" }, 404);
  }
  
  return c.json(pageData);
});

// Create page
blocksRoutes.post("/pages", requireAuth, async (c) => {
  const body = await c.req.json();
  
  // Generate slug if not provided
  const slug = body.slug || body.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  
  // Check for duplicate slug
  const [existing] = await dbInstance
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.slug, slug))
    .limit(1);
  
  if (existing) {
    return c.json({ error: "A page with this slug already exists" }, 409);
  }
  
  // If setting as homepage, unset other homepages
  if (body.isHomepage) {
    await dbInstance
      .update(pages)
      .set({ isHomepage: false })
      .where(eq(pages.isHomepage, true));
  }
  
  const [page] = await dbInstance
    .insert(pages)
    .values({
      title: body.title,
      slug,
      description: body.description,
      status: body.status || "draft",
      layout: body.layout || "default",
      metaTitle: body.metaTitle,
      metaDescription: body.metaDescription,
      ogImageId: body.ogImageId,
      cssClass: body.cssClass,
      customCss: body.customCss,
      publishedAt: body.status === "published" ? new Date() : null,
      authorId: body.authorId,
      isHomepage: body.isHomepage || false,
      requireAuth: body.requireAuth || false,
    })
    .returning();
  
  // Create blocks if provided
  if (body.blocks?.length) {
    const blockValues = body.blocks.map((block: any, index: number) => ({
      pageId: page.id,
      type: block.type,
      name: block.name,
      sortOrder: block.sortOrder ?? index,
      columnSpan: block.columnSpan ?? 12,
      content: block.content,
      cssClass: block.cssClass,
      backgroundColor: block.backgroundColor,
      textColor: block.textColor,
      padding: block.padding,
      isVisible: block.isVisible ?? true,
    }));
    
    await dbInstance.insert(blocks).values(blockValues);
  }
  
  await invalidateCache("pages:*");
  return c.json(page, 201);
});

// Update page
blocksRoutes.patch("/pages/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  
  const updates: Record<string, any> = { updatedAt: new Date() };
  
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "published" && !body.publishedAt) {
      updates.publishedAt = new Date();
    }
  }
  if (body.layout !== undefined) updates.layout = body.layout;
  if (body.metaTitle !== undefined) updates.metaTitle = body.metaTitle;
  if (body.metaDescription !== undefined) updates.metaDescription = body.metaDescription;
  if (body.ogImageId !== undefined) updates.ogImageId = body.ogImageId;
  if (body.cssClass !== undefined) updates.cssClass = body.cssClass;
  if (body.customCss !== undefined) updates.customCss = body.customCss;
  if (body.requireAuth !== undefined) updates.requireAuth = body.requireAuth;
  
  // Handle slug update with duplicate check
  if (body.slug !== undefined) {
    const [existing] = await dbInstance
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.slug, body.slug), sql`${pages.id} != ${id}`))
      .limit(1);
    
    if (existing) {
      return c.json({ error: "A page with this slug already exists" }, 409);
    }
    updates.slug = body.slug;
  }
  
  // Handle homepage flag
  if (body.isHomepage === true) {
    await dbInstance
      .update(pages)
      .set({ isHomepage: false })
      .where(and(eq(pages.isHomepage, true), sql`${pages.id} != ${id}`));
    updates.isHomepage = true;
  } else if (body.isHomepage === false) {
    updates.isHomepage = false;
  }
  
  const [updated] = await dbInstance
    .update(pages)
    .set(updates)
    .where(eq(pages.id, id))
    .returning();
  
  if (!updated) {
    return c.json({ error: "Page not found" }, 404);
  }
  
  await invalidateCache(`page:${id}:*`);
  await invalidateCache("pages:*");
  return c.json(updated);
});

// Delete page
blocksRoutes.delete("/pages/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  
  const [deleted] = await dbInstance
    .delete(pages)
    .where(eq(pages.id, id))
    .returning();
  
  if (!deleted) {
    return c.json({ error: "Page not found" }, 404);
  }
  
  await invalidateCache(`page:${id}:*`);
  await invalidateCache("pages:*");
  return c.json({ success: true, id: deleted.id });
});

// ═══════════════════════════════════════════════
// BLOCKS CRUD
// ═══════════════════════════════════════════════

// Add block to page
blocksRoutes.post("/pages/:pageId/blocks", requireAuth, async (c) => {
  const { pageId } = c.req.param();
  const body = await c.req.json();
  
  // Verify page exists
  const [page] = await dbInstance.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) {
    return c.json({ error: "Page not found" }, 404);
  }
  
  // Get current max sort order
  const [{ maxOrder }] = await dbInstance
    .select({ maxOrder: sql<number>`COALESCE(MAX(${blocks.sortOrder}), -1)` })
    .from(blocks)
    .where(eq(blocks.pageId, pageId));
  
  const [block] = await dbInstance
    .insert(blocks)
    .values({
      pageId,
      type: body.type,
      name: body.name,
      sortOrder: body.sortOrder ?? maxOrder + 1,
      columnSpan: body.columnSpan ?? 12,
      content: body.content,
      cssClass: body.cssClass,
      backgroundColor: body.backgroundColor,
      textColor: body.textColor,
      padding: body.padding,
      isVisible: body.isVisible ?? true,
      visibleFrom: body.visibleFrom,
      visibleUntil: body.visibleUntil,
    })
    .returning();
  
  await invalidateCache(`page:${pageId}:*`);
  return c.json(block, 201);
});

// Update block
blocksRoutes.patch("/blocks/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  
  const updates: Record<string, any> = { updatedAt: new Date() };
  
  if (body.name !== undefined) updates.name = body.name;
  if (body.content !== undefined) updates.content = body.content;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
  if (body.columnSpan !== undefined) updates.columnSpan = body.columnSpan;
  if (body.cssClass !== undefined) updates.cssClass = body.cssClass;
  if (body.backgroundColor !== undefined) updates.backgroundColor = body.backgroundColor;
  if (body.textColor !== undefined) updates.textColor = body.textColor;
  if (body.padding !== undefined) updates.padding = body.padding;
  if (body.isVisible !== undefined) updates.isVisible = body.isVisible;
  if (body.visibleFrom !== undefined) updates.visibleFrom = body.visibleFrom;
  if (body.visibleUntil !== undefined) updates.visibleUntil = body.visibleUntil;
  
  const [updated] = await dbInstance
    .update(blocks)
    .set(updates)
    .where(eq(blocks.id, id))
    .returning();
  
  if (!updated) {
    return c.json({ error: "Block not found" }, 404);
  }
  
  await invalidateCache(`page:${updated.pageId}:*`);
  return c.json(updated);
});

// Delete block
blocksRoutes.delete("/blocks/:id", requireAuth, async (c) => {
  const { id } = c.req.param();
  
  const [block] = await dbInstance.select({ pageId: blocks.pageId }).from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!block) {
    return c.json({ error: "Block not found" }, 404);
  }
  
  await dbInstance.delete(blocks).where(eq(blocks.id, id));
  
  await invalidateCache(`page:${block.pageId}:*`);
  return c.json({ success: true });
});

// Reorder blocks
blocksRoutes.post("/pages/:pageId/blocks/reorder", requireAuth, async (c) => {
  const { pageId } = c.req.param();
  const { blockOrders } = await c.req.json(); // [{ id: string, sortOrder: number }]
  
  if (!Array.isArray(blockOrders)) {
    return c.json({ error: "blockOrders must be an array" }, 400);
  }
  
  // Update all blocks in a transaction
  await dbInstance.transaction(async (trx) => {
    for (const { id, sortOrder } of blockOrders) {
      await trx
        .update(blocks)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(blocks.id, id), eq(blocks.pageId, pageId)));
    }
  });
  
  await invalidateCache(`page:${pageId}:*`);
  return c.json({ success: true });
});

// Duplicate block
blocksRoutes.post("/blocks/:id/duplicate", requireAuth, async (c) => {
  const { id } = c.req.param();
  
  const [original] = await dbInstance.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!original) {
    return c.json({ error: "Block not found" }, 404);
  }
  
  // Get max sort order for the page
  const [{ maxOrder }] = await dbInstance
    .select({ maxOrder: sql<number>`COALESCE(MAX(${blocks.sortOrder}), -1)` })
    .from(blocks)
    .where(eq(blocks.pageId, original.pageId));
  
  const [duplicated] = await dbInstance
    .insert(blocks)
    .values({
      pageId: original.pageId,
      type: original.type,
      name: `${original.name || original.type} (Copy)`,
      sortOrder: maxOrder + 1,
      columnSpan: original.columnSpan,
      content: original.content,
      cssClass: original.cssClass,
      backgroundColor: original.backgroundColor,
      textColor: original.textColor,
      padding: original.padding,
      isVisible: original.isVisible,
    })
    .returning();
  
  await invalidateCache(`page:${original.pageId}:*`);
  return c.json(duplicated, 201);
});

// ═══════════════════════════════════════════════
// RENDER ENDPOINT (Public)
// ═══════════════════════════════════════════════

// Render page for public consumption
blocksRoutes.get("/render/:slug", async (c) => {
  const { slug } = c.req.param();
  
  const rendered = await cachedQuery(`render:${slug}`, 300, async () => {
    // Get published page
    const [page] = await dbInstance
      .select()
      .from(pages)
      .where(and(
        eq(pages.slug, slug),
        eq(pages.status, "published")
      ))
      .limit(1);
    
    if (!page) return null;
    
    // Get visible blocks
    const now = new Date();
    const pageBlocks = await dbInstance
      .select()
      .from(blocks)
      .where(and(
        eq(blocks.pageId, page.id),
        eq(blocks.isVisible, true)
      ))
      .orderBy(asc(blocks.sortOrder));
    
    // Filter by visibility dates
    const visibleBlocks = pageBlocks.filter((block) => {
      if (block.visibleFrom && new Date(block.visibleFrom) > now) return false;
      if (block.visibleUntil && new Date(block.visibleUntil) < now) return false;
      return true;
    });
    
    // Process blocks to add transform URLs for media
    const processedBlocks = visibleBlocks.map((block) => {
      const content = block.content as Record<string, any>;
      const mediaUrls: Record<string, any> = {};
      
      // Generate transform URLs based on block type
      if (block.type === "hero" && content?.mediaId) {
        // Hero uses hero preset (1920x1080 cover) with optional focal point
        const focalPoint = content.focalPoint;
        mediaUrls.hero = buildTransformUrl(content.mediaId, "hero", focalPoint);
        mediaUrls.large = buildTransformUrl(content.mediaId, "large", focalPoint);
        mediaUrls.medium = buildTransformUrl(content.mediaId, "medium", focalPoint);
        mediaUrls.small = buildTransformUrl(content.mediaId, "small", focalPoint);
      }
      
      if (block.type === "image" && content?.mediaId) {
        // Image block uses multiple presets for responsive images
        mediaUrls.thumbnail = buildTransformUrl(content.mediaId, "thumbnail");
        mediaUrls.small = buildTransformUrl(content.mediaId, "small");
        mediaUrls.medium = buildTransformUrl(content.mediaId, "medium");
        mediaUrls.large = buildTransformUrl(content.mediaId, "large");
      }
      
      if (block.type === "cards" && content?.cards) {
        // Cards may have images - generate thumbnail and small
        mediaUrls.cards = content.cards.map((card: any) => {
          if (!card?.mediaId) return null;
          return {
            cardId: card.id,
            thumbnail: buildTransformUrl(card.mediaId, "thumbnail"),
            small: buildTransformUrl(card.mediaId, "small"),
            medium: buildTransformUrl(card.mediaId, "medium"),
          };
        }).filter(Boolean);
      }
      
      if (block.type === "quote" && content?.authorImageId) {
        // Quote author image uses thumbnail
        mediaUrls.authorImage = buildTransformUrl(content.authorImageId, "thumbnail");
      }
      
      return {
        id: block.id,
        type: block.type,
        content: block.content,
        columnSpan: block.columnSpan,
        cssClass: block.cssClass,
        backgroundColor: block.backgroundColor,
        textColor: block.textColor,
        padding: block.padding,
        mediaUrls: Object.keys(mediaUrls).length > 0 ? mediaUrls : undefined,
      };
    });
    
    return {
      page: {
        id: page.id,
        title: page.title,
        slug: page.slug,
        description: page.description,
        metaTitle: page.metaTitle || page.title,
        metaDescription: page.metaDescription,
        layout: page.layout,
        cssClass: page.cssClass,
        customCss: page.customCss,
        publishedAt: page.publishedAt,
      },
      blocks: processedBlocks,
    };
  });
  
  if (!rendered) {
    return c.json({ error: "Page not found" }, 404);
  }
  
  return c.json(rendered);
});

// ═══════════════════════════════════════════════
// BLOCK TEMPLATES
// ═══════════════════════════════════════════════

// List templates
blocksRoutes.get("/templates", async (c) => {
  const query = c.req.query();
  const category = query.category;
  const type = query.type;
  
  const result = await cachedQuery(`templates:list:${category || "all"}:${type || "all"}`, 300, async () => {
    let conditions = [eq(blockTemplates.isActive, true)];
    
    if (category) {
      conditions.push(eq(blockTemplates.category, category));
    }
    if (type) {
      conditions.push(eq(blockTemplates.type, type as any));
    }
    
    const list = await dbInstance
      .select({
        id: blockTemplates.id,
        name: blockTemplates.name,
        description: blockTemplates.description,
        category: blockTemplates.category,
        type: blockTemplates.type,
        content: blockTemplates.content,
        cssClass: blockTemplates.cssClass,
        backgroundColor: blockTemplates.backgroundColor,
        textColor: blockTemplates.textColor,
        padding: blockTemplates.padding,
        usageCount: blockTemplates.usageCount,
      })
      .from(blockTemplates)
      .where(and(...conditions))
      .orderBy(desc(blockTemplates.usageCount));
    
    return { docs: list };
  });
  
  return c.json(result);
});

// Create template
blocksRoutes.post("/templates", requireAuth, async (c) => {
  const body = await c.req.json();
  
  const [template] = await dbInstance
    .insert(blockTemplates)
    .values({
      name: body.name,
      description: body.description,
      category: body.category,
      type: body.type,
      content: body.content,
      cssClass: body.cssClass,
      backgroundColor: body.backgroundColor,
      textColor: body.textColor,
      padding: body.padding,
    })
    .returning();
  
  await invalidateCache("templates:*");
  return c.json(template, 201);
});

// Update template usage count (called when used)
blocksRoutes.post("/templates/:id/use", requireAuth, async (c) => {
  const { id } = c.req.param();
  
  const [updated] = await dbInstance
    .update(blockTemplates)
    .set({ 
      usageCount: sql`${blockTemplates.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(blockTemplates.id, id))
    .returning();
  
  if (!updated) {
    return c.json({ error: "Template not found" }, 404);
  }
  
  return c.json(updated);
});

// ═══════════════════════════════════════════════
// BLOCK TYPES REGISTRY
// ═══════════════════════════════════════════════

// Get available block types and their schemas
blocksRoutes.get("/block-types", (c) => {
  const blockTypes = [
    {
      type: "hero",
      name: "Hero Section",
      category: "layout",
      icon: "layout",
      description: "Large banner with headline, description, and call-to-action",
      schema: {
        headline: { type: "string", required: true },
        subheadline: { type: "string" },
        description: { type: "string" },
        mediaId: { type: "string", description: "Background image/video" },
        mediaType: { type: "enum", options: ["image", "video"], default: "image" },
        alignment: { type: "enum", options: ["left", "center", "right"], default: "center" },
        minHeight: { type: "enum", options: ["sm", "md", "lg", "xl"], default: "md" },
        focalPoint: { 
          type: "object", 
          description: "Smart crop focal point (0-1)",
          properties: {
            x: { type: "number", min: 0, max: 1, default: 0.5 },
            y: { type: "number", min: 0, max: 1, default: 0.5 },
          }
        },
        primaryButton: {
          type: "object",
          properties: {
            label: { type: "string" },
            url: { type: "string" },
            variant: { type: "enum", options: ["primary", "secondary", "outline"] },
          },
        },
        secondaryButton: {
          type: "object",
          properties: {
            label: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
    {
      type: "text",
      name: "Text",
      category: "content",
      icon: "type",
      description: "Rich text content block",
      schema: {
        text: { type: "string", required: true },
        format: { type: "enum", options: ["html", "markdown", "plain"], default: "html" },
        alignment: { type: "enum", options: ["left", "center", "right", "justify"], default: "left" },
        textSize: { type: "enum", options: ["sm", "md", "lg", "xl"], default: "md" },
      },
    },
    {
      type: "image",
      name: "Image",
      category: "media",
      icon: "image",
      description: "Single image with optional caption and link",
      schema: {
        mediaId: { type: "string", required: true },
        altText: { type: "string" },
        caption: { type: "string" },
        alignment: { type: "enum", options: ["left", "center", "right", "full"], default: "center" },
        linkUrl: { type: "string" },
        openInNewTab: { type: "boolean", default: false },
      },
    },
    {
      type: "video",
      name: "Video",
      category: "media",
      icon: "video",
      description: "Self-hosted or embedded video",
      schema: {
        mediaId: { type: "string", description: "For self-hosted videos" },
        embedUrl: { type: "string", description: "YouTube/Vimeo URL" },
        provider: { type: "enum", options: ["youtube", "vimeo", "self"], default: "self" },
        autoplay: { type: "boolean", default: false },
        loop: { type: "boolean", default: false },
        muted: { type: "boolean", default: true },
        controls: { type: "boolean", default: true },
      },
    },
    {
      type: "grid",
      name: "Grid Layout",
      category: "layout",
      icon: "grid",
      description: "Multi-column grid for organizing content",
      schema: {
        columns: { type: "number", min: 1, max: 4, default: 2 },
        gap: { type: "enum", options: ["sm", "md", "lg"], default: "md" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              columnSpan: { type: "number", min: 1, max: 12 },
              content: { type: "object" },
            },
          },
        },
      },
    },
    {
      type: "cards",
      name: "Cards",
      category: "content",
      icon: "square-stack",
      description: "Card grid with images, titles, and descriptions",
      schema: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string", required: true },
              description: { type: "string" },
              mediaId: { type: "string" },
              linkUrl: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
          },
        },
        columns: { type: "enum", options: [1, 2, 3, 4], default: 3 },
        variant: { type: "enum", options: ["default", "horizontal", "compact"], default: "default" },
      },
    },
    {
      type: "quote",
      name: "Quote",
      category: "content",
      icon: "quote",
      description: "Testimonial or quote with attribution",
      schema: {
        quote: { type: "string", required: true },
        author: { type: "string" },
        authorTitle: { type: "string" },
        authorImageId: { type: "string" },
        style: { type: "enum", options: ["default", "large", "minimal"], default: "default" },
      },
    },
    {
      type: "cta",
      name: "Call to Action",
      category: "marketing",
      icon: "megaphone",
      description: "Promotional section with button",
      schema: {
        title: { type: "string", required: true },
        description: { type: "string" },
        buttonLabel: { type: "string", required: true },
        buttonUrl: { type: "string", required: true },
        buttonVariant: { type: "enum", options: ["primary", "secondary", "outline"], default: "primary" },
        alignment: { type: "enum", options: ["left", "center", "right"], default: "center" },
      },
    },
    {
      type: "embed",
      name: "Embed",
      category: "media",
      icon: "code",
      description: "HTML embed code (iframes, widgets, etc.)",
      schema: {
        code: { type: "string", required: true, description: "HTML embed code" },
        caption: { type: "string" },
      },
    },
    {
      type: "divider",
      name: "Divider",
      category: "layout",
      icon: "minus",
      description: "Horizontal line separator",
      schema: {
        style: { type: "enum", options: ["solid", "dashed", "dotted"], default: "solid" },
        width: { type: "enum", options: ["full", "partial"], default: "full" },
        color: { type: "string", description: "CSS color value" },
      },
    },
    {
      type: "spacer",
      name: "Spacer",
      category: "layout",
      icon: "arrows-out-vertical",
      description: "Vertical spacing block",
      schema: {
        height: { type: "enum", options: ["sm", "md", "lg", "xl", "2xl"], default: "md" },
      },
    },
    {
      type: "custom",
      name: "Custom Component",
      category: "advanced",
      icon: "puzzle-piece",
      description: "Custom React/Vue/Svelte component",
      schema: {
        component: { type: "string", required: true, description: "Component identifier" },
        props: { type: "object", description: "Component props" },
      },
    },
  ];
  
  return c.json({ blockTypes });
});

// ═══════════════════════════════════════════════
// CLONE PAGE
// ═══════════════════════════════════════════════

blocksRoutes.post("/pages/:id/clone", requireAuth, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  
  // Get original page with blocks
  const [original] = await dbInstance.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!original) {
    return c.json({ error: "Page not found" }, 404);
  }
  
  const originalBlocks = await dbInstance
    .select()
    .from(blocks)
    .where(eq(blocks.pageId, id))
    .orderBy(asc(blocks.sortOrder));
  
  // Generate new slug
  const newSlug = body.slug || `${original.slug}-copy`;
  const newTitle = body.title || `${original.title} (Copy)`;
  
  // Check for slug conflict
  const [existing] = await dbInstance.select({ id: pages.id }).from(pages).where(eq(pages.slug, newSlug)).limit(1);
  if (existing) {
    return c.json({ error: "A page with this slug already exists" }, 409);
  }
  
  // Create cloned page
  const [cloned] = await dbInstance
    .insert(pages)
    .values({
      title: newTitle,
      slug: newSlug,
      description: original.description,
      status: "draft", // Always start as draft
      layout: original.layout,
      metaTitle: original.metaTitle,
      metaDescription: original.metaDescription,
      ogImageId: original.ogImageId,
      cssClass: original.cssClass,
      customCss: original.customCss,
      authorId: body.authorId,
      isHomepage: false, // Never clone as homepage
      requireAuth: original.requireAuth,
    })
    .returning();
  
  // Clone blocks
  if (originalBlocks.length > 0) {
    await dbInstance.insert(blocks).values(
      originalBlocks.map((block) => ({
        pageId: cloned.id,
        type: block.type,
        name: block.name,
        sortOrder: block.sortOrder,
        columnSpan: block.columnSpan,
        content: block.content,
        cssClass: block.cssClass,
        backgroundColor: block.backgroundColor,
        textColor: block.textColor,
        padding: block.padding,
        isVisible: block.isVisible,
      }))
    );
  }
  
  await invalidateCache("pages:*");
  return c.json(cloned, 201);
});


  // Return the configured router
  return blocksRoutes;
}

// Legacy exports maintained for compatibility
// Use createBlocksRouter(ctx) instead
export const blocksRoutes = createBlocksRouter;
