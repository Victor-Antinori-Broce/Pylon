/**
 * Promote to Content — Schema
 *
 * 1:1 overlay table that adds CMS editorial fields to raw data_entries.
 * Non-destructive: promoting creates overlay rows, demoting deletes them.
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    jsonb,
    uniqueIndex,
    index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { dataEntries, media, authUsers as user } from "../../db/schema";

// ── SEO Metadata Type ────────────────────────────────────────

export interface SeoMetadata {
    title?: string;
    description?: string;
    ogImage?: string;
    canonical?: string;
    noIndex?: boolean;
}

// ── Content Config Type (stored on dataSets.contentConfig) ───

export interface ContentConfig {
    promoted: boolean;
    promotedAt: string;
    slugPrefix: string;
    defaultSeoTemplate?: {
        titleSuffix?: string;
        descriptionField?: string;
    };
}

// ── Tables ────────────────────────────────────────────────────

export const contentMetadata = pgTable(
    "content_metadata",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        entryId: uuid("entry_id")
            .notNull()
            .references(() => dataEntries.id, { onDelete: "cascade" }),
        slug: varchar("slug", { length: 500 }).notNull(),
        publishedAt: timestamp("published_at", { withTimezone: true }),
        seoMetadata: jsonb("seo_metadata").$type<SeoMetadata>(),
        featuredImageId: uuid("featured_image_id").references(() => media.id, {
            onDelete: "set null",
        }),
        authorId: text("author_id").references(() => user.id, {
            onDelete: "set null",
        }),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        uniqueIndex("cm_entry_unique").on(t.entryId),
        uniqueIndex("cm_slug_unique").on(t.slug),
        index("cm_published_idx").on(t.publishedAt),
    ]
);

// ── Relations ─────────────────────────────────────────────────

export const contentMetadataRelations = relations(contentMetadata, ({ one }) => ({
    entry: one(dataEntries, {
        fields: [contentMetadata.entryId],
        references: [dataEntries.id],
    }),
    featuredImage: one(media, {
        fields: [contentMetadata.featuredImageId],
        references: [media.id],
    }),
    author: one(user, {
        fields: [contentMetadata.authorId],
        references: [user.id],
    }),
}));

// ── Types ─────────────────────────────────────────────────────

export type ContentMeta = typeof contentMetadata.$inferSelect;
export type NewContentMeta = typeof contentMetadata.$inferInsert;
