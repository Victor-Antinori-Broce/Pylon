# GremiusCMS - Architecture and Functions Summary

## Overview
**GremiusCMS** is a high-performance, modular BaaS (Backend as a Service) and CMS (Content Management System) hybrid built for modern data-driven applications. It features a "Lego-style" Page Builder, an advanced modular auto-discovery architecture, and native AI optimization.

## Tech Stack & Infrastructure
- **Runtime:** Bun
- **Backend API:** Hono (REST API) + Drizzle ORM
- **Database:** PostgreSQL 16
- **Cache & Queues:** Valkey (DragonflyDB compatible) + BullMQ
- **Media Storage:** MinIO (S3-compatible object storage)
- **Frontend / Web:** Astro 5.0 + Vue 3 Islands
- **Admin Panel:** Svelte 5 + Vite + Tailwind CSS
- **Authentication:** Better-Auth (JWT + Sessions)

### Architectural Layout
```text
gremiuscms/
├── apps/
│   ├── api/                  # Backend: Hono API + Grimoires (Bun)
│   ├── admin/                # Backoffice: Svelte 5 Admin interface
│   └── web/                  # Frontend: Astro 5 SSR application
├── packages/
│   ├── shared/               # Shared Types and Schemas (Monorepo)
│   ├── grimoires/            # Grimoires (individual magical code blocks)
│   └── realms/               # Realms (business ecosystems bundling grimoires)
└── docker/                   # Infrastructure definitions (Pg, Valkey, MinIO)
```

## The Engine (Always Active Base Layer)
The core engine handles base BaaS operations transparently:
- **Schema Engine:** Powered by Drizzle and Dataset dynamic schemas.
- **Auth Manager:** Secure session and token management.
- **API Gateway:** Hono routing and middleware pipeline.
- **Grimoire Loader:** Dynamically discovers and mounts routes/schemas based on `realm.json`.
- **Valkey Layer:** Caching, fast reads, leaderboards, and job queues.
- **Media Hub:** Storage proxy for S3 API uploads.

## Grimoire System (Functions & Features)
Gremius uses a config-driven architecture where grimoires (formerly "modules") can be toggled on/off to adapt to project needs without carrying dead weight.

### 1. Core Grimoires (Toggleable)
Foundational features extending the basic BaaS.
- **`promote`**: Transforms raw dataset entries into indexed CMS content (slugs, SEO fields).
- **`webhooks`**: Event-driven architecture with HTTP callbacks.
- **`connectors`**: Ingest and sync data from external APIs or legacy databases (MySQL, etc.).
- **`blocks`**: The logical structure for the Lego Page Builder frontend.
- **`media`**: Media file asset management and categorization.

### 2. Optional Grimoires (Enterprise Apps)
Complex sub-systems that serve specific operational needs.
- **`academy`**: Full LMS engine (courses, modules, quizzes, certificates).
- **`dms`**: Document Management System with multi-step approval workflows.
- **`booking`**: Resource mapping and time-slot reservation system.
- **`directory`**: Corporate employee profiles and hierarchy charts.
- **`formulas`**: A mathematical engine to calculate and track runtime KPIs.
- **`gremius-crm`**: Internal CRM pipelines and lead tracking.
- **`blog`**: Traditional scheduled blog post system.

### 3. Realm Grimoires (Auto-Loaded by Realm)
Realms (formerly "themes") are treated as extensions and bundle their own data structures.
- **Realm Esports Details:** Focuses on gaming and esports ecosystems.
- **Entities:** `games` (with IGDB syncing), `streamers` (Twitch/YouTube/Kick integration), `platforms`, and `tags`.
- **"Core Competitivo" Engine:** Custom extensions specifically supporting `players`, `teams`, `tournaments` (with visual brackets), and `matches`.

## The Lore Refactor: Jerarquía Mágica de Gremius

As of v0.5+, GremiusCMS adopts a magical hierarchy:

- **Grimoires** (formerly "Modules"): Individual magical code blocks containing schemas, routes, and business logic.
  - Location: `packages/grimoires/`
  - Manifest: `grimoire.json` or `gremius.json`

- **Realms** (formerly "Themes"): Business ecosystems that group grimoires and define the visual experience.
  - Location: `packages/realms/`
  - Manifest: `realm.json`
  - Declares which grimoires are active: `"grimoires": ["games", "streamers", ...]`

## Key Differentiators
- **TOON (Token-Optimized Object Notation):** A native AI-optimized data format reducing token footprint by up to 60% compared to standard JSON when providing API data to AI agents. Activated via `Accept: application/vnd.toon` header or `?format=toon` query param.
- **Lego Page Builder:** A modular setup that utilizes Astro HTML structures and Vue 3 Islands precisely where JS is needed (Data tables, interactive filtering, dynamic MDX editors with real-time Mermaid diagrams).
