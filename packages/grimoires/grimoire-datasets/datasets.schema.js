// @ts-nocheck
/**
 * DataSets Schema
 *
 * Drizzle ORM schema for dynamic data collections.
 */
import { pgTable, uuid, varchar, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
/**
 * Data Sets - Collection definitions
 */
export const dataSets = pgTable("data_sets", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }),
    // Schema definition (fields, types, validation)
    schema: jsonb("schema").default({ fields: [] }),
    // Display configuration
    displayConfig: jsonb("display_config"),
    // RLS Policy
    policyJson: jsonb("policy_json"),
    // Workflow configuration
    workflowJson: jsonb("workflow_json"),
    // Relations
    gameId: uuid("game_id"),
    // Metadata
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
/**
 * Data Entries - Actual data records
 */
export const dataEntries = pgTable("data_entries", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    // Relation to dataset
    dataSetId: uuid("data_set_id").notNull().references(() => dataSets.id, { onDelete: "cascade" }),
    // The actual data (JSONB)
    data: jsonb("data").default({}),
    // Status
    status: varchar("status", { length: 50 }).default("published"),
    // Sorting
    sortOrder: integer("sort_order").default(0),
    // Media
    thumbnailId: uuid("thumbnail_id"),
    // Metadata
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    // Audit
    createdById: text("created_by_id"),
    updatedById: text("updated_by_id"),
});
//# sourceMappingURL=datasets.schema.js.map