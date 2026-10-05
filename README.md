# ⬡ Kitsuden

**The AI-native backend framework & self-hosted BaaS.**

Kitsuden is a batteries-included backend built on **Bun + Hono + Drizzle + PostgreSQL**, designed from the ground up for a world where AI agents are first-class API consumers. One codebase gives you a full framework (routing, policies, validation, ORM sugar, jobs, observability) _and_ a self-hosted BaaS (auth, auto REST + GraphQL, admin UI, storage, MCP).

> _Kitsuden_ (Italian: "gateway") — every request passes through the kitsuden. Plugins are **kons** (cuts of a gem); bundled ecosystems are **grimoires** (spellbooks).

---

## Why Kitsuden

|                        |                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI-native**          | MCP server with IDE-grade code intelligence, TOON token-efficient responses (~55% fewer bytes than JSON), deterministic Second Brain, self-mapping system           |
| **Secure by default**  | PostgreSQL RLS ("Titanium Wall") + deny-by-default policies + auto-RLS repository — queries inside a request run under the caller's row-level context automatically |
| **Clean architecture** | Cross-cutting layers live in `@kitsuden/engine`; plugins (kons) never import from the app. Structural typing, no decorators, no magic                               |
| **Batteries included** | Auth (Better-Auth), auto REST + GraphQL, Svelte 5 admin, S3 storage, queues (BullMQ), cron, webhooks, W3C tracing, SLOs                                             |

## Quick start

```bash
# 1. Infrastructure (PostgreSQL 16 + Valkey + MinIO)
cp .env.example .env
docker compose up -d

# 2. Install & database
bun install
cd apps/api && bun run db:push && bun run db:seed

# 3. Run
bun run dev        # API → http://localhost:3001
```

First request:

```bash
curl http://localhost:3001/api/health
curl -H "Accept: application/vnd.toon" http://localhost:3001/api/health   # TOON format
```

**→ [Full 15-minute walkthrough](docs/QUICKSTART.md)** — from zero to authenticated CRUD, GraphQL, and a connected AI agent.

---

## The framework layer

Everything a kon (plugin) needs comes from `@kitsuden/engine` — never from the app:

```typescript
import { repo, definePolicy, can, validateRequest, AppError } from "@kitsuden/engine";

// Deny-by-default authorization
definePolicy<Game>("game", {
  view: (user, game) => game.status === "published" || user?.role === "admin",
  update: (user, game) => !!game.ownerId && game.ownerId === user?.id,
});

// Chainable repository — auto-uses the RLS transaction inside a request
const games = await repo(gamesTable)
  .filter({ status: "published" })
  .orderBy("-createdAt")
  .paginate(1, 20);
```

**Mail** follows the same rule — a kon owns its emails and registers them in
the shared Mailer, so the host never needs to know about them:

```typescript
import { mail, layout, heading, button } from "@kitsuden/engine";

mail.register({
  name: "crm.deal-won", // ← also the queue job name
  envelope: (d, ctx) => ({ to: d.to, subject: ctx.t("crm.won", { deal: d.name }) }),
  content: (d, ctx) => ({ html: layout({ body: heading("Deal won 🎉") + button("View", d.url) }) }),
});

await emailQueue.add("crm.deal-won", { to, name, locale: "es" });
```

Drivers are interchangeable (`smtp` · `resend` · `log` · `memory`) and testing
needs no SMTP:

```typescript
mail.fake();
await signUp("ada@example.com");
mail.assertSentTo("system.welcome", "ada@example.com");
```

**Billing** ships as `kon-payments` — four gateways behind one interface
(**Stripe**, **Lemon Squeezy**, **Paddle**, **PayPal**). It's the Cashier
equivalent, not an ecommerce. Only providers whose keys exist get enabled:

```bash
POST /api/payments/checkout          # → redirect URL
POST /api/payments/webhook/:provider # public, authenticated by SIGNATURE
GET  /api/payments/subscription      # does this user have access?
```

Every gateway funnels into one event stream, and that stream can feed the
double-entry ledger in `kon-conta` — no other JS stack has built-in
accounting; they hand you a CSV for your accountant.

Generators scaffold the patterns (`--kon` targets a plugin):

```bash
kitsuden make policy Game --kon games
kitsuden make request CreateGame
kitsuden make job SyncCatalog
```

## The BaaS layer

Every table — core, kon, or user-created dataset — is instantly served:

- **REST**: `/api/<table>` CRUD with pagination, filtering, TOON negotiation
- **GraphQL**: `/api/graphql` — schema auto-generated from all tables, GraphiQL playground, **auth + RLS enforced per-request**
- **Admin**: Svelte 5 panel with data explorer, page builder, module toggles
- **SDK**: `npm i @kitsuden/sdk` → `new KitsudenClient({url, apiKey}).from("games").list()`

## AI-native tooling

