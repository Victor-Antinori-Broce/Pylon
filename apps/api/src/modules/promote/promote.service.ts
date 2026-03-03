/**
 * Promote to Content — Service Layer
 *
 * Core operations:
 *   - promoteDataset: Marks a dataset as promoted, creates content_metadata for all entries
 *   - demoteDataset: Removes content_metadata and clears contentConfig
 *   - getContentEntries: Entries joined with CMS metadata
 *   - getContentBySlug: Public slug lookup (published only)
 *   - updateContentMeta: Update slug, SEO, etc.
 */

import { eq, and, isNotNull, desc } from "drizzle-orm";
import { db } from "../../db";
import { dataSets, dataEntries, media, authUsers as user } from "../../db/schema";
import { contentMetadata, type ContentConfig, type SeoMetadata } from "./promote.schema";
import { events } from "../../lib/events";

// ═══════════════════════════════════════════════
// Promote / Demote
// ═══════════════════════════════════════════════

/**
 * Generate a URL-friendly slug from a title string.
 */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 200);
}

/**
 * Promote a dataset to CMS content.
 * Sets contentConfig on the dataset and creates content_metadata rows
 * for all existing entries.
 */
export async function promoteDataset(
    datasetId: string,
    config: {
        slugPrefix: string;
        defaultSeoTemplate?: ContentConfig["defaultSeoTemplate"];
    }
) {
    // 1. Verify dataset exists
    const [dataset] = await db
        .select()
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);

    if (!dataset) return null;

    // 2. Check if already promoted
    const existing = dataset.contentConfig as ContentConfig | null;
    if (existing?.promoted) {
        return { alreadyPromoted: true, dataset };
    }

    // 3. Set contentConfig on dataset
    const contentConfig: ContentConfig = {
        promoted: true,
        promotedAt: new Date().toISOString(),
        slugPrefix: config.slugPrefix,
        defaultSeoTemplate: config.defaultSeoTemplate,
    };

    await db
        .update(dataSets)
        .set({ contentConfig } as any)
        .where(eq(dataSets.id, datasetId));

    // 4. Fetch all existing entries
    const entries = await db
        .select()
        .from(dataEntries)
        .where(eq(dataEntries.dataSetId, datasetId));

    // 5. Create content_metadata for each entry (skip if already exists)
    let created = 0;
    for (const entry of entries) {
        // Check if metadata already exists
        const [existing] = await db
            .select({ id: contentMetadata.id })
            .from(contentMetadata)
            .where(eq(contentMetadata.entryId, entry.id))
            .limit(1);

        if (existing) continue;

        const entrySlug = `${config.slugPrefix}-${slugify(entry.title)}-${entry.id.slice(0, 8)}`;

        await db.insert(contentMetadata).values({
            entryId: entry.id,
            slug: entrySlug,
            publishedAt: entry.status === "published" ? new Date() : null,
            seoMetadata: {
                title: entry.title + (config.defaultSeoTemplate?.titleSuffix || ""),
            },
        });
        created++;
    }

    return {
        promoted: true,
        datasetId,
        entriesPromoted: created,
        totalEntries: entries.length,
        contentConfig,
    };
}

/**
 * Demote a dataset back to raw BaaS data.
 * Removes all content_metadata rows and clears contentConfig.
 */
export async function demoteDataset(datasetId: string) {
    // 1. Verify dataset exists
    const [dataset] = await db
        .select()
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);

    if (!dataset) return null;

    // 2. Find all entries for this dataset
    const entries = await db
        .select({ id: dataEntries.id })
        .from(dataEntries)
        .where(eq(dataEntries.dataSetId, datasetId));

    // 3. Delete content_metadata rows for these entries
    let removed = 0;
    for (const entry of entries) {
        const [deleted] = await db
            .delete(contentMetadata)
            .where(eq(contentMetadata.entryId, entry.id))
            .returning();
        if (deleted) removed++;
    }

    // 4. Clear contentConfig on dataset
    await db
        .update(dataSets)
        .set({ contentConfig: null } as any)
        .where(eq(dataSets.id, datasetId));

    return {
        demoted: true,
        datasetId,
        entriesDemoted: removed,
    };
}

