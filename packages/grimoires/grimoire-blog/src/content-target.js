/**
 * Blog Content Target
 *
 * Implementa ContentTarget para el grimoire-blog.
 * Permite que cualquier otro grimoire promueva contenido al Blog.
 */
import { eq, sql, and } from "drizzle-orm";
import { generateSlug, renderTemplate, generateExcerpt, estimateReadingTime, } from "./content-utils";
import { blogPosts, blogPostsToTags, blogPostsToGames } from "./schema";
/**
 * Content Target para Blog
 */
export const blogContentTarget = {
    id: "blog",
    name: "Blog Posts",
    grimoireId: "grimoire-blog",
    capabilities: {
        supportsSeo: true,
        supportsScheduling: true,
        supportsEditorial: true, // draft → published → archived
        supportsTaxonomy: true, // tags
        supportsMedia: true, // featured images
    },
    /**
     * Publicar contenido en el Blog
     */
    async publish(data, ctx) {
        const { db, logger } = ctx;
        const { source, options } = data;
        if (!source?.data) {
            throw new Error("Promotion data must include source.data");
        }
        // 1. Generar título
        const title = options.title
            ? renderTemplate(options.title, source.data)
            : source.data.title ||
                source.data.name ||
                `Content from ${source.type}`;
        // 2. Generar slug único
        const baseSlug = options.slug || generateSlug(title);
        const slug = await generateUniqueSlug(db.instance, baseSlug);
        // 3. Generar excerpt y reading time
        const excerpt = generateExcerpt(source.data);
        const readingTime = estimateReadingTime(excerpt);
        // 4. Determinar estado y fechas
        const status = options.autoPublish
            ? "published"
            : options.scheduledAt
                ? "scheduled"
                : "draft";
        const publishedAt = options.autoPublish
            ? new Date()
            : options.scheduledAt || null;
        // 5. Construir snapshot de la fuente
        const snapshot = {
            title: source.data.title || source.data.name || "Untitled",
            rawData: source.data,
            capturedAt: new Date().toISOString(),
        };
        // 6. Construir contenido Lexical básico
        const content = buildLexicalContent(excerpt);
        // 7. Crear el post
        const [post] = await db.instance
            .insert(blogPosts)
            .values({
            title,
            slug,
            content,
            excerpt,
            status,
            publishedAt,
            authorId: options.authorId,
            readingTime,
            source: {
                type: source.type,
                grimoireId: source.grimoireId,
                table: source.table,
                recordId: source.recordId,
                snapshot,
            },
            seoOverrides: {},
            blocks: [],
        })
            .returning();
        // 8. Manejar relaciones si vienen en targetConfig
        const targetConfig = options.targetConfig || {};
        if (targetConfig.tagIds?.length) {
            await db.instance.insert(blogPostsToTags).values(targetConfig.tagIds.map((tagId) => ({
                postId: post.id,
                tagId,
            })));
        }
        if (targetConfig.gameIds?.length) {
            await db.instance.insert(blogPostsToGames).values(targetConfig.gameIds.map((gameId) => ({
                postId: post.id,
                gameId,
            })));
        }
        logger.info("Content promoted to Blog", {
            postId: post.id,
            slug: post.slug,
            sourceType: source.type,
            sourceId: source.recordId,
        });
        return {
            contentId: post.id,
            targetId: "blog",
            slug: post.slug,
            url: `/blog/${post.slug}`,
            status: post.status,
            createdAt: new Date(),
        };
    },
    /**
     * Obtener URL pública de un post
     */
    getPublishedUrl(result) {
        return `/blog/${result.slug}`;
    },
    /**
     * Despublicar (archivar) un post
     */
    async unpublish(contentId, ctx) {
        const { db, logger } = ctx;
        await db.instance
            .update(blogPosts)
            .set({
            status: "archived",
            updatedAt: new Date(),
        })
            .where(eq(blogPosts.id, contentId));
        logger.info("Blog post archived", { postId: contentId });
    },
    /**
     * Actualizar un post existente
     */
    async update(contentId, data, ctx) {
        const { db, logger } = ctx;
        const updates = {
            updatedAt: new Date(),
        };
        if (data.options?.title) {
            updates.title = data.options.title;
        }
        if (data.options?.slug) {
            updates.slug = await generateUniqueSlug(db.instance, data.options.slug, contentId);
        }
        if (data.source?.data) {
            updates.excerpt = generateExcerpt(data.source.data);
            updates.readingTime = estimateReadingTime(updates.excerpt);
        }
        const [updated] = await db.instance
            .update(blogPosts)
            .set(updates)
            .where(eq(blogPosts.id, contentId))
            .returning();
        if (!updated) {
            throw new Error(`Blog post not found: ${contentId}`);
        }
        logger.info("Blog post updated", { postId: contentId });
        return {
            contentId: updated.id,
            targetId: "blog",
            slug: updated.slug,
            url: `/blog/${updated.slug}`,
            status: updated.status,
            createdAt: updated.createdAt,
        };
    },
    /**
     * Obtener estado de un post
     */
    async getStatus(contentId, ctx) {
        const { db } = ctx;
        const result = await db.instance
            .select({ status: blogPosts.status })
            .from(blogPosts)
            .where(eq(blogPosts.id, contentId))
            .limit(1);
        if (!result.length) {
            throw new Error(`Blog post not found: ${contentId}`);
        }
        return result[0].status;
    },
};
// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Generar slug único evitando duplicados
 */
async function generateUniqueSlug(db, baseSlug, excludeId) {
    let slug = baseSlug;
    let counter = 1;
    while (true) {
        // Build where clause
        const conditions = [eq(blogPosts.slug, slug)];
        if (excludeId) {
            conditions.push(sql `${blogPosts.id} != ${excludeId}`);
        }
        const existing = await db
            .select({ id: blogPosts.id })
            .from(blogPosts)
            .where(and(...conditions))
            .limit(1);
        if (!existing.length) {
            return slug;
        }
        slug = `${baseSlug}-${counter}`;
        counter++;
        // Safety limit
        if (counter > 1000) {
            throw new Error("Could not generate unique slug after 1000 attempts");
        }
    }
}
/**
 * Construir contenido Lexical básico
 */
function buildLexicalContent(text) {
    return {
        root: {
            children: [
                {
                    type: "paragraph",
                    children: [{ text }],
                },
            ],
            direction: null,
            format: "",
            indent: 0,
            type: "root",
            version: 1,
        },
    };
}
//# sourceMappingURL=content-target.js.map