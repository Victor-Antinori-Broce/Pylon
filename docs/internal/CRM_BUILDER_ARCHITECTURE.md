# CRM Builder - Arquitectura Configurable

## Visión

Transformar kon-crm en un motor de CRM configurable donde:

- "Deals" pueden ser Casos Legales, Propiedades, Proyectos, Oportunidades...
- Cada negocio define sus propios pipelines, reglas y formularios
- Time tracking automático entre etapas
- Validaciones de documentos obligatorios por etapa
- Integración nativa con calendario

---

## 1. Configuración de Entidades (Entity Schema)

```typescript
// crm_entity_configs - Define qué "tipo de cosa" maneja este CRM
export const crmEntityConfigs = pgTable("crm_entity_configs", {
  id: text("id").primaryKey().$defaultFn(createId),
  konId: text("kon_id").notNull(), // A qué instancia pertenece

  // Configuración semántica
  entityName: text("entity_name").notNull(), // "case", "matter", "deal", "property"
  singularLabel: text("singular_label").notNull(), // "Case", "Propiedad", "Oportunidad"
  pluralLabel: text("plural_label").notNull(), // "Cases", "Propiedades"

  // Campos base requeridos
  requiresContact: boolean("requires_contact").default(true),
  requiresCompany: boolean("requires_company").default(true),
  allowsValue: boolean("allows_value").default(true), // Tiene valor monetario?
  allowsTimeTracking: boolean("allows_time_tracking").default(true),

  // Custom fields schema (JSON Schema-like)
  fieldSchema: jsonb("field_schema").default([]),

  // Etapas del pipeline para esta entidad
  pipelineId: text("pipeline_id").references(() => crmPipelines.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Ejemplo de fieldSchema para Legal:
[
  {
    key: "caseNumber",
    type: "text",
    label: "Case Number",
    required: true,
    unique: true,
  },
  {
    key: "practiceArea",
    type: "select",
    label: "Practice Area",
    options: ["Family", "Corporate", "Criminal", "Personal Injury"],
    required: true,
  },
  {
    key: "courtDate",
    type: "datetime",
    label: "Court Date",
    calendarSync: true, // ← Genera evento de calendario
    reminderDays: [7, 1], // ← Recordatorios automáticos
  },
  {
    key: "retainerAgreement",
    type: "file",
    label: "Retainer Agreement",
    required: true,
    stageValidation: "retained", // ← Obligatorio para mover a stage "Retained"
  },
];
```

---

## 2. Pipeline Stages con Validaciones

```typescript
// crm_pipeline_stages extendido
export const crmPipelineStages = pgTable("crm_pipeline_stages", {
  id: text("id").primaryKey().$defaultFn(createId),
  pipelineId: text("pipeline_id").notNull(),
  name: text("name").notNull(), // "Discovery", "Under Contract", "Discovery"
  order: integer("order").notNull(),

  // Time tracking automático
  trackTimeInStage: boolean("track_time_in_stage").default(true),
  estimatedDays: integer("estimated_days"), // SLA: "Debería estar aquí X días"

  // Validaciones para entrar a esta etapa
  entryRequirements: jsonb("entry_requirements").default({
    // Campos que deben estar completos
    requiredFields: ["caseNumber", "practiceArea"],
    // Documentos obligatorios
    requiredDocuments: ["retainer_agreement", "conflicts_check"],
    // Campos custom específicos
    customValidations: [{ field: "retainerAmount", operator: ">", value: 0 }],
  }),

  // Acciones automáticas al entrar
  onEnterActions: jsonb("on_enter_actions").default([
    { type: "create_calendar_event", template: "Court Date: {courtDate}" },
    { type: "send_email", template: "stage_change_notification" },
    { type: "create_task", title: "Review case files" },
  ]),

  // Acciones al salir
  onExitActions: jsonb("on_exit_actions").default([
    { type: "log_time", description: "Time in {stageName}" },
  ]),

  color: text("color").default("#6366f1"),
  probability: integer("probability").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
```

---

## 3. Time Tracking Automático entre Etapas

