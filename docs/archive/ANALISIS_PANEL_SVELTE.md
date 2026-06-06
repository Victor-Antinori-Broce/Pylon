# Análisis del Panel de Administración en Svelte

**Fecha:** 26 de abril de 2026  
**Versión:** GremiusCMS v0.8.0-beta  
**Estado:** ✅ Refactor de Hybrid Rendering COMPLETADO. Admin liviano y funcional.

---

## Resumen Ejecutivo

| Área                                     | Estado            | Notas                                                                        |
| ---------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| Nomenclatura (Grimoires/Realms/Actions)  | ✅ **ESTABLE**    | Sidebar alineado con la arquitectura de paquetes                             |
| Hybrid Rendering (DataExplorer + Custom) | ✅ **COMPLETADO** | `GrimoirePage.svelte` carga DataExplorer o custom view según `grimoire.json` |
| Grimoires View                           | ✅ **COMPLETO**   | Toggle, uninstall, delete permanente, confirmaciones, categorías             |
| Actions (Workers + Webhooks unificados)  | ✅ **COMPLETO**   | `ActionsView.svelte` con fallback a legacy APIs                              |
| AI Agents                                | ⚠️ **DUAL**       | Vista de ejecución (`/agents`) + gestión NHI (tab en Settings)               |
| Settings General                         | ✅ **FUNCIONAL**  | `saveGeneralSettings` persiste vía `PATCH /api/settings`                     |
| CRM Admin                                | ✅ **HYBRID**     | 2 custom views justificadas (CrmDashboard, DealForm) + DataExplorer          |
| Conta Admin                              | ✅ **HYBRID**     | 4 custom views justificadas (forms + reports) + DataExplorer                 |
| Agile Admin                              | ✅ **ELIMINADO**  | `AgileView.svelte` ya no existe. Puro DataExplorer (5 grids)                 |
| Blog                                     | ✅ **GRIMOIRE**   | Carga vía `grimoire-loader` con `PostsView.svelte` o DataExplorer            |
| Workers/Webhooks legacy                  | ✅ **ELIMINADOS** | Vistas y rutas eliminadas del filesystem                                     |

---

## 1. Arquitectura del Admin — Nivel Actual

### 1.1 Flujo de Renderizado Híbrido (Implementado)

```
routes/g/[id]/+page.svelte
        ↓
   GrimoirePage.svelte
        ↓
   ├─ hasCustomView()? ─→ loadCustomView() ─→ Componente Svelte Custom
   │                      (per-view registry)
   │
   └─ else ─→ getGrimoireConfig() ─→ generateExplorerConfig()
                                          ↓
                                    DataExplorer.svelte
                                    ├─ type: "grid" → GridView
                                    ├─ type: "kanban" → KanbanBoard
                                    └─ type: "calendar" → CalendarView
```

**Archivos clave:**

- `packages/admin/src/lib/components/admin/GrimoirePage.svelte` — Orquestador
- `packages/admin/src/lib/grimoire-loader.ts` — Registro por vista (no por grimoire)
- `packages/admin/src/lib/components/admin/DataExplorer.svelte` — Grid/Kanban/Calendar genérico
- `packages/admin/src/lib/components/admin/AutoFormModal.svelte` — Formulario auto-generado

### 1.2 Registro de Vistas Custom (Nuevo sistema)

`GRIMOIRE_VIEW_REGISTRY` ahora registra **vistas custom por ID**, no grimoires enteros:

```ts
// ✅ Sistema actual: Solo vistas que realmente necesitan custom
"grimoire-crm-dashboard": () => import("$views/crm/CrmDashboard.svelte"),
"grimoire-crm-deal-form": () => import("$views/crm/DealForm.svelte"),
"grimoire-conta-journal-form": () => import("$views/conta/JournalForm.svelte"),
"grimoire-conta-reports": () => import("$views/conta/ReportsView.svelte"),
```

