/**
 * Kitsuden - Core Database Schema (Domain-Agnostic)
 *
 * Infrastructure tables only. No gaming/blog/streamer domain tables.
 * Domain tables live in their respective kons:
 *   - kon-games: games, platforms, tags, collections
 *   - kon-blog: blog_posts
 *   - kon-streamers: streamers
 *
 * This schema is the base for schema-merger.ts which combines it
 * with active kon schemas at runtime.
 */

import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  real,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  customType,
  date,
  primaryKey,
  bigint,
} from "drizzle-orm/pg-core";

// ─── Block Type (shared with admin + web) ─────────────────────
export interface PageBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
  order: number;
}

// ═══════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════

export const contentStatusEnum = pgEnum("content_status", ["draft", "published", "archived"]);

export const userRoleEnum = pgEnum("user_role", ["admin", "editor", "user"]);

// ═══════════════════════════════════════════════
// Auth Tables (Better-Auth compatible)
// ═══════════════════════════════════════════════

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccounts = pgTable("auth_accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authVerifications = pgTable("auth_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════
// API Keys (Machine Auth)
// ═══════════════════════════════════════════════

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  keyHash: text("key_hash").notNull(),
  hint: varchar("hint", { length: 20 }).notNull(), // e.g. "kitsuden_sk_...xyz1"
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdById: text("created_by_id")
    .references(() => authUsers.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════
// Core Tables
// ═══════════════════════════════════════════════

// ── Media, DataSets y DataEntries ──
//
// ═══════════════════════════════════════════════════════════════════════════
// Estas tres tablas NO se declaran aquí: se reexportan desde packages/core.
// ═══════════════════════════════════════════════════════════════════════════
//
// Antes estaban declaradas en los DOS sitios, y habían derivado. No en teoría:
//
//   · La migración 0031 renombró `url→public_url`, `alt→alt_text` y
//     `uploaded_by_id→created_by_id` en `media`. `packages/core/media` se
//     actualizó; ESTE fichero no. Su tabla `media` llevaba rota desde entonces:
//     cualquier consulta a través de ella pedía columnas que ya no existen.
//   · `data_sets.content_config` solo lo declaraba este fichero.
//   · `data_entries.owner_id` —el que usa RLS— solo lo declaraba este fichero.
//
// O sea que cada mitad del código trabajaba con una tabla distinta, y ninguna
// de las dos fallaba de forma visible: simplemente cada una veía columnas que
// la otra ignoraba.
//
// Con un solo origen eso no puede volver a pasar. Las relaciones de más abajo
// siguen funcionando porque referencian estos mismos objetos.
export { media, mediaFolders } from "../../../../packages/core/media/media.schema";
export { dataSets, dataEntries } from "../../../../packages/core/datasets/datasets.schema";

import { media, mediaFolders } from "../../../../packages/core/media/media.schema";
import { dataSets, dataEntries } from "../../../../packages/core/datasets/datasets.schema";

// ── Site Settings (singleton) ──
export const siteSettings = pgTable("site_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteName: varchar("site_name", { length: 200 }).default("Kitsuden").notNull(),
  siteDescription: text("site_description"),
  siteUrl: text("site_url").default("http://localhost:4321").notNull(),
  branding: jsonb("branding").$type<{
    logoId?: string;
    faviconId?: string;
    ogImageId?: string;
    primaryColor?: string;
    accentColor?: string;
  }>(),
  mainNav: jsonb("main_nav").$type<Array<{ label: string; url: string; openInNewTab?: boolean }>>(),
  /**
   * Redes del GRUPO, configurables desde el panel: son el mismo juego en las
   * varias webs, así que viven aquí y no en el
   * entorno de cada plantilla. Lo que el panel no tenga, cada web puede
   * seguir supliendo por entorno (lee `lib/perfil.ts` del template).
   *
   *   · `twitch` es el LOGIN del canal (el de la URL), no la URL entera:
   *     el endpoint de estado en vivo lo consulta directo en helix.
   *   · Las credenciales de la API de Twitch NO van aquí: son secretos de
   *     servidor y viven en `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`
   *     (ver `src/services/twitch.ts`).
   *   · `youtubeChannels` es la lista de canales del grupo: el id del canal
   *     (el del feed RSS) y el nombre que se pinta en cada ficha. El
   *     `youtube` suelto se mantiene por compatibilidad con lo ya guardado.
   */
  social: jsonb("social").$type<{
    twitter?: string;
    discord?: string;
    youtube?: string;
    youtubeChannels?: Array<{ id: string; nombre: string }>;
    twitch?: string;
    instagram?: string;
    tiktok?: string;
    /** La segunda cuenta de TikTok del grupo */
    tiktok2?: string;
    facebook?: string;
    /** El grupo de Facebook de la comunidad (se puede insertar como bloque en una entrada) */
    facebookGroup?: string;
    /** El grupo de WhatsApp (invitación chat.whatsapp.com), junto al de Facebook en las entradas */
    whatsappGroup?: string;
    pinterest?: string;
    kofi?: string;
    github?: string;
  }>(),
  analytics: jsonb("analytics").$type<{
    googleAnalyticsId?: string;
    plausibleDomain?: string;
  }>(),
  activeTheme: varchar("active_theme", { length: 100 }),
  footerText: text("footer_text"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * KPIs sobre datasets — NO son fórmulas de juego.
 *
 * Se llamaba `formulas`, y con la llegada de `kon-formulas` —el evaluador de
 * fórmulas de juego que usan builders, calculadoras y simuladores— el nombre
 * designaba dos cosas distintas. Renombrada en la migración 0030 a lo que de
 * verdad es: los KPIs del DatasetCreator (`totals, averages, or custom
 * formulas`, en sus propias palabras).
 *
 * ADVERTENCIA: la tabla está HUÉRFANA. Ningún código la lee ni la escribe;
 * solo la declara este schema. Está aquí para no romper bases de datos que ya
 * la tengan. Si el DatasetCreator nunca va a persistir sus KPIs aquí, lo
 * honesto es borrarla — pero eso es una decisión de producto.
 */
export const datasetKpis = pgTable("dataset_kpis", {
  id: uuid("id").primaryKey().defaultRandom(),
  kpiName: varchar("kpi_name", { length: 200 }).notNull(),
  formulaType: varchar("formula_type", { length: 50 }).notNull().default("custom"),
  expression: text("expression").notNull(),
  threshold: real("threshold").default(95.0),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════
// Kons & Grimoires (Module Registry)
// ═══════════════════════════════════════════════

// ── Kon Source Enum ──
export const konSourceEnum = pgEnum("kon_source", [
  "local",
  "npm",
  "github",
  "marketplace",
  "legacy",
]);

// ── Modules (Plugin/Kon Registry) ──
export const modules = pgTable("modules", {
  key: varchar("key", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  category: varchar("category", { length: 100 }),
  enabled: boolean("enabled").default(false).notNull(),
  // Grimoire ID - null for standalone kons, set for grimoire-specific modules
  grimoireId: varchar("grimoire_id", { length: 100 }),
  settings: jsonb("settings").default({}).$type<Record<string, unknown>>(),
  sidebarPath: varchar("sidebar_path", { length: 200 }),
  sidebarIcon: varchar("sidebar_icon", { length: 50 }),
  sidebarBadge: varchar("sidebar_badge", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Installed Kons (from npm/marketplace) ──
export const installedKons = pgTable(
  "installed_kons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    konId: varchar("kon_id", { length: 200 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    version: varchar("version", { length: 50 }).notNull(),
    source: konSourceEnum("source").notNull().default("local"),
    sourceUrl: text("source_url"), // npm package name, git url, etc.
    path: text("path").notNull(), // Filesystem path
    manifest: jsonb("manifest"), // Full kon.json content
    config: jsonb("config").default({}), // Plugin-specific config
    enabled: boolean("enabled").notNull().default(true),
    installedById: text("installed_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("installed_kon_id_idx").on(t.konId)]
);

// ═══════════════════════════════════════════════
// Kitsuden Workers (Cloud Functions / Serverless)
// ═══════════════════════════════════════════════

export const functionTriggerEnum = pgEnum("function_trigger", [
  "on_entry_created",
  "on_entry_updated",
  "on_entry_deleted",
  "on_post_published",
  "cron",
  "manual",
  "webhook_incoming",
]);

export const functionStatusEnum = pgEnum("function_status", ["active", "inactive", "error"]);

export const executionStatusEnum = pgEnum("execution_status", [
  "pending",
  "running",
  "success",
  "error",
  "timeout",
  "killed",
]);

export const kitsudenFunctions = pgTable(
  "kitsuden_functions", // Legacy table name preserved for migration compat
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    /** The user's JS/TS source code */
    code: text("code").notNull(),
    /** Trigger type */
    trigger: functionTriggerEnum("trigger").notNull(),
    // Cron expression (only for trigger=cron), e.g. "0 */5 * * *"
    cronExpression: varchar("cron_expression", { length: 100 }),
    /** Dataset ID to watch (only for on_entry_* triggers) */
    watchDatasetId: uuid("watch_dataset_id").references(() => dataSets.id, {
      onDelete: "set null",
    }),
    /** Max execution time in ms (default 5000) */
    timeoutMs: integer("timeout_ms").default(5000).notNull(),
    /** Max memory in MB (default 64) */
    memoryLimitMb: integer("memory_limit_mb").default(64).notNull(),
    /** Whether this function is active */
    status: functionStatusEnum("status").default("active").notNull(),
    /** Environment variables available to the function (encrypted at rest) */
    envVars: jsonb("env_vars").default({}).$type<Record<string, string>>(),
    /** Runtime metadata */
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }),
    lastError: text("last_error"),
    executionCount: integer("execution_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    /** Who created it */
    createdById: text("created_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("pf_slug_idx").on(t.slug),
    index("pf_trigger_idx").on(t.trigger),
    index("pf_status_idx").on(t.status),
    index("pf_dataset_idx").on(t.watchDatasetId),
  ]
);

export const functionExecutions = pgTable(
  "function_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    functionId: uuid("function_id")
      .references(() => kitsudenFunctions.id, { onDelete: "cascade" })
      .notNull(),
    status: executionStatusEnum("status").default("pending").notNull(),
    /** Trigger event that caused the execution */
    triggerEvent: varchar("trigger_event", { length: 100 }),
    /** Payload that was passed to the function */
    triggerPayload: jsonb("trigger_payload").$type<Record<string, unknown>>(),
    /** Captured console.log output */
    logs: text("logs"),
    /** Return value from the function */
    result: jsonb("result").$type<unknown>(),
    /** Error message if failed */
    errorMessage: text("error_message"),
    /** Execution duration in ms */
    durationMs: integer("duration_ms"),
    /** Memory used in bytes */
    memoryUsedBytes: integer("memory_used_bytes"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("fe_function_idx").on(t.functionId),
    index("fe_status_idx").on(t.status),
    index("fe_created_idx").on(t.createdAt),
  ]
);

// Relations
export const kitsudenFunctionsRelations = relations(kitsudenFunctions, ({ one, many }) => ({
  createdBy: one(authUsers, {
    fields: [kitsudenFunctions.createdById],
    references: [authUsers.id],
  }),
  watchDataset: one(dataSets, {
    fields: [kitsudenFunctions.watchDatasetId],
    references: [dataSets.id],
  }),
  executions: many(functionExecutions),
}));

export const functionExecutionsRelations = relations(functionExecutions, ({ one }) => ({
  function: one(kitsudenFunctions, {
    fields: [functionExecutions.functionId],
    references: [kitsudenFunctions.id],
  }),
}));

// ═══════════════════════════════════════════════
// Actions (Unified Action System)
// ═══════════════════════════════════════════════

export const actionTypeEnum = pgEnum("action_type", ["code", "webhook_out", "webhook_in", "agent"]);

export const actionTriggerEnum = pgEnum("action_trigger", ["manual", "cron", "event", "http"]);

export const actionStatusEnum = pgEnum("action_status", ["active", "paused", "error"]);

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    type: actionTypeEnum("type").notNull(),
    trigger: actionTriggerEnum("trigger").notNull(),
    triggerConfig: jsonb("trigger_config")
      .$type<{
        cronExpression?: string;
        eventName?: string;
        datasetId?: string;
        httpMethod?: string;
        httpPath?: string;
      }>()
      .default({}),
    config: jsonb("config").default({}),
    status: actionStatusEnum("status").default("active").notNull(),
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }),
    lastError: text("last_error"),
    executionCount: integer("execution_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    createdById: text("created_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    // Legacy migration tracking (optional)
    legacyId: uuid("legacy_id"), // For tracking migrated functions/webhooks
    legacyType: varchar("legacy_type", { length: 50 }), // "function" | "webhook"
  },
  (t) => [
    uniqueIndex("actions_slug_idx").on(t.slug),
    index("actions_type_idx").on(t.type),
    index("actions_trigger_idx").on(t.trigger),
    index("actions_status_idx").on(t.status),
    index("actions_legacy_idx").on(t.legacyId, t.legacyType),
  ]
);

export const actionExecutions = pgTable(
  "action_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionId: uuid("action_id")
      .references(() => actions.id, { onDelete: "cascade" })
      .notNull(),
    status: executionStatusEnum("status").default("pending").notNull(),
    triggerType: actionTriggerEnum("trigger_type"),
    triggerEvent: varchar("trigger_event", { length: 100 }),
    triggerPayload: jsonb("trigger_payload"),
    httpRequest: jsonb("http_request"),
    logs: text("logs"),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    memoryUsedBytes: integer("memory_used_bytes"),
    httpResponse: jsonb("http_response"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ae_action_idx").on(t.actionId),
    index("ae_status_idx").on(t.status),
    index("ae_created_idx").on(t.createdAt),
  ]
);

// Custom vector type for pgvector (used by agent_memory.embedding and brain_notes.embedding)
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimension: number };
}>({
  dataType(config) {
    return `vector(${config?.dimension ?? 1536})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (typeof value === "string") {
      return value.slice(1, -1).split(",").map(Number);
    }
    return value as number[];
  },
});

// ═══════════════════════════════════════════════
// Agent System (NHI - Non-Human Identities)
// ═══════════════════════════════════════════════

export const agentTraceStatusEnum = pgEnum("agent_trace_status", [
  "pending",
  "running",
  "success",
  "error",
  "cancelled",
]);

export const agentTraceStepTypeEnum = pgEnum("agent_trace_step_type", [
  "llm_call",
  "tool_call",
  "tool_result",
  "thinking",
  "retrieval",
  "memory_read",
  "memory_write",
  "user_input",
  "system",
  "error",
]);

export const agentIdentities = pgTable(
  "agent_identities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").default("custom").notNull(),
    scopes: jsonb("scopes").default([]),
    rateLimit: integer("rate_limit").default(60),
    /** Cuotas por día UTC (fase E). NULL = sin límite. Ver lib/cuotas-de-agente.ts. */
    writesPerDay: integer("writes_per_day"),
    budgetUnitsPerDay: integer("budget_units_per_day"),
    capabilities: jsonb("capabilities").default([]),
    systemPrompt: text("system_prompt"),
    allowedTools: jsonb("allowed_tools").default([]),
    /**
     * Fase F: aprobación humana. `inherit` (decide el interruptor global),
     * `propose` (todo lo que escribe queda como propuesta) o `direct` (nunca).
     * Ver lib/aprobaciones.ts y docs/agents/approvals.md.
     */
    approvalMode: text("approval_mode").default("inherit").notNull(),
    /**
     * Fase F (decisión del propietario): la cuenta humana que FIRMA lo que el
     * agente crea (autor del blog, dueño de entradas). NULL = sin firmante. Sin
     * FK a propósito (migración 0049): borrada la cuenta, el agente sabe que
     * su firmante ya no vale. Ver @kitsuden/shared firmante.ts.
     */
    sponsorUserId: text("sponsor_user_id"),
    /**
     * Ajustes MCP del agente (migración 0052, lib/ajustes-mcp.ts): `toolset` por
     * defecto y `untrustedWrap`. `{}` = lo de siempre.
     */
    mcpSettings: jsonb("mcp_settings").default({}).notNull(),
    /**
     * Fase I (migración 0053, lib/promocion.ts): cómo se promociona el código
     * que escribe. `suggestion` (de fábrica) o `turbo`. Ver docs/agents/promotion.md.
     */
    promotionMode: text("promotion_mode").default("suggestion").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_identities_name_idx").on(t.name),
    index("agent_identities_created_at_idx").on(t.createdAt),
  ]
);

export const agentApiKeys = pgTable(
  "agent_api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id")
      .references(() => agentIdentities.id, { onDelete: "cascade" })
      .notNull(),
    keyId: text("key_id").unique(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    algorithm: text("algorithm").default("argon2id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Fase E: nombre para humanos («producción», «CI»…). */
    name: text("name"),
    /** Fase E: revocada (deja de autenticar en la siguiente petición; la fila queda para auditar). */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
    /** Fase E: la clave que esta sustituyó al rotar (la vieja caduca tras la gracia). */
    rotatedFrom: text("rotated_from"),
  },
  (t) => [
    index("agent_api_keys_agent_id_idx").on(t.agentId),
    uniqueIndex("agent_api_keys_hash_idx").on(t.keyHash),
    uniqueIndex("agent_api_keys_key_id_idx").on(t.keyId),
    index("agent_api_keys_expires_at_idx").on(t.expiresAt),
  ]
);

/**
 * Consumo diario de cuota de cada agente: la RESERVA cuando Valkey no está
 * (fase E, lib/cuotas-de-agente.ts). Día en UTC.
 */
export const agentQuotaUsage = pgTable(
  "agent_quota_usage",
  {
    agentId: text("agent_id")
      .references(() => agentIdentities.id, { onDelete: "cascade" })
      .notNull(),
    day: date("day").notNull(),
    writes: integer("writes").default(0).notNull(),
    units: integer("units").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.day] })]
);

/**
 * Lo que el formato `auto` ahorró frente a JSON compacto, por agente, día UTC
 * y canal (migración 0052, lib/ahorro-de-formato.ts). Solo contadores.
 */
export const agentFormatSavings = pgTable(
  "agent_format_savings",
  {
    agentId: text("agent_id")
      .references(() => agentIdentities.id, { onDelete: "cascade" })
      .notNull(),
    day: date("day").notNull(),
    channel: text("channel").default("mcp").notNull(),
    responses: integer("responses").default(0).notNull(),
    compacted: integer("compacted").default(0).notNull(),
    jsonBytes: bigint("json_bytes", { mode: "number" }).default(0).notNull(),
    sentBytes: bigint("sent_bytes", { mode: "number" }).default(0).notNull(),
    jsonTokensEst: bigint("json_tokens_est", { mode: "number" }).default(0).notNull(),
    sentTokensEst: bigint("sent_tokens_est", { mode: "number" }).default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.day, t.channel] }), index("agent_format_savings_day_idx").on(t.day)]
);

/**
 * Fase F: la configuración de la aprobación humana (una fila, `id = 'global'`).
 * Sin fila = la de fábrica (apagada). Migración 0048.
 */
export const approvalSettings = pgTable("approval_settings", {
  id: text("id").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Fase F: peticiones de agentes retenidas hasta que un humano las apruebe o
 * rechace. El cuerpo va SIN secretos; el resultado real se queda para que el
 * agente lo lea. Migración 0048; ver lib/aprobaciones.ts.
 */
export const agentProposals = pgTable(
  "agent_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id")
      .references(() => agentIdentities.id, { onDelete: "cascade" })
      .notNull(),
    keyId: text("key_id"),
    /** `rest` o `mcp`: por dónde llegó (y por dónde se ejecuta al aprobarla). */
    channel: text("channel").notNull(),
    method: text("method").notNull(),
    /** Camino con su query. En MCP, el de la operación del SDK o `mcp:<herramienta>`. */
    path: text("path").notNull(),
    konId: text("kon_id"),
    operationId: text("operation_id"),
    /** La clave de configuración (`kon:blog:borrar-entrada`, `mcp:<nombre>`), si la hay. */
    operationKey: text("operation_key"),
    tool: text("tool"),
    body: jsonb("body"),
    contentType: text("content_type"),
    fingerprint: text("fingerprint").notNull(),
    idempotencyKey: text("idempotency_key"),
    scopes: jsonb("scopes").default([]).notNull(),
    reason: text("reason").notNull(),
    diff: jsonb("diff"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionComment: text("decision_comment"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    resultStatus: integer("result_status"),
    resultContentType: text("result_content_type"),
    resultBody: jsonb("result_body"),
    resultError: text("result_error"),
    /** D5: la segunda opinión de un clasificador de inyección (migración 0059). */
    injectionCheck: jsonb("injection_check"),
    /** El firmante del agente al proponer y, tras aprobar, al ejecutar (0049). */
    sponsorUserId: text("sponsor_user_id"),
  },
  (t) => [
    index("agent_proposals_status_idx").on(t.status, t.createdAt),
    index("agent_proposals_agent_idx").on(t.agentId, t.createdAt),
    index("agent_proposals_fingerprint_idx").on(t.agentId, t.fingerprint),
    uniqueIndex("agent_proposals_idempotency_idx").on(t.agentId, t.idempotencyKey),
  ]
);

/**
 * Fase I: versiones del código de una acción (`code`) escritas por agentes.
 * La activa nunca se edita: un cambio es otra fila. Migración 0053; RLS en
 * rls-owned-tables.sql («Code promotion»); ver lib/promocion.ts.
 */
export const codeVersions = pgTable(
  "code_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetKind: text("target_kind").default("action").notNull(),
    targetId: uuid("target_id").references(() => actions.id, { onDelete: "set null" }),
    targetSlug: text("target_slug").notNull(),
    targetName: text("target_name").notNull(),
    versionNumber: integer("version_number").notNull(),
    /** `agent` (un borrador), `manual` (edición de una persona) o `baseline` (la foto de lo que corría). */
    origin: text("origin").default("agent").notNull(),
    agentId: text("agent_id"),
    keyId: text("key_id"),
    sponsorUserId: text("sponsor_user_id"),
    channel: text("channel").default("rest").notNull(),
    description: text("description"),
    code: text("code").notNull(),
    capabilities: jsonb("capabilities").default({}).notNull(),
    tests: jsonb("tests").default([]).notNull(),
    contentHash: text("content_hash").notNull(),
    baseHash: text("base_hash"),
    parentVersionId: uuid("parent_version_id"),
    mode: text("mode").default("suggestion").notNull(),
    status: text("status").notNull(),
    testReport: jsonb("test_report"),
    scanReport: jsonb("scan_report"),
    capabilityDiff: jsonb("capability_diff"),
    decision: jsonb("decision"),
    proposalId: uuid("proposal_id").references(() => agentProposals.id, { onDelete: "set null" }),
    previousVersionId: uuid("previous_version_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedBy: text("activated_by"),
    watchUntil: timestamp("watch_until", { withTimezone: true }),
    watch: jsonb("watch"),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rolledBackBy: text("rolled_back_by"),
    rollbackReason: text("rollback_reason"),
    activationError: text("activation_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("code_versions_dedupe_idx")
      .on(t.agentId, t.targetSlug, t.contentHash)
      .where(sql`origin = 'agent'`),
    uniqueIndex("code_versions_number_idx").on(t.targetSlug, t.versionNumber),
    uniqueIndex("code_versions_one_active_idx").on(t.targetSlug).where(sql`status = 'active'`),
    index("code_versions_agent_idx").on(t.agentId, t.createdAt),
    index("code_versions_status_idx").on(t.status, t.createdAt),
    index("code_versions_proposal_idx").on(t.proposalId),
  ]
);

/** `bytea` de Postgres: el driver (node-postgres) lo devuelve como Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Fase F (decisión del propietario, 2026-10-26): las IMÁGENES de una subida
 * multipart retenida como propuesta. Fuera del almacén público de `/media`
 * hasta que un humano decide; se borran al rechazarla, caducar o ejecutarse.
 * Migración 0050; ver lib/aprobaciones.ts.
 */
export const agentProposalFiles = pgTable(
  "agent_proposal_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .references(() => agentProposals.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull(),
    field: text("field").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    content: bytea("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_proposal_files_proposal_idx").on(t.proposalId, t.position)]
);

export const agentMemory = pgTable(
  "agent_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id")
      .references(() => agentIdentities.id, { onDelete: "cascade" })
      .notNull(),
    memoryType: text("memory_type").default("short_term").notNull(),
    category: text("category").default("general").notNull(),
    key: text("key"),
    content: jsonb("content").notNull(),
    summary: text("summary"),
    importance: integer("importance").default(50),
    confidence: integer("confidence").default(80),
    source: text("source").default("agent"),
    relatedMemoryIds: jsonb("related_memory_ids").default([]),
    tags: jsonb("tags").default([]),
    embedding: vector("embedding", { dimension: 1536 }),
    validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    accessCount: integer("access_count").default(0),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_memory_agent_type_idx").on(t.agentId, t.memoryType),
    index("agent_memory_category_idx").on(t.category),
    index("agent_memory_key_idx").on(t.agentId, t.key),
  ]
);

export const agentAuditLogs = pgTable(
  "agent_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL = intento de un agente que no existe (clave inventada o mal
    // formada). Con NOT NULL esos fallos de autenticación no se podían
    // registrar: "unknown" violaba la FK. Migración 0044.
    agentId: text("agent_id").references(() => agentIdentities.id, { onDelete: "cascade" }),
    keyId: text("key_id"),
    action: text("action").notNull(),
    resource: text("resource"),
    resourceId: text("resource_id"),
    details: jsonb("details").default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    durationMs: integer("duration_ms"),
    success: boolean().default(true).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_audit_agent_id_idx").on(t.agentId),
    index("agent_audit_created_at_idx").on(t.createdAt),
    index("agent_audit_action_idx").on(t.action),
  ]
);

// ═══════════════════════════════════════════════
// Agent Traces (Telemetry)
// ═══════════════════════════════════════════════

export const agentTraces = pgTable(
  "agent_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentIdentities.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    name: text(),
    input: jsonb(),
    output: jsonb(),
    totalDurationMs: integer("total_duration_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    estimatedCost: doublePrecision("estimated_cost"),
    status: agentTraceStatusEnum("status").default("pending").notNull(),
    errorMessage: text("error_message"),
    metadata: jsonb().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_traces_agent_id_idx").on(t.agentId),
    index("agent_traces_created_at_idx").on(t.createdAt),
    index("agent_traces_session_id_idx").on(t.sessionId),
    index("agent_traces_status_idx").on(t.status),
  ]
);

export const agentTraceSteps = pgTable(
  "agent_trace_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => agentTraces.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").default(0).notNull(),
    stepType: agentTraceStepTypeEnum("step_type").notNull(),
    content: text(),
    reasoning: text(),
    toolName: text("tool_name"),
    toolInput: jsonb("tool_input"),
    toolOutput: jsonb("tool_output"),
    durationMs: integer("duration_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    errorMessage: text("error_message"),
    metadata: jsonb().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_trace_steps_trace_id_idx").on(t.traceId),
    index("agent_trace_steps_trace_order_idx").on(t.traceId, t.stepOrder),
    index("agent_trace_steps_type_idx").on(t.stepType),
  ]
);

export const agentFeedback = pgTable(
  "agent_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => agentTraces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => authUsers.id, { onDelete: "set null" }),
    rating: integer("rating"),
    comment: text("comment"),
    stepId: uuid("step_id").references(() => agentTraceSteps.id, { onDelete: "set null" }),
    metadata: jsonb().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_feedback_trace_id_idx").on(t.traceId),
    index("agent_feedback_user_id_idx").on(t.userId),
    index("agent_feedback_rating_idx").on(t.rating),
  ]
);

// ═══════════════════════════════════════════════
// Data Sources (External Connections)
// ═══════════════════════════════════════════════

export const dataSourceTypeEnum = pgEnum("data_source_type", [
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "api",
  "webhook",
]);

export const dataSources = pgTable(
  "data_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: dataSourceTypeEnum("type").notNull(),
    // Database connection fields
    host: text("host"),
    port: integer("port"),
    database: text("database"),
    username: text("username"),
    password: text("password"),
    // API/Webhook fields
    url: text("url"),
    headers: jsonb("headers").default({}),
    // Status
    isActive: boolean("is_active").default(true).notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("data_sources_type_idx").on(t.type),
    index("data_sources_is_active_idx").on(t.isActive),
    index("data_sources_created_at_idx").on(t.createdAt),
  ]
);

// ═══════════════════════════════════════════════
// KITSUDEN Brain (Self-Aware Knowledge Layer)
// ═══════════════════════════════════════════════

export const brainNoteSourceEnum = pgEnum("brain_note_source", [
  "code",
  "user",
  "agent",
  "system",
  "insight",
]);

export const brainNoteCategoryEnum = pgEnum("brain_note_category", [
  "schema",
  "route",
  "kon",
  "agent",
  "function",
  "dataset",
  "insight",
  "connection",
  "general",
]);

export const brainNotes = pgTable(
  "brain_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content").notNull(),
    source: brainNoteSourceEnum("source").notNull().default("system"),
    sourcePath: text("source_path"),
    category: brainNoteCategoryEnum("category").notNull().default("general"),
    tags: jsonb("tags").default([]).$type<string[]>(),
    // JSONB array of floats (384 dims). Migrated to VECTOR(384) in SQL when pgvector is present.
    embedding: jsonb("embedding").default([]).$type<number[]>(),
    importance: integer("importance").default(50).notNull(),
    confidence: integer("confidence").default(80).notNull(),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    relatedNoteIds: jsonb("related_note_ids").default([]).$type<string[]>(),
    // 0051: owner (a user OR an agent), the agent's human signer, visibility
    // (private | shared), the owner's idempotency key and the embedding kind.
    // Policies: rls-owned-tables.sql («Agent memory»).
    ownerUserId: text("owner_user_id"),
    ownerAgentId: text("owner_agent_id"),
    sponsorUserId: text("sponsor_user_id"),
    visibility: varchar("visibility", { length: 16 }).notNull().default("private"),
    noteKey: text("note_key"),
    embeddingKind: varchar("embedding_kind", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("brain_notes_owner_user_idx").on(t.ownerUserId),
    index("brain_notes_owner_agent_idx").on(t.ownerAgentId),
    index("brain_notes_category_idx").on(t.category),
    index("brain_notes_source_idx").on(t.source),
    index("brain_notes_created_at_idx").on(t.createdAt),
    index("brain_notes_importance_idx").on(t.importance),
  ]
);

export const brainConnections = pgTable(
  "brain_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceNoteId: uuid("source_note_id")
      .references(() => brainNotes.id, { onDelete: "cascade" })
      .notNull(),
    targetNoteId: uuid("target_note_id")
      .references(() => brainNotes.id, { onDelete: "cascade" })
      .notNull(),
    relationType: varchar("relation_type", { length: 100 }).notNull().default("related"),
    strength: real("strength").default(0.5).notNull(),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    // 0051: provenance. EXTRACTED (explicit in a source) | INFERRED (similarity,
    // a model's guess) | MANUAL (asserted through the API); confianza in [0, 1].
    origen: varchar("origen", { length: 16 }).notNull().default("INFERRED"),
    confianza: real("confianza").notNull().default(0),
    ownerUserId: text("owner_user_id"),
    ownerAgentId: text("owner_agent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("brain_connections_source_idx").on(t.sourceNoteId),
    index("brain_connections_target_idx").on(t.targetNoteId),
    index("brain_connections_type_idx").on(t.relationType),
    uniqueIndex("brain_connections_pair_idx").on(t.sourceNoteId, t.targetNoteId, t.relationType),
  ]
);

// ── Brain Sources (Layer 1: raw, immutable corpus — Karpathy method) ──
// Documentos crudos que la IA lee pero NUNCA edita. La wiki (brain_notes) es
// interpretación derivada; las fuentes son la verdad auditable. Dedupe por hash.
export const brainSources = pgTable(
  "brain_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    // Contenido crudo, inmutable. No hay endpoint de update por diseño.
    content: text("content").notNull(),
    // SHA-256 del contenido: dedupe e detección de "fuente cambió" (staleness).
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    // Origen: 'url' | 'file' | 'text' | 'note'. String libre para extensibilidad.
    sourceType: varchar("source_type", { length: 50 }).notNull().default("text"),
    // URI opcional (URL, ruta de archivo, etc.).
    uri: text("uri"),
    tags: jsonb("tags").default([]).$type<string[]>(),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("brain_sources_hash_idx").on(t.contentHash),
    index("brain_sources_type_idx").on(t.sourceType),
    index("brain_sources_created_at_idx").on(t.createdAt),
  ]
);

// ── Brain Claims (0051): a statement of a note with its evidence ──
// The source (Layer 1) and its SHA-256 when the claim was made. Sources are
// immutable; a newer source with the same uri and another hash makes the
// claim stale (lint). Policies: rls-owned-tables.sql («Agent memory»).
export const brainClaims = pgTable(
  "brain_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .references(() => brainNotes.id, { onDelete: "cascade" })
      .notNull(),
    statement: text("statement").notNull(),
    statementHash: varchar("statement_hash", { length: 64 }).notNull(),
    sourceId: uuid("source_id").references(() => brainSources.id, { onDelete: "set null" }),
    sourceSha256: varchar("source_sha256", { length: 64 }).notNull(),
    sourceUri: text("source_uri"),
    sourceRange: jsonb("source_range").$type<{ unit: "line" | "char"; start: number; end: number } | null>(),
    status: varchar("status", { length: 16 }).notNull().default("fresh"),
    staleReason: text("stale_reason"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    ownerUserId: text("owner_user_id"),
    ownerAgentId: text("owner_agent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("brain_claims_note_idx").on(t.noteId),
    index("brain_claims_source_idx").on(t.sourceId),
    index("brain_claims_status_idx").on(t.status),
    uniqueIndex("brain_claims_unique_idx").on(t.noteId, t.statementHash, t.sourceSha256),
  ]
);

// ═══════════════════════════════════════════════
// Relations (Drizzle ORM)
// ═══════════════════════════════════════════════

export const dataSetsRelations = relations(dataSets, ({ many }) => ({
  entries: many(dataEntries),
}));

export const dataEntriesRelations = relations(dataEntries, ({ one }) => ({
  dataSet: one(dataSets, { fields: [dataEntries.dataSetId], references: [dataSets.id] }),
  thumbnail: one(media, { fields: [dataEntries.thumbnailId], references: [media.id] }),
}));

// ═══════════════════════════════════════════════
// Agent Relations
// ═══════════════════════════════════════════════

export const agentIdentitiesRelations = relations(agentIdentities, ({ many }) => ({
  apiKeys: many(agentApiKeys),
  memories: many(agentMemory),
  auditLogs: many(agentAuditLogs),
  traces: many(agentTraces),
}));

export const agentApiKeysRelations = relations(agentApiKeys, ({ one }) => ({
  agent: one(agentIdentities, { fields: [agentApiKeys.agentId], references: [agentIdentities.id] }),
}));

export const agentMemoryRelations = relations(agentMemory, ({ one }) => ({
  agent: one(agentIdentities, { fields: [agentMemory.agentId], references: [agentIdentities.id] }),
}));

export const agentAuditLogsRelations = relations(agentAuditLogs, ({ one }) => ({
  agent: one(agentIdentities, {
    fields: [agentAuditLogs.agentId],
    references: [agentIdentities.id],
  }),
}));

export const agentTracesRelations = relations(agentTraces, ({ one, many }) => ({
  agent: one(agentIdentities, { fields: [agentTraces.agentId], references: [agentIdentities.id] }),
  steps: many(agentTraceSteps),
  feedback: many(agentFeedback),
}));

export const agentTraceStepsRelations = relations(agentTraceSteps, ({ one }) => ({
  trace: one(agentTraces, { fields: [agentTraceSteps.traceId], references: [agentTraces.id] }),
}));

export const agentFeedbackRelations = relations(agentFeedback, ({ one }) => ({
  trace: one(agentTraces, { fields: [agentFeedback.traceId], references: [agentTraces.id] }),
  user: one(authUsers, { fields: [agentFeedback.userId], references: [authUsers.id] }),
  step: one(agentTraceSteps, { fields: [agentFeedback.stepId], references: [agentTraceSteps.id] }),
}));

// ═══════════════════════════════════════════════
// Brain Relations
// ═══════════════════════════════════════════════

export const brainNotesRelations = relations(brainNotes, ({ many }) => ({
  outgoingConnections: many(brainConnections, { relationName: "sourceNote" }),
  incomingConnections: many(brainConnections, { relationName: "targetNote" }),
}));

export const brainConnectionsRelations = relations(brainConnections, ({ one }) => ({
  sourceNote: one(brainNotes, {
    fields: [brainConnections.sourceNoteId],
    references: [brainNotes.id],
    relationName: "sourceNote",
  }),
  targetNote: one(brainNotes, {
    fields: [brainConnections.targetNoteId],
    references: [brainNotes.id],
    relationName: "targetNote",
  }),
}));

// ═══════════════════════════════════════════════
// KITSUDEN Secrets Manager (arquitectura KITSUDEN §7)
// Prefect-style secrets: encriptados con AES-256-GCM e inyectados
// en caliente en la memoria del proceso de Bun (sin depender de .env).
// El servicio vive en services/secrets.ts; incluye bootstrap
// CREATE TABLE IF NOT EXISTS para entornos sin migraciones aplicadas.
// ═══════════════════════════════════════════════

export const kitsudenSecrets = pgTable(
  "kitsuden_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nombre de variable estilo env: KITSUDEN_OPENAI_API_KEY */
    key: varchar("key", { length: 200 }).notNull(),
    /** Valor cifrado (AES-256-GCM, hex) */
    valueEncrypted: text("value_encrypted").notNull(),
    /** IV del cifrado (hex, 12 bytes) */
    iv: varchar("iv", { length: 32 }).notNull(),
    /** Auth tag GCM (hex, 16 bytes) */
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    description: text("description"),
    /** Agrupación en la UI: llm, storage, integrations, general... */
    category: varchar("category", { length: 100 }).default("general").notNull(),
    /** Si true, se inyecta en process.env al arrancar el servidor */
    autoInject: boolean("auto_inject").default(true).notNull(),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }),
    lastInjectedAt: timestamp("last_injected_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("kitsuden_secrets_key_unique").on(table.key)]
);
