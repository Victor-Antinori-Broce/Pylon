/**
 * Example Grimoire — Database Schema
 *
 * Standard Drizzle ORM schema for a npm-published grimoire.
 * Use migrations/ for production DDL to avoid enum conflicts.
 */
import { pgTable, uuid, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";
export const examples = pgTable("examples", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    description: text("description"),
    metadata: jsonb("metadata").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
//# sourceMappingURL=schema.js.map