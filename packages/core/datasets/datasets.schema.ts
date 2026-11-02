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

  /**
   * Definicion de campos del dataset.
   *
   * El `$type<>` viene de `apps/api/src/db/schema-core.ts`, que era la otra
   * declaracion de esta tabla. Al unificar en un solo origen habia que
   * quedarse con la version MAS tipada de cada campo: sin el, `schema` es
   * `unknown` y el agregador de OpenAPI —que genera la documentacion de la API
   * a partir de estos campos— deja de compilar.
   *
   * Perder tipos al deduplicar es la forma silenciosa de estropear una
   * unificacion: compila, corre, y el codigo que dependia del tipo se queda con
   * `unknown` y casts.
   */
  schema: jsonb("schema")
    .$type<
      Array<{
        fieldName: string;
        fieldType: string;
        required?: boolean;
        options?: string;
        defaultValue?: string;
      }>
    >()
    .default([]),

  // Display configuration
  displayConfig: jsonb("display_config"),

  // RLS Policy
  policyJson: jsonb("policy_json"),

  // Workflow configuration
  workflowJson: jsonb("workflow_json"),

  /**
   * Configuración de publicación de contenido.
   *
   * Existe en la base desde la migración inicial y este módulo NO la declaraba:
   * la declaraba solo `apps/api/src/db/schema-core.ts`. O sea que la mitad del
   * código veía una columna que la otra mitad ignoraba, y ninguna de las dos
   * fallaba — simplemente cada una trabajaba con una tabla distinta.
   */
  contentConfig: jsonb("content_config"),

  // Relations
  gameId: uuid("game_id"),

  /**
   * Procedencia: de dónde salieron estos datos y bajo qué términos.
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Todo opcional: un dataset que alguien escribe a mano no tiene fuente, y
   * obligar a inventarse una sería peor que dejarla vacía.
   *
   * Importa cuando el dataset viene de FUERA. Un catálogo importado sin esto
   * es un misterio a los tres meses: nadie sabe si los números son del parche
   * actual, de dónde se sacaron ni si se pueden republicar. Es justo lo que no
   * publican los sitios que hacen esto mismo — y es barato tenerlo.
   */
  sourceName: varchar("source_name", { length: 300 }),
  sourceUrl: text("source_url"),
  /** Términos en texto largo, no un identificador de licencia. */
  sourceLicense: text("source_license"),
  /** Versión o parche del origen: `1_4`, `3.1`. */
  sourceVersion: varchar("source_version", { length: 60 }),
  /** Cuándo se descargó. Distinto de `updatedAt`, que es cuándo se tocó aquí. */
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  /** Avisos que traía el volcado: datos sin verificar, huecos declarados. */
  sourceCaveats: jsonb("source_caveats").default([]),

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
  dataSetId: uuid("data_set_id")
    .notNull()
    .references(() => dataSets.id, { onDelete: "cascade" }),

  // The actual data (JSONB)
  /**
   * El contenido de la entrada.
   *
   * El `$type<>` y el `notNull()` vienen de la otra declaracion de esta tabla,
   * la que habia en `apps/api/src/db/schema-core.ts`. Al unificar hay que
   * quedarse con la version que dice la VERDAD sobre la base, y en los dos
   * casos era aquella:
   *
   *   · Sin `$type`, `entry.data` es `unknown` y todo el codigo que lo lee
   *     necesita un cast.
   *   · Sin `notNull`, es `Record | null` — pero la columna es `jsonb NOT NULL`
   *     desde la migracion inicial, asi que ese `null` no puede ocurrir y
   *     obligaba a comprobarlo en cada uso.
   *
   * Perder tipado "por deduplicar" es la forma silenciosa de estropear una
   * unificacion: compila, corre, y el codigo se llena de casts.
   */
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),

  /**
   * Dueño de la fila. Lo usa RLS para aislar por usuario.
   *
   * Existe en la base desde el principio y este módulo no lo declaraba, así que
   * las consultas de datasets no podían filtrar por dueño ni escribirlo. No es
   * lo mismo que `createdById`: eso es quién la escribió, esto es de quién es.
   */
  ownerId: text("owner_id"),

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

// Types
export type DataSet = typeof dataSets.$inferSelect;
export type DataEntry = typeof dataEntries.$inferSelect;
export type NewDataSet = typeof dataSets.$inferInsert;
export type NewDataEntry = typeof dataEntries.$inferInsert;

// Field definition type
export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "select"
    | "multiselect"
    | "relation"
    | "image"
    | "file"
    | "richtext"
    | "json";
  required?: boolean;
  unique?: boolean;
  defaultValue?: any;
  options?: { label: string; value: any }[];
  relation?: {
    table: string;
    field: string;
    displayField: string;
  };
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

// Policy types
export type RLSType = "admin" | "public" | "authenticated";

export interface RLSRule {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt";
  value: string;
}

export interface PolicyJson {
  readAccess: RLSType;
  writeAccess: RLSType;
  enableRLS: boolean;
  rlsRules?: RLSRule[];
}
