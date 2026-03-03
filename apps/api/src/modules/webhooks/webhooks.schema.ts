/**
 * Webhooks Engine — Schema
 *
 * Two tables:
 *   - webhooks_config: user-defined webhook subscriptions
 *   - webhooks_log:    delivery audit trail
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    boolean,
    integer,
    timestamp,
    jsonb,
    pgEnum,
    index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { dataSets } from "../../db/schema";

// ── Enums ─────────────────────────────────────────────────────

export const webhookEventEnum = pgEnum("webhook_event", [
    "on_create",
    "on_update",
    "on_delete",
]);

// ── Tables ────────────────────────────────────────────────────

export const webhooksConfig = pgTable(
    "webhooks_config",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: varchar("name", { length: 200 }).notNull(),
        datasetId: uuid("dataset_id")
            .notNull()
            .references(() => dataSets.id, { onDelete: "cascade" }),
        event: webhookEventEnum("event").notNull(),
        targetUrl: text("target_url").notNull(),
        secret: varchar("secret", { length: 255 }),
        enabled: boolean("enabled").default(true).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        index("wh_config_dataset_idx").on(t.datasetId),
        index("wh_config_event_idx").on(t.event),
    ]
);

export const webhooksLog = pgTable(
    "webhooks_log",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        webhookId: uuid("webhook_id")
            .notNull()
            .references(() => webhooksConfig.id, { onDelete: "cascade" }),
        event: varchar("event", { length: 50 }).notNull(),
        payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
        statusCode: integer("status_code"),
        responseBody: text("response_body"),
        success: boolean("success").notNull(),
        attemptedAt: timestamp("attempted_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
        durationMs: integer("duration_ms"),
    },
    (t) => [
        index("wh_log_webhook_idx").on(t.webhookId),
        index("wh_log_attempted_idx").on(t.attemptedAt),
    ]
);

// ── Relations ─────────────────────────────────────────────────

export const webhooksConfigRelations = relations(webhooksConfig, ({ one, many }) => ({
    dataset: one(dataSets, {
        fields: [webhooksConfig.datasetId],
        references: [dataSets.id],
    }),
    logs: many(webhooksLog),
}));

export const webhooksLogRelations = relations(webhooksLog, ({ one }) => ({
    webhook: one(webhooksConfig, {
        fields: [webhooksLog.webhookId],
        references: [webhooksConfig.id],
    }),
}));

// ── Types ─────────────────────────────────────────────────────

export type WebhookConfig = typeof webhooksConfig.$inferSelect;
export type NewWebhookConfig = typeof webhooksConfig.$inferInsert;
export type WebhookLog = typeof webhooksLog.$inferSelect;
