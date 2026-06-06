# Admin Grimoires — Filosofía & Guía de Arquitectura

> **Versión**: 1.0  
> **Estado**: Draft / Decisión Arquitectónica  
> **Filosofía**: Django Admin con superpoderes de Svelte

---

## 1. La Filosofía

Gremius no es un SaaS de usuario final. Es un **Backend-as-a-Service con panel de administración**. Las custom views del admin no son "aplicaciones de producto" — son **herramientas de gestión de datos** para administradores y operadores.

### 1.1 Analogía: Django Admin → Gremius Admin

| Django Admin                    | Gremius Admin                                |
| ------------------------------- | -------------------------------------------- |
| `ModelAdmin` registration       | `defineGrimoire({ admin: {...} })`           |
| `list_display`, `list_filter`   | DataExplorer genérico (`type: "grid"`)       |
| `change_form` con `inlines`     | Custom Svelte view para relaciones complejas |
| `readonly_fields`               | DataExplorer `readonly` mode                 |
| `actions` (bulk delete, export) | DataExplorer `bulkActions` / `rowActions`    |
| Dashboard con métricas          | Custom view (justificada)                    |

**La ventaja Svelte**: Reactividad fina, transiciones sin recarga, componentes UI reutilizables. Pero la **filosofía permanece**: convención sobre configuración, solo custom cuando el dominio lo exige.

---

## 2. La Regla de Oro

> **"Custom view = solo cuando el DataExplorer genérico no puede expresar la lógica de negocio del dominio."**

### 2.1 ¿Cuándo el DataExplorer NO sirve?

El DataExplorer genérico (grid/kanban/calendar) NO puede manejar:

- **Relaciones complejas con validación de negocio** (ej: partida doble debe=haber)
- **Vistas analíticas/dashboards** (reportes, métricas, gráficas)
- **Workflows con estados dinámicos** (pipeline Kanban con stages configurables)
- **Inlines anidados con lógica dependiente** (journal + líneas de mayor que deben cuadrar)
- **Procesos transaccionales multi-paso** (disbursements con retenciones)

### 2.2 ¿Cuándo el DataExplorer SÍ sirve?

Para el 70-80% de las tablas de un grimoire:

- Listados con búsqueda, filtros, sorting, paginación
- Forms de edición/creación estándar (campos textos, números, selects, relaciones simples)
- Acciones bulk (delete, export)
- Vistas de solo lectura con columnas configurables

---

## 3. Arquitectura Ideal: Hybrid Rendering

El admin debe implementar un sistema de **renderizado híbrido** que respete las declaraciones del grimoire:

```
Grimoire define admin.views:
├── type: "grid"     → DataExplorer genérico
├── type: "kanban"   → DataExplorer KanbanBoard (si aplica)
├── type: "calendar" → DataExplorer CalendarView
└── type: "custom"   → GRIMOIRE_VIEW_REGISTRY (fallback)
```

**No** hardcodear todo el grimoire al registry. Registrar **solo** las vistas custom que realmente lo necesitan.

### 3.1 Antipatrón Actual (a eliminar)

```ts
// ❌ Mal: Todo el grimoire va al registry
GRIMOIRE_VIEW_REGISTRY = {
  "grimoire-crm": () => import("$views/crm/CRMView.svelte"),
  "grimoire-conta": () => import("$views/conta/ContaView.svelte"),
  "grimoire-agile": () => import("$views/agile/AgileView.svelte"),
};
```

Esto ignora completamente `admin.views` del grimoire y fuerza monolitos Svelte.

### 3.2 Patrón Correcto

```ts
// ✅ Bien: Solo las vistas que realmente necesitan custom
GRIMOIRE_VIEW_REGISTRY = {
  // CRM: solo el pipeline Kanban es custom
  "crm-deal-pipeline": () => import("$views/crm/DealPipelineView.svelte"),
  "crm-dashboard": () => import("$views/crm/CrmDashboard.svelte"),

  // Conta: solo journal form (partida doble) y reports
  "conta-journal-form": () => import("$views/conta/JournalForm.svelte"),
  "conta-reports": () => import("$views/conta/ReportsView.svelte"),
  "conta-disbursement-form": () => import("$views/conta/DisbursementForm.svelte"),

  // Agile: idealmente NADA en admin. Si es necesario, intakes como grid custom.
};
```

Las vistas `type: "grid"` deben renderizarse vía DataExplorer consumiendo el endpoint `/api/explorer/:table`.

---

## 4. Análisis por Grimoire

---

### 4.1 CRM — Estado: ✅ Cercano al ideal

