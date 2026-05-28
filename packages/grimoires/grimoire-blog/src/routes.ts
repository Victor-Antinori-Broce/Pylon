/**
 * Grimoire Blog — API Routes
 *
 * Router Hono autocontenido que recibe dependencias vía contexto inyectado.
 *
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 * Example: `/source/:postId` must come before `/:id`
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";
import type { GrimoireContext, GrimoireRouterFactory } from "@gremius/shared";
import { blogPosts, blogPostsToTags, blogPostsToGames } from "./schema";
import { blogContentTarget } from "./content-target";
import { 
  generateSEOMetadata, 
  validateSEO, 
  validateWhatsAppImage,
  SEO_LIMITS,
  generateTitle,
  generateMetaDescription,
  type SiteSEOConfig,
  type AuthorInfo,
  type FeaturedImage,
} from "./seo-utils";

import {
  validateBLUF,
  sanitizeHTML,
  sanitizeFAQText,
  generateFAQPageSchema,
  generateArticleSchema,
  buildAPIPayload,
  extractTOC,
  ALLOWED_HTML_TAGS,
} from "./geo-utils";

import type { FAQItem, BlogPostStatus } from "./schema";

// ═══════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const focalPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
}).optional();

const faqItemSchema = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
  order: z.number().optional(),
});

const createPostSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().max(500).optional(),
  content: z.any().optional(),
  excerpt: z.string().optional(),
  blufText: z.string().optional(),
  faqData: z.array(faqItemSchema).optional(),
  datasetUrl: z.string().url().optional().or(z.literal("")),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(170).optional(),
  ogImageId: z.string().uuid().optional(),
  status: z.enum(["draft", "published", "scheduled", "archived"] as const).optional(),
  publishedAt: z.string().datetime().optional(),
  authorId: z.string().optional(),
  featuredImageId: z.string().uuid().optional(),
  featuredImageFocalPoint: focalPointSchema,
  readingTime: z.number().int().positive().optional(),
  seoOverrides: z.record(z.any()).optional(),
  blocks: z.array(z.any()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  gameIds: z.array(z.string().uuid()).optional(),
});

const updatePostSchema = createPostSchema.partial().extend({
  tagIds: z.array(z.string().uuid()).optional(),
  gameIds: z.array(z.string().uuid()).optional(),
});

const validateSeoSchema = z.object({
  title: z.string().optional(),
  metaDescription: z.string().optional(),
  excerpt: z.string().optional(),
  focusKeyword: z.string().optional(),
  content: z.any().optional(),
  imageUrl: z.string().url().optional(),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
  imageFileSize: z.number().optional(),
  imageMimeType: z.string().optional(),
});

const validateImageSchema = z.object({
  imageUrl: z.string().url(),
  width: z.number().optional(),
  height: z.number().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
});

const promoteFromSourceSchema = z.object({
  sourceType: z.enum(["dataset", "grimoire"]),
  datasetId: z.string().optional(),
  entryId: z.string().optional(),
  grimoireId: z.string().optional(),
  table: z.string().optional(),
  recordId: z.string().optional(),
  titleTemplate: z.string().optional(),
  slugPrefix: z.string().optional(),
  autoPublish: z.boolean().optional(),
  authorId: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  gameIds: z.array(z.string()).optional(),
});

/**
 * Factory que crea el router de blog con contexto inyectado
 */
