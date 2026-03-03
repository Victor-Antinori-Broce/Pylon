/**
 * DMS — Schema & Validators
 *
 * Drizzle ORM table definitions for `documents` and `document_versions`,
 * and Zod schemas for all request bodies.
 *
 * The `document_versions.is_active` flag implements the "Black Box" pattern:
 * only ONE version is active at a time; superseded versions are flagged but
 * never deleted.
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    boolean,
    timestamp,
    integer,
    pgEnum,
    index,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────

export const documentStatusEnum = pgEnum("document_status", ["DRAFT", "APPROVED"]);
export const versionStatusEnum = pgEnum("version_status", ["active", "superseded"]);

// ── Tables ────────────────────────────────────────────────────

export const documents = pgTable(
    "documents",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        title: varchar("title", { length: 300 }).notNull(),
        targetDepartment: varchar("target_department", { length: 200 }).notNull(),
        status: documentStatusEnum("status").notNull().default("DRAFT"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("docs_status_idx").on(t.status)]
);

export const documentVersions = pgTable(
    "document_versions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        documentId: uuid("document_id")
            .notNull()
            .references(() => documents.id, { onDelete: "cascade" }),
        /** Semantic version string, e.g. "v1.0", "v1.1", "v2.0" */
        versionNumber: varchar("version_number", { length: 20 }).notNull(),
        fileUrl: text("file_url").notNull(),
        /** True only for the current active version (Black Box pattern) */
        isActive: boolean("is_active").notNull().default(true),
        versionStatus: versionStatusEnum("version_status").notNull().default("active"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("dv_document_idx").on(t.documentId),
        index("dv_active_idx").on(t.documentId, t.isActive),
    ]
);

// ── TypeScript Types ──────────────────────────────────────────

export type Document = typeof documents.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type NewVersion = typeof documentVersions.$inferInsert;

// ── Zod Validators ────────────────────────────────────────────

export const newVersionSchema = z.object({
    version_number: z.string().min(1, "version_number is required").max(20),
    file_url: z.string().url("file_url must be a valid URL"),
});

export type NewVersionInput = z.infer<typeof newVersionSchema>;

// ── User context injected by the controller ───────────────────

export interface UserContext {
    userId: string;
    role: "employee" | "manager" | "admin";
    department: string;
}