Las vistas `type: "grid"` se renderizan vía DataExplorer consumiendo `/api/explorer/:table`.

### 1.3 Navegación (Sidebar)

**`SidebarLayout.svelte` — Estructura actual:**

```
Sidebar Principal:
├── Dashboard
├── Core Grimoires (ordenados)
│   ├── DataSets        (grimoire-datasets)
│   ├── Media Library   (grimoire-media)
│   ├── Page Builder    (grimoire-blocks)
│   ├── Blog Posts      (grimoire-blog)
│   └── Data Visualizer (grimoire-data-visualizer)
├── Optional Grimoires
│   ├── Academy, DMS, Booking, Directory
│   ├── Gremius CRM     (grimoire-crm)
│   └── Contabilidad    (grimoire-conta)
├── Realm Grimoires (Esports/Gaming)
│   ├── Games, Streamers, Platforms, Tags...
│   └── Teams, Players, Matches, Tournaments
└── System (bottom)
    ├── Grimoires       (/grimoires)
    ├── Realms          (/realms)
    ├── Actions         (/actions)
    ├── AI Agents       (/agents)
    └── Settings        (/settings)
        ├── General, Appearance, API Keys
        ├── Agents (NHI tab), MCP, Data Sources
```

---

## 2. Estado por Grimoire (Actualizado)

### 2.1 CRM (`views/crm/`)

| Componente                | Líneas | Estado                                                 |
| ------------------------- | ------ | ------------------------------------------------------ |
| `CRMView.svelte`          | —      | ❌ **ELIMINADO** — ya no existe en disco               |
| `CrmDashboard.svelte`     | —      | ✅ Custom justificado — métricas, gráficas, KPIs       |
| `DealForm.svelte`         | —      | ✅ Custom justificado — campos condicionales por stage |
| `CompanyList.svelte`      | —      | ❌ **ELIMINADO** — reemplazado por DataExplorer        |
| `CompanyForm.svelte`      | —      | ❌ **ELIMINADO** — reemplazado por AutoFormModal       |
| `ContactList.svelte`      | —      | ❌ **ELIMINADO** — reemplazado por DataExplorer        |
| `ContactForm.svelte`      | —      | ❌ **ELIMINADO** — reemplazado por AutoFormModal       |
| `ActivityList.svelte`     | —      | ❌ **ELIMINADO** — reemplazado por DataExplorer        |
| `ActivityForm.svelte`     | —      | ❌ **ELIMINADO** — reemplazado por AutoFormModal       |
| `DealList.svelte`         | —      | ❌ **ELIMINADO** — reemplazado por DataExplorer        |
| `ActivityTimeline.svelte` | —      | ❌ **NO IMPLEMENTADO** — no existe en views/crm/       |
| `DealPipelineView.svelte` | —      | ❌ **NO IMPLEMENTADO** — no existe en views/crm/       |

**Impacto real:** Reducción de ~11 componentes a **2**. CRM ahora es 100% DataExplorer excepto Dashboard y DealForm.

### 2.2 Conta (`views/conta/`)

| Componente                | Estado                                           |
| ------------------------- | ------------------------------------------------ |
| `ContaView.svelte`        | ❌ **ELIMINADO** — ya no existe en disco         |
| `JournalForm.svelte`      | ✅ Custom justificado — partida doble            |
| `ReportsView.svelte`      | ✅ Custom justificado — balance, P&L             |
| `DisbursementForm.svelte` | ✅ Custom justificado — trust accounting         |
| `TemplateForm.svelte`     | ✅ Custom justificado — templates con líneas     |
| `AccountList.svelte`      | ❌ **ELIMINADO** — reemplazado por DataExplorer  |
| `AccountForm.svelte`      | ❌ **ELIMINADO** — reemplazado por AutoFormModal |
| `JournalList.svelte`      | ❌ **ELIMINADO** — reemplazado por DataExplorer  |
| `LedgerList.svelte`       | ❌ **ELIMINADO** — reemplazado por DataExplorer  |
| `TemplateList.svelte`     | ❌ **ELIMINADO** — reemplazado por DataExplorer  |
| `DisbursementList.svelte` | ❌ **ELIMINADO** — reemplazado por DataExplorer  |

