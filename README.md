# ⬡ GremiusCMS

**The High-Performance, Modular BaaS/CMS Hybrid**

GremiusCMS is a next-generation content management system built for high-performance sites. Powered by Astro 5, Hono, and Bun, it features a modular auto-discovery architecture, a "Lego-style" Page Builder, and native AI optimization.

---

## 🚀 Key Features

- **Modular Architecture**: Dual-source module loading from core and theme bundles.
- **BaaS/CMS Hybrid**: Use as pure BaaS or promote data to CMS content with slugs and SEO.
- **Lego Page Builder**: Dynamic block-based layout system (Hero, Smart Grid, Interactive Maps, etc.).
- **AI-Optimized (TOON)**: Native support for **Token-Optimized Object Notation** for ultra-efficient AI responses.
- **Enterprise Infra**: **Valkey** for high-speed caching, queues, and leaderboards.
- **Modern Stack**: Built with **Astro 5**, **Vue 3 Islands**, **Hono**, **Bun**, and **Drizzle ORM**.
- **Secure by Default**: Powered by **Better-Auth** with JWT and session management.

---

## 🏗️ Architecture

```
gremiuscms/
├── apps/
│   ├── api/                  # Hono + Drizzle API (Bun)
│   │   ├── gremius.config.ts   # Module activation
│   │   └── src/modules/      # Core & optional modules
│   ├── admin/                # Vue 3 Admin Panel (Vite)
│   └── web/                  # Astro 5 SSR frontend
├── packages/
│   ├── shared/               # Types & utilities
│   └── themes/               # Theme packages with bundled modules
│       └── gremio-cms/       # Gaming theme (games, streamers, etc.)
└── docker/                   # Infrastructure definitions
```

---

## 📦 Module System

GremiusCMS organizes functionality into three categories:

### Engine (Always Active)
Schema Engine, Auth Manager, API Gateway, Valkey, Media Hub, Module Loader

### Core Modules (Toggleable)
| Module | Purpose |
|:---|:---|
| `promote` | CMS / Promote to Content with slugs, SEO |
| `webhooks` | Event-driven HTTP callbacks |
| `connectors` | External APIs and databases |
| `blocks` | Page Builder foundation |
| `media` | S3/MinIO media library |

### Optional Modules (Toggleable)
| Module | Purpose |
|:---|:---|
| `academy` | LMS with courses, quizzes, certificates |
| `dms` | Document management with workflows |
| `booking` | Room and resource reservations |
| `directory` | Employee directory and org chart |
| `formulas` | KPI calculations and expressions |
| `blog` | Blog posts with scheduling |

### Theme Modules (Auto-loaded)
Bundled with themes like **Gremio CMS**:
- `games` — Game catalog with IGDB sync
- `streamers` — Twitch/YouTube/Kick integration
- `platforms` — Gaming platforms
- `tags` — Content categorization

---

## ⚡ Quick Start

### 1. Infrastructure (Docker)
```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d
```
Infrastructure includes: **PostgreSQL 16**, **Valkey** (Cache & Queues), and **MinIO** (S3 Storage).

### 2. Setup & Database
```bash
pnpm install
cd packages/shared && pnpm build && cd ../..
cd apps/api && pnpm db:push
pnpm db:seed # Optional: initial admin and test data
```

### 3. Launch Development
```bash
pnpm dev
```
- **API**: [http://localhost:3001](http://localhost:3001)
- **Admin**: [http://localhost:5173](http://localhost:5173)
- **Web**: [http://localhost:4321](http://localhost:4321)

---

## 🏰 Realms (formerly Themes)

Realms are business ecosystems that bundle grimoires (formerly modules) and provide custom styling. Realms define which grimoires are active via `realm.json`.

### Creating a Realm
```
packages/realms/my-realm/
├── realm.json          # Manifest with grimoires
├── variables.css       # Design system variables
└── grimoires/          # Realm-specific grimoires (optional)
    └── my-grimoire/
        ├── index.ts
        └── my-grimoire.schema.ts
```

### Realm Manifest (realm.json)
```json
{
  "id": "realm-esports",
  "name": "Esports Realm",
  "type": "realm",
  "grimoires": ["games", "streamers", "platforms", "tags", "players", "teams", "tournaments", "matches"]
}
```

---

## 🤖 AI Optimization (TOON)

GremiusCMS natively supports **TOON (Token-Optimized Object Notation)**. This format reduces token consumption by up to 60% vs traditional JSON.

- **Request via Header**: `Accept: application/vnd.toon`
- **Request via Query**: `?format=toon`

---

## 🧱 Lego Page Builder & Vue Islands

The frontend uses a **Partial Hydration** model with Astro Islands. Zero JavaScript is shipped for static content.

### Page Builder Blocks (Astro)
- **Hero**: Motion-enhanced headers
- **Smart Grid/Filter**: Interactive data exploration
- **Image Gallery**: Optimized responsive layouts
- **Comparison Slider**: Before/After visuals
- **Game Map**: Interactive pan/zoom world maps

### Interactive Islands (Vue 3)
- **DataTable**: Pro-grade data management
- **GameBuilder**: Custom loadout and stat planning
- **CommandMenu**: Global shortcut-based navigation
- **PublicForm**: Dynamic schema-based lead capture

---

## 📄 License

MIT © 2026 GremiusCMS Team.
