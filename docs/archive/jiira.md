# KON AGILE - Sistema de Gestión de Proyectos para Kitsuden

## Visión General

**Kon Agile** es un sistema profesional de gestión de proyectos estilo Plane/Linear/Jira, diseñado específicamente para la arquitectura Kitsuden BaaS/CMS. Proporciona gestión ágil completa con separación clara entre **Tiempo** (Cycles/Sprints) y **Alcance** (Modules/Epics).

---

## 🎯 Principios de Diseño

1. **Separación de Concerns**: Cycles (tiempo) ≠ Modules (alcance)
2. **Estados como Entidades**: Cada proyecto define sus propios estados personalizados
3. **Inbox para IA**: Bandeja de entrada para triage antes de afectar el backlog
4. **Estimaciones Flexibles**: Sistema configurable (Fibonacci, Tallas, Lineal)
5. **Zero Config**: Usa el sistema `kon.json` de Kitsuden

---

## 📁 Estructura del Kon

```
packages/kons/kon-agile/
├── kon.json              # Manifiesto del módulo
├── index.ts                   # Punto de entrada
├── schema.ts                  # Esquema Drizzle completo
├── routes.ts                  # Rutas API Hono
├── types.ts                   # Tipos TypeScript
├── services/
│   ├── issue.service.ts
│   ├── cycle.service.ts
│   ├── module.service.ts
│   ├── intake.service.ts      # Triage para IA
│   └── board.service.ts
└── README.md
```

---

## 🗃️ Esquema de Base de Datos (schema.ts)