El CRM es el mejor ejemplo de la filosofía. Sus custom views son legítimas: un pipeline Kanban y un dashboard no pueden expresarse como config JSON.

#### 4.1.1 Qué mantener como custom

| Componente                  | Justificación                                              |
| --------------------------- | ---------------------------------------------------------- |
| `CrmDashboard.svelte`       | Métricas, gráficas, KPIs. No es un grid.                   |
| `DealPipelineView.svelte`   | Kanban con stages dinámicos. Drag-and-drop entre columnas. |
| `ActivityTimeline.svelte`   | Inline polimórfico (call/email/meeting/task).              |
| `DealForm.svelte` (parcial) | Campos condicionales por pipeline stage.                   |

#### 4.1.2 Qué migrar a DataExplorer

| Componente actual     | Reemplazo                                            |
| --------------------- | ---------------------------------------------------- |
| `CompanyList.svelte`  | DataExplorer `type: "grid"`, table: `crm_companies`  |
| `CompanyForm.svelte`  | AutoFormModal del DataExplorer                       |
| `ContactList.svelte`  | DataExplorer `type: "grid"`, table: `crm_contacts`   |
| `ContactForm.svelte`  | AutoFormModal del DataExplorer                       |
| `ActivityList.svelte` | DataExplorer `type: "grid"`, table: `crm_activities` |
| `ActivityForm.svelte` | AutoFormModal del DataExplorer                       |

#### 4.1.3 Mejoras recomendadas

- **Inline relations**: En `CompanyForm`, mostrar contacts inline (como Django `TabularInline`). Esto sí requiere custom view o extensión del AutoFormModal.
- **URL por entidad**: `/crm/companies`, `/crm/contacts`, `/crm/deals/pipeline` en lugar de tabs con query params.

---

### 4.2 Conta — Estado: ⚠️ Over-custom (deuda técnica)

Contabilidad requiere custom views para la lógica de partida doble, pero la mayoría de sus tablas son grids estándar.

#### 4.2.1 Qué mantener como custom

| Componente                | Justificación                                                                 |
| ------------------------- | ----------------------------------------------------------------------------- |
| `JournalForm.svelte`      | Partida doble: líneas de debe/haber que deben cuadrar. Validación de negocio. |
| `ReportsView.svelte`      | Balance, pérdidas y ganancias. Vistas analíticas.                             |
| `DisbursementForm.svelte` | Trust accounting con retenciones.                                             |
| `TemplateForm.svelte`     | Journal templates con líneas predefinidas.                                    |

#### 4.2.2 Qué migrar URGENTEMENTE a DataExplorer

| Componente actual     | Reemplazo                                                            |
| --------------------- | -------------------------------------------------------------------- |
| `AccountList.svelte`  | DataExplorer `type: "grid"`, table: `conta_accounts`                 |
| `AccountForm.svelte`  | AutoFormModal del DataExplorer                                       |
| `JournalList.svelte`  | DataExplorer `type: "grid"`, table: `conta_journals`                 |
| `LedgerList.svelte`   | DataExplorer `type: "grid"`, table: `conta_ledger_entries`, readonly |
| `TemplateList.svelte` | DataExplorer `type: "grid"`, table: `conta_journal_templates`        |

#### 4.2.3 Impacto

**Reducción**: De 10 componentes custom a ~4. El mantenimiento se reduce un 60%.

---

### 4.3 Agile — Estado: ❌ Fuera de filosofía

Agile rompe completamente el contrato. No es un panel de administración — es una app de producto (Jira/Trello/Linear) embebida en el admin.

#### 4.3.1 El problema

El `AgileView.svelte` (730 líneas) mezcla:

- Selector de proyectos
- Kanban board drag-and-drop
- Intake inbox con aprobación
- Gestión de estados/settings
- Creación de issues/projects/modales

**Esto no es Django Admin. Es un monolito de producto.**

#### 4.3.2 Qué debería ser (refactor completo)

**Opción A: Purista (recomendada)**

Migrar TODO a DataExplorer + custom views mínimas:

| Vista      | Tipo                            | Notas                                    |
| ---------- | ------------------------------- | ---------------------------------------- |
| Projects   | DataExplorer grid               | Grid estándar.                           |
| Issues     | DataExplorer grid               | Grid por proyecto con filtros.           |
| Cycles     | DataExplorer grid               | Fechas, estados.                         |
| Modules    | DataExplorer grid               | Nombre, descripción.                     |
| Intakes    | DataExplorer grid + row actions | Botones "approve/decline" por fila.      |
| Issue Form | AutoFormModal                   | Custom solo si necesita inline comments. |