export const createBlogRouter: GrimoireRouterFactory = (ctx: GrimoireContext) => {
  const router = new Hono();
  const { db, cache, events, realtime, auth } = ctx;

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC ROUTES - SPECIFIC FIRST (before parameterized routes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/blog — Listar posts (público)
   */
  router.get("/", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 12, 100);
    const page = Math.max(Number(c.req.query("page")) || 1, 1);
    const offset = (page - 1) * limit;
    const status = c.req.query("status") || "published";

    // Cache key
    const cacheKey = `blog:list:${page}:${limit}:${status}`;
    
    // Intentar leer de caché
    const cached = await cache.get(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    try {
      // Query principal
      const [docs, countResult] = await Promise.all([
        db.instance
          .select({
            post: blogPosts,
          })
          .from(blogPosts)
          .where(eq(blogPosts.status, status))
          .orderBy(desc(blogPosts.publishedAt))
          .limit(limit)
          .offset(offset),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(blogPosts)
          .where(eq(blogPosts.status, status)),
      ]);

      const totalDocs = Number(countResult[0]?.count ?? 0);
      const totalPages = Math.ceil(totalDocs / limit);

      const response = {
        docs: docs.map((row: any) => ({
          ...row.post,
        })),
        totalDocs,
        totalPages,
        page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };

      // Guardar en caché
      await cache.set(cacheKey, response, 60);

      return c.json(response);
    } catch (err: any) {
      ctx.logger.error("Failed to list blog posts", { error: err.message });
      return c.json({ error: "Failed to fetch posts" }, 500);
    }
  });

  /**
   * GET /api/blog/slug/:slug — Obtener post por slug (público)
   * SPECIFIC ROUTE - must come before /:id
   */
  router.get("/slug/:slug", async (c) => {
    const { slug } = c.req.param();

    try {
      const result = await db.instance
        .select()
        .from(blogPosts)
        .where(eq(blogPosts.slug, slug))
        .limit(1);

      if (!result.length) {
        return c.json({ error: "Post not found" }, 404);
      }

      const post = result[0];

      // Obtener tags y games relacionados
      const [postTags, postGames] = await Promise.all([
        db.instance
          .select({
            tagId: blogPostsToTags.tagId,
          })
          .from(blogPostsToTags)
          .where(eq(blogPostsToTags.postId, post.id)),
        db.instance
          .select({
            gameId: blogPostsToGames.gameId,
          })
          .from(blogPostsToGames)
          .where(eq(blogPostsToGames.postId, post.id)),
      ]);

      return c.json({
        ...post,
        tagIds: postTags.map((r) => r.tagId),
        gameIds: postGames.map((r) => r.gameId),
      });
    } catch (err: any) {
      ctx.logger.error("Failed to get blog post", { slug, error: err.message });
      return c.json({ error: "Failed to fetch post" }, 500);
    }
  });

  /**
   * GET /api/blog/seo/:slug — Obtener metadatos SEO completos de un post
   * SPECIFIC ROUTE - must come before /:id
   */
  router.get("/seo/:slug", async (c) => {
    const { slug } = c.req.param();
    const siteName = c.req.query("siteName") || "Gremius CMS";
    const baseUrl = c.req.query("baseUrl") || new URL(c.req.url).origin;
    
    try {
      // Obtener post
      const [post] = await db.instance
        .select()
        .from(blogPosts)
        .where(eq(blogPosts.slug, slug))
        .limit(1);

      if (!post) {
        return c.json({ error: "Post not found" }, 404);
      }

      // Solo posts publicados tienen SEO publico
      const isPreview = c.req.query("preview") === "true";
      if (post.status !== "published" && !isPreview) {
        return c.json({ 
          error: "Post not published",
          message: "Add ?preview=true to see SEO for unpublished posts"
        }, 403);
      }

      // Configuracion del sitio
      const siteConfig: SiteSEOConfig = {
        name: siteName,
        baseUrl,
        defaultLanguage: "es_ES",
      };

      // Generar metadatos SEO
      const seoMetadata = generateSEOMetadata({
        post,
        siteConfig,
        tags: [],
      });

      // Helper para escapar HTML
      const escapeHtml = (text: string) => text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      // Respuesta completa
      return c.json({
        success: true,
        post: {
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          publishedAt: post.publishedAt,
        },
        seo: {
          title: seoMetadata.title,
          metaDescription: seoMetadata.metaDescription,
          canonicalUrl: seoMetadata.canonicalUrl,
          robots: seoMetadata.robots,
          keywords: seoMetadata.keywords,
          openGraph: seoMetadata.openGraph,
          twitterCard: seoMetadata.twitterCard,
          jsonLd: seoMetadata.jsonLd,
          readingTime: seoMetadata.readingTime,
          wordCount: seoMetadata.wordCount,
          score: seoMetadata.score,
          warnings: seoMetadata.warnings,
        },
        social: {
          // WhatsApp/Facebook/LinkedIn Open Graph
          openGraph: {
            title: seoMetadata.openGraph.title,
            description: seoMetadata.openGraph.description,
            image: seoMetadata.openGraph.image,
            url: seoMetadata.openGraph.url,
            type: seoMetadata.openGraph.type,
            whatsAppReady: seoMetadata.whatsAppValidation?.isValid ?? false,
            whatsAppWarnings: seoMetadata.whatsAppValidation?.warnings ?? [],
            whatsAppRecommendations: seoMetadata.whatsAppValidation?.recommendations ?? [],
          },
          // Twitter/X Card
          twitterCard: {
            card: seoMetadata.twitterCard.card,
            title: seoMetadata.twitterCard.title,
            description: seoMetadata.twitterCard.description,
            image: seoMetadata.twitterCard.image,
          },
        },
        html: {
          title: `<title>${escapeHtml(seoMetadata.title)}</title>`,
          metaTags: seoMetadata.metaTags,
          canonical: `<link rel="canonical" href="${escapeHtml(seoMetadata.canonicalUrl)}">`,
          jsonLd: seoMetadata.jsonLd.map(schema => 
            `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`
          ),
        }
      });

    } catch (err: any) {
      ctx.logger.error("Failed to generate SEO metadata", { slug, error: err.message });
      return c.json({ error: "Failed to generate SEO metadata" }, 500);
    }
  });

  /**
   * GET /api/blog/geo/:slug — Payload completo SEO/GEO optimizado
   * SPECIFIC ROUTE - must come before /:id
   */
  router.get("/geo/:slug", async (c) => {
    const { slug } = c.req.param();
    const siteName = c.req.query("siteName") || "Gremius CMS";
    const baseUrl = c.req.query("baseUrl") || new URL(c.req.url).origin;
    const isPreview = c.req.query("preview") === "true";
    
    try {
      // Obtener post con campos GEO
      const [post] = await db.instance
        .select({
          id: blogPosts.id,
          slug: blogPosts.slug,
          title: blogPosts.title,
          content: blogPosts.content,
          excerpt: blogPosts.excerpt,
          blufText: blogPosts.blufText,
          faqData: blogPosts.faqData,
          datasetUrl: blogPosts.datasetUrl,
          metaTitle: blogPosts.metaTitle,
          metaDescription: blogPosts.metaDescription,
          ogImageId: blogPosts.ogImageId,
          status: blogPosts.status,
          publishedAt: blogPosts.publishedAt,
          updatedAt: blogPosts.updatedAt,
          authorId: blogPosts.authorId,
          readingTime: blogPosts.readingTime,
        })
        .from(blogPosts)
        .where(eq(blogPosts.slug, slug))
        .limit(1);

      if (!post) {
        return c.json({ error: "Post not found" }, 404);
      }

      // Solo posts publicados (a menos que sea preview)
      if (post.status !== "published" && !isPreview) {
        return c.json({ 
          error: "Post not published",
          message: "Add ?preview=true to see unpublished posts"
        }, 403);
      }

      // Construir payload optimizado
      const payload = buildAPIPayload(post, {
        baseUrl,
        siteName,
      });

      // Validaciones de GEO (no bloqueantes, solo informativas)
      const faqData = post.faqData as FAQItem[] | null;
      const geoValidation = {
        bluf: post.blufText ? validateBLUF(post.blufText) : null,
        faq: faqData ? {
          count: faqData.length,
          valid: faqData.every((f) => f.q && f.a)
        } : null,
      };

      return c.json({
        success: true,
        data: payload,
        _meta: {
          validation: geoValidation,
          generatedAt: new Date().toISOString(),
        }
      });

    } catch (err: any) {
      ctx.logger.error("Failed to get GEO payload", { slug, error: err.message });
      return c.json({ error: "Failed to fetch post" }, 500);
    }
  });

  /**
   * POST /api/blog/validate-seo — Validar metadatos SEO (requiere auth)
   * SPECIFIC ROUTE - must come before /:id
   */
  router.post("/validate-seo", auth.requireAuth, async (c) => {
    try {
      const rawBody = await c.req.json();
      const parseResult = validateSeoSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return c.json({
          error: "Validation failed",
          issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        }, 400);
      }

      const body = parseResult.data;
      const title = body.title || "";
      const metaDescription = body.metaDescription || body.excerpt || "";
      const focusKeyword = body.focusKeyword;
      const content = body.content;

      const validation = {
        title: {
          current: title.length,
          min: SEO_LIMITS.title.min,
          optimal: SEO_LIMITS.title.optimal,
          max: SEO_LIMITS.title.max,
          isValid: title.length >= SEO_LIMITS.title.min && title.length <= SEO_LIMITS.title.max,
          isOptimal: title.length >= SEO_LIMITS.title.optimal && title.length <= SEO_LIMITS.title.max,
        },
        description: {
          current: metaDescription.length,
          min: SEO_LIMITS.description.min,
          optimal: SEO_LIMITS.description.optimal,
          max: SEO_LIMITS.description.max,
          isValid: metaDescription.length >= SEO_LIMITS.description.min && metaDescription.length <= SEO_LIMITS.description.max,
          isOptimal: metaDescription.length >= SEO_LIMITS.description.optimal && metaDescription.length <= SEO_LIMITS.description.max,
        },
      };

      const warnings = validateSEO(title, metaDescription, focusKeyword, content);

      // Validate OG Image for WhatsApp if provided
      let whatsAppValidation = null;
      if (body.imageUrl) {
        whatsAppValidation = validateWhatsAppImage(body.imageUrl, {
          width: body.imageWidth,
          height: body.imageHeight,
          fileSizeBytes: body.imageFileSize,
          mimeType: body.imageMimeType,
        });

        // Add WhatsApp warnings to general warnings
        if (!whatsAppValidation.isValid) {
          warnings.push(...whatsAppValidation.warnings.map((w: string) => `[WhatsApp] ${w}`));
        }
      }

      return c.json({
        valid: warnings.length === 0,
        validation,
        warnings,
        suggestions: [
          !validation.title.isOptimal && `Ajusta el titulo a ${SEO_LIMITS.title.optimal}-${SEO_LIMITS.title.max} caracteres`,
          !validation.description.isOptimal && `Ajusta la descripcion a ${SEO_LIMITS.description.optimal}-${SEO_LIMITS.description.max} caracteres`,
          !focusKeyword && "Considera agregar una palabra clave principal",
        ].filter(Boolean),
        whatsApp: whatsAppValidation,
      });
    } catch (err: any) {
      ctx.logger.error("Failed to validate SEO", { error: err.message });
      return c.json({ error: "Failed to validate SEO" }, 500);
    }
  });
  
  /**
   * POST /api/blog/validate-image — Validar imagen para WhatsApp/OG (requiere auth)
   * SPECIFIC ROUTE - must come before /:id
   */
  router.post("/validate-image", auth.requireAuth, async (c) => {
    try {
      const rawBody = await c.req.json();
      const parseResult = validateImageSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return c.json({
          error: "Validation failed",
          issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        }, 400);
      }

      const body = parseResult.data;
      const validation = validateWhatsAppImage(body.imageUrl, {
        width: body.width,
        height: body.height,
        fileSizeBytes: body.fileSize,
        mimeType: body.mimeType,
      });

      return c.json({
        valid: validation.isValid,
        whatsAppCompatible: validation.isValid,
        checks: validation.checks,
        warnings: validation.warnings,
        recommendations: validation.recommendations,
        metadata: validation.metadata,
        requirements: {
          maxFileSize: "300KB",
          idealDimensions: "1200x630px (1.91:1 ratio)",
          minDimensions: "400x400px",
          formats: ["JPG", "PNG"],
          avoid: ["WebP", "GIF", "SVG"],
        },
      });
    } catch (err: any) {
      ctx.logger.error("Failed to validate image", { error: err.message });
      return c.json({ error: "Failed to validate image" }, 500);
    }
  });

  /**
   * POST /api/blog/promote-from-source — Promote to Content
   * SPECIFIC ROUTE - must come before /:id
   */
  router.post("/promote-from-source", auth.requireAuth, async (c) => {
    try {
      const rawBody = await c.req.json();
      const parseResult = promoteFromSourceSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return c.json({
          error: "Validation failed",
          issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        }, 400);
      }

      const body = parseResult.data;
      const currentUser = c.get("user");

      // Obtener datos de la fuente
      let sourceData: Record<string, any> | null = null;

      if (body.sourceType === 'dataset' && body.datasetId && body.entryId) {
        sourceData = await fetchDatasetEntry(ctx, body.datasetId, body.entryId);
      } else if (body.sourceType === 'grimoire' && body.grimoireId && body.table && body.recordId) {
        sourceData = await fetchGrimoireRecord(ctx, body.grimoireId, body.table, body.recordId);
      }

      if (!sourceData) {
        return c.json({ error: "Source record not found" }, 404);
      }

      // Usar el ContentTarget directamente
      const result = await blogContentTarget.publish(
        {
          source: {
            type: body.sourceType,
            grimoireId: body.grimoireId,
            table: body.table,
            recordId: body.recordId || body.entryId!,
            data: sourceData,
          },
          options: {
            title: body.titleTemplate
              ? body.titleTemplate.replace(/\{(\w+)\}/g, (_: string, key: string) => sourceData![key] || '')
              : undefined,
            slug: body.slugPrefix ? `${body.slugPrefix}/${sourceData.slug || sourceData.id}` : undefined,
            autoPublish: body.autoPublish || false,
            authorId: body.authorId || currentUser?.id,
            targetConfig: {
              tagIds: body.tagIds,
              gameIds: body.gameIds,
            },
          },
        },
        ctx
      );

      await cache.invalidate("blog:list:*");

      events.emit("blog:post:promoted", { 
        postId: result.contentId, 
        slug: result.slug,
        sourceType: body.sourceType,
      });

      return c.json({
        success: true,
        postId: result.contentId,
        slug: result.slug,
        message: "Entry promoted to blog post successfully (legacy endpoint - use /api/content/promote)",
      }, 201);

    } catch (err: any) {
      ctx.logger.error("Failed to promote entry to blog", { error: err.message });
      return c.json({ error: "Failed to promote entry" }, 500);
    }
  });

  /**
   * GET /api/blog/source/:postId — Obtener datos de la fuente original
   * SPECIFIC ROUTE - must come before /:id
   */
  router.get("/source/:postId", auth.requireAuth, async (c) => {
    try {
      const postId = c.req.param("postId");

      const [post] = await db.instance
        .select({
          id: blogPosts.id,
          source: blogPosts.source,
          title: blogPosts.title,
          slug: blogPosts.slug,
        })
        .from(blogPosts)
        .where(eq(blogPosts.id, postId))
        .limit(1);

      if (!post) {
        return c.json({ error: "Post not found" }, 404);
      }

      if (!post.source) {
        return c.json({ error: "Post has no source data" }, 404);
      }

      return c.json({
        postId: post.id,
        title: post.title,
        slug: post.slug,
        source: post.source,
      });

    } catch (err: any) {
      ctx.logger.error("Failed to get source data", { error: err.message });
      return c.json({ error: "Failed to fetch source" }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROTECTED ROUTES - PARAMETERIZED (must come AFTER specific routes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/blog — Crear post (requiere auth)
   */
  router.post("/", auth.requireAuth, async (c) => {
    try {
      const rawBody = await c.req.json();
      const parseResult = createPostSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return c.json({
          error: "Validation failed",
          issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        }, 400);
      }

      const body = parseResult.data;
      const currentUser = c.get("user");

      // Validar BLUF (Bottom Line Up Front)
      if (body.blufText) {
        const blufValidation = validateBLUF(body.blufText);
        if (!blufValidation.isValid) {
          return c.json({
            error: "Validation failed",
            field: "blufText",
            message: "BLUF validation failed",
            details: blufValidation.errors,
            warnings: blufValidation.warnings,
            metrics: blufValidation.metrics,
          }, 400);
        }
      }

      // Sanitizar FAQs
      let sanitizedFAQs: FAQItem[] | undefined;
      if (body.faqData && body.faqData.length > 0) {
        sanitizedFAQs = body.faqData.map((faq, index) => ({
          q: sanitizeHTML(faq.q, { stripAll: true }),
          a: sanitizeFAQText(faq.a),
          order: faq.order ?? index,
        }));
      }

      // Generar slug si no se proporciona
      const slug = body.slug || body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Insertar post
      const [post] = await db.instance
        .insert(blogPosts)
        .values({
          title: body.title,
          slug,
          content: body.content,
          excerpt: body.excerpt,
          blufText: body.blufText,
          faqData: sanitizedFAQs,
          datasetUrl: body.datasetUrl,
          metaTitle: body.metaTitle,
          metaDescription: body.metaDescription,
          ogImageId: body.ogImageId,
          status: body.status || "draft",
          publishedAt: body.status === "published" ? new Date() : body.publishedAt,
          authorId: body.authorId || currentUser?.id,
          featuredImageId: body.featuredImageId,
          featuredImageFocalPoint: body.featuredImageFocalPoint,
          readingTime: body.readingTime,
          seoOverrides: body.seoOverrides,
          blocks: body.blocks || [],
        })
        .returning();

      // Manejar relaciones con tags
      if (body.tagIds?.length) {
        await db.instance.insert(blogPostsToTags).values(
          body.tagIds.map((tagId: string) => ({ postId: post.id, tagId }))
        );
      }

      // Manejar relaciones con games
      if (body.gameIds?.length) {
        await db.instance.insert(blogPostsToGames).values(
          body.gameIds.map((gameId: string) => ({ postId: post.id, gameId }))
        );
      }

      // Emitir evento
      events.emit("blog:post:created", { postId: post.id, title: post.title });

      // Invalidar caché
      await cache.invalidate("blog:list:*");

      ctx.logger.info("Blog post created", { postId: post.id, author: currentUser?.id });

      return c.json(post, 201);
    } catch (err: any) {
      // Manejar error de slug duplicado
      if (err.message?.includes("unique")) {
        return c.json({ error: "Slug already exists" }, 409);
      }
      ctx.logger.error("Failed to create blog post", { error: err.message });
      return c.json({ error: "Failed to create post" }, 500);
    }
  });

  /**
   * GET /api/blog/:id — Obtener post por ID (publico)
   * PARAMETERIZED ROUTE - must come AFTER all specific routes
   */
  router.get("/:id", async (c) => {
    try {
      const result = await db.instance
        .select()
        .from(blogPosts)
        .where(eq(blogPosts.id, c.req.param("id")))
        .limit(1);

      if (!result.length) {
        return c.json({ error: "Post not found" }, 404);
      }

      return c.json(result[0]);
    } catch (err: any) {
      ctx.logger.error("Failed to get blog post", { error: err.message });
      return c.json({ error: "Failed to fetch post" }, 500);
    }
  });

  /**
   * PATCH /api/blog/:id — Actualizar post (requiere auth)
   */
  router.patch("/:id", auth.requireAuth, async (c) => {
    try {
      const rawBody = await c.req.json();
      const parseResult = updatePostSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return c.json({
          error: "Validation failed",
          issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        }, 400);
      }

      const body = parseResult.data;
      const postId = c.req.param("id");

      // Separar actualizaciones de columnas vs relaciones
      const { tagIds, gameIds, ...columnUpdates } = body as any;

      const [updated] = await db.instance
        .update(blogPosts)
        .set({
          ...columnUpdates,
          updatedAt: new Date(),
        })
        .where(eq(blogPosts.id, postId))
        .returning();

      if (!updated) {
        return c.json({ error: "Post not found" }, 404);
      }

      // Sincronizar tags si se proporcionaron
      if (tagIds !== undefined) {
        await db.instance
          .delete(blogPostsToTags)
          .where(eq(blogPostsToTags.postId, postId));
        
        if (tagIds.length > 0) {
          await db.instance.insert(blogPostsToTags).values(
            tagIds.map((tagId: string) => ({ postId, tagId }))
          );
        }
      }

      // Sincronizar games si se proporcionaron
      if (gameIds !== undefined) {
        await db.instance
          .delete(blogPostsToGames)
          .where(eq(blogPostsToGames.postId, postId));
        
        if (gameIds.length > 0) {
          await db.instance.insert(blogPostsToGames).values(
            gameIds.map((gameId: string) => ({ postId, gameId }))
          );
        }
      }

      // Invalidar caché
      await cache.invalidate("blog:list:*");
      await cache.invalidate(`blog:post:${postId}`);

      // Broadcast realtime
      realtime.broadcast(`blog:post:${postId}`, {
        type: "update",
        data: updated,
      });

      // Emitir evento si se publicó
      if (updated.status === "published" && body.status === "published") {
        events.emit("blog:post:published", { postId: updated.id, post: updated });
      }

      ctx.logger.info("Blog post updated", { postId });

      return c.json(updated);
    } catch (err: any) {
      ctx.logger.error("Failed to update blog post", { error: err.message });
      return c.json({ error: "Failed to update post" }, 500);
    }
  });

  /**
   * DELETE /api/blog/:id — Eliminar post (requiere auth)
   */
  router.delete("/:id", auth.requireAuth, async (c) => {
    try {
      const postId = c.req.param("id");

      const [deleted] = await db.instance
        .delete(blogPosts)
        .where(eq(blogPosts.id, postId))
        .returning({ id: blogPosts.id });

      if (!deleted) {
        return c.json({ error: "Post not found" }, 404);
      }

      // Limpiar relaciones
      await db.instance.delete(blogPostsToTags).where(eq(blogPostsToTags.postId, postId));
      await db.instance.delete(blogPostsToGames).where(eq(blogPostsToGames.postId, postId));

      // Invalidar caché
      await cache.invalidate("blog:list:*");

      // Emitir evento
      events.emit("blog:post:deleted", { postId });

      ctx.logger.info("Blog post deleted", { postId });

      return c.json({ deleted: true, id: deleted.id });
    } catch (err: any) {
      ctx.logger.error("Failed to delete blog post", { error: err.message });
      return c.json({ error: "Failed to delete post" }, 500);
    }
  });

  /**
   * POST /api/blog/:id/publish — Publicar post rápidamente
   */
  router.post("/:id/publish", auth.requireAuth, async (c) => {
    try {
      const postId = c.req.param("id");

      const [updated] = await db.instance
        .update(blogPosts)
        .set({
          status: "published",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(blogPosts.id, postId))
        .returning();

      if (!updated) {
        return c.json({ error: "Post not found" }, 404);
      }

      await cache.invalidate("blog:list:*");
      
      events.emit("blog:post:published", { postId: updated.id, post: updated });

      ctx.logger.info("Blog post published", { postId });

      return c.json(updated);
    } catch (err: any) {
      ctx.logger.error("Failed to publish blog post", { error: err.message });
      return c.json({ error: "Failed to publish post" }, 500);
    }
  });

  /**
   * POST /api/blog/:slug/refresh-og-cache — Refrescar caché de Open Graph
   * PARAMETERIZED with :slug - must come AFTER all specific routes like /slug/:slug
   */
  router.post("/:slug/refresh-og-cache", auth.requireAuth, async (c) => {
    try {
      const { slug } = c.req.param();
      const baseUrl = c.req.query("baseUrl") || new URL(c.req.url).origin;
      const postUrl = `${baseUrl.replace(/\/$/, "")}/blog/${slug}`;
      
      // Intentar rescrapear con Facebook
      const fbResponse = await fetch(
        `https://graph.facebook.com/?id=${encodeURIComponent(postUrl)}&scrape=true`,
        { method: "POST" }
      );
      
      const fbResult = await fbResponse.json().catch(() => null);
      
      ctx.logger.info("Facebook OG cache refresh attempted", { 
        slug, 
        postUrl, 
        status: fbResponse.status,
        result: fbResult 
      });
      
      return c.json({
        success: true,
        message: "Open Graph cache refresh requested",
        postUrl,
        facebook: {
          status: fbResponse.status,
          result: fbResult,
          debuggerUrl: `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(postUrl)}`
        },
        notes: [
          "Facebook puede tardar hasta 24 horas en actualizar el caché",
          "Usa el Facebook Debugger para forzar el rescrapeo manualmente",
          "LinkedIn tiene su propio caché separado",
          "WhatsApp no tiene API pública para refrescar caché"
        ]
      });
    } catch (err: any) {
      ctx.logger.error("Failed to refresh OG cache", { error: err.message });
      return c.json({ 
        error: "Failed to refresh cache",
        message: err.message 
      }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function sanitizeIdentifier(name: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid SQL identifier: ${name}`);
    }
    return name;
  }

  async function fetchDatasetEntry(ctx: GrimoireContext, datasetId: string, entryId: string): Promise<Record<string, any> | null> {
    try {
      const safeTable = sanitizeIdentifier(datasetId);
      const result = await ctx.db.instance.execute(
        sql`SELECT * FROM ${sql.identifier(safeTable)} WHERE id = ${entryId} LIMIT 1`
      );
      return (result as any)?.rows?.[0] || (result as any)?.[0] || null;
    } catch {
      return null;
    }
  }

  async function fetchGrimoireRecord(ctx: GrimoireContext, grimoireId: string, table: string, recordId: string): Promise<Record<string, any> | null> {
    try {
      const safeTable = sanitizeIdentifier(table);
      const result = await ctx.db.instance.execute(
        sql`SELECT * FROM ${sql.identifier(safeTable)} WHERE id = ${recordId} LIMIT 1`
      );
      return (result as any)?.rows?.[0] || (result as any)?.[0] || null;
    } catch {
      return null;
    }
  }

  return router;
};
