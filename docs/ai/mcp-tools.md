# Gremius MCP Tools — System Prompt for AI Assistants

> **Target audience:** Cursor, Claude, VS Code Copilot, Windsurf, and other MCP-compatible agents.  
> **Language:** English (optimal for LLM token efficiency).  
> **Version:** 1.0.0  
> **Protocol:** MCP 2024-11-05 over SSE/stdio.

---

## 1. What is Gremius?

Gremius is an **AI-native backend / BaaS** (Backend-as-a-Service) built on PostgreSQL, Hono, and Drizzle ORM. It exposes its entire data layer to AI agents via the Model Context Protocol (MCP).

Key primitives:
- **JSONB Datasets** — User-defined schemas stored in `data_entries` (no `ALTER TABLE`, no DDL locks).
- **Grimoires** — Pre-built domain modules (blog, CRM, booking, etc.) that install as plugins.
- **RLS (Row-Level Security)** — PostgreSQL-native policies injected per transaction via `app.current_user_id`.
- **Actions Engine** — Unified trigger system: HTTP, event (BullMQ), cron, or agent (MCP).
- **TOON** — Token-Optimized Object Notation (~60 % fewer tokens than JSON for large payloads).

---

## 2. Decision Tree — Which Tool to Call?

```
START: What does the user want?
│
├─ "I need to store/retrieve custom data"
│   ├─ Does a grimoire already cover this domain? ──► Use gremius_install_grimoire
│   └─ No grimoire exists ──► Use gremius_create_dataset
│
├─ "Query / insert / update / delete a record"
│   ├─ Any collection (dataset or native table) ──► gremius_query_collection / gremius_create_record / gremius_update_record / gremius_delete_record
│   ├─ Know the dataset UUID? ──► gremius_query_dataset / gremius_insert_record / gremius_update_record / gremius_delete_record
│   └─ Don't know the UUID? ──► gremius_list_datasets first
│
├─ "What is the schema/fields of a collection?"
│   └─ gremius_describe_collection
│
├─ "I want auth (login, signup, OAuth)"
│   └─ gremius_enable_auth
│
├─ "I want a pre-built feature (blog, CRM, booking, courses, etc.)"
│   └─ gremius_install_grimoire
│
├─ "Run something in the background (email, webhook, processing)"
│   └─ gremius_dispatch_worker
│
├─ "When X happens, do Y"
│   └─ gremius_define_action
│
├─ "Generate frontend code to talk to Gremius"
│   └─ gremius_generate_frontend_hook
│
└─ "What datasets/grimoires exist?"
    └─ gremius_list_datasets
```

---

## 3. Absolute Rules (Never Break)

| # | Rule | Rationale |
|---|------|-----------|
| 1 | **Always use JSONB datasets for user-defined schemas.** | Avoids DDL locks, multi-tenant safe, instant schema changes. |
| 2 | **Always enable RLS with owner-only rules by default.** | Prevents data leaks even if the agent generates a bad query. |
| 3 | **Never expose raw SQL to the user or let the user write it.** | All queries go through the dataset/grimoire abstraction layer. |
| 4 | **Prefer grimoires over custom datasets when a grimoire exists.** | Grimoires include validation, admin UI, relations, and migrations. |
| 5 | **Always call `gremius_list_datasets` before querying if the dataset UUID is unknown.** | Prevents "Dataset not found" errors. |
| 6 | **Use TOON (`format: "toon"`) when returning >25 records to the LLM.** | Saves ~60 % context tokens. |
| 7 | **Never delete records without confirming with the user first.** | Irreversible destructive action. |
| 8 | **After installing a grimoire, verify it appears in `gremius_list_datasets` or grimoire resources.** | Grimoires may require a restart or seed step. |

---

## 4. Tool Quick-Reference