**El Kanban board no vive en el admin.** Se mueve al **realm** como una vista de producto (si el usuario la necesita) o se sirve como una app separada consumiendo la API.

**Opción B: Pragmática**

Si el Kanban es absolutamente requerido en el admin:

- Separar `AgileView.svelte` en componentes reutilizables:
  - `ProjectSelector.svelte`
  - `KanbanBoard.svelte` (usar el del DataExplorer, no reinventar)
  - `IntakeList.svelte`
  - `IssueForm.svelte`
- El Kanban del DataExplorer ya soporta `groupBy`. Usarlo.

#### 4.3.3 APIs: unificar patrones

Actualmente Agile usa llamadas genéricas:

```ts
// ❌ Mal (Agile actual)
const data = await api.get("/agile/projects");
```

Debería usar el patrón tipado del CRM:

```ts
// ✅ Bien
const projects = await api.getAgileProjects();
const issues = await api.getAgileIssues(projectId);
```

---

## 5. Convenciones de Código para Custom Views

### 5.1 Estructura de archivos

Un grimoire con custom views DEBE seguir esta estructura en el admin:

```
packages/admin/src/views/
├── {grimoire-short}/           # ej: crm/, conta/, agile/
│   ├── {Grimoire}View.svelte   # Layout principal (tabs/router)
│   ├── {Entity}List.svelte     # Solo si DataExplorer no sirve
│   ├── {Entity}Form.svelte     # Solo si AutoFormModal no sirve
│   ├── {Special}View.svelte    # Dashboards, reports, analytics
│   └── types.ts                # Tipos compartidos del grimoire
```

**Regla**: Si una vista es un grid + form estándar, no crees componentes custom. Úsala via DataExplorer.

### 5.2 Cada custom view debe responder:

Antes de crear un `.svelte`, pregúntate:

1. ¿El DataExplorer puede mostrar estos datos con `type: "grid"`? → **Usa DataExplorer**
2. ¿Es solo un form con campos estándar? → **Usa AutoFormModal**
3. ¿Requiere validación de negocio entre múltiples entidades? → **Custom view justificada**
4. ¿Es un dashboard/reporte analítico? → **Custom view justificada**
5. ¿Es una experiencia de producto (Kanban, inbox, canvas)? → **NO va en el admin**

### 5.3 Consistencia de API

Todos los custom views deben consumir la API a través del cliente tipado de `$lib/api`:

```ts
// ✅ Bien (patrón CRM)
import { api } from "$lib/api";
const res = await api.getCrmDeals({ pipelineId, stageId });
```

```ts
// ❌ Mal (patrón Agile actual)
const data = await api.get("/agile/projects");
```

Si el endpoint no existe en el API client, agrégalo.

### 5.4 Tipos

Los tipos deben importarse de `packages/shared`, no definirse inline:

```ts
// ❌ Mal (AgileView.svelte actual)
interface Project { id: string; name: string; ... }
```

```ts
// ✅ Bien
import type { AgileProject, AgileIssue } from "@gremius/shared";
```

---

## 6. Plan de Migración

### Fase 1: Estabilizar arquitectura (1-2 semanas)

1. **Implementar Hybrid Rendering** en `grimoire-loader.ts`:
   - Leer `admin.views` del grimoire registry
   - Renderizar `type: "grid"`/`"kanban"`/`"calendar"` vía DataExplorer
   - Solo usar `GRIMOIRE_VIEW_REGISTRY` para `type: "custom"` o vistas explícitamente registradas

2. **Crear vista `type: "custom"` por defecto**:
   - Si un grimoire declara `type: "custom"` sin componente en registry, mostrar placeholder con mensaje útil.

### Fase 2: Conta (1 semana)

- Migrar `AccountList` → DataExplorer
- Migrar `JournalList` → DataExplorer
- Migrar `LedgerList` → DataExplorer (readonly)
- Migrar `TemplateList` → DataExplorer
- Mantener: `JournalForm`, `DisbursementForm`, `ReportsView`, `TemplateForm`
- **Reducción**: 10 → 4 componentes

### Fase 3: CRM (1-2 semanas)

- Migrar `CompanyList`, `ContactList`, `ActivityList` → DataExplorer
- Extraer `DealPipelineView` como custom aislado
- Mantener: `CrmDashboard`, `DealPipelineView`, `ActivityTimeline`
- Opcional: Implementar inlines en `CompanyForm` (contacts relacionados)
- **Reducción**: 11 → 5-6 componentes

### Fase 4: Agile (2-3 semanas)