```typescript
import { pgTable, text, timestamp, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// ENUMS
// ============================================

export const issueTypeEnum = pgEnum("agile_issue_type", [
  "issue", // Tarea genérica
  "feature", // Nueva funcionalidad
  "bug", // Bug report
  "improvement", // Mejora
  "epic", // Épica (grupo de issues) - LEGACY, usar modules
  "sub_issue", // Sub-tarea
  "spike", // Investigación
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
  "pending", // Esperando triage
  "accepted", // Aceptado, creará un issue
  "declined", // Rechazado
  "duplicate", // Duplicado de otro
  "spam", // Spam
]);

export const linkTypeEnum = pgEnum("agile_link_type", [
  "blocks",
  "blocked_by",
  "relates_to",
  "duplicates",
  "duplicate_of",
  "parent_of", // Épica → Issue
  "child_of", // Issue → Épica
]);

export const estimateTypeEnum = pgEnum("agile_estimate_type", [
  "fibonacci", // 1, 2, 3, 5, 8, 13, 21
  "linear", // 1, 2, 3, 4, 5
  "tshirt", // XS, S, M, L, XL, XXL
  "days", // 0.5, 1, 2, 3, 5, 8
  "points", // Personalizado
]);

// ============================================
// TABLAS CORE
// ============================================

/**
 * PROYECTOS - Contenedores de trabajo
 */
export const agileProjects = pgTable("agile_projects", {
  id: text("id").primaryKey(),

  // Identificación
  name: text("name").notNull(),
  identifier: text("identifier").notNull().unique(), // Ej: "PROJ" (para keys PROJ-123)
  description: text("description"),

  // Estado
  isArchived: boolean("is_archived").default(false),

  // Liderazgo
  leadId: text("lead_id"), // FK a users
  defaultAssigneeId: text("default_assignee_id"),

  // Visual
  emoji: text("emoji").default("📁"),
  color: text("color").default("#6366f1"),
  iconProp: jsonb("icon_prop").$type<{ icon: string; color: string }>(),

  // Contador para auto-generar issue keys
  keyCounter: integer("key_counter").default(0),

  // Configuración
  config: jsonb("config")
    .$type<{
      estimateType: "fibonacci" | "linear" | "tshirt" | "days" | "points";
      coverImage?: string;
      timezone?: string;
      weekStartDay?: number; // 0 = Domingo, 1 = Lunes
      totalCycles?: number;
      totalModules?: number;
      totalIssues?: number;
    }>()
    .default({ estimateType: "fibonacci" }),

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
});

/**
 * ESTADOS - Columnas del Kanban (ENTIDAD PRIMERA CLASE)
 *
 * Cada proyecto define sus propios estados. Los tableros Kanban
 * dibujan las columnas leyendo esta tabla, no los issues.
 */
export const agileStates = pgTable("agile_states", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),

  // Identificación
  name: text("name").notNull(), // Ej: "En Progreso", "Code Review"
  description: text("description"),

  // Grupo lógico (para UI y reportes)
  group: text("group").notNull(), // 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled'

  // Visual
  color: text("color").default("#94a3b8"),

  // Posición en el tablero
  sequence: integer("sequence").default(0),

  // Comportamiento
  isDefault: boolean("is_default").default(false), // Estado inicial para nuevos issues
  isCompleted: boolean("is_completed").default(false), // Marca issue como hecho
  isCancelled: boolean("is_cancelled").default(false), // Marca como cancelado

  // Validaciones al entrar a este estado
  validations: jsonb("validations")
    .$type<{
      requireAssignee?: boolean;
      requireEstimate?: boolean;
      requireDescription?: boolean;
    }>()
    .default({}),

  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * ISSUES - Elementos de trabajo
 */
export const agileIssues = pgTable("agile_issues", {
  id: text("id").primaryKey(),

  // Key única (PROJ-123)
  key: text("key").notNull(),

  // Contenido
  name: text("name").notNull(), // Título
  descriptionHtml: text("description_html"), // Descripción en HTML
  descriptionText: text("description_text"), // Versión plaintext para search

  // Clasificación
  type: issueTypeEnum("type").default("issue").notNull(),
  priority: issuePriorityEnum("priority").default("medium").notNull(),

  // Relaciones jerárquicas
  projectId: text("project_id").notNull(),
  parentId: text("parent_id"), // Para sub-issues

  // Asignación
  assigneeId: text("assignee_id"),
  createdBy: text("created_by").notNull(),

  // Estado (FK a agile_states)
  stateId: text("state_id").notNull(),

  // TIEMPO: Ciclo/Sprint actual
  cycleId: text("cycle_id"),

  // ALCANCE: Módulo/Épica al que pertenece
  moduleId: text("module_id"),

  // Posición para ordenamiento en listas/boards
  sequence: integer("sequence").default(0),
  sortOrder: integer("sort_order").default(0), // Para drag & drop

  // Estimación (valor del sistema configurado en proyecto)
  estimate: integer("estimate"), // Puntos según agile_estimates

  // Tracking de tiempo
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),

  // Fechas planificadas
  targetDate: timestamp("target_date"),

  // Metadata extensible
  props: jsonb("props")
    .$type<{
      parentKey?: string;
      component?: string;
      affectedVersion?: string;
      fixVersion?: string;
      environment?: string;
      source?: string;
      customFields?: Record<string, unknown>;
    }>()
    .default({}),

  // Flags
  isDraft: boolean("is_draft").default(false),
  isSubIssue: boolean("is_sub_issue").default(false),

  // Contadores (para performance)
  subIssuesCount: integer("sub_issues_count").default(0),
  commentsCount: integer("comments_count").default(0),
  attachmentsCount: integer("attachments_count").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * CYCLES - Sprints (Miden TIEMPO)
 *
 * "Lo que haremos esta semana/quincena"
 */
export const agileCycles = pgTable("agile_cycles", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),

  // Identificación
  name: text("name").notNull(), // Ej: "Cycle 12", "Sprint 3"
  description: text("description"),

  // Fechas
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),

  // Estado
  status: cycleStatusEnum("status").default("draft").notNull(),

  // Objetivo del ciclo
  goal: text("goal"),

  // Capacidad del equipo (opcional)
  capacity: integer("capacity"), // Puntos totales que pueden comprometer

  // Métricas calculadas
  stats: jsonb("stats")
    .$type<{
      totalIssues: number;
      completedIssues: number;
      cancelledIssues: number;
      startedIssues: number;
      unstartedIssues: number;
      backlogIssues: number;
      totalEstimate: number;
      completedEstimate: number;
      burndown?: Array<{
        date: string;
        remaining: number;
        ideal?: number;
      }>;
      velocity?: number;
    }>()
    .default({}),

  // Configuración
  viewProps: jsonb("view_props")
    .$type<{
      filters?: Record<string, unknown>;
      displayProperties?: string[];
      groupBy?: string;
      orderBy?: string;
    }>()
    .default({}),

  // Ciclo activo (solo uno por proyecto)
  isActive: boolean("is_active").default(false),

  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * MODULES - Épicas/Módulos (Miden ALCANCE)
 *
 * "Lanzar el nuevo sistema de Login" - puede tomar varios Cycles
 * Alimenta la vista de Roadmap
 */
export const agileModules = pgTable("agile_modules", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  leadId: text("lead_id"),

  // Identificación
  name: text("name").notNull(),
  description: text("description"),
  descriptionText: text("description_text"),

  // Estado del módulo
  status: moduleStatusEnum("status").default("backlog").notNull(),

  // Fechas (planificadas vs reales)
  startDate: timestamp("start_date"),
  targetDate: timestamp("target_date"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),

  // Visual
  color: text("color").default("#6366f1"),

  // Métricas
  stats: jsonb("stats")
    .$type<{
      totalIssues: number;
      completedIssues: number;
      cancelledIssues: number;
      totalEstimate: number;
      completedEstimate: number;
      progress: number;
    }>()
    .default({ progress: 0 }),

  // Jerarquía (módulos anidados)
  parentId: text("parent_id"),

  // Metadata
  viewProps: jsonb("view_props").default({}),

  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Relación Module ↔ Issues (muchos a muchos)
 * Permite que un issue pertenezca a múltiples módulos si es necesario
 */
export const agileModuleIssues = pgTable("agile_module_issues", {
  id: text("id").primaryKey(),
  moduleId: text("module_id").notNull(),
  issueId: text("issue_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * INTAKES - Bandeja de Entrada para Triage (Killer Feature para IA!)
 *
 * Cuando un Agente IA dice "Revisa logs y crea tickets", NO debe
 * contaminar el backlog. Los crea aquí para que un humano los apruebe.
 */
export const agileIntakes = pgTable("agile_intakes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),

  // Contenido
  title: text("title").notNull(),
  description: text("description"),

  // Tipo y prioridad sugeridos
  suggestedType: issueTypeEnum("suggested_type"),
  suggestedPriority: issuePriorityEnum("suggested_priority"),
  suggestedStateId: text("suggested_state_id"),

  // Origen
  source: text("source").notNull(), // 'api', 'slack', 'email', 'form', 'ai_agent'
  sourceData: jsonb("source_data")
    .$type<{
      slackChannel?: string;
      slackUser?: string;
      emailFrom?: string;
      aiAgentId?: string;
      aiPrompt?: string;
      formId?: string;
      ipAddress?: string;
    }>()
    .default({}),

  // Estado de triage
  status: intakeStatusEnum("status").default("pending").notNull(),

  // Decisión
  decidedBy: text("decided_by"), // Quién hizo el triage
  decidedAt: timestamp("decided_at"),
  decisionReason: text("decision_reason"), // Por qué se aceptó/rechazó

  // Si fue aceptado
  createdIssueId: text("created_issue_id"), // FK al issue creado
  createdIssueKey: text("created_issue_key"), // PROJ-123

  // Si fue rechazado/duplicado
  duplicateOfId: text("duplicate_of_id"), // Si es duplicado, referencia al original

  // Metadata del creador (puede ser anónimo o externo)
  createdBy: text("created_by"), // null = anónimo
  createdByEmail: text("created_by_email"),
  createdByName: text("created_by_name"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * SISTEMA DE ESTIMACIÓN PERSONALIZABLE
 *
 * Cada proyecto configura su sistema: Fibonacci, Tallas, Lineal, etc.
 */
export const agileEstimates = pgTable("agile_estimates", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),

  // Configuración del sistema
  type: estimateTypeEnum("type").notNull(),
  name: text("name").notNull(), // "Story Points", "T-shirt Sizes", "Días"

  // Si es tipo 'points', estos son los valores permitidos
  customPoints: jsonb("custom_points").$type<
    Array<{
      value: number; // Valor numérico interno
      label: string; // Label mostrado ("S", "M", "5", "8")
      color?: string;
    }>
  >(),

  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * LABELS - Etiquetas por proyecto
 */
export const agileLabels = pgTable("agile_labels", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),

  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#6366f1"),

  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Relación Issue ↔ Labels
 */
export const agileIssueLabels = pgTable("agile_issue_labels", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  labelId: text("label_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * LINKS entre Issues
 */
export const agileIssueLinks = pgTable("agile_issue_links", {
  id: text("id").primaryKey(),

  sourceId: text("source_id").notNull(),
  targetId: text("target_id").notNull(),

  linkType: linkTypeEnum("link_type").notNull(),
  relation: text("relation"), // Nombre legible de la relación

  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by"),
});

/**
 * COMENTARIOS
 */
export const agileComments = pgTable("agile_comments", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),

  // Contenido
  contentHtml: text("content_html").notNull(),
  contentText: text("content_text"),

  // Autor
  createdBy: text("created_by").notNull(),

  // Edición
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),

  // Threading (respuestas)
  parentId: text("parent_id"),

  // Reacciones
  reactions: jsonb("reactions").$type<Record<string, string[]>>().default({}),

  // Acceso
  access: text("access").default("public"), // 'public', 'internal', 'restricted'

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * ACTIVITY LOG - Auditoría completa
 */
export const agileActivityLog = pgTable("agile_activity_log", {
  id: text("id").primaryKey(),

  // Actor
  actorId: text("actor_id").notNull(),

  // Objeto afectado
  entityType: text("entity_type").notNull(), // 'issue', 'project', 'cycle', 'module', 'intake'
  entityId: text("entity_id").notNull(),

  // Acción
  action: text("action").notNull(), // 'created', 'updated', 'deleted', 'state_changed', 'assigned'

  // Cambios específicos
  field: text("field"), // Campo afectado (para updates)
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),

  // Descripción legible
  description: text("description"),

  // Metadata
  metadata: jsonb("metadata").default({}),

  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// RELACIONES
// ============================================

export const agileProjectsRelations = relations(agileProjects, ({ many }) => ({
  issues: many(agileIssues),
  states: many(agileStates),
  cycles: many(agileCycles),
  modules: many(agileModules),
  intakes: many(agileIntakes),
  labels: many(agileLabels),
  estimates: many(agileEstimates),
}));

export const agileStatesRelations = relations(agileStates, ({ one, many }) => ({
  project: one(agileProjects, {
    fields: [agileStates.projectId],
    references: [agileProjects.id],
  }),
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
  subIssues: many(agileIssues, {
    relationName: "subIssues",
  }),
  comments: many(agileComments),
  labels: many(agileIssueLabels),
  outgoingLinks: many(agileIssueLinks, {
    relationName: "source",
  }),
  incomingLinks: many(agileIssueLinks, {
    relationName: "target",
  }),
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
  issues: many(agileIssues),
  moduleIssues: many(agileModuleIssues),
  parent: one(agileModules, {
    fields: [agileModules.parentId],
    references: [agileModules.id],
    relationName: "subModules",
  }),
  subModules: many(agileModules, {
    relationName: "subModules",
  }),
}));

export const agileIntakesRelations = relations(agileIntakes, ({ one }) => ({
  project: one(agileProjects, {
    fields: [agileIntakes.projectId],
    references: [agileProjects.id],
  }),
  createdIssue: one(agileIssues, {
    fields: [agileIntakes.createdIssueId],
    references: [agileIssues.id],
  }),
}));
```