```typescript
// crm_stage_transitions - Log automático de movimientos
export const crmStageTransitions = pgTable("crm_stage_transitions", {
  id: text("id").primaryKey().$defaultFn(createId),
  dealId: text("deal_id").notNull(),
  fromStageId: text("from_stage_id"),
  toStageId: text("to_stage_id").notNull(),

  // Timing
  enteredAt: timestamp("entered_at").notNull(),
  exitedAt: timestamp("exited_at"), // NULL si está actualmente aquí
  durationMinutes: integer("duration_minutes"), // Calculado automático

  // Metadata
  movedBy: text("moved_by"), // Quién movió el deal
  moveReason: text("move_reason"), // Opcional: por qué se movió

  // SLA tracking
  wasOnTime: boolean("was_on_time"), // Comparado contra stage.estimatedDays
  slaBreach: boolean("sla_breach").default(false),

  createdAt: timestamp("created_at").defaultNow(),
});

// Esto permite reportes tipo:
// - "Casos pasan en promedio 15 días en Discovery"
// - "Lawyer X mueve casos 30% más rápido"
// - "30% de casos se exceden del SLA en etapa de Filing"
```

---

## 4. Documentos Obligatorios por Etapa

```typescript
// crm_documents vinculados a deals y stages
export const crmDocuments = pgTable("crm_documents", {
  id: text("id").primaryKey().$defaultFn(createId),
  dealId: text("deal_id").notNull(),

  // Document metadata
  name: text("name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"), // pdf, doc, etc
  fileSize: integer("file_size"),

  // Categorización
  documentType: text("document_type"), // "contract", "pleading", "evidence", "retainer"
  category: text("category"), // Agrupación lógica

  // Stage requirements
  requiredForStageId: text("required_for_stage_id"), // Si es obligatorio para X etapa
  isRequired: boolean("is_required").default(false),
  wasRequired: boolean("was_required").default(false), // Se cumplió el requisito?

  // Version control
  version: integer("version").default(1),
  previousVersionId: text("previous_version_id"),

  // Access control
  isPrivileged: boolean("is_privileged").default(false), // Attorney-client privilege
  confidential: boolean("confidential").default(false),

  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Validación al mover etapa:
// 1. Consultar: qué documentos son requiredForStageId = targetStageId
// 2. Verificar que existan en crmDocuments para este deal
// 3. Si falta alguno: reject move con error específico
```

---

## 5. Formularios de Intake con Kitsuden Forms

```typescript
// crm_intake_forms - Configuración de formularios
export const crmIntakeForms = pgTable("crm_intake_forms", {
  id: text("id").primaryKey().$defaultFn(createId),
  konId: text("kon_id").notNull(),

  name: text("name").notNull(), // "Family Law Intake", "Property Inquiry"
  entityConfigId: text("entity_config_id").notNull(), // Qué tipo de entidad crea

  // Schema del formulario (compatible con Kitsuden Forms)
  formSchema: jsonb("form_schema").notNull(), // Fields, validations, conditional logic

  // Configuración
  isPublic: boolean("is_public").default(false), // Form público web?
  publicSlug: text("public_slug"), // URL: /forms/family-law-intake

  // Qué pasa al submit
  onSubmitActions: jsonb("on_submit_actions").default([
    { type: "create_contact", mapping: { "email": "contact.email" } },
    { type: "create_deal", mapping: { "practiceArea": "customFields.practiceArea" } },
    { type: "create_activity", title: "New intake form submitted" },
    { type: "send_email", to: "{assignedTo}", template: "new_intake_notification" },
    { type: "webhook", url: "https://..." }
  ]),

  // Integración con Datasets si se necesita
  datasetMapping: jsonb("dataset_mapping").default({
    // "Mapear respuestas a un Dataset para reporting avanzado"
    targetDataset: "intake_responses_2024",
    fieldMappings: { "income": "customFields.annualIncome" }
  }),

  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ejemplo de formSchema:
{
  "fields": [
    {
      "id": "marital_status",
      "type": "select",
      "label": "Marital Status",
      "options": ["Single", "Married", "Divorced", "Separated"],
      "required": true,
      // Conditional logic
      "conditions": {
        "showWhen": { "field": "practice_area", "equals": "family_law" }
      }
    },
    {
      "id": "children_count",
      "type": "number",
      "label": "Number of Children",
      "required": true,
      "validation": { "min": 0, "max": 20 }
    },
    {
      "id": "income_documents",
      "type": "file_upload",
      "label": "Upload Tax Returns (last 2 years)",
      "multiple": true,
      "required": true,
      "acceptedTypes": [".pdf", ".jpg", ".png"]
    }
  ]
}
```