- **Decisión de producto**: ¿El Kanban vive en el admin o en el realm?
- Si va en admin: refactorizar en componentes separados, reutilizar `KanbanBoard` del DataExplorer
- Migrar Projects, Issues, Cycles, Modules, Intakes → DataExplorer
- Unificar API client con métodos tipados
- **Reducción**: 1 monolito de 730 líneas → 1 layout + 1-2 componentes custom

### Fase 5: Documentación (1 semana)

- Actualizar esta guía con ejemplos reales post-refactor
- Crear template de custom view para nuevos grimoires
- Documentar en `SKILL.md` del builder de grimoires

---

## 7. Reglas para Nuevos Grimoires

### 7.1 Checklist al diseñar admin views

```markdown
## Admin View Checklist para Grimoires

- [ ] Todas las tablas tienen `type: "grid"` en `admin.views`?
- [ ] Solo las vistas que requieren lógica de negocio compleja usan `type: "custom"`?
- [ ] He justificado cada `type: "custom"` respondiendo: "¿por qué DataExplorer no sirve?"
- [ ] Los tipos TypeScript viven en `packages/shared`, no en el componente?
- [ ] La API usa el cliente tipado (`api.getXxx()`) en lugar de strings sueltos?
- [ ] No mezclo "vistas de producto" (Kanban, canvas, inbox) con "vistas de admin"?
```

### 7.2 Ejemplo de declaración ideal

```ts
// packages/grimoires/grimoire-inventory/index.ts
export const grimoire = defineGrimoire({
  id: "grimoire-inventory",
  name: "Inventory",

  admin: {
    category: "business",
    views: [
      // Estas se renderizan automáticamente por DataExplorer
      { id: "products", type: "grid", title: "Products", table: "inventory_products" },
      { id: "warehouses", type: "grid", title: "Warehouses", table: "inventory_warehouses" },
      { id: "movements", type: "grid", title: "Stock Movements", table: "inventory_movements" },

      // Esto requiere custom porque hay validación de stock en tiempo real
      {
        id: "stock-adjustment",
        type: "custom",
        title: "Stock Adjustment",
        component: "inventory-stock-adjustment", // referencia al registry
      },
    ],
  },
});
```

---

## 8. Métricas de Éxito

Después de aplicar esta filosofía, los grimoires deberían tener:

| Métrica                          | Target                            |
| -------------------------------- | --------------------------------- |
| % de tablas usando DataExplorer  | > 70%                             |
| Líneas de código por custom view | < 200 (ideal < 150)               |
| Componentes custom por grimoire  | 1-4 (dominios simples: 0)         |
| Reutilización de componentes UI  | 100% (Button, Input, Badge, etc.) |
| Tipos inline en custom views     | 0 (todos desde `@gremius/shared`) |
| Llamadas API con strings sueltos | 0                                 |

---

## 9. Decisiones Archivadas (ADR)

### ADR-001: Custom Views solo para dominios que superan al DataExplorer

**Contexto**: Los grimoires declararon `admin.views` con `type: "grid"`, pero el frontend hardcodeaba todo a componentes Svelte custom.

**Decisión**: Implementar Hybrid Rendering. El DataExplorer maneja grids/kanbans/calendars declarativos. Solo `type: "custom"` usa componentes Svelte.

**Consecuencias**:

- Menos código Svelte que mantener
- Consistencia UX en el 70% de las vistas
- Custom views concentradas donde realmente aportan valor

### ADR-002: No mezclar "vistas de producto" con "vistas de admin"

**Contexto**: Agile incluye un Kanban board drag-and-drop como vista principal del admin.

**Decisión**: Las experiencias de producto (Kanban, canvas, timelines interactivos) viven en el **realm** o como apps independientes. El admin es para gestión de datos.

**Consecuencias**:

- El admin permanece liviano y rápido
- Las apps de producto pueden evolucionar sin tocar el admin
- Separación clara de concerns

---

## 10. Referencias

- Django Admin documentation: https://docs.djangoproject.com/en/stable/ref/contrib/admin/
- `packages/admin/src/lib/grimoire-loader.ts` — Sistema de carga de vistas
- `packages/admin/src/lib/components/admin/DataExplorer.svelte` — DataExplorer genérico
- `packages/admin/src/lib/components/DataExplorer.svelte` — DataExplorer legacy
- `packages/shared/src/grimoire-api.ts` — Contrato `defineGrimoire`

---

_Documento creado tras análisis de los grimoires CRM, Conta y Agile. Aplicar antes de crear nuevos grimoires con custom views._