---

## 📡 API Endpoints

```typescript
// ============================================
// PROJECTS
// ============================================
GET    /api/agile/projects                 # Listar proyectos
POST   /api/agile/projects                 # Crear proyecto (auto-crea estados default)
GET    /api/agile/projects/:id             # Detalle con estadísticas
PATCH  /api/agile/projects/:id             # Actualizar
DELETE /api/agile/projects/:id             # Archivar

// ============================================
// STATES (Kanban Columns)
// ============================================
GET    /api/agile/projects/:id/states      # Estados del proyecto
POST   /api/agile/projects/:id/states      # Crear estado
PATCH  /api/agile/states/:stateId          # Actualizar estado
POST   /api/agile/states/reorder           # Reordenar estados

// ============================================
// ISSUES
// ============================================
GET    /api/agile/issues                   # Búsqueda global
POST   /api/agile/projects/:id/issues      # Crear issue (auto-genera KEY)
GET    /api/agile/issues/:key              # Detalle completo
PATCH  /api/agile/issues/:key              # Actualizar
POST   /api/agile/issues/:key/transition   # Cambiar estado
DELETE /api/agile/issues/:key              # Eliminar

// Sub-issues
POST   /api/agile/issues/:key/sub-issues   # Crear sub-issue

// ============================================
// CYCLES (Sprints - TIEMPO)
// ============================================
GET    /api/agile/projects/:id/cycles      # Listar cycles
POST   /api/agile/projects/:id/cycles      # Crear cycle
GET    /api/agile/cycles/:id               # Detalle con stats
POST   /api/agile/cycles/:id/start         # Iniciar sprint
POST   /api/agile/cycles/:id/complete      # Completar sprint
GET    /api/agile/cycles/:id/burndown      # Datos burndown
POST   /api/agile/cycles/:id/issues        # Añadir issues

// ============================================
// MODULES (Epics - ALCANCE)
// ============================================
GET    /api/agile/projects/:id/modules     # Listar módulos
POST   /api/agile/projects/:id/modules     # Crear módulo
GET    /api/agile/modules/:id              # Detalle con issues
GET    /api/agile/modules/:id/progress     # Progreso calculado
POST   /api/agile/modules/:id/issues       # Añadir issues

// ============================================
// INTAKES (Triage para IA!)
// ============================================
GET    /api/agile/projects/:id/intakes     # Bandeja de entrada
POST   /api/agile/projects/:id/intakes     # Crear intake (para IA)
POST   /api/agile/intakes/:id/accept       # Aceptar → crea issue
POST   /api/agile/intakes/:id/decline      # Rechazar
POST   /api/agile/intakes/:id/duplicate    # Marcar duplicado

// ============================================
// COMMENTS
// ============================================
GET    /api/agile/issues/:key/comments     # Listar comentarios
POST   /api/agile/issues/:key/comments     # Crear comentario
PATCH  /api/agile/comments/:id             # Editar comentario
POST   /api/agile/comments/:id/reactions   # Añadir reacción

// ============================================
// LABELS
// ============================================
GET    /api/agile/projects/:id/labels      # Listar labels
POST   /api/agile/projects/:id/labels      # Crear label
POST   /api/agile/issues/:key/labels       # Asignar labels

// ============================================
// ROADMAP & SEARCH
// ============================================
GET    /api/agile/roadmap                  # Datos para vista roadmap
POST   /api/agile/search                   # Búsqueda avanzada tipo JQL
```