**Integración con Kitsuden Forms:**

- Reutilizar el motor de forms existente
- Los intake forms pueden vincularse a un Dataset para reporting
- Usar el mismo sistema de validaciones condicionales

---

## 6. Calendario Integrado

```typescript
// crm_calendar_events - Eventos vinculados a deals/contacts
export const crmCalendarEvents = pgTable("crm_calendar_events", {
  id: text("id").primaryKey().$defaultFn(createId),

  // Vinculación
  dealId: text("deal_id"), // Opcional: vinculado a un case/deal
  contactId: text("contact_id"), // Opcional: vinculado a contact
  activityId: text("activity_id"), // Opcional: vinculado a activity

  // Event details
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  allDay: boolean("all_day").default(false),

  // Location (para court hearings, depositions)
  location: text("location"),
  isVirtual: boolean("is_virtual").default(false),
  meetingUrl: text("meeting_url"),

  // Categoría y tipo
  eventType: text("event_type"), // "court_hearing", "deposition", "client_meeting", "deadline"
  category: text("category"), // "critical", "important", "routine"

  // Reminders
  reminders: jsonb("reminders").default([
    { type: "email", minutesBefore: 1440 }, // 1 día antes
    { type: "notification", minutesBefore: 60 }, // 1 hora antes
  ]),

  // Attendees
  attendees: jsonb("attendees").default([]), // [{ contactId, email, status }]

  // Auto-generated from field
  autoGenerated: boolean("auto_generated").default(false),
  sourceField: text("source_field"), // "courtDate", "depositionDate"

  // Status
  status: text("status").default("confirmed"), // confirmed, tentative, cancelled
  completed: boolean("completed").default(false),

  // iCal/Sync
  externalCalId: text("external_cal_id"), // Google/Outlook event ID
  icalUid: text("ical_uid"),

  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Vista de calendario:
// - Mostrar eventos de crm_calendar_events
// - Mostrar activities con dueDate
// - Mostrar deadlines calculados
// - Filtros por: tipo, deal, contact, assigned to me
```

---

## 7. API Extensions

```typescript
// Endpoints nuevos necesarios:

// Entity Config
GET   /api/crm/entity-configs
POST  /api/crm/entity-configs
PATCH /api/crm/entity-configs/:id

// Validaciones de stage
POST  /api/crm/deals/:id/validate-move
      // Body: { targetStageId }
      // Response: { canMove: boolean, missingFields: [], missingDocuments: [] }

// Time tracking reportes
GET   /api/crm/analytics/cycle-time
      // Query: pipelineId, dateRange, groupBy: "stage" | "user" | "practiceArea"
GET   /api/crm/analytics/sla-breaches
GET   /api/crm/deals/:id/timeline
      // Devuelve: transiciones + tiempo en cada etapa

// Intake forms
GET   /api/crm/intake-forms
POST  /api/crm/intake-forms/:id/submit  // Público
GET   /api/crm/intake-forms/:id/submissions

// Calendar
GET   /api/crm/calendar/events
POST  /api/crm/calendar/events
GET   /api/crm/calendar/availability    // Para scheduling

// Document validation
POST  /api/crm/deals/:id/validate-documents
GET   /api/crm/deals/:id/missing-documents
```

---

## 8. UI Components Necesarios

### Admin Views:

1. **EntityConfigBuilder** - Configurar "qué es un Deal" para este negocio
2. **PipelineStageBuilder** - Drag-drop stages + configurar validaciones
3. **IntakeFormBuilder** - Form builder con conditional logic
4. **DocumentRequirementsManager** - Qué docs requiere cada etapa
5. **CalendarView** - Vista mensual/semanal/diaria con eventos
6. **TimeAnalyticsDashboard** - Reportes de cycle time, SLA breaches

### Kanban mejorado:

- Mostrar "tiempo en etapa" en cada card
- Alertas visuales si excede SLA
- Botón "Ver documentos faltantes" antes de mover
- Indicador de campos requeridos incompletos

---

## 9. Database Migration Strategy

