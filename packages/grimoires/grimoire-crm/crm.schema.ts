/**
 * Gremius CRM - Database Schema (Drizzle ORM)
 * 
 * Complete CRM system with:
 * - Companies (accounts)
 * - Contacts (people)
 * - Pipelines & Stages (kanban columns)
 * - Deals (opportunities)
 * - Activities (calls, emails, meetings, tasks)
 */

import { pgTable, text, timestamp, integer, boolean, jsonb, pgEnum, uuid } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const contactStatusEnum = pgEnum("crm_contact_status", [
  "lead",
  "prospect", 
  "customer",
  "churned",
  "archived"
]);

export const dealStatusEnum = pgEnum("crm_deal_status", [
  "open",
  "won",
  "lost",
  "paused"
]);

export const activityTypeEnum = pgEnum("crm_activity_type", [
  "call",
  "email",
  "meeting",
  "task",
  "note",
  "sms",
  "demo"
]);

export const priorityEnum = pgEnum("crm_priority", [
  "low",
  "medium",
  "high",
  "urgent"
]);

// ============================================================================
// COMPANIES
// ============================================================================

export const crmCompanies = pgTable("crm_companies", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  domain: text("domain"),
  industry: text("industry"),
  size: text("size"), // '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'
  website: text("website"),
  linkedin: text("linkedin"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  phone: text("phone"),
  description: text("description"),
  logoId: uuid("logo_id"), // Reference to grimoire-media
  annualRevenue: integer("annual_revenue"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
  organizationId: text("organization_id"),
});

export const companiesRelations = relations(crmCompanies, ({ many }) => ({
  contacts: many(crmContacts),
  deals: many(crmDeals),
  activities: many(crmActivities),
}));

// ============================================================================
// CONTACTS
// ============================================================================

export const crmContacts = pgTable("crm_contacts", {
  id: text("id").primaryKey().$defaultFn(createId),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  mobile: text("mobile"),
  jobTitle: text("job_title"),
  department: text("department"),
  avatarId: uuid("avatar_id"), // Reference to grimoire-media
  
  // CRM fields
  status: contactStatusEnum("status").default("lead"),
  source: text("source"),
  score: integer("score").default(0),
  
  // Relations
  companyId: text("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
  assignedTo: text("assigned_to"),
  
  // Social
  linkedin: text("linkedin"),
  twitter: text("twitter"),
  
  // Address
  address: text("address"),
  city: text("city"),
  country: text("country"),
  
  // Content
  notes: text("notes"),
  tags: jsonb("tags").default([]),
  customFields: jsonb("custom_fields").default({}),
  lastContactedAt: timestamp("last_contacted_at"),
  metadata: jsonb("metadata").default({}),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
  organizationId: text("organization_id"),
});

export const contactsRelations = relations(crmContacts, ({ one, many }) => ({
  company: one(crmCompanies, {
    fields: [crmContacts.companyId],
    references: [crmCompanies.id],
  }),
  deals: many(crmDeals),
  activities: many(crmActivities),
}));

// ============================================================================
// PIPELINES
// ============================================================================

export const crmPipelines = pgTable("crm_pipelines", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  currency: text("currency").default("USD"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
  organizationId: text("organization_id"),
});

export const pipelinesRelations = relations(crmPipelines, ({ many }) => ({
  stages: many(crmPipelineStages),
  deals: many(crmDeals),
}));

// ============================================================================
// PIPELINE STAGES
// ============================================================================

export const crmPipelineStages = pgTable("crm_pipeline_stages", {
  id: text("id").primaryKey().$defaultFn(createId),
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => crmPipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").default("#3b82f6"),
  order: integer("order").notNull().default(0),
  probability: integer("probability").default(0),
  wipLimit: integer("wip_limit"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pipelineStagesRelations = relations(crmPipelineStages, ({ one, many }) => ({
  pipeline: one(crmPipelines, {
    fields: [crmPipelineStages.pipelineId],
    references: [crmPipelines.id],
  }),
  deals: many(crmDeals),
}));

// ============================================================================
// DEALS
// ============================================================================

export const crmDeals = pgTable("crm_deals", {
  id: text("id").primaryKey().$defaultFn(createId),
  title: text("title").notNull(),
  description: text("description"),
  
  // Value
  value: integer("value").notNull().default(0),
  currency: text("currency").default("USD"),
  
  // Status & Stage
  status: dealStatusEnum("status").default("open"),
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => crmPipelines.id, { onDelete: "cascade" }),
  stageId: text("stage_id")
    .notNull()
    .references(() => crmPipelineStages.id, { onDelete: "cascade" }),
  probability: integer("probability").default(0),
  
  // Relations
  contactId: text("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
  companyId: text("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
  assignedTo: text("assigned_to"),
  
  // Dates
  expectedCloseDate: timestamp("expected_close_date"),
  actualCloseDate: timestamp("actual_close_date"),
  lastActivityAt: timestamp("last_activity_at"),
  
  // Source
  source: text("source"),
  campaign: text("campaign"),
  
  // Metadata
  tags: jsonb("tags").default([]),
  customFields: jsonb("custom_fields").default({}),
  metadata: jsonb("metadata").default({}),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
  organizationId: text("organization_id"),
});

export const dealsRelations = relations(crmDeals, ({ one, many }) => ({
  pipeline: one(crmPipelines, {
    fields: [crmDeals.pipelineId],
    references: [crmPipelines.id],
  }),
  stage: one(crmPipelineStages, {
    fields: [crmDeals.stageId],
    references: [crmPipelineStages.id],
  }),
  contact: one(crmContacts, {
    fields: [crmDeals.contactId],
    references: [crmContacts.id],
  }),
  company: one(crmCompanies, {
    fields: [crmDeals.companyId],
    references: [crmCompanies.id],
  }),
  activities: many(crmActivities),
}));

// ============================================================================
// ACTIVITIES
// ============================================================================

export const crmActivities = pgTable("crm_activities", {
  id: text("id").primaryKey().$defaultFn(createId),
  type: activityTypeEnum("type").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  
  // Relations (at least one should be set)
  contactId: text("contact_id").references(() => crmContacts.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => crmCompanies.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
  
  // Assignment
  assignedTo: text("assigned_to"),
  createdBy: text("created_by"),
  
  // Scheduling
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  durationMinutes: integer("duration_minutes"),
  
  // Outcome
  outcome: text("outcome"),
  notes: text("notes"),
  
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  organizationId: text("organization_id"),
});

export const activitiesRelations = relations(crmActivities, ({ one }) => ({
  contact: one(crmContacts, {
    fields: [crmActivities.contactId],
    references: [crmContacts.id],
  }),
  company: one(crmCompanies, {
    fields: [crmActivities.companyId],
    references: [crmCompanies.id],
  }),
  deal: one(crmDeals, {
    fields: [crmActivities.dealId],
    references: [crmDeals.id],
  }),
}));

// ============================================================================
// TYPES
// ============================================================================

export type CrmCompany = typeof crmCompanies.$inferSelect;
export type NewCrmCompany = typeof crmCompanies.$inferInsert;

export type CrmContact = typeof crmContacts.$inferSelect;
export type NewCrmContact = typeof crmContacts.$inferInsert;

export type CrmPipeline = typeof crmPipelines.$inferSelect;
export type NewCrmPipeline = typeof crmPipelines.$inferInsert;

export type CrmPipelineStage = typeof crmPipelineStages.$inferSelect;
export type NewCrmPipelineStage = typeof crmPipelineStages.$inferInsert;

export type CrmDeal = typeof crmDeals.$inferSelect;
export type NewCrmDeal = typeof crmDeals.$inferInsert;

export type CrmActivity = typeof crmActivities.$inferSelect;
export type NewCrmActivity = typeof crmActivities.$inferInsert;

export type ContactStatus = typeof contactStatusEnum.enumValues[number];
export type DealStatus = typeof dealStatusEnum.enumValues[number];
export type ActivityType = typeof activityTypeEnum.enumValues[number];
export type Priority = typeof priorityEnum.enumValues[number];

// ============================================================================
// API PAYLOAD TYPES
// ============================================================================

export interface DealMovePayload {
  dealId: string;
  targetStageId: string;
  newOrder?: number;
}

export interface PipelineWithStages extends CrmPipeline {
  stages: CrmPipelineStage[];
}

export interface KanbanData {
  pipeline: CrmPipeline;
  stages: (CrmPipelineStage & { deals: CrmDeal[] })[];
}

export interface ContactWithCompany extends CrmContact {
  company?: CrmCompany | null;
}

export interface DealWithRelations extends CrmDeal {
  contact?: CrmContact | null;
  company?: CrmCompany | null;
  stage?: CrmPipelineStage | null;
}

// ============================================================================
// FASE 1: CRM BUILDER - ENTITY CONFIGS
// ============================================================================

/**
 * Field Schema Definition for Entity Config
 */
export interface EntityFieldSchema {
  key: string;
  type: 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'select' | 'multiselect' | 'boolean' | 'email' | 'url' | 'file' | 'contact' | 'company';
  label: string;
  required?: boolean;
  unique?: boolean;
  options?: string[]; // For select/multiselect
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  calendarSync?: boolean; // If true, creates calendar event
  reminderDays?: number[]; // Days before to remind
}

/**
 * Entry Requirements for Pipeline Stage
 */
export interface StageEntryRequirements {
  requiredFields?: string[]; // Field keys that must be filled
  requiredDocuments?: string[]; // Document types required (Fase 2)
  customValidations?: {
    field: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'exists';
    value?: unknown;
  }[];
}

/**
 * Stage Action - Executed on enter/exit
 */
export interface StageAction {
  type: 'create_calendar_event' | 'send_email' | 'create_task' | 'create_activity' | 'webhook' | 'log_time' | 'update_field';
  template?: string;
  title?: string;
  url?: string;
  field?: string;
  value?: unknown;
  condition?: {
    field: string;
    operator: string;
    value: unknown;
  };
}

// ============================================================================
// ENTITY CONFIGS
// ============================================================================

export const crmEntityConfigs = pgTable("crm_entity_configs", {
  id: text("id").primaryKey().$defaultFn(createId),
  grimoireId: text("grimoire_id").notNull(),
  
  // Identity
  entityName: text("entity_name").notNull(), // 'case', 'deal', 'property', 'matter'
  singularLabel: text("singular_label").notNull(), // 'Case', 'Deal'
  pluralLabel: text("plural_label").notNull(), // 'Cases', 'Deals'
  
  // Features
  requiresContact: boolean("requires_contact").default(true),
  requiresCompany: boolean("requires_company").default(true),
  allowsValue: boolean("allows_value").default(true),
  allowsTimeTracking: boolean("allows_time_tracking").default(true),
  
  // Schema
  fieldSchema: jsonb("field_schema").$type<EntityFieldSchema[]>().default([]),
  
  // Default pipeline for this entity
  defaultPipelineId: text("default_pipeline_id").references(() => crmPipelines.id),
  
  // Active
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Default entity for this grimoire
  
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
});

export const entityConfigsRelations = relations(crmEntityConfigs, ({ one }) => ({
  defaultPipeline: one(crmPipelines, {
    fields: [crmEntityConfigs.defaultPipelineId],
    references: [crmPipelines.id],
  }),
}));

// ============================================================================
// PIPELINE STAGES - EXTENDED (Fase 1)
// ============================================================================

// Note: Adding columns via migration, not replacing table
// These are the new fields to be added to crm_pipeline_stages:

export interface PipelineStageExtension {
  // Time tracking
  trackTimeInStage: boolean;
  estimatedDays: number | null; // SLA expectation
  
  // Validations
  entryRequirements: StageEntryRequirements;
  
  // Automations
  onEnterActions: StageAction[];
  onExitActions: StageAction[];
}

// ============================================================================
// STAGE TRANSITIONS - Time Tracking
// ============================================================================

export const crmStageTransitions = pgTable("crm_stage_transitions", {
  id: text("id").primaryKey().$defaultFn(createId),
  dealId: text("deal_id")
    .notNull()
    .references(() => crmDeals.id, { onDelete: "cascade" }),
  
  // Stage movement
  fromStageId: text("from_stage_id").references(() => crmPipelineStages.id),
  toStageId: text("to_stage_id")
    .notNull()
    .references(() => crmPipelineStages.id),
  
  // Timing
  enteredAt: timestamp("entered_at").notNull().defaultNow(),
  exitedAt: timestamp("exited_at"),
  durationMinutes: integer("duration_minutes"), // Calculated automatically
  
  // SLA tracking
  estimatedDays: integer("estimated_days"), // SLA at time of entry
  wasOnTime: boolean("was_on_time"), // Did it exit within estimatedDays?
  slaBreach: boolean("sla_breach").default(false),
  
  // Metadata
  movedBy: text("moved_by"), // User who initiated the move
  moveReason: text("move_reason"),
  validationResult: jsonb("validation_result").default({}), // Store what was validated
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const stageTransitionsRelations = relations(crmStageTransitions, ({ one }) => ({
  deal: one(crmDeals, {
    fields: [crmStageTransitions.dealId],
    references: [crmDeals.id],
  }),
  fromStage: one(crmPipelineStages, {
    fields: [crmStageTransitions.fromStageId],
    references: [crmPipelineStages.id],
  }),
  toStage: one(crmPipelineStages, {
    fields: [crmStageTransitions.toStageId],
    references: [crmPipelineStages.id],
  }),
}));

// ============================================================================
// DEALS - EXTENDED
// ============================================================================

// New fields for crm_deals:
export interface DealExtension {
  entityConfigId: string; // Links to crm_entity_configs
  currentTransitionId: string | null; // Active stage transition (for time tracking)
}

// ============================================================================
// DOCUMENTS (Fase 1 - Basic Structure)
// ============================================================================

export const crmDocuments = pgTable("crm_documents", {
  id: text("id").primaryKey().$defaultFn(createId),
  dealId: text("deal_id")
    .notNull()
    .references(() => crmDeals.id, { onDelete: "cascade" }),
  
  // Document info
  name: text("name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  
  // Categorization
  documentType: text("document_type"), // 'contract', 'retainer', 'evidence', etc.
  category: text("category"),
  
  // Stage requirements (Fase 1: basic, Fase 2: full validation)
  requiredForStageId: text("required_for_stage_id").references(() => crmPipelineStages.id),
  isRequired: boolean("is_required").default(false),
  wasRequired: boolean("was_required").default(false), // Was this doc originally required?
  
  // Version control
  version: integer("version").default(1),
  previousVersionId: text("previous_version_id"),
  
  // Access control
  isPrivileged: boolean("is_privileged").default(false),
  confidential: boolean("confidential").default(false),
  
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  metadata: jsonb("metadata").default({}),
});

export const documentsRelations = relations(crmDocuments, ({ one }) => ({
  deal: one(crmDeals, {
    fields: [crmDocuments.dealId],
    references: [crmDeals.id],
  }),
  requiredForStage: one(crmPipelineStages, {
    fields: [crmDocuments.requiredForStageId],
    references: [crmPipelineStages.id],
  }),
}));

// ============================================================================
// EXTENDED TYPES
// ============================================================================

export type CrmEntityConfig = typeof crmEntityConfigs.$inferSelect;
export type NewCrmEntityConfig = typeof crmEntityConfigs.$inferInsert;

export type CrmStageTransition = typeof crmStageTransitions.$inferSelect;
export type NewCrmStageTransition = typeof crmStageTransitions.$inferInsert;

export type CrmDocument = typeof crmDocuments.$inferSelect;
export type NewCrmDocument = typeof crmDocuments.$inferInsert;

// Extended Pipeline Stage with builder fields
export interface CrmPipelineStageExtended extends CrmPipelineStage {
  trackTimeInStage: boolean;
  estimatedDays: number | null;
  entryRequirements: StageEntryRequirements;
  onEnterActions: StageAction[];
  onExitActions: StageAction[];
}

// Extended Deal with builder fields  
export interface CrmDealExtended extends CrmDeal {
  entityConfigId: string | null;
  currentTransitionId: string | null;
}

// Analytics types
export interface StageCycleTime {
  stageId: string;
  stageName: string;
  avgDurationMinutes: number;
  medianDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  dealCount: number;
  slaBreachCount: number;
  slaBreachRate: number;
}

export interface DealTimelineEntry {
  id: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string;
  toStageName: string;
  enteredAt: Date;
  exitedAt: Date | null;
  durationMinutes: number | null;
  durationText: string; // "2 days, 4 hours"
  wasOnTime: boolean | null;
  slaBreach: boolean;
  movedBy: string | null;
}

export interface ValidationResult {
  canMove: boolean;
  missingFields: {
    key: string;
    label: string;
    currentValue: unknown;
  }[];
  missingDocuments: {
    type: string;
    label: string;
  }[];
  failedValidations: {
    field: string;
    operator: string;
    expected: unknown;
    actual: unknown;
    message: string;
  }[];
  warnings: string[];
}