---

## 📋 Manifiesto (kon.json)

```json
{
  "id": "kon-agile",
  "name": "Agile Project Management",
  "description": "Sistema profesional de gestión ágil con Cycles (tiempo), Modules (alcance), States personalizables e Intake para triage de IA",
  "version": "1.0.0",
  "type": "kon",
  "icon": "Kanban",
  "tables": [
    {
      "name": "agile_projects",
      "label": "Projects",
      "icon": "FolderKanban",
      "searchableFields": ["name", "identifier", "description"],
      "filterableFields": ["isArchived", "leadId"]
    },
    {
      "name": "agile_states",
      "label": "States",
      "icon": "Columns3",
      "readonly": true
    },
    {
      "name": "agile_issues",
      "label": "Issues",
      "icon": "CircleDot",
      "searchableFields": ["name", "descriptionText", "key"],
      "filterableFields": [
        "type",
        "priority",
        "stateId",
        "assigneeId",
        "cycleId",
        "moduleId",
        "projectId"
      ]
    },
    {
      "name": "agile_cycles",
      "label": "Cycles",
      "icon": "Timer",
      "searchableFields": ["name", "description", "goal"],
      "filterableFields": ["status", "projectId", "isActive"]
    },
    {
      "name": "agile_modules",
      "label": "Modules",
      "icon": "Component",
      "searchableFields": ["name", "description"],
      "filterableFields": ["status", "leadId", "projectId"]
    },
    {
      "name": "agile_intakes",
      "label": "Intakes",
      "icon": "Inbox",
      "searchableFields": ["title", "description"],
      "filterableFields": ["status", "source", "projectId"]
    },
    {
      "name": "agile_labels",
      "label": "Labels",
      "icon": "Tag",
      "searchableFields": ["name"]
    },
    {
      "name": "agile_comments",
      "label": "Comments",
      "icon": "MessageSquare",
      "readonly": true
    },
    {
      "name": "agile_issue_links",
      "label": "Issue Links",
      "icon": "Link",
      "readonly": true
    },
    {
      "name": "agile_activity_log",
      "label": "Activity Log",
      "icon": "Activity",
      "readonly": true
    }
  ],
  "admin": {
    "category": "productivity",
    "defaultView": "grid",
    "views": [
      {
        "id": "projects",
        "type": "grid",
        "title": "Projects",
        "table": "agile_projects"
      },
      {
        "id": "board",
        "type": "kanban",
        "title": "Board View",
        "table": "agile_issues",
        "groupBy": "stateId"
      },
      {
        "id": "list",
        "type": "list",
        "title": "List View",
        "table": "agile_issues"
      },
      {
        "id": "roadmap",
        "type": "timeline",
        "title": "Roadmap",
        "table": "agile_modules"
      },
      {
        "id": "intakes",
        "type": "grid",
        "title": "Intake Triage",
        "table": "agile_intakes"
      }
    ]
  }
}
```

---

## 🤖 Integración MCP para Agentes IA

### Tools Exponibles

```typescript
agile_search_issues; // Buscar issues
agile_get_issue; // Obtener detalle de issue por key
agile_create_issue; // Crear issue directamente
agile_create_intake; // Crear en bandeja de entrada (RECOMENDADO PARA IA)
agile_update_issue; // Actualizar issue
agile_get_project_status; // Resumen del proyecto
agile_get_cycle_status; // Estado del sprint
agile_list_modules; // Listar módulos/épicas
```

### Flujo Recomendado para Agentes IA

```
1. Agente detecta problema (logs, errores, etc.)
   ↓
2. Usa agile_create_intake (NO agile_create_issue directo)
   ↓
3. Intake queda en estado 'pending' para triage humano
   ↓
4. Humano revisa bandeja de entrada
   ↓
5. Humano acepta → se crea el issue formal
   ↓
6. Issue entra al workflow normal
```

---

## ✅ Checklist de Arquitectura

| Principio                  | Implementación                                        |
| -------------------------- | ----------------------------------------------------- |
| **Cycles ≠ Modules**       | Tablas separadas: cycles (tiempo) + modules (alcance) |
| **Estados como Entidades** | Tabla agile_states, no string en issue                |
| **Inbox para IA**          | Tabla agile_intakes con flujo de triage               |
| **Estimaciones Flexibles** | Tabla agile_estimates con tipos configurables         |
| **Keys Únicas**            | PROJ-123 auto-generado con counter                    |
| **Zero Config**            | kon.json con tables y admin.views                     |
| **MCP Ready**              | Tools definidos para agentes                          |

---

## 🚀 Instalación

```bash
# 1. Crear directorio
mkdir packages/kons/kon-agile

# 2. Copiar archivos del plan
# - kon.json
# - schema.ts
# - routes.ts
# - index.ts

# 3. Ejecutar migraciones
cd apps/api && pnpm drizzle-kit migrate

# 4. Restart servidor
pnpm start

# 5. Verificar
# Ir a /admin → "Agile Project Management" en sidebar
```

---

## 💡 Diferencias Clave vs Jira Tradicional

| Aspecto                | Jira Tradicional     | Kon Agile                                     |
| ---------------------- | -------------------- | --------------------------------------------- |
| **Épicas vs Sprints**  | Épicas como campo    | Modules (alcance) y Cycles (tiempo) separados |
| **Estados**            | Workflow global      | Cada proyecto define sus propios estados      |
| **Bandeja de entrada** | No tiene             | Intakes para triage antes de backlog          |
| **Estimaciones**       | Story points fijo    | Fibonacci, Tallas, Lineal, Días configurables |
| **Keys**               | PROJ-123 configurado | Auto-generado con contador                    |
| **Arquitectura**       | Monolito             | Modular Kitsuden con RLS + JSONB              |
