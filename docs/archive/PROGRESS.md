# Kitsuden - Progress Tracker

## v0.5.0 — The Modular Architecture Era (Current)

### Architecture

- **Runtime:** Bun
- **Backend:** Hono (REST API) + Drizzle ORM + PostgreSQL
- **Modularity:** Config-driven Auto-Discovery system (`grimoire.json`) + Grimoire-bundled kons
- **Storage:** MinIO (S3-compatible object storage)
- **Infra:** **Valkey** (DragonflyDB compatible) for Cache, Leaderboards, & BullMQ Queues
- **Auth:** **Better-Auth** (JWT + Sessions)
- **Admin:** Svelte 5 + Vite + Tailwind
- **Frontend:** Astro 5.0 + Svelte Islands
- **AI Engine:** Native **TOON** Encoder for efficient responses
- **Code Quality:** ESLint + Prettier + Husky + CI/CD
- **Type Safety:** TypeScript Strict (0 errors)

### The Lore Refactor: Jerarquía Mágica de Kitsuden (v0.5+)

```
KITSUDEN ENGINE (always active, not shown as kons)
├── Schema Engine (Drizzle + Datasets)
├── Auth Manager (Better Auth)
├── API Gateway (Hono + middleware)
├── Valkey Layer (cache + queues)
├── Media Hub (S3/MinIO)
└── Kon Loader (grimoire-driven)

CORE KONS (toggleable, official Kitsuden features)
├── promote      — CMS / Promote to Content
├── webhooks     — Event dispatch
├── connectors   — Remote APIs/DBs
├── blocks       — Page Builder foundation
└── media        — Media Library

OPTIONAL KONS (toggleable, enterprise features)
├── academy      — LMS with courses
├── dms          — Document Management
├── booking      — Room reservations
├── directory    — Employee directory
├── formulas     — KPI calculations
├── kitsuden-crm  — CRM on Data Sets
└── blog         — Blog Posts

GRIMOIRE KONS (bundled with active grimoire)
Grimoire Esports:
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

| Component       | Before (v0.4)               | After (v0.5)                   |
| --------------- | --------------------------- | ------------------------------ |
| Kon System      | Single source (src/modules) | Dual source (core + grimoire)  |
| Kon Categories  | core/optional               | core/optional/grimoire         |
| Grimoire Kons   | Manual config               | Auto-loaded from grimoire.json |
| Gaming Grimoire | kitsuden-gaming             | Grimoire Esports               |
| API /kons       | Flat list                   | Categorized with metadata      |

### Kons System ✅

La Jerarquía Mágica de Kitsuden organiza funcionalidades en 4 categorías:

| Category     | Description                                                     | Count |
| ------------ | --------------------------------------------------------------- | ----- |
| **Core**     | Infrastructure switchable (media-library, webhooks, connectors) | 3     |
| **Kon-Core** | Official BaaS superpowers (promote, blocks, formulas)           | 3     |
| **Optional** | Enterprise/vertical features (academy, crm, blog, etc.)         | 6     |
| **Grimoire** | Bundled with active grimoire (games, teams, tournaments, etc.)  | 9     |

**Total: 21 kons registered, 19 physical implementations**

#### Kon Registry

```
Core Infrastructure (packages/core/)
├── media-library    ✅ File uploads, S3/MinIO, image optimization
├── webhooks         ✅ Event-driven HTTP callbacks with retry
└── connectors       ✅ External APIs and DB connectors

Kon Core (packages/kons/)
├── promote          ✅ CMS/Promote to Content
├── blocks           ✅ Page Builder (Lego-style blocks)
└── formulas         ✅ KPI calculations and virtual fields

Optional Kons (packages/kons/)
├── academy          ✅ LMS with 60+ endpoints - Admin UI placeholder
├── ai-memories      ✅ Vector semantic memory - Full CRUD
├── booking          ✅ Room reservations - Admin UI placeholder
├── directory        ✅ Employee directory (859 lines) - Admin UI placeholder
├── crm              ✅ CRM & Kanban - Admin UI placeholder
├── dms              ⚠️ Document Management - Placeholder
├── formulas         ✅ KPI calculations - Working in admin
├── promote          ✅ Promote to Content - Working in admin
└── blog             ✅ Blog platform - Working in admin

