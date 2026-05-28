/**
 * Grimoire Agile — Project Management Schema
 *
 * Sistema profesional de gestión ágil con:
 * - Projects: Contenedores de trabajo
 * - States: Estados personalizables por proyecto (columnas Kanban)
 * - Issues: Elementos de trabajo con key única (PROJ-123)
 * - Cycles: Sprints que miden TIEMPO
 * - Modules: Épicas que miden ALCANCE
 * - Intakes: Bandeja de entrada para triage de IA
 *
 * Orden de dependencias:
 * 1. agile_projects (base)
 * 2. agile_states (depende de projects)
 * 3. agile_cycles (depende de projects)
 * 4. agile_modules (depende de projects)
 * 5. agile_estimates (depende de projects)
 * 6. agile_labels (depende de projects)
 * 7. agile_issues (depende de projects, states, cycles, modules)
 * 8. agile_module_issues (depende de modules, issues)
 * 9. agile_issue_labels (depende de issues, labels)
 * 10. agile_issue_links (depende de issues)
 * 11. agile_intakes (depende de projects, opcionalmente issues)
 * 12. agile_comments (depende de issues)
 * 13. agile_activity_log (depende de projects, issues)
 *
 * @version 1.0.0
 */
import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, uniqueIndex, jsonb, } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════
export const issueTypeEnum = pgEnum("agile_issue_type", [
    "issue",
    "feature",
    "bug",
    "improvement",
    "epic",
    "sub_issue",
    "spike",
]);
export const issuePriorityEnum = pgEnum("agile_issue_priority", [
    "urgent",
    "high",
    "medium",
    "low",
]);
export const cycleStatusEnum = pgEnum("agile_cycle_status", [
    "draft",
    "started",
    "completed",
    "cancelled",
]);
export const moduleStatusEnum = pgEnum("agile_module_status", [
    "backlog",
    "planned",
    "in_progress",
    "paused",
    "completed",
    "cancelled",
]);
export const intakeStatusEnum = pgEnum("agile_intake_status", [
    "pending",
    "accepted",
    "declined",
    "duplicate",
    "spam",
]);
export const linkTypeEnum = pgEnum("agile_link_type", [
    "blocks",
    "blocked_by",
    "relates_to",
    "duplicates",
    "duplicate_of",
    "parent_of",
    "child_of",
]);
export const estimateTypeEnum = pgEnum("agile_estimate_type", [
    "fibonacci",
    "linear",
    "tshirt",
    "days",
    "points",
]);
export const stateGroupEnum = pgEnum("agile_state_group", [
    "backlog",
    "unstarted",
    "started",
    "completed",
    "cancelled",
]);
// ═══════════════════════════════════════════════════════════════════════════════
// 1. AGILE_PROJECTS (Base - Sin dependencias)
// ═══════════════════════════════════════════════════════════════════════════════
export const agileProjects = pgTable("agile_projects", {
    id: uuid("id").primaryKey().defaultRandom(),
    // Identificación
    name: text("name").notNull(),
    identifier: text("identifier").notNull().unique(), // Ej: "PROJ" para keys PROJ-123
    description: text("description"),
    // Estado
    isArchived: boolean("is_archived").default(false),
    // Liderazgo (referencias flexibles tipo text, no FK estricto)
    leadId: text("lead_id"), // Referencia a usuario/agente
    defaultAssigneeId: text("default_assignee_id"),
    // Visual
    emoji: text("emoji").default("📁"),
    color: text("color").default("#6366f1"),
    // Contador para auto-generar issue keys
    keyCounter: integer("key_counter").default(0),
    // Media - Cover Image (referencia a grimoire-media)
    coverImageId: uuid("cover_image_id"),
    // Configuración
    config: jsonb("config").$type().default({}),
    // Metadata
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
}, (t) => [uniqueIndex("agile_projects_identifier_idx").on(t.identifier)]);
// ═══════════════════════════════════════════════════════════════════════════════
// 2. AGILE_STATES (Depende de agile_projects)
// Estados personalizables por proyecto - Columnas del Kanban
// ═══════════════════════════════════════════════════════════════════════════════
export const agileStates = pgTable("agile_states", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
        .references(() => agileProjects.id, { onDelete: "cascade" })
        .notNull(),
    // Identificación
    name: text("name").notNull(), // Ej: "En Progreso", "Code Review"
    description: text("description"),
    // Grupo lógico para UI y reportes
    group: stateGroupEnum("group").notNull(),
    // Visual
    color: text("color").default("#94a3b8"),
    // Posición en el tablero
    sequence: integer("sequence").default(0),
    // Comportamiento
    isDefault: boolean("is_default").default(false), // Estado inicial para nuevos issues
    isCompleted: boolean("is_completed").default(false),
    isCancelled: boolean("is_cancelled").default(false),
    // Validaciones al entrar a este estado
    validations: jsonb("validations").$type().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("agile_states_project_sequence_idx").on(t.projectId, t.sequence)]);