**Impacto real:** Reducción de ~10 componentes a **4**.

### 2.3 Agile

| Componente         | Líneas | Estado                                   |
| ------------------ | ------ | ---------------------------------------- |
| `AgileView.svelte` | —      | ❌ **ELIMINADO** — ya no existe en disco |

**Decisión ejecutada:** Agile es puro DataExplorer en el admin (5 grids: projects, issues, cycles, modules, intakes). La app de producto (Kanban board) vive en el realm si es necesario.

---

## 3. AI Agents — Arquitectura Dual

Sin cambios desde versión anterior. Sigue vigente la dualidad:

- **Agentes de Ejecución** (`/agents`): Playground, traces, modelos
- **Agent Identities / NHI** (`Settings > Agents`): Scopes, rate limits, API keys

---

## 4. Settings — Estado Real (Actualizado)

### 4.1 Tabs implementadas

| Tab          | Estado                     | Persistencia API                              |
| ------------ | -------------------------- | --------------------------------------------- |
| General      | UI completa                | ✅ **Funcional** — `PATCH /api/settings` real |
| Appearance   | `ThemeSelector.svelte`     | ✅ Funcional                                  |
| API Keys     | CRUD completo              | ✅ Funcional (`/api/keys`)                    |
| Agents (NHI) | CRUD + keys + logs + stats | ✅ Funcional (`/api/admin/agents`)            |
| MCP          | Info de conexión SSE       | ✅ Informativo (copia URL)                    |
| Data Sources | CRUD + test de conexión    | ✅ Funcional (`/api/admin/data-sources`)      |

### 4.2 Deuda técnica menor

- **Tipos inline en Settings.svelte**: `Agent`, `AgentKey`, `AuditLog`, `DataSource` deberían moverse a `@gremius/shared`

---

## 5. Vistas Legacy Huérfanas

**Estado:** ✅ **ELIMINADAS del filesystem**

Los directorios y archivos siguientes ya no existen:

- `packages/admin/src/views/workers/` — eliminado
- `packages/admin/src/views/webhooks/` — eliminado
- `packages/admin/src/routes/workers/` — eliminado
- `packages/admin/src/routes/webhooks/` — eliminado

`ActionsView.svelte` cubre toda la funcionalidad unificada.

---

## 6. Próximos Pasos (Priorizados)

### Prioridad Alta

1. **DataExplorer enhancements**: Kanban con nombres legibles, row actions, inline relations
2. **Testing**: Alcanzar 60% cobertura (actual ~15%)

### Prioridad Media

3. **Scheduling / Publicación programada**: Campo `publishAt` + cron job
4. **Analytics Dashboard**: Métricas de uso del CMS

### Prioridad Baja

5. **i18n**: Multi-idioma en UI y contenido
6. **Mover tipos inline** de Settings.svelte a `@gremius/shared`
7. **Documentar la dualidad de Agents** (ejecución vs NHI)

---

## 7. Métricas de Éxito (Target vs Actual)

| Métrica                         | Target | Actual                                    |
| ------------------------------- | ------ | ----------------------------------------- |
| % tablas usando DataExplorer    | > 70%  | **~75%** ✅                               |
| Líneas por custom view          | < 200  | 97 max (DealForm) ✅                      |
| Componentes custom por grimoire | 1-4    | CRM: **2**, Conta: **4**, Agile: **0** ✅ |
| Tipos inline en custom views    | 0      | **~5 en Settings.svelte** ⚠️              |
| Llamadas API con strings        | 0      | **0** ✅                                  |

---

_Documento actualizado para reflejar la realidad del código en v0.8.0-beta. Refactor completado 2026-04-22._