| Tool               | What it does                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **MCP server**     | `kitsuden mcp --ide cursor` — agents get CRUD, schema introspection, TOON encoding                                                 |
| **Code Graph**     | `kitsuden graph symbol repo` — deterministic symbol index (find/references/outline/path), god nodes, git history. No LLM, pure AST |
| **System Map**     | `kitsuden map` — live architecture graph: endpoints, tables, FK relations, kons                                                    |
| **Second Brain**   | `kitsuden brain capture/sync/lint` — 3-layer knowledge base (immutable sources → AI wiki → BRAIN.md) with deterministic core       |
| **Tree retrieval** | `/api/brain/tree` — reason over a document's structure instead of embedding chunks; every answer cites its section path            |
| **TOON**           | `Accept: application/vnd.toon` or `?format=toon` on any endpoint                                                                   |
| **Run Inspector**  | `/api/runs` — global feed of every action/worker/webhook run with payloads, logs, p50/p95                                          |
| **Mail preview**   | `/api/mail/preview` — render any email without sending it                                                                          |

Agent-facing MCP tools include `kitsuden_find_symbol`, `kitsuden_file_outline`, `kitsuden_search_code`, `kitsuden_graph_path`, `kitsuden_commit_history` for IDE-grade navigation; `kitsuden_rename_symbol`, `kitsuden_replace_symbol_body`, `kitsuden_safe_delete_symbol` for **semantic refactoring** (dry-run by default); and `kitsuden_list_mailables`, `kitsuden_preview_mail` to discover and render emails — all for any MCP client (Claude Code, Cursor, Windsurf).

```json
{
  "mcpServers": {
    "kitsuden": {
      "command": "npx",
      "args": ["-y", "@kitsuden/mcp-server"],
      "env": {
        "KITSUDEN_API_URL": "http://localhost:3001",
        "KITSUDEN_API_TOKEN": "kitsuden_sk_..."
      }
    }
  }
}
```

---

## Architecture

```
kitsuden/
├── apps/api/               # Hono + Drizzle API (Bun) — the host
├── packages/
│   ├── engine/             # Tier 1 — @kitsuden/engine framework primitives (authz,
│   │                       #   validation, errors, repo, request-scope,
│   │                       #   interceptors, brain, system-map, code-graph)
│   ├── core/               # Tier 2 — Kitsuden Core batteries: datasets, media,
│   │                       #   blocks, vector-search (every app wants these)
│   ├── kons/             # Tier 3 — domain modules: games, crm, blog, lms,
│   │                       #   agile, booking, dms, esports, payments, ocr…
│   ├── grimoires/          # Curated kon bundles + theming
│   ├── shared/             # @kitsuden/shared — types, Zod schemas
│   ├── admin/              # Svelte 5 admin panel
│   ├── sdk/                # @kitsuden/sdk — official JS/TS client
│   ├── mcp-server/         # MCP server for AI agents
│   ├── cli/                # kitsuden CLI (init, dev, make, map, graph, brain)
│   └── starters/           # Project templates
└── docker/                 # PostgreSQL 16, Valkey, MinIO
```

See **[CORE.md](CORE.md)** for the full 3-tier taxonomy (batteries vs domain).

**Kon contract**: a kon declares `@kitsuden/shared` (+ optionally `@kitsuden/engine`) as peer dependencies, exports `defineKon`, and receives everything else (db, cache, events, auth, storage, logger) via injected `KonContext`. No imports from `apps/api` — ever.

## Security model

Three independent walls, all on by default:

1. **Policies/Gates** (`definePolicy`/`can`) — application-level, deny-by-default: an action without a rule is denied.
2. **Row-Level Security** — PostgreSQL native policies with `ENABLE` + `FORCE` on every personally-owned table (sessions, payments, learning progress, reservations…). `withTransactionalRLS()` opens a transaction, sets the user context, and publishes the tx to the request scope; `repo()` and GraphQL resolvers pick it up automatically. Apply with `bun run db:rls` after migrations. Collaborative tables (CRM, agile, shared docs) are deliberately excluded — team visibility is their point — and a coverage test forces every new owned table to be classified one way or the other.
3. **Scopes** — API keys (`kitsuden_sk_*`) and agent keys carry granular scopes checked per route.

> ⚠️ RLS only binds if the API connects as a **non-superuser** database role. See [docs/RLS_SETUP_GUIDE](apps/api/docs/RLS_SETUP_GUIDE.md).

## Observability

Structured JSON logs correlated with **W3C Trace Context** (`traceparent`), real SLI metrics (sliding window + reservoir percentiles), SLO evaluation with error budgets, and symptom-based alerting: `/api/live`, `/api/ready`, `/api/slo`, Prometheus metrics at `/api/metrics`.

---

## Commands

```bash
kitsuden init my-app          # scaffold a new project
kitsuden dev                  # dev server with hot reload
kitsuden make <kind> <name>   # generate policy | request | job | test
kitsuden map                  # system architecture map
kitsuden graph <action>       # code graph: symbol | outline | path | search | history
kitsuden brain <action>       # second brain: capture | sync | lint | digest
kitsuden mcp --ide cursor     # configure MCP for your IDE
kitsuden migrate              # apply migrations
```

## Documentation

- [15-minute Quickstart](docs/QUICKSTART.md)
- [Architecture](ARCHITECTURE.md)
- **[Operations: migrations, RLS and backups](docs/OPERACIONES.md)** — read this
  before deploying to an existing database: `--baseline` is a one-time manual
  step and skipping it re-applies 31 migrations over live data.
- [SDK reference](packages/sdk/README.md)
- [RLS setup (production)](apps/api/docs/RLS_SETUP_GUIDE.md)
- [Second Brain schema](BRAIN.md)

## License

MIT
