# GremiusCMS - Progress Tracker

## v0.5.0 — The Modular Architecture Era (Current)

### Architecture
- **Runtime:** Bun
- **Backend:** Hono (REST API) + Drizzle ORM + PostgreSQL
- **Modularity:** Config-driven Auto-Discovery system (`realm.json`) + Realm-bundled grimoires
- **Storage:** MinIO (S3-compatible object storage)
- **Infra:** **Valkey** (DragonflyDB compatible) for Cache, Leaderboards, & BullMQ Queues
- **Auth:** **Better-Auth** (JWT + Sessions)
- **Admin:** Vue 3 + Vite + Tailwind
- **Frontend:** Astro 5.0 + Vue 3 Islands
- **AI Engine:** Native **TOON** Encoder for efficient responses

### The Lore Refactor: Jerarquía Mágica de Gremius (v0.5+)

```
GREMIUS ENGINE (always active, not shown as grimoires)
├── Schema Engine (Drizzle + Datasets)
├── Auth Manager (Better Auth)
├── API Gateway (Hono + middleware)
├── Valkey Layer (cache + queues)
├── Media Hub (S3/MinIO)
└── Grimoire Loader (realm-driven)

CORE GRIMOIRES (toggleable, official Gremius features)
├── promote      — CMS / Promote to Content
├── webhooks     — Event dispatch
├── connectors   — Remote APIs/DBs
├── blocks       — Page Builder foundation
└── media        — Media Library

OPTIONAL GRIMOIRES (toggleable, enterprise features)
├── academy      — LMS with courses
├── dms          — Document Management
├── booking      — Room reservations
├── directory    — Employee directory
├── formulas     — KPI calculations
├── gremius-crm  — CRM on Data Sets
└── blog         — Blog Posts

REALM GRIMOIRES (bundled with active realm)
Realm Esports:
├── games        — Game catalog + IGDB
├── streamers    — Twitch/YouTube/Kick
├── platforms    — Gaming platforms
├── tags         — Content tagging
├── players      — Player profiles
├── teams        — Team management
├── tournaments  — Tournament brackets
└── matches      — Match results
```

### Major Features
- ✅ **Lego Page Builder**: 14+ dynamic blocks (Hero, Grid, Filter, etc.)
- ✅ **Webhooks Engine**: Event-driven HTTP callbacks with BullMQ
- ✅ **Promote to Content**: Transform BaaS data into CMS content
- ✅ **Data Connectors**: External APIs and MySQL/MariaDB
- ✅ **MDX Editor**: Split-screen editor with Mermaid diagrams
- ✅ **Academy**: Courses, quizzes, certificates, progress tracking
- ✅ **DMS**: Document approval workflows and departmental access
- ✅ **Booking**: Reservation engine for resources and rooms
- ✅ **Directory**: Employee profiles and headcount management
- ✅ **Formulas**: Dynamic KPI and mathematical formula engine

### What's New from v0.4
| Component | Before (v0.4) | After (v0.5) |
|-----------|--------------|--------------|
| Grimoire System | Single source (src/modules) | Dual source (core + realm) |
| Grimoire Categories | core/optional | core/optional/realm |
| Realm Grimoires | Manual config | Auto-loaded from realm.json |
| Gaming Realm | gremius-gaming | Realm Esports |
| API /grimoires | Flat list | Categorized with metadata |

### API Endpoints (Selection)
```
GET  /api/health
POST /api/auth/login

# Grimoire Management
GET  /api/grimoires              — List with categories
GET  /api/grimoires/:key/check   — Dependency check
PATCH /api/grimoires/:key        — Toggle/configure

# Core Grimoires
GET  /api/custom/webhooks
POST /api/custom/promote/:datasetId
GET  /api/custom/connectors

# Realm Grimoires (when Realm Esports active)
GET  /api/games
GET  /api/streamers

# TOON Format
GET  /api/... ?format=toon
```

### Admin UI Migration (Vue 3 → Svelte 5) — COMPLETE ✅

| Component | Status | Notes |
|-----------|--------|-------|
| **Core Infrastructure** | ✅ Complete | Router, Auth stores, Theme system |
| **Layout Components** | ✅ Complete | SidebarLayout, Navigation |
| **DataTable** | ✅ Complete | TanStack Svelte Table with sorting/filtering/pagination |
| **Cell Renderers** | ✅ Complete | ImageCell, RelationCell, ScoreCell |
| **StatusBadge** | ✅ Complete | All variants (success, error, warning, info) |
| **SchemaBuilder** | ✅ Complete | Drag-and-drop field designer with 3 tabs (Fields/Security/Workflow) |
| **DynamicForm** | ✅ Complete | Runtime form generator from schema |
| **RelationshipField** | ✅ Complete | Combobox/MultiSelect for relations (1:1, 1:N, M:N) |
| **KanbanView** | ✅ Complete | Board view with drag-and-drop |
| **MdxEditor** | ✅ Complete | Split-screen MDX editor with CodeMirror 6 + Mermaid |
| **EditorView** | ✅ Complete | Content editor with SEO panel |
| **SEOAnalyzer** | ✅ Complete | SEO score, char counters, social preview |
| **PageBuilder** | ✅ Complete | Visual block layout editor with 12+ block types |
| **BlockPicker** | ✅ Complete | Block selection grid |
| **BlockEditor** | ✅ Complete | Per-block settings panel |
| **Views** | ✅ Complete | Dashboard, Webhooks, DataSets, DataSetEntries, DataGrid, Editor, Builder |
| **Widgets** | ✅ Complete | GameStats, WebhookStatus, RecentActivity |

**Technical Decisions:**
- Using **Svelte 5 compatibility mode** (not full runes) for lucide-svelte compatibility
- Custom SPA router (svelte-routing incompatible with Svelte 5)
- TanStack Svelte Table for data grids
- CodeMirror 6 for MDX editing with Mermaid diagram support
- Component registry system replacing Vue's plugin architecture

**Build Status:** ✅ Production build successful  
**Bundle Size:** JS: ~2.1MB (includes Mermaid), CSS: 53KB

### Migration Stats
- **Vue Components:** 48 original
- **Svelte Components:** 35 migrated + 10 new
- **Lines of Code:** ~15,000+ TypeScript/Svelte
- **Dependencies Added:** codemirror, @codemirror/*, mermaid, @tanstack/svelte-table

### TODO
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Production Caddy/Traefik reverse proxy
- [ ] Rate limiting middleware
- [ ] Automated end-to-end testing suite
- [ ] Dashboard analytics integration
- [x] Move gaming module files to grimoires directory (La Jerarquía Mágica refactor)
- [ ] Complete Realm system documentation
- [ ] Complete remaining admin views (Media, Modules, Settings)