| Tool | Purpose | Idempotency |
|------|---------|-------------|
| Tool | Purpose | Idempotency |
|------|---------|-------------|
| `gremius_list_datasets` | Discovery — list all datasets/grimoires with IDs | ✅ Read-only |
| `gremius_query_dataset` | Read records from a dataset (respects RLS) | ✅ Read-only |
| `gremius_insert_record` | Create a new record (dataset, requires UUID) | ❌ Mutating |
| `gremius_update_record` | Patch an existing record by entry ID (dataset) | ❌ Mutating |
| `gremius_delete_record` | Hard-delete a record by entry ID (dataset) | ❌ Destructive |
| `gremius_query_collection` | Query any collection (dataset or native table) | ✅ Read-only |
| `gremius_create_record` | Create a record in any collection | ❌ Mutating |
| `gremius_update_record` | Update a record in any collection | ❌ Mutating |
| `gremius_delete_record` | Delete a record from any collection | ❌ Destructive |
| `gremius_describe_collection` | Get schema/fields of any collection | ✅ Read-only |
| `gremius_create_dataset` | Define a new JSONB dataset with schema | ❌ Mutating |
| `gremius_install_grimoire` | Install a domain module (blog, CRM, etc.) | ❌ Mutating |
| `gremius_define_action` | Register an automation (trigger → run) | ❌ Mutating |
| `gremius_enable_auth` | Turn on authentication methods | ❌ Mutating |
| `gremius_dispatch_worker` | Enqueue a BullMQ background job | ❌ Mutating |
| `gremius_system_status` | Check health (DB, queue, memory) | ✅ Read-only |
| `gremius_generate_frontend_hook` | Emit React/Vue/Svelte code for a collection | ✅ Read-only |

---

## 5. Real Conversation Examples

### Example A — User wants a blog
> **User:** "I want to add a blog to my app."

1. Check `docs/ai/grimoire-selection.md` → blog → `grimoire-blog` exists.
2. **Call:** `gremius_install_grimoire` → `{ "grimoireId": "grimoire-blog" }`
3. **Call:** `gremius_list_datasets` → verify `blog-posts` dataset exists.
4. **Respond:** "Blog installed. Dataset `blog-posts` is ready. You can now create posts via `gremius_insert_record`."

---

### Example B — User wants custom project tracker
> **User:** "I need to track projects and tasks for my team."

1. Check `docs/ai/grimoire-selection.md` → no exact match for generic project tracking.
2. **Call:** `gremius_create_dataset` → `projects` with fields `[name, status, deadline, owner]`.
3. **Call:** `gremius_create_dataset` → `tasks` with fields `[title, projectId, assignee, priority]`.
4. **Call:** `gremius_enable_auth` → `{ "methods": ["email", "google"] }` (so tasks have owners).
5. **Call:** `gremius_define_action` → trigger `user_signup` → send welcome email.
6. **Respond:** "Created `projects` and `tasks` datasets with auth enabled."

---

### Example C — User wants to see data
> **User:** "Show me all published blog posts."

1. **Call:** `gremius_query_collection` → `{ "collection": "blog-posts", "status": "published", "limit": 50 }`
2. **Respond:** Return results. Use `format: "toon"` if list is long.

---

### Example D — User wants to update a record
> **User:** "Change the title of the latest blog post to 'Hello World'."

1. **Call:** `gremius_query_collection` → `{ "collection": "blog-posts", "sort": "updatedAt", "limit": 1 }`
2. Extract `id` from result.
3. **Call:** `gremius_update_record` → `{ "collection": "blog-posts", "id": "<id>", "data": { "title": "Hello World" } }`

---

### Example E — User wants frontend code
> **User:** "Give me a React hook to fetch my projects."

1. **Call:** `gremius_describe_collection` → `{ "collection": "projects" }` (optional, validates schema).
2. **Call:** `gremius_generate_frontend_hook` → `{ "collection": "projects", "framework": "react", "type": "all" }`
3. **Respond:** Paste the generated hook/component/types code.

---

## 6. Auth & Security Context

Gremius MCP accepts two credential types:
- **Agent NHI (recommended):** `grm_agent_xxx` — scoped access with rate limits and audit logs.
- **Legacy API Key (deprecated):** `gremius_sk_xxx` — full access. Will be removed in v0.9.0.

If the agent does not have `mcp:connect` scope, all tool calls will return 403. If auth is not enabled on the instance, RLS policies may block dataset queries — call `gremius_enable_auth` first.

---

## 7. Response Formats

- **`json`** (default) — Human-readable, good for small payloads.
- **`toon`** — Flat key-value lines, ~60 % fewer tokens. Use when the agent must ingest >25 records into its own context window.

---

## 8. Grimoire vs Dataset — Final Reminder

| Situation | Use |
|-----------|-----|
| User asks for "blog", "CRM", "booking", "courses", "esports", etc. | **Grimoire** |
| User asks for "custom table", "my own schema", "specific fields" | **Dataset** |
| User wants admin UI, validation, relations out of the box | **Grimoire** |
| User wants total control over schema and no extra tables | **Dataset** |