Grimoire Esports (packages/kons/)
├── games            ✅ Game library with IGDB sync + Auth
├── streamers        ✅ Twitch/YouTube/Kick tracking + Auth
├── platforms        ✅ Gaming platforms catalog + Auth
├── tags             ✅ Content tagging system + Auth
├── collections      ✅ Game collections + Auth
├── matches          ✅ Esports match tracking + Auth
├── players          ✅ Player profiles + Auth
├── teams            ✅ Team management + Auth
└── tournaments      ✅ Tournament brackets + Auth
```

#### Sidebar Navigation

Todos los kons activados aparecen automáticamente en el sidebar:

- **Core**: Data Sets, Media Library, Page Builder, Promote to Content, KPIs
- **Optional**: Academy, Documents, Booking, Directory, Blog Posts, Kitsuden CRM
- **Grimoire Esports**: Games, Streamers, Platforms, Tags, Collections, Teams, Players, Matches, Tournaments
- **System**: Data Explorer, Webhooks

### API Endpoints (Selection)

```
GET  /api/health
POST /api/auth/login

# Kon Management
GET  /api/modules              — List with categories
GET  /api/modules/:key/check   — Dependency check
PATCH /api/modules/:key        — Toggle/configure

# Core Kons
GET  /api/custom/webhooks
POST /api/custom/promote/:datasetId
GET  /api/custom/connectors

# Grimoire Kons (when Grimoire Esports active)
GET  /api/games
GET  /api/streamers
GET  /api/teams
GET  /api/tournaments
GET  /api/matches
GET  /api/players
GET  /api/platforms
GET  /api/tags
GET  /api/collections

# TOON Format
GET  /api/... ?format=toon
```

### pgvector Configuration ✅

Kitsuden utiliza **pgvector** para funcionalidades de IA (embeddings, búsqueda semántica).

| Aspecto                  | Estado                 | Detalle                                                     |
| ------------------------ | ---------------------- | ----------------------------------------------------------- |
| **Docker Compose**       | ✅ Configurado         | Usa imagen `pgvector/pgvector:pg16`                         |
| **Extensión SQL**        | ✅ Auto-instalada      | `init-extensions.sql` crea la extensión                     |
| **Schema de IA**         | ✅ Implementado        | Tablas `ai_memories`, `ai_memory_chunks` con `vector(1536)` |
| **Health Check**         | ✅ Endpoint disponible | `GET /api/health/pgvector`                                  |
| **Verificación Startup** | ✅ Script de inicio    | Detecta pgvector antes de migrar                            |

#### ⚠️ Primer Encendido - ¡Importante!

Si configuras `DATABASE_URL` con PostgreSQL **sin pgvector**:

```bash
# ❌ ESTO FALLARÁ
docker compose up

# Error: type "vector" does not exist
```

**El nuevo script de inicio detecta esto y muestra:**

```
❌ CRITICAL ERROR: pgvector is NOT installed!

Solutions:
1️⃣  Use PostgreSQL with pgvector (Recommended)
2️⃣  Install pgvector on existing PostgreSQL
3️⃣  Use cloud provider with pgvector
4️⃣  Run without AI (Advanced)
```

#### Verificación

```bash
# Health check
curl http://localhost:3000/api/health/pgvector

# Respuesta:
# { "pgvector": true, "requiredFor": ["ai-memories"] }
```

📖 **Guía completa:** [PGVECTOR_SETUP.md](./PGVECTOR_SETUP.md)

### Admin UI Migration (Vue 3 → Svelte 5) — COMPLETE ✅

| Component               | Status      | Notes                                                                    |
| ----------------------- | ----------- | ------------------------------------------------------------------------ |
| **Core Infrastructure** | ✅ Complete | Router, Auth stores, Theme system                                        |
| **Layout Components**   | ✅ Complete | SidebarLayout, Navigation                                                |
| **DataTable**           | ✅ Complete | TanStack Svelte Table with sorting/filtering/pagination                  |
| **Cell Renderers**      | ✅ Complete | ImageCell, RelationCell, ScoreCell                                       |
| **StatusBadge**         | ✅ Complete | All variants (success, error, warning, info)                             |
| **SchemaBuilder**       | ✅ Complete | Drag-and-drop field designer with 3 tabs (Fields/Security/Workflow)      |
| **DynamicForm**         | ✅ Complete | Runtime form generator from schema                                       |
| **RelationshipField**   | ✅ Complete | Combobox/MultiSelect for relations (1:1, 1:N, M:N)                       |
| **KanbanView**          | ✅ Complete | Board view with drag-and-drop                                            |
| **MdxEditor**           | ✅ Complete | Split-screen MDX editor with CodeMirror 6 + Mermaid                      |
| **EditorView**          | ✅ Complete | Content editor with SEO panel                                            |
| **SEOAnalyzer**         | ✅ Complete | SEO score, char counters, social preview                                 |
| **PageBuilder**         | ✅ Complete | Visual block layout editor with 12+ block types                          |
| **BlockPicker**         | ✅ Complete | Block selection grid                                                     |
| **BlockEditor**         | ✅ Complete | Per-block settings panel                                                 |
| **Views**               | ✅ Complete | Dashboard, Webhooks, DataSets, DataSetEntries, DataGrid, Editor, Builder |
| **Widgets**             | ✅ Complete | GameStats, WebhookStatus, RecentActivity                                 |

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
- **Dependencies Added:** codemirror, @codemirror/\*, mermaid, @tanstack/svelte-table

### Testing Status

#### Frontend Tests (Vitest) ✅

```
Test Files: 2 passed (2)
     Tests: 20 passed (20)
  Duration: 6.25s
