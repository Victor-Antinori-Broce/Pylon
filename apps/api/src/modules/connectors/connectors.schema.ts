/**
 * Data Connectors — Schema
 *
 * Stores connector configurations for external data sources.
 * Two types: `api` (remote JSON endpoints) and `database` (MySQL/MariaDB introspection).
 */

import {
    pgTable,
    pgEnum,
    uuid,
    varchar,
    boolean,
    timestamp,
    jsonb,
    index,
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────

export const connectorTypeEnum = pgEnum("connector_type", [
    "api",
    "database",
]);

// ── Config Types ──────────────────────────────────────────────

export interface ApiConnectorConfig {
    url: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: any;
    /** JSONPath-like dot notation to reach the data array, e.g. "data.items" */
    dataPath?: string;
}

export interface DbConnectorConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl?: boolean;
}

export type ConnectorConfig = ApiConnectorConfig | DbConnectorConfig;

// ── Tables ────────────────────────────────────────────────────

export const dataConnectors = pgTable(
    "data_connectors",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: varchar("name", { length: 200 }).notNull(),
        type: connectorTypeEnum("type").notNull(),
        config: jsonb("config").notNull().$type<ConnectorConfig>(),
        lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
        enabled: boolean("enabled").notNull().default(true),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [index("connectors_type_idx").on(t.type)]
);

// ── Types ─────────────────────────────────────────────────────

export type DataConnector = typeof dataConnectors.$inferSelect;
export type NewDataConnector = typeof dataConnectors.$inferInsert;