/**
 * Get promotion status for a dataset.
 */
export async function getPromotionStatus(datasetId: string) {
    const [dataset] = await db
        .select({
            id: dataSets.id,
            name: dataSets.name,
            slug: dataSets.slug,
            contentConfig: dataSets.contentConfig,
        })
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);

    if (!dataset) return null;

    const config = dataset.contentConfig as ContentConfig | null;
    return {
        datasetId: dataset.id,
        name: dataset.name,
        promoted: config?.promoted ?? false,
        contentConfig: config,
    };
}

// ═══════════════════════════════════════════════
// Content Queries
// ═══════════════════════════════════════════════

/**
 * List entries for a promoted dataset, joined with CMS metadata.
 */
export async function getContentEntries(datasetId: string, limit = 100) {
    const rows = await db
        .select({
            entry: dataEntries,
            meta: contentMetadata,
        })
        .from(dataEntries)
        .leftJoin(contentMetadata, eq(dataEntries.id, contentMetadata.entryId))
        .where(eq(dataEntries.dataSetId, datasetId))
        .orderBy(desc(dataEntries.updatedAt))
        .limit(Math.min(limit, 500));

    return rows.map((r) => ({
        ...r.entry,
        contentMeta: r.meta || null,
    }));
}

/**
 * Public slug lookup — returns published content only.
 */
export async function getContentBySlug(slug: string) {
    const [row] = await db
        .select({
            entry: dataEntries,
            meta: contentMetadata,
        })
        .from(contentMetadata)
        .innerJoin(dataEntries, eq(contentMetadata.entryId, dataEntries.id))
        .where(
            and(
                eq(contentMetadata.slug, slug),
                eq(dataEntries.status, "published"),
                isNotNull(contentMetadata.publishedAt)
            )
        )
        .limit(1);

    if (!row) return null;

    // Fetch related dataset info for context
    const [dataset] = await db
        .select({ name: dataSets.name, slug: dataSets.slug })
        .from(dataSets)
        .where(eq(dataSets.id, row.entry.dataSetId))
        .limit(1);

    // Fetch featured image if set
    let featuredImage = null;
    if (row.meta.featuredImageId) {
        const [img] = await db
            .select()
            .from(media)
            .where(eq(media.id, row.meta.featuredImageId))
            .limit(1);
        featuredImage = img || null;
    }

    // Fetch author if set
    let author = null;
    if (row.meta.authorId) {
        const [usr] = await db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(eq(user.id, row.meta.authorId))
            .limit(1);
        author = usr || null;
    }

    return {
        ...row.entry,
        contentMeta: {
            ...row.meta,
            featuredImage,
            author,
        },
        dataset: dataset || null,
    };
}

// ═══════════════════════════════════════════════
// Content Metadata CRUD
// ═══════════════════════════════════════════════

/**
 * Update CMS metadata for a promoted entry.
 */
export async function updateContentMeta(
    entryId: string,
    data: Partial<{
        slug: string;
        publishedAt: string | null;
        seoMetadata: SeoMetadata | null;
        featuredImageId: string | null;
        authorId: string | null;
    }>
) {
    const updates: Record<string, any> = {};
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.publishedAt !== undefined) {
        updates.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
    }
    if (data.seoMetadata !== undefined) updates.seoMetadata = data.seoMetadata;
    if (data.featuredImageId !== undefined) updates.featuredImageId = data.featuredImageId;
    if (data.authorId !== undefined) updates.authorId = data.authorId;

    const [updated] = await db
        .update(contentMetadata)
        .set(updates)
        .where(eq(contentMetadata.entryId, entryId))
        .returning();

    return updated || null;
}
