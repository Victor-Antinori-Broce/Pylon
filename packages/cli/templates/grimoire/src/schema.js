/**
 * Drizzle schema for grimoire-example.
 *
 * This file is automatically discovered by the schema-merger
 * and merged into the global schema at runtime.
 */
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
export const exampleItems = pgTable("example_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
//# sourceMappingURL=schema.js.map
