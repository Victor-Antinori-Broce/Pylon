/**
 * DataSets Calculated Fields - Database Schema
 *
 * Schema de Drizzle ORM para almacenar campos calculados de DataSets.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

import { dataSets } from "./datasets.schema";

/**
 * Calculated Fields - Fórmulas y KPIs por dataset
 */
export const dataSetCalculatedFields = pgTable("data_set_calculated_fields", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relación al dataset
  dataSetId: uuid("data_set_id")
    .notNull()
    .references(() => dataSets.id, { onDelete: "cascade" }),

  // Identificación
  name: varchar("name", { length: 100 }).notNull(), // Nombre técnico
  label: varchar("label", { length: 200 }).notNull(), // Label para UI

  // Tipo de cálculo
  type: varchar("type", { length: 50 }).notNull(), // formula, count, sum, avg, etc.

  // Configuración del cálculo (JSON)
  config: jsonb("config").default({}),

  // Formato de salida
  format: jsonb("format"),

  // Dependencias
  dependsOn: jsonb("depends_on").$type<string[]>().default([]),

  // Metadata KPI
  description: text("description"),
  category: varchar("category", { length: 100 }),
  isKpi: boolean("is_kpi").default(false),
  target: integer("target"),
  warningThreshold: integer("warning_threshold"),

  // Estado
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdById: text("created_by_id"),
});

// Types
export type DataSetCalculatedField = typeof dataSetCalculatedFields.$inferSelect;
export type NewDataSetCalculatedField = typeof dataSetCalculatedFields.$inferInsert;