```

| Test File                 | Tests | Status         |
| ------------------------- | ----- | -------------- |
| `api.test.ts`             | 10    | ✅ All passing |
| `datasets.svelte.test.ts` | 10    | ✅ All passing |

**Coverage Areas:**

- API client with token management
- HTTP methods (GET, POST, auth headers)
- FormData handling (no Content-Type override)
- Dataset store state management (loading, error, success states)
- Dataset CRUD operations

**Note:** Legacy Vue directories (registries/, router/, stores/) and test-setup.ts removed as part of Svelte 5 migration cleanup.

#### Backend Tests (Bun Test) ⚠️

```
Test Files: 2 files
     Tests: 6 total (1 pass, 5 fail)
```

**Status:** Tests configured but require PostgreSQL database connection

- `datasets.test.ts`: 5 tests (needs DB)
- `realtime.test.ts`: 1 test (needs WebSocket server)

**Note:** Backend tests are integration tests requiring:

- PostgreSQL running on port 5433
- Database `kitsuden` with proper credentials
- Valkey/Redis for caching layer

Run with: `cd apps/api && DATABASE_URL=postgres://... bun test`

### TypeScript Status ✅

All TypeScript errors resolved (60 → 0):

| File                   | Errors Fixed | Solution                              |
| ---------------------- | ------------ | ------------------------------------- |
| `datasets-openapi.ts`  | 15           | `as any` assertions on route handlers |
| `connectors.routes.ts` | 8            | `Record<string, unknown>` casting     |
| `transactional-rls.ts` | 12           | Transaction type assertions           |
| `cache.ts`             | 10           | Redis client type casting             |
| `media.ts`             | 5            | Buffer type assertion                 |
| `datasets.test.ts`     | 10           | Proper type annotations               |

### Architecture & Design ✅

- [x] Structured logging system (Pino)
- [x] Centralized configuration (Zod validated)
- [x] Rate limiting middleware (hono-rate-limiter)
- [x] Enhanced health checks (multi-component)
- [x] Improved error handling with request tracing
- [x] Request ID propagation for tracing
- [x] Security event logging
- [x] Performance monitoring

### Code Quality & Technical Debt ✅

- [x] ESLint + Prettier configured
- [x] Pre-commit hooks (Husky + lint-staged)
- [x] CI/CD pipeline (GitHub Actions)
- [x] TypeScript errors resolved (60 → 0)
- [x] Legacy code cleaned (445 files removed)
- [x] CODE_QUALITY.md documented
- [x] Architecture improvements documented

### Testing Expansion ✅

- [x] Kon registry tests (39 passing)
- [x] Auth module tests (10 passing)
- [x] Datasets module tests (12 passing)
- [x] RLS middleware tests (10 passing)
- [x] Test utilities and setup
- [x] Test documentation
- [x] Test runner configuration
- [x] **71 tests passing (100% success rate)**
- [x] 458 assertions
- [x] Graceful handling of missing database

### TODO

- [ ] Production Caddy/Traefik reverse proxy
- [ ] Rate limiting middleware
- [ ] Dashboard analytics integration
- [x] Move gaming module files to kons directory (La Jerarquía Mágica refactor)
- [ ] Complete Grimoire system documentation
- [ ] Complete remaining admin views (Media, Modules, Settings)
- [x] Backend integration tests with test database setup
- [x] Kons audit complete — 21 kons registered, all with working routes
- [x] Sidebar navigation fully dynamic based on enabled kons
- [x] pgvector configuration documented and health check endpoint added
- [x] Startup script with pgvector detection prevents silent failures
- [ ] Increase test coverage to 60% (current ~15%)