// ═══════════════════════════════════════════════════════════════════════════════
// 3. AGILE_CYCLES (Depende de agile_projects)
// Sprints - Miden TIEMPO ("Lo que haremos esta semana")
// ═══════════════════════════════════════════════════════════════════════════════
export const agileCycles = pgTable("agile_cycles", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
        .references(() => agileProjects.id, { onDelete: "cascade" })
        .notNull(),
    // Identificación
    name: text("name").notNull(), // Ej: "Cycle 12", "Sprint 3"
    description: text("description"),
    // Fechas
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    // Estado
    status: cycleStatusEnum("status").default("draft").notNull(),
    // Objetivo del ciclo
    goal: text("goal"),
    // Capacidad del equipo (opcional)
    capacity: integer("capacity"),
    // Métricas calculadas
    stats: jsonb("stats").$type().default({}),
    // Ciclo activo (solo uno por proyecto)
    isActive: boolean("is_active").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════════════════════════════════════
// 4. AGILE_MODULES (Depende de agile_projects)
// Épicas/Módulos - Miden ALCANCE ("Lanzar Login" - puede tomar varios Cycles)
// ═══════════════════════════════════════════════════════════════════════════════
export const agileModules = pgTable("agile_modules", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
        .references(() => agileProjects.id, { onDelete: "cascade" })
        .notNull(),
    leadId: text("lead_id"),
    // Identificación
    name: text("name").notNull(),
    description: text("description"),
    // Estado del módulo
    status: moduleStatusEnum("status").default("backlog").notNull(),
    // Fechas
    startDate: timestamp("start_date", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Visual
    color: text("color").default("#6366f1"),
    // Métricas
    stats: jsonb("stats").$type().default({ progress: 0 }),
    // Jerarquía (módulos anidados)
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════════════════════════════════════
// 5. AGILE_ESTIMATES (Depende de agile_projects)
// Sistema de estimación configurable por proyecto
// ═══════════════════════════════════════════════════════════════════════════════
export const agileEstimates = pgTable("agile_estimates", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
        .references(() => agileProjects.id, { onDelete: "cascade" })
        .notNull(),
    // Configuración
    type: estimateTypeEnum("type").notNull(),
    name: text("name").notNull(), // "Story Points", "T-shirt Sizes"
    // Puntos personalizados para tipo 'points'
    customPoints: jsonb("custom_points").$type(),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════════════════════════════════════
// 6. AGILE_LABELS (Depende de agile_projects)
// ═══════════════════════════════════════════════════════════════════════════════
export const agileLabels = pgTable("agile_labels", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
        .references(() => agileProjects.id, { onDelete: "cascade" })
        .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").default("#6366f1"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("agile_labels_project_name_idx").on(t.projectId, t.name)]);
// ═══════════════════════════════════════════════════════════════════════════════
// 7. AGILE_ISSUES (Depende de agile_projects, agile_states, agile_cycles, agile_modules)
// Elementos de trabajo principales
// ═══════════════════════════════════════════════════════════════════════════════
export const agileIssues = pgTable("agile_issues", {
    id: uuid("id").primaryKey().defaultRandom(),
    // Key única (PROJ-123)
    key: text("key").notNull(),
    // Contenido
    name: text("name").notNull(), // Título
    descriptionHtml: text("description_html"),
    descriptionText: text("description_text"), // Para búsqueda
    // Clasificación
    type: issueTypeEnum("type").default("issue").notNull(),
    priority: issuePriorityEnum("priority").default("medium").notNull(),
    // Relaciones jerárquicas
    projectId: uuid("project_id")
        .references(() => agileProjects.id, { onDelete: "cascade" })
        .notNull(),
    parentId: uuid("parent_id"), // Para sub-issues (self-reference)
    // Asignación (referencias flexibles tipo text)
    assigneeId: text("assignee_id"), // Puede ser user id o agent id
    createdBy: text("created_by").notNull(),
    // Estado (FK a agile_states)
    stateId: uuid("state_id")
        .references(() => agileStates.id, { onDelete: "restrict" })
        .notNull(),
    // TIEMPO: Ciclo/Sprint actual
    cycleId: uuid("cycle_id").references(() => agileCycles.id, { onDelete: "set null" }),
    // ALCANCE: Módulo al que pertenece
    moduleId: uuid("module_id").references(() => agileModules.id, { onDelete: "set null" }),
    // Posición
    sequence: integer("sequence").default(0),
    sortOrder: integer("sort_order").default(0),
    // Estimación
    estimate: integer("estimate"),
    // Tracking de tiempo
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // Fechas planificadas
    targetDate: timestamp("target_date", { withTimezone: true }),
    // Metadata extensible
    props: jsonb("props").$type().default({}),
    // Flags
    isDraft: boolean("is_draft").default(false),
    isSubIssue: boolean("is_sub_issue").default(false),
    // Contadores (performance)
    subIssuesCount: integer("sub_issues_count").default(0),
    commentsCount: integer("comments_count").default(0),
    attachmentsCount: integer("attachments_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    uniqueIndex("agile_issues_key_idx").on(t.key),
    uniqueIndex("agile_issues_project_sequence_idx").on(t.projectId, t.sequence),
]);
// ═══════════════════════════════════════════════════════════════════════════════
// 8. AGILE_MODULE_ISSUES (Junction - Depende de agile_modules y agile_issues)
// Relación muchos a muchos entre módulos e issues
// ═══════════════════════════════════════════════════════════════════════════════
export const agileModuleIssues = pgTable("agile_module_issues", {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
        .references(() => agileModules.id, { onDelete: "cascade" })
        .notNull(),
    issueId: uuid("issue_id")
        .references(() => agileIssues.id, { onDelete: "cascade" })
        .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("agile_module_issues_unique_idx").on(t.moduleId, t.issueId)]);
// ═══════════════════════════════════════════════════════════════════════════════
// 9. AGILE_ISSUE_LABELS (Junction - Depende de agile_issues y agile_labels)
// ═══════════════════════════════════════════════════════════════════════════════
export const agileIssueLabels = pgTable("agile_issue_labels", {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
        .references(() => agileIssues.id, { onDelete: "cascade" })
        .notNull(),
    labelId: uuid("label_id")
        .references(() => agileLabels.id, { onDelete: "cascade" })
        .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("agile_issue_labels_unique_idx").on(t.issueId, t.labelId)]);
// ═══════════════════════════════════════════════════════════════════════════════
// 10. AGILE_ISSUE_LINKS (Depende de agile_issues - Self-reference)
// Links entre issues
// ═══════════════════════════════════════════════════════════════════════════════
export const agileIssueLinks = pgTable("agile_issue_links", {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
        .references(() => agileIssues.id, { onDelete: "cascade" })
        .notNull(),
    targetId: uuid("target_id")
        .references(() => agileIssues.id, { onDelete: "cascade" })
        .notNull(),
    linkType: linkTypeEnum("link_type").notNull(),
    relation: text("relation"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
}, (t) => [uniqueIndex("agile_issue_links_unique_idx").on(t.sourceId, t.targetId, t.linkType)]);
// ═══════════════════════════════════════════════════════════════════════════════
// 11. AGILE_INTAKES (Depende de agile_projects - Opcionalmente issues)
// Bandeja de entrada para triage - KILLER FEATURE PARA IA
// ═══════════════════════════════════════════════════════════════════════════════
export const agileIntakes = pgTable("agile_intakes", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
        .references(() => agileProjects.id, { onDelete: "cascade" })
        .notNull(),
    // Contenido
    title: text("title").notNull(),
    description: text("description"),
    // Sugerencias del creador (IA o externo)
    suggestedType: issueTypeEnum("suggested_type"),
    suggestedPriority: issuePriorityEnum("suggested_priority"),
    suggestedStateId: uuid("suggested_state_id").references(() => agileStates.id, {
        onDelete: "set null",
    }),
    // Origen
    source: text("source").notNull(), // 'api', 'slack', 'email', 'form', 'ai_agent'
    sourceData: jsonb("source_data").$type().default({}),
    // Estado de triage
    status: intakeStatusEnum("status").default("pending").notNull(),
    // Decisión
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    // Si fue aceptado
    createdIssueId: uuid("created_issue_id").references(() => agileIssues.id, {
        onDelete: "set null",
    }),
    createdIssueKey: text("created_issue_key"),
    // Si fue duplicado
    duplicateOfId: uuid("duplicate_of_id"),
    // Creador (puede ser anónimo o externo)
    createdBy: text("created_by"),
    createdByEmail: text("created_by_email"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════════════════════════════════════
// 12. AGILE_COMMENTS (Depende de agile_issues)
// ═══════════════════════════════════════════════════════════════════════════════
export const agileComments = pgTable("agile_comments", {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
        .references(() => agileIssues.id, { onDelete: "cascade" })
        .notNull(),
    // Contenido
    contentHtml: text("content_html").notNull(),
    contentText: text("content_text"),
    // Autor (referencia flexible)
    createdBy: text("created_by").notNull(),
    // Edición
    isEdited: boolean("is_edited").default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Threading (respuestas)
    parentId: uuid("parent_id"),
    // Reacciones
    reactions: jsonb("reactions").$type().default({}),
    // Acceso
    access: text("access").default("public"), // 'public', 'internal'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════════════════════════════════════
// 13. AGILE_ACTIVITY_LOG (Depende de agile_projects, agile_issues)
// Auditoría completa de cambios
// ═══════════════════════════════════════════════════════════════════════════════
export const agileActivityLog = pgTable("agile_activity_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    // Actor
    actorId: text("actor_id").notNull(),
    // Objeto afectado (polimórfico)
    entityType: text("entity_type").notNull(), // 'issue', 'project', 'cycle', 'module', 'intake'
    entityId: uuid("entity_id").notNull(),
    // Acción
    action: text("action").notNull(), // 'created', 'updated', 'deleted', 'state_changed'
    // Cambios específicos
    field: text("field"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    // Descripción legible
    description: text("description"),
    // Metadata
    metadata: jsonb("metadata").default({}),
    // Referencias opcionales para queries rápidas
    projectId: uuid("project_id").references(() => agileProjects.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => agileIssues.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════════════════════════════════════
// RELACIONES (Relations)
// ═══════════════════════════════════════════════════════════════════════════════
export const agileProjectsRelations = relations(agileProjects, ({ many }) => ({
    states: many(agileStates),
    issues: many(agileIssues),
    cycles: many(agileCycles),
    modules: many(agileModules),
    labels: many(agileLabels),
    estimates: many(agileEstimates),
    intakes: many(agileIntakes),
    activityLogs: many(agileActivityLog),
}));
export const agileStatesRelations = relations(agileStates, ({ one, many }) => ({
    project: one(agileProjects, {
        fields: [agileStates.projectId],
        references: [agileProjects.id],
    }),
    issues: many(agileIssues),
}));
export const agileCyclesRelations = relations(agileCycles, ({ one, many }) => ({
    project: one(agileProjects, {
        fields: [agileCycles.projectId],
        references: [agileProjects.id],
    }),
    issues: many(agileIssues),
}));
export const agileModulesRelations = relations(agileModules, ({ one, many }) => ({
    project: one(agileProjects, {
        fields: [agileModules.projectId],
        references: [agileProjects.id],
    }),
    parent: one(agileModules, {
        fields: [agileModules.parentId],
        references: [agileModules.id],
        relationName: "subModules",
    }),
    subModules: many(agileModules, { relationName: "subModules" }),
    moduleIssues: many(agileModuleIssues),
    issues: many(agileIssues),
}));
export const agileIssuesRelations = relations(agileIssues, ({ one, many }) => ({
    project: one(agileProjects, {
        fields: [agileIssues.projectId],
        references: [agileProjects.id],
    }),
    state: one(agileStates, {
        fields: [agileIssues.stateId],
        references: [agileStates.id],
    }),
    cycle: one(agileCycles, {
        fields: [agileIssues.cycleId],
        references: [agileCycles.id],
    }),
    module: one(agileModules, {
        fields: [agileIssues.moduleId],
        references: [agileModules.id],
    }),
    parent: one(agileIssues, {
        fields: [agileIssues.parentId],
        references: [agileIssues.id],
        relationName: "subIssues",
    }),
    subIssues: many(agileIssues, { relationName: "subIssues" }),
    comments: many(agileComments),
    outgoingLinks: many(agileIssueLinks, { relationName: "source" }),
    incomingLinks: many(agileIssueLinks, { relationName: "target" }),
    activityLogs: many(agileActivityLog),
}));
export const agileModuleIssuesRelations = relations(agileModuleIssues, ({ one }) => ({
    module: one(agileModules, {
        fields: [agileModuleIssues.moduleId],
        references: [agileModules.id],
    }),
    issue: one(agileIssues, {
        fields: [agileModuleIssues.issueId],
        references: [agileIssues.id],
    }),
}));
export const agileLabelsRelations = relations(agileLabels, ({ one, many }) => ({
    project: one(agileProjects, {
        fields: [agileLabels.projectId],
        references: [agileProjects.id],
    }),
    issueLabels: many(agileIssueLabels),
}));
export const agileIssueLabelsRelations = relations(agileIssueLabels, ({ one }) => ({
    issue: one(agileIssues, {
        fields: [agileIssueLabels.issueId],
        references: [agileIssues.id],
    }),
    label: one(agileLabels, {
        fields: [agileIssueLabels.labelId],
        references: [agileLabels.id],
    }),
}));
export const agileIssueLinksRelations = relations(agileIssueLinks, ({ one }) => ({
    source: one(agileIssues, {
        fields: [agileIssueLinks.sourceId],
        references: [agileIssues.id],
        relationName: "source",
    }),
    target: one(agileIssues, {
        fields: [agileIssueLinks.targetId],
        references: [agileIssues.id],
        relationName: "target",
    }),
}));
export const agileIntakesRelations = relations(agileIntakes, ({ one }) => ({
    project: one(agileProjects, {
        fields: [agileIntakes.projectId],
        references: [agileProjects.id],
    }),
    suggestedState: one(agileStates, {
        fields: [agileIntakes.suggestedStateId],
        references: [agileStates.id],
    }),
    createdIssue: one(agileIssues, {
        fields: [agileIntakes.createdIssueId],
        references: [agileIssues.id],
    }),
}));
export const agileCommentsRelations = relations(agileComments, ({ one }) => ({
    issue: one(agileIssues, {
        fields: [agileComments.issueId],
        references: [agileIssues.id],
    }),
}));
export const agileActivityLogRelations = relations(agileActivityLog, ({ one }) => ({
    project: one(agileProjects, {
        fields: [agileActivityLog.projectId],
        references: [agileProjects.id],
    }),
    issue: one(agileIssues, {
        fields: [agileActivityLog.issueId],
        references: [agileIssues.id],
    }),
}));
//# sourceMappingURL=agile.schema.js.map