# Compatibilidad con Gremius Zero Config System

## ✅ Estado: FULLY COMPLIANT (v1.1.0)

---

## 📦 Estructura de Archivos

```
packages/grimoires/grimoire-agile/
├── grimoire.json          ✅ Manifest Zero Config
├── index.ts               ✅ GrimoireDefinition + exports
├── schema.ts              ✅ Drizzle ORM schema (13 tablas)
├── agile.routes.ts        ✅ Hono router con DI
├── mcp.ts                 ✅ MCP tools para IA
└── ZERO_CONFIG_COMPAT.md  ✅ Este documento
```

---

## 🔌 GrimoireDefinition (index.ts)

```typescript
export const grimoire: GrimoireDefinition = defineGrimoire({
    id: "grimoire-agile",
    name: "Agile Tracker",
    version: "1.1.0",
    mountPath: "/api/agile",
    createRouter: createGrimoireAgile,  // Factory con DI
    hooks: { onStartup, onEnable, onDisable },
    admin: { category: "productivity", views: [...] },
    tables: ["agile_projects", "agile_issues", ...],
    dependencies: { grimoires: [], core: ["auth"] }
});
```

**✅ Estado:** Implementado correctamente con `defineGrimoire()`

---

## 📋 Manifest (grimoire.json)

```json
{
  "id": "grimoire-agile",
  "name": "Agile Tracker",
  "version": "1.1.0",
  "mount": { "path": "/api/agile" },
  "tables": [...],
  "admin": { "category": "productivity", "views": [...] }
}
```

**✅ Estado:** Configuración válida para module-loader v3

---

## 🔄 Dependency Injection

### Database Access
```typescript
// ✅ CORRECTO: Usar db.instance
await db.instance
    .select()
    .from(agileIssues)
    .where(eq(agileIssues.projectId, projectId));

// ❌ INCORRECTO: Usar db directamente
await db.select()... // Error: db no tiene métodos de query
```

### Correcciones Aplicadas (v1.1.0)
- [x] `agile.routes.ts`: Todos los queries usan `db.instance`
- [x] `mcp.ts`: Acceso correcto a base de datos
- [x] Consistencia en todas las operaciones CRUD

---

## 🎯 MCP Integration

### Tools Disponibles

| Tool | Tipo | Descripción |
|------|------|-------------|
| `agile_read_board` | Read-only | Lee tablero Kanban organizado por estados |
| `agile_submit_intake` | Write-controlled | Crea sugerencia en bandeja de entrada |

### Flujo de IA → Aprobación Humana
```
IA detecta problema
        ↓
agile_submit_intake() → Crea intake (status='pending')
        ↓
Humano revisa en Admin UI
        ↓
[APROBAR] → Transacción atómica → Issue creado
[RECHAZAR] → Intake marcado como declined
```

---

## 🎨 Admin UI Configuration

### Categoría
```json
{
  "admin": {
    "category": "productivity",
    "defaultView": "board"
  }
}
```

### Vistas Configuradas
| ID | Tipo | Tabla | Descripción |
|----|------|-------|-------------|
| projects | grid | agile_projects | Lista de proyectos |
| board | kanban | agile_issues | Tablero Kanban (groupBy: stateId) |
| intakes | grid | agile_intakes | Bandeja de entrada |
| cycles | grid | agile_cycles | Sprints |
| modules | grid | agile_modules | Épicas |

---

## 🗄️ Esquema de Base de Datos

### Tablas (13 total)

| Tabla | Propósito | Dependencias |
|-------|-----------|--------------|
| agile_projects | Proyectos | - (raíz) |
| agile_states | Estados Kanban | agile_projects |
| agile_issues | Issues/Tasks | agile_projects, agile_states |
| agile_cycles | Sprints (tiempo) | agile_projects |
| agile_modules | Épicas (alcance) | agile_projects |
| agile_intakes | Bandeja entrada | agile_projects |
| agile_comments | Comentarios | agile_issues |
| agile_labels | Etiquetas | agile_projects |
| agile_estimates | Config estimación | agile_projects |
| agile_module_issues | Junction M:M | agile_modules, agile_issues |
| agile_issue_labels | Junction M:M | agile_issues, agile_labels |
| agile_issue_links | Links entre issues | agile_issues |
| agile_activity_log | Auditoría | agile_projects, agile_issues |

### Enums
- `agile_issue_type`: issue, feature, bug, improvement, epic, sub_issue, spike
- `agile_issue_priority`: urgent, high, medium, low
- `agile_cycle_status`: draft, started, completed, cancelled
- `agile_module_status`: backlog, planned, in_progress, paused, completed, cancelled
- `agile_intake_status`: pending, accepted, declined, duplicate, spam
- `agile_link_type`: blocks, blocked_by, relates_to, duplicates, duplicate_of, parent_of, child_of
- `agile_estimate_type`: fibonacci, linear, tshirt, days, points
- `agile_state_group`: backlog, unstarted, started, completed, cancelled

---

## 🚀 API Endpoints

### Projects
```
GET    /api/agile/projects              # Listar proyectos
GET    /api/agile/projects/:id          # Detalle con estados
POST   /api/agile/projects              # Crear proyecto (+ estados default)
```

### Issues
```
GET    /api/agile/:projectId/issues     # Listar issues
GET    /api/agile/issues/:key           # Obtener por key (PROJ-123)
POST   /api/agile/:projectId/issues     # Crear issue (auto-genera key)
PATCH  /api/agile/issues/:key           # Actualizar issue
```

### Intakes (AI Triage)
```
GET    /api/agile/:projectId/intakes    # Listar intakes
POST   /api/agile/:projectId/intakes    # Crear intake
POST   /api/agile/intakes/:id/approve   # Aprobar → Crea issue
POST   /api/agile/intakes/:id/decline   # Rechazar
POST   /api/agile/intakes/:id/duplicate # Marcar duplicado
```

### Cycles (Sprints)
```
GET    /api/agile/:projectId/cycles     # Listar cycles
POST   /api/agile/:projectId/cycles     # Crear cycle
```

### Modules (Epics)
```
GET    /api/agile/:projectId/modules    # Listar modules
POST   /api/agile/:projectId/modules    # Crear module
```

### Comments
```
GET    /api/agile/issues/:key/comments  # Listar comentarios
POST   /api/agile/issues/:key/comments  # Crear comentario
```

---

## ✅ Checklist Zero Config

| Requisito | Estado |
|-----------|--------|
| `grimoire.json` con `id`, `name`, `version` | ✅ |
| `index.ts` exporta `grimoire` (GrimoireDefinition) | ✅ |
| `createRouter` con DI (ctx: GrimoireContext) | ✅ |
| Uso correcto de `db.instance` | ✅ |
| `hooks` configurados (onStartup, onEnable, onDisable) | ✅ |
| `admin.views` configurado | ✅ |
| Tablas definidas en `tables` | ✅ |
| Iconos válidos de Lucide | ✅ |
| Sin dependencias circulares | ✅ |
| Compatible con Gremius >=0.8.0 | ✅ |

---

## 🔄 Lifecycle Hooks

### onStartup
```typescript
async (ctx) => {
    ctx.logger.info("📋 Agile grimoire initialized");
    // Verifica que tablas existen
    // Logea advertencias si faltan migraciones
}
```

### onEnable
```typescript
async (ctx) => {
    ctx.logger.info("📋 Agile Tracker enabled");
}
```

### onDisable
```typescript
async (ctx) => {
    ctx.logger.info("📋 Agile Tracker disabled");
}
```

---

## 📊 Estado de Correcciones (v1.1.0)

| Issue | Descripción | Estado |
|-------|-------------|--------|
| #1 | Inconsistencia db vs db.instance | ✅ Corregido |
| #2 | Falta export GrimoireDefinition | ✅ Agregado |
| #3 | grimoire.json router incorrecto | ✅ Eliminado campo obsoleto |
| #4 | Imports sin usar (or, isNull) | ✅ Limpiados |
| #5 | @ts-nocheck innecesario | ✅ Removido |

---

## 🎯 Resumen de Compatibilidad

| Sistema | Estado | Notas |
|---------|--------|-------|
| **Autoloading** | ✅ | `module-loader.ts` v3 compatible |
| **Sidebar** | ✅ | Categoría: "productivity" |
| **Data Explorer** | ✅ | 6 vistas configuradas |
| **Zero Config** | ✅ | Sin registro manual |
| **MCP Tools** | ✅ | 2 tools con descripciones enriquecidas |
| **DI Pattern** | ✅ | Usa GrimoireContext correctamente |

**Resultado Final:** ✅ **FULLY COMPLIANT con Gremius Zero Config System**