```sql
-- Migración incremental desde CRM actual

-- 1. Agregar tablas nuevas (no breaking changes)
CREATE TABLE crm_entity_configs (...)
CREATE TABLE crm_stage_transitions (...)
CREATE TABLE crm_intake_forms (...)
CREATE TABLE crm_calendar_events (...)

-- 2. Extender tablas existentes con JSONB
ALTER TABLE crm_deals ADD COLUMN entityConfigId text;
ALTER TABLE crm_deals ADD COLUMN timeTrackingEnabled boolean DEFAULT true;
ALTER TABLE crm_pipeline_stages ADD COLUMN entryRequirements jsonb DEFAULT '{}';
ALTER TABLE crm_pipeline_stages ADD COLUMN onEnterActions jsonb DEFAULT '[]';

-- 3. Default entity config para backwards compatibility
INSERT INTO crm_entity_configs (
  id, konId, entityName, singularLabel, pluralLabel
) VALUES (
  'default-deal', 'default', 'deal', 'Deal', 'Deals'
);

-- 4. Migrar deals existentes
UPDATE crm_deals SET entityConfigId = 'default-deal' WHERE entityConfigId IS NULL;
```

---

## 10. Ejemplo de Uso: Legal CRM Configurado

```typescript
// Configuración para Firma Legal
const legalConfig = {
  entityConfig: {
    entityName: "case",
    singularLabel: "Case",
    pluralLabel: "Cases",
    fieldSchema: [
      { key: "caseNumber", type: "text", label: "Case #", required: true, unique: true },
      {
        key: "practiceArea",
        type: "select",
        label: "Practice Area",
        options: ["Family", "Corporate", "Criminal", "PI"],
        required: true,
      },
      {
        key: "courtDate",
        type: "datetime",
        label: "Court Date",
        calendarSync: true,
        reminderDays: [7, 1],
      },
      { key: "retainerAmount", type: "currency", label: "Retainer", required: true },
      { key: "judgeName", type: "text", label: "Judge" },
      { key: "opposingCounsel", type: "contact", label: "Opposing Counsel" },
    ],
  },

  pipeline: {
    name: "Legal Case Pipeline",
    stages: [
      {
        name: "Intake",
        entryRequirements: { requiredFields: [] },
        onEnter: [{ type: "send_email", template: "intake_received" }],
      },
      {
        name: "Conflicts Check",
        estimatedDays: 2,
        entryRequirements: {
          requiredFields: ["caseNumber"],
          requiredDocuments: ["conflicts_check_form"],
        },
      },
      {
        name: "Retained",
        estimatedDays: 1,
        entryRequirements: {
          requiredFields: ["retainerAmount"],
          requiredDocuments: ["retainer_agreement", "fee_agreement"],
        },
        onEnter: [
          { type: "create_calendar_event", template: "Case opened: {caseNumber}" },
          { type: "create_task", title: "Open case file" },
        ],
      },
      { name: "Discovery", estimatedDays: 90 },
      { name: "Settlement/Trail", estimatedDays: 30 },
      {
        name: "Closed",
        onEnter: [
          { type: "log_time", description: "Total case duration" },
          { type: "create_task", title: "Archive case files" },
        ],
      },
    ],
  },

  intakeForm: {
    name: "Legal Intake Form",
    fields: [
      { id: "legal_issue", type: "textarea", label: "Describe your legal issue", required: true },
      {
        id: "urgency",
        type: "select",
        label: "Urgency",
        options: ["Immediate", "This week", "This month"],
      },
      { id: "documents", type: "file", label: "Relevant documents", multiple: true },
    ],
    onSubmit: [
      { type: "create_contact" },
      { type: "create_deal", stage: "Intake" },
      { type: "send_email", to: "intake@firm.com" },
    ],
  },
};
```

---

## Resumen de Esfuerzo

| Feature                 | Complejidad | Tiempo Est.          |
| ----------------------- | ----------- | -------------------- |
| Entity Configs          | Media       | 3-4 días             |
| Stage Validations       | Media       | 2-3 días             |
| Time Tracking           | Baja        | 2 días               |
| Document Requirements   | Media       | 3 días               |
| Intake Forms (Kitsuden) | Baja        | 2 días (reusa Forms) |
| Calendario              | Media-Alta  | 5-7 días             |
| Analytics/Reportes      | Media       | 3-4 días             |
| UI Components           | Alta        | 7-10 días            |
| **TOTAL**               |             | **3-4 semanas**      |

Esta arquitectura convierte el CRM en un **motor de automatización de workflows** configurable, no solo un tracker de deals.
