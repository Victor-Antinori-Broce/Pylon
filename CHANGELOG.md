# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work done in October 2026 to prepare the public repository. Nothing here is
a tagged release yet.

### One-command install (2026-10-31)

#### Added

- **`./install.sh`** and **`install.ps1`**: generate `.env`, build, start and
  print the next steps. They only need Docker, and pick free names and ports if
  another install is on the machine.
- **`KITSUDEN_INSTANCE`**: prefix of containers, volumes and network. The
  default keeps today's names, so existing installs are unaffected.
- **`DDL_DB_PASSWORD`** in `.env.production.example`. Compose now builds
  `DATABASE_DDL_URL` from it, so kons can be enabled from the panel.

#### Fixed

- **On a new database, background jobs never ran.** Migrations 0056 and 0057
  grant their functions only if the app role exists, and it was created after
  migrating: `permission denied for function kitsuden_cola_reclamar`, about
  twice a second. The role is now created first. Existing installs were not
  affected.
- Sign-in at `http://127.0.0.1:3001` failed with "Invalid origin".
- `OAUTH_ISSUER_URL` never reached the API container.
- Enabling a kon that is not installed answered `500` "migrations failed"; now
  `409` with how to install it.

### Postgres queue, optional Valkey, glass box, streams and the rest of kitsuden2.md (2026-10-28)

#### Changed

- **BullMQ removed.** Background jobs run on a Postgres queue with a
  transactional outbox (`queue.dispatch()` in `@kitsuden/engine`, table
  `kitsuden_outbox`, migration 0056): a job dispatched in a request that rolls
  back does not exist; `FOR UPDATE SKIP LOCKED`, leases with an orphan sweep,
  retries with backoff and a dead letter (`/api/admin/queue`, panel
  **Requests and queue**); the actor is re-read before running. `NOTIFY` wakes
  the worker, polling is the safety net. Measured: ~600 dispatches/s and ~550
  claims/s on a laptop ([docs/install/queue.md](docs/install/queue.md)).
- **Valkey is optional.** Without `VALKEY_URL`/`REDIS_URL` the API never tries
  `localhost:6379`: caches and the rate limiter use process memory, realtime
  Pub/Sub uses the process plus `LISTEN/NOTIFY`. Two services are enough.
- Kons import Zod from the engine (`@kitsuden/engine/zod`); ESLint rejects
  `zod` and `bullmq` imports inside `packages/kons`.
- `hono` pinned to 4.13.13 (GHSA-5r4p-p66f-jhc7 / CVE-2026-111757 affects
  4.12.4–4.13.10); Dependabot configured.
- The published `kitsuden` package: LLM SDKs, PGlite, `nodemailer` and
  `pdf-lib` are optional peers (imported when used); small utilities are
  bundled. Generated projects (`create-kitsuden --full`) start with API +
  Postgres only; Valkey and MinIO are compose profiles.

#### Added

- **Glass box:** one trace per request in Postgres (daily partitions, 7-day
  retention): actor, kon, operation, duration, database time, rows written and
  writes **blocked** by the owner filter or RLS (same 404 for the caller).
  `/api/admin/requests`, panel tab, optional OTLP export.
- **Streaming operations:** `salida.flujo` + `async function*` → standard
  Server-Sent Events, each step in its own short RLS transaction; typed
  `AsyncIterable` in the SDK, the list of events over MCP.
- **Proposal notifications:** `GET /api/proposals/{id}/events` (SSE) and a
  signed webhook per agent (`/api/admin/agents/{id}/notify`), delivered by
  the queue.
- **Semantic search in `defineModelo`** (`semantica`): pgvector column and
  HNSW index in the generated migration, embeddings computed on the queue,
  `search-<plural>` operation. Local OpenAI-compatible embedding servers
  (`EMBEDDINGS_URL`). An optional prompt-injection classifier annotates
  proposals for reviewers (never decides).
- **kon-ingesta** (optional, off by default): extract, chunk and search
  documents (PDF via optional `unpdf`, images via an OCR sidecar).
- **Node 22+ runtime** (`servidor-node.ts`, `build:node`), checked in CI
  without Valkey. `lib/fichero.ts` replaces direct `Bun.file`.
- `pnpm sdk:watch` (incremental SDK generation), Standard Schema validators
  from the OpenAPI in the SDK, per-test rollback helper for API tests,
  PgBouncer guide and probe, day-2 model migration tests, publication
  inventory and history-free export scripts, threat model, docs index.

### Typed clients for TypeScript and Python, generated from the OpenAPI (2026-10-28)

#### Added

- **Generated typed clients** ([docs/agents/clients.md](docs/agents/clients.md)):
  `createKitsuden()` / `KitsudenApi` in `@kitsuden/sdk` and `KitsudenApi` /
  `AsyncKitsudenApi` in the Python `kitsuden` package. One property per kon and
  one typed method per kon SDK operation (737 operations of 40 kons at
  generation time), with typed arguments (the MCP tool's shape), typed
  responses and `KITSUDEN_E_*` codes as a closed union / `Literal`.
- Both clients: agent token (`KITSUDEN_API_TOKEN`) or session cookie, base URL
  from `KITSUDEN_API_URL` (no localhost default), `202
  KITSUDEN_E_APPROVAL_REQUIRED` returned as a typed pending proposal and never
  retried, automatic `Idempotency-Key` on writes, retries only when safe
  honouring `Retry-After`, `json` / `toon` / `tron` / `auto` with decoding,
  provenance (`X-Kitsuden-Provenance`) and pagination helpers. TS: zero runtime
  dependencies (Node 18+, Bun, Deno, browsers). Python: sync and async (httpx),
  stdlib dataclasses + generated `TypedDict`s, `py.typed`, 3.9+.
- TRON decoders of our own in both SDKs (no new dependency), checked against
  `@tron-format/tron` on shared fixtures (`scripts/sdk/tron-fixtures.mjs`).
- `pnpm sdk:openapi` (offline OpenAPI of every installed kon's operations,
  `apps/api/scripts/sdk-openapi.ts`), `pnpm sdk:generate`
  (`scripts/sdk/generate.mjs`, deterministic, no third-party generator,
  `--from-url` for projects with their own kons), `pnpm sdk:check` and the CI
  jobs `sdk-clients` / `sdk-clients-integration`.
- Tests: `pnpm test:sdk:ts`, `pnpm test:sdk:py` (mocked server) and
  `pnpm test:sdk:integration` (both clients against a live API on a test
  database, `scripts/sdk/integration.mjs`).

### Models declared once: `defineModelo` (phase H3, 2026-10-28)

#### Added

- **`defineModelo`** ([docs/agents/models.md](docs/agents/models.md)) in
  `@kitsuden/shared`: declare a model's fields and its **required** access
  policy (`leer`: `publico` | `dueno` | `staff`; `escribir`: `dueno` |
  `staff`) once. Kitsuden derives the Drizzle table (`tablaDeModelo`), six kon
  SDK operations (`describe-`, `list-`, `get-`, `create-`, `update-`,
  `delete-<model>`) and therefore REST, OpenAPI 3.1 and MCP tools, zod 4
  validation with 422 problem+json, RLS policies with `FORCE`, the agent scopes
  `<model>:read` / `<model>:write` (agents never write without a write scope;
  a deny wins over `admin`), DELETE as sensitive, and the panel view.
- **`defineKonDeModelos`** in `@kitsuden/engine`: a `defineKonSdk` kon whose
  operations come from its models (plus any hand-written ones).
- **`kitsuden make model <name>`** and a new **`kitsuden makemigrations`**: a
  Django-style diff against `migrations/modelos.snapshot.json` that writes
  `migrations/NNNN_<name>.sql` (CREATE, ADD/RENAME/ALTER COLUMN, CHECK and
  UNIQUE changes, RLS policies). Destructive changes are written as comments
  unless `--allow-destructive`. It never runs SQL. The previous drizzle-kit
  generator stays behind `--drizzle`.
- **`GET /api/models`** (staff) and the panel's **Models** page (`/models`):
  list, create and edit forms generated from each model's descriptor.
- A test-only demo kon, `tests/unit/fixtures/kon-notas`, with its generated
  migration; tests cover the table, the REST/MCP/OpenAPI surface, owner
  isolation, agent scopes, RLS with a sabotage check, the migration diff and
  the panel view.

#### Changed

- `kitsuden makemigrations` now generates migrations from `defineModelo`
  models by default; use `--drizzle` for the old behaviour.

### OAuth 2.1 for MCP clients (2026-10-28)

#### Added

- **Standard MCP authorization** ([docs/agents/oauth.md](docs/agents/oauth.md)),
  revision **2026-07-28** of the MCP spec: any MCP client (Claude Code, Claude
  Desktop/claude.ai connectors, Cursor, VS Code, MCP Inspector…) connects to
  `/api/mcp` with no key to copy. Protected Resource Metadata (RFC 9728) with
  `WWW-Authenticate` on `401`/`403`, Authorization Server Metadata (RFC 8414),
  Client ID Metadata Documents (SSRF-guarded) and Dynamic Client Registration
  (RFC 7591), authorization code + PKCE `S256` only, resource indicators
  (RFC 8707) with audience-bound tokens, `iss` in the redirect (RFC 9207),
  15-minute access tokens, rotating refresh tokens with reuse detection (a
  reused refresh token revokes its whole family), and revocation (RFC 7009).
- **Consent in the panel** (`/oauth/consent`, en/es): a human admin or editor
  picks the agent the client acts as (an admin may create one) and the scopes,
  which can only narrow what the agent and the human already have. That human
  becomes the agent's signer. **OAuth connections** (`/oauth/connections`)
  lists connected clients with revoke.
- An OAuth token resolves to the same agent context as the agent's static key:
  scopes, denies, toolsets, quotas, approvals, RLS, provenance and audit hold
  unchanged. Each connection is an `OAuth · <client>` row in the agent's keys.
- `/api/mcp` also accepts **Streamable HTTP** sessions: `POST initialize`
  without a session opens one and returns `Mcp-Session-Id`; `GET` with that
  header answers `405`. The HTTP+SSE flow is unchanged.
- Migration `0055_oauth_para_mcp.sql` (five tables, hashes only, system/admin
  RLS). New env: `OAUTH_ISSUER_URL` (public `https` API origin; required for
  OAuth in production) and optional `KITSUDEN_OAUTH_*` / `OAUTH_*` switches.

#### Changed

- Static agent keys (`kitsuden_agent_*`) keep working as before. Rotating the
  `OAuth · <client>` row of an agent is refused (`409`): revoke it instead.

### Signed, versioned kon registry (2026-10-28)

#### Added

- **Kon registry** ([docs/kons/registry.md](docs/kons/registry.md)): kons can
  now be published to and installed from a signed, static index (a folder
  for GitHub Pages, R2 or a git repo; an "API mode" is any server serving the
  same paths). New CLI commands: `kitsuden kon search|info|update|outdated|
  sync|verify|publish|yank|keygen`, and `kon add <id>@<range>`.
- **Manifest spec 1** for `kon.json`: id, semver version, core range
  `kitsuden`, `sdk`, SPDX `license`, `author`, `repository`,
  `dependencies.versions` (ranges next to the existing `dependencies.kons`
  array), tables, migrations (recorded at publish) and a required
  `permissions` block (`scopes`, `hosts`, `sensitive`). Added to
  `packages/schemas/kon-schema.json` as optional fields.
- **Signatures**: Ed25519 in the minisign format with `node:crypto` (no new
  dependencies, verifiable offline). The registry key signs the index; owner
  publisher keys listed in it sign each package, and the signed comment binds
  id, version and SHA-256. Unsigned or tampered packages are refused;
  `--allow-unsigned` is for local development and is always refused when
  `KITSUDEN_PUBLIC=true`. Rollback protection by index `serial`, optional
  `expires`.
- **Deterministic packages and safe extraction**: reproducible `.tgz`;
  symlinks, hard links, devices, pax headers, traversal, absolute and Windows
  reserved paths, case-insensitive duplicates and gzip bombs are refused;
  size limits; no lifecycle scripts allowed or executed.
- **Semver resolution and `kitsuden.kons.lock`** (exact versions, hashes,
  signing keys, normalized manifests); yanked versions refused for new
  installs, revoked versions (advisories) refused always.
- **Permission diff before install**, like code promotion: new kons need a
  yes or `--yes`; updates that widen scopes, hosts or sensitive operations
  need a yes or `--yes --accept-wider`. Registry kons' migrations still run
  through `apps/api/scripts/migrate.ts --kon <id>` and the existing DDL role.

### Code promotion for agent-written code: suggestion and turbo (2026-10-28)

#### Added

- **Code promotion pipeline** (phase I): an agent with the new scope
  `promotion:propose` submits a *draft* of a code action's code
  (`POST /api/promotion/drafts`, MCP `promotion_propose`; `promotion_list`,
  `promotion_status`). Drafts are versioned (`code_versions`; the active
  version is never edited in place) and go through: sandbox tests with a
  simulated `kitsuden.api` and `fetch` (the draft's tests plus the action's),
  a local deterministic security scan (eval/Function, escapes, host globals,
  secret literals, obfuscation, size; no network, no LLM, no AI-Infra-Guard),
  and a diff of the declared scopes, outbound hosts and limits against the
  active version.
- **Two modes per agent**, set by an admin: `suggestion` (default; every
  draft is a proposal in the approvals inbox, approved by a human admin) and
  `turbo` (activates by itself only if every test and check passes and
  nothing widens scopes, hosts or limits, creates an action, touches secrets,
  users, roles or security config, calls a sensitive operation or makes an
  unclassifiable API call; otherwise a proposal with the reasons). A global
  cap `turboAllowed` (off by default) bounds it. Agents can never approve,
  activate or roll back anything.
- **Watched activation with automatic rollback**: a watch window (30 min,
  3 executions, 50 % errors by default) restores the previous version on
  errors/timeouts; admins can roll back by hand. Everything is audited
  (`promotion_*` in `agent_audit_logs`, with agent, signer and version
  hashes) and rollbacks go to the agent webhook.
- Panel (en/es): **Approvals → Code promotion** (pipeline per version,
  approve, reject, roll back, activate, settings, agents' modes) and
  **Agents → agent → Approval → Code promotion**.
- Works with `ENABLE_CODE_ACTIONS` off: drafts are tested and decided; the
  version stays `approved` and activation reports `code_actions_disabled`.
- Migration `0053_promocion_de_codigo.sql` (`code_versions` with RLS,
  `agent_identities.promotion_mode`). See `docs/agents/promotion.md`.

#### Changed

- `/api/promotion` is excluded from the generic approval gate (REST and MCP):
  a draft already is a proposal.
- **Agents can no longer change an action's code outside the pipeline**
  (owner's decision): `POST`/`PATCH /api/actions` with code or declared
  capabilities, `/api/functions` with `code` and the MCP tool
  `kitsuden_define_action` with code answer `403 KITSUDEN_E_FORBIDDEN`
  pointing to `promotion_propose`, whatever the agent's scopes (`admin`
  included). Non-code fields work as before.
- Generic routes (`/api/items`, the data explorer, GraphQL mutations, MCP
  table tools) no longer write `actions`, `kitsuden_functions`,
  `code_versions`, `action_executions`, `function_executions` or
  `approval_settings`, for anyone.
- **Human edits are versioned**: every change of an action's code by an admin
  in `/api/actions` (creation included) is stored as an active `manual`
  version with base and previous hashes and audited
  (`promotion_manual_edit`); rollback and `stale_base` take it into account.
- **Turbo counts only what is new** (owner's decision): a sensitive operation,
  host, scope or touch of secrets/users/roles/security config the active
  version already had no longer blocks turbo; only additions do. Computed API
  paths, missing tests, raised limits and the first version of a new action
  still need a human.

### MCP security and efficiency: provenance, toolsets, savings, red-teaming (2026-10-28)

#### Added

- **Provenance on returned data** (defence against prompt injection between
  agents): MCP results with stored records carry `_meta["kitsuden/provenance"]`
  (per record: `user` | `agent` | `system` | `anonymous`, `untrusted`,
  `self`). Optional wrapping of untrusted text (`untrusted_wrap` argument or
  the agent setting: `delimiters` or `object`; default `none`, unchanged
  output). REST on request (`X-Kitsuden-Provenance: 1`). See
  `docs/agents/untrusted-content.md`.
- **MCP toolsets**: `GET /api/mcp?toolset=read,kon:blog` or a per-agent
  default in the panel narrows `tools/list` and `tools/call`; intersected with
  `allowedTools` and scopes, never grants anything. Admin with every kon:
  187,822 → 1,409 `o200k` tokens of tool definitions with `data`. See
  `docs/agents/toolsets.md`.
- **Format savings per agent**: bytes and estimated tokens the `auto` format
  saved against compact JSON, per agent and UTC day (`agent_format_savings`,
  counters only), shown in the panel next to the quotas (en/es).
- `GET/PUT /api/v1/agents/:id/mcp-settings` (admin), `formatSavings` in
  `GET /api/v1/agents/:id/quotas`. Migration `0052_mcp_ajustes_y_ahorro.sql`
  (must be applied before deploying: agent authentication reads the new column).
- **AI-Infra-Guard** (Tencent Zhuque Lab, Apache-2.0) red-teaming: non-blocking
  CI job `aig-red-team` (only with the `LLM_API_KEY` secret, push to main or
  manual) and `scripts/seguridad/aig.mjs`; pinned `aig-mcp-scan==0.2.0`,
  `aig-skill-scan==0.2.2`; SARIF as artifact. Its web UI is never deployed.
  See `docs/agents/red-teaming.md`.

### Agent memory over MCP, with an owner (2026-10-28)

#### Added

- **The brain is reachable over MCP** (`brain_search`, `brain_read`,
  `brain_list`, `brain_note_write`, `brain_note_delete`, `brain_connect`,
  `brain_connections`, `brain_claim_add`, `brain_claims`,
  `brain_claim_verify`, `brain_lint`, `brain_export_okf`,
  `brain_import_graphify`), declared once as kon SDK operations
  (`kon-brain`, `/api/brain/memory`): REST, OpenAPI and MCP come from the
  same declaration. New scopes `brain:read` / `brain:write`. See
  `docs/agents/memory.md`.
- **Claims with evidence** (`brain_claims`): a statement tied to a source and
  its SHA-256 (plus an optional range). `lint` marks a claim stale when the
  source is re-captured with another hash, deleted or no longer fits the range;
  `brain_claim_verify` re-checks or rebinds it.
- **Export to Open Knowledge Format v0.2** (`brain_export_okf`), written from
  the spec in GoogleCloudPlatform/knowledge-catalog `okf/SPEC.md`.
- **graphify importer** (`brain_import_graphify`): our own parser of
  graphify's `graph.json` (no graphify code). Checks `graph.schema_version`
  (absent = legacy, 1 = supported, other = 422), keeps EXTRACTED/INFERRED.
- **Pluggable embeddings**: `KITSUDEN_BRAIN_EMBEDDINGS=lexical` (default) or
  `http` (any OpenAI-compatible `/embeddings`, e.g. Ollama). Vectors are
  stored with their kind and only compared with the same kind.

#### Changed

- **Brain notes have an owner** (user or agent, plus the agent's signer) and a
  visibility (`private` by default, `shared`), enforced by RLS on
  `brain_notes`, `brain_connections` and `brain_claims` and in the queries.
  Migration `0051_memoria_de_agentes.sql`: existing notes become `shared`.
- **Connections say where they come from**: `origen`
  (EXTRACTED | INFERRED | MANUAL) and `confianza`. Existing rows are
  backfilled as INFERRED with `confianza = strength`.
- The scanner no longer overwrites a note that has an owner agent or a key.

#### Fixed

- Docs and the panel called the built-in embeddings "semantic". They are a
  term-frequency hash: lexical. Every search response now says which.

### Real sandbox for user code; the API drops the superuser (2026-10-26)

#### Security

- **Code actions and functions run in QuickJS (WebAssembly) inside a child
  process** with an empty environment and `node --permission` (falls back to
  Bun without permissions if there is no Node >= 22; the production image now
  installs `nodejs`). The previous sandbox, a Bun child process running the
  code with `new Function`, let it read any file (including `.env`), open
  sockets, spawn processes and, on Windows, see the user's environment.
  Hostile tests: 22 of 25 failed against it, 25 of 25 pass now.
- **`kitsuden.api.*`** inside the code: the Kitsuden API as an agent identity
  with the scopes the action declares in `config.scopes` (none by default),
  never more than the caller has; through the same gates, `can()`, RLS, quotas
  and approvals (sandbox calls no longer skip them). `fetch` only to
  `config.fetchAllow` / `KITSUDEN_SANDBOX_FETCH_ALLOW`, redirects not
  followed. Hard memory cap on the whole WASM memory, time and call limits.
- **`created_by_id` of actions and functions comes from the session**; the
  functions route used to take it from the request body.
- **`docker/start-with-check.sh` unsets `DATABASE_ADMIN_URL` before starting
  the API.** Optional limited role `DATABASE_DDL_URL` for runtime DDL (hot kon
  activation, Vault); `KITSUDEN_API_KEEP_ADMIN_URL=true` keeps the old
  behaviour. See [docs/agents/sandbox.md](docs/agents/sandbox.md).

### Owner decisions: image proposals, front desk, games without owner (2026-10-26)

#### Added

- **An image upload by an agent can be a proposal.** A multipart upload whose
  files are all images by their content (JPEG, PNG, GIF, WebP, AVIF), each up to
  `APPROVALS_MAX_UPLOAD_MB` (default 10, like the media library), with no
  secret in its text fields, is held (`202`) instead of refused. The bytes wait
  in the new table `agent_proposal_files` (migration `0050`), never in
  `/media`; the inbox shows thumbnails from
  `GET /api/approvals/proposals/{id}/files/{fileId}` (team only); on approval
  the form is rebuilt and run as the agent; the files are deleted on
  rejection, expiry or execution. Other files get
  `KITSUDEN_E_APPROVAL_UNSUPPORTED` with `reason: "not_image"`.

#### Fixed

- **An agent could not upload to the media library at all**: the row stored
  the agent id in `media.created_by_id`, a foreign key to `auth_users`, and the
  insert failed (207). It now stores the agent's valid human signer (or
  nothing) and keeps the agent in `metadata.agentId`.

#### Changed (kitsuden-kons)

- **kon-booking: editors are front-desk staff again.** `admin` and `editor`
  (or an agent with the whole kon) manage rooms and every booking; users still
  book and see only their own; only an admin deletes a room. Policy
  `esStaffEfectivo` and RLS `kitsuden_staff_efectivo` (migration `0005`).
- **kon-games: games have no owner.** The `update` rule no longer says "admin
  or owner"; staff creates, edits and sees drafts, only an admin deletes, and
  `POST /api/games` and `PATCH /api/games/:id` now ask the policy.

### zod 4 (2026-10-25)

#### Changed

- **zod 3 → 4** across the core, the engine, the CLI, the MCP server and every
  kon (`^4.6.7`).
- **JSON Schema comes from `z.toJSONSchema`** (OpenAPI 3.1 / JSON Schema
  2020-12, request bodies described as input). `zod-to-json-schema`,
  `@hono/zod-openapi` and `@asteasolutions/zod-to-openapi` are gone; the last
  two were not imported anywhere. `@hono/zod-validator` is now `^0.9.1`.
- **`z.string().uuid()` became `z.guid()`.** zod 4's `uuid()` only accepts
  RFC 9562 ids, so seeded or hand-written ids that zod 3 accepted would
  start failing with a 400. `guid()` keeps zod 3's rule (8-4-4-4-12 hex).
- **Environment defaults use `prefault`.** In zod 4 a `.default()` skips
  `.transform()`, so `RATE_LIMIT_ENABLED` arrived as the string `"true"`,
  `PORT` as a string, and `ALLOWED_ORIGINS` was never split into a list.

#### Fixed

- **The OpenAPI for discovered kon bodies no longer points at a
  `#/definitions/<name>` that does not exist.** Schemas are always inline.

### Response formats for agents: TOON fixed, TRON added, `auto` by default (2026-10-25)

#### Fixed

- **TOON could lose data.** The decoder returned `[]` for any list of
  non-flat objects; the middleware dropped the keys next to `data`; `{}` was
  not valid TOON; a root array came back under an invented `data` key. The
  codec was rewritten: its output is byte-identical to the reference encoder
  (`@toon-format/toon@4.4.0`) and it reads everything that encoder writes.
  The TypeScript and Python SDKs and the standalone MCP server, which had
  parsers for an older format, use the real decoder.
- **Unmeasured "~60 % fewer tokens" claims** removed from tool descriptions,
  READMEs and the agent docs.

#### Added

- **`auto` format**: each response is encoded as compact JSON, TOON and TRON,
  checked to decode back to the same data, and the shortest is sent
  (`apps/api/src/lib/formatos.ts`). Default for MCP tools (`_meta["kitsuden/format"]`
  says which); on REST with `Accept: application/vnd.kitsuden.auto` or
  `?format=auto`. `Accept: application/json` still always gets JSON.
- **TRON** (`Accept: application/vnd.tron`), via `@tron-format/tron` pinned
  to `0.1.3`.
- Measured on 24 real responses: `auto` uses 16.7 % fewer tokens than compact
  JSON (`docs/agents/benchmarks.md`).

#### Changed

- MCP tools return **compact JSON** instead of pretty-printed JSON when the
  format is `json` (hardcoded tools, kon SDK tools, engine actions,
  resources, the standalone server).

### Kons moved out of the core (2026-10-24)

#### Changed

- **Kons are no longer part of Kitsuden.** The 30 domain kons (blog, wiki,
  CRM, games…) live in the new repository
  [kitsuden-kons](https://github.com/Victor-Antinori-Broce/kitsuden-kons)
  (MIT), each with its maturity. The core keeps `kon-datasets`, `kon-media`
  and `kon-blocks` (`packages/core`). A clean clone installs, builds and passes
  its tests with no kon. Why each module went where:
  `docs/kons/core-and-kons.md`.
- **Kons are installed by configuration, not found by scanning folders.**
  The API mounts what is declared in `kitsuden.kons.json` (written by the CLI)
  or `KITSUDEN_KONS`, resolved as a copy in `packages/kons/<id>`, a local path
  or an installed package (`apps/api/src/lib/kons-instalados.ts`), and active
  in the `modules` table. The loader, the panel registry, the scanner, the
  migration runner (`--todos-los-kons` = all installed), the schema merger and
  the authorization matrix all read the same list.
- `schema-kons.generated.ts` aggregates only the core modules: kon tables
  are created by each kon's own SQL migrations.

#### Added

- `kitsuden kon add|remove|list` (`packages/cli/src/commands/kon.ts`):
  installs from a local path or git (`--from`, `--ref`), with the kon's
  dependencies, an SDK compatibility check, `pnpm install` and the normal
  migration runner (`migrate.ts --kon <id>`, new flag); `--link` for kon
  development; refuses to overwrite or delete a copy with local changes.
- The loader checks a kon's `sdk` (in `kon.json`) against the core's
  (`GET /api/version` → `sdk.kons`) **before importing it**, and refuses to
  mount or reserve an incompatible kon, with the reason in the log and in the
  load report (`rechazados`). It also reports kons that are active in the
  database but not installed, with the command that fixes it.
- Docker: the API image installs the kons in the `KITSUDEN_KONS` build
  argument from an additional build context `kons`
  (`docker/instalar-kons.mjs`, which refuses missing kon dependencies). The
  public compose builds the core only.
- Docs: `docs/kons/core-and-kons.md`, `installing.md`, `publishing.md`.

#### Fixed

- A kon activated from the panel (`PATCH /api/modules/:key`) whose mount path
  lives only in its code (`kon-ecommerce` → `/api/shop`, `kon-character-builder`
  → `/api/builder`) answered 404 until a restart: the reserved candidates came
  from the manifest and the id. The loader now reads the code's `mountPath`
  when the manifest does not declare it, and every kon in kitsuden-kons
  declares `mount.path` (guarded). Test:
  `apps/api/src/tests/kon-activado-en-caliente.test.ts`.
- `kon-payments` imported `../kon-conta` statically: with `kon-conta` not
  installed it did not compile. The ledger integration is now loaded at
  runtime and declared as an optional kon dependency.

### Human approval of agent requests (2026-10-24)

#### Added

- **Proposal mode** (guide: `docs/agents/approvals.md`). Off by default. An
  admin turns it on globally, per agent (`inherit` / `propose` / `direct`) and
  per operation (the kon SDK's `sensible` is the default; legacy routes by
  method + path rules; core MCP tools by name). An agent request that needs
  approval is not executed: it is stored as a proposal (body without secrets,
  cheap diff, idempotency key) and answered `202` with
  `KITSUDEN_E_APPROVAL_REQUIRED`, the proposal id and `Location:
  /api/proposals/{id}`; over MCP the tool returns a pending (non-error)
  result and agents get `kitsuden_proposal_status`.
- Approval inbox, settings and audit in the admin panel (English and Spanish)
  and in `/api/approvals` (humans of the team only; settings admin only; no
  agent, not even with `admin`). Approval runs the request once, with the
  agent's current identity and permissions (revoked = not executed), records
  the approver and stores the real result for the agent.
- Error codes `KITSUDEN_E_APPROVAL_REQUIRED` and
  `KITSUDEN_E_APPROVAL_UNSUPPORTED`; migration `0048` (`approval_settings`,
  `agent_proposals`, `agent_identities.approval_mode`).
- **Human signer per agent** (`sponsor_user_id`, migration `0049`): what an
  agent creates is signed by an admin or editor chosen in the panel (blog
  `authorId`, dataset entry `owner_id`; `created_by_id` keeps the agent).
  `KITSUDEN_E_AGENT_SPONSOR_INVALID` when the signer is gone or lost its role.
- Kitsuden's own SDK operations (agent permissions, approvals, proposals) are
  now listed in `GET /api/docs/openapi.json`.

#### Changed

- Core MCP tools: `mcp:read` / `mcp:write` open the tool, not a dataset whose
  `policyJson` closes it; `rlsRules` apply as over REST. Per-dataset scopes
  still open datasets.
- Idempotent replays (`Idempotent-Replayed: true`) no longer spend agent
  quota (requests, writes or units), over REST or MCP.

#### Fixed

- MCP SSE sessions died after 10 s without traffic (Bun's default
  `idleTimeout`, keepalive every 30 s): the next `POST` got "Invalid or
  expired session". `GET /api/mcp` now has no idle timeout.

### Kon SDK: declare an operation once (2026-10-23)

#### Added

- **Kon SDK** (`defineOperacion` / `defineKonSdk`, contract in
  `@kitsuden/shared`, runtime in `@kitsuden/engine`; guide in
  `docs/kons/README.md`). One declaration per operation (id, method, path, zod
  input/output, description, access and permission, `sensible`, `idempotente`,
  `KITSUDEN_E_*` errors, MCP exposure) generates the REST route (422
  problem+json validation, scope + policy authorization, idempotency and RLS
  inherited), its OpenAPI 3.1 operation and its MCP tool (`<kon>__<id>`, same
  schemas, the session's scopes and `allowedTools`, `idempotency_key`).
  Versioned as `sdk.kons = 1` in `GET /api/version`.
- `kon-blocks`, `kon-media`, `kon-datasets` and `kon-blog` are written with the
  SDK (81 operations, 72 MCP tools); their HTTP contract is unchanged.
- `kitsuden make kon` generates SDK kons.
- CI coverage test `tests/unit/cobertura-de-operaciones.test.ts` (every mounted
  route is an SDK operation or in the shrink-only legacy list) and the live
  report `apps/api/scripts/cobertura-de-operaciones.ts`.

#### Changed

- `GET /api/docs/openapi.json` is now **OpenAPI 3.1.0** and validates against
  the official schema (`@seriousme/openapi-schema-validator`).

#### Fixed

- `PATCH /api/blog/:id` (and `POST /api/blog`) with `publishedAt` answered 500
  (`value.toISOString is not a function`): publishing or scheduling while
  editing a post failed. Dates are now coerced from ISO 8601; `null`
  unschedules.

### Public repository preparation (2026-10-19)

#### Added

- **Public/private split.** The root `.gitignore` is now an allowlist: only
  the product (API, panel, engine, core, kons, grimoires, shared packages,
  the neutral starter, compose files, Docker files, scripts, product docs) is
  part of the repository; local sites, data dumps and scratch files stay out.
- **Neutral starter** `packages/starters/kitsuden-starter-basic`: an Astro 7
  server-rendered site that renders page-builder pages, the blog and the
  media library, with SEO basics, a light/dark theme, a 503 on API outages and
  optional Inti visual editing. New runtime variable `KITSUDEN_TRUST_PROXY`
  (take the visitor IP from the last `X-Forwarded-For` entry behind a proxy).
- **Inti installable from git.** The starter has no Inti dependency; Inti's
  packages install from `github:Victor-Antinori-Broce/inti#<commit>&path:/packages/…`
  and build themselves in `prepare` (documented in the starter README and
  `docs/install/inti.md`).
- **Generic website image.** `docker/Dockerfile.web` builds the neutral
  starter (Node 22, pnpm 9.15.4, no root); `docker-compose.tls.yml` runs it as
  `kitsuden_web` (`SITE_URL` from `SITE_DOMAIN` at build; `KITSUDEN_API_URL`,
  `KITSUDEN_SITE_KEY`, `KITSUDEN_TRUST_PROXY=true` at start) and
  `docker/Caddyfile` is generic. To serve another website, pass an extra
  overlay after the TLS one; `scripts/deploy.sh` reads `KITSUDEN_OVERLAYS`.
- **Configurable reserved paths.** `KITSUDEN_SEGMENTOS_RESERVADOS` (API,
  passed by `docker-compose.yml`) adds first-level paths of your website that
  a game slug cannot take, on top of the common list in
  `packages/shared/src/sitio-publico.ts`.
- **English installation guide** in `docs/install/` (requirements, local,
  server and VPS, first run, variables, starter, Inti, upgrades and backups,
  versions, troubleshooting). The Spanish guide in `docs/instalacion/` was
  updated to match.

#### Changed

- The pnpm workspace only includes `packages/starters/kitsuden-starter-*`; any
  other site folder under `packages/starters/` needs its own
  `pnpm-workspace.yaml` and lockfile, so the root lockfile only describes the
  repository.
- CI reworked to run from a clean clone (Bun everywhere, SvelteKit sync, test
  database and secret, a job for the neutral starter, the generic web image).
- Example data and placeholders are neutral (`example.com` in CORS examples
  and tests, admin placeholders, the game stats widget marked as sample data).
- `README.md` rewritten: what Kitsuden and Inti are, real requirements
  (pnpm 9, Node 22.12+, Bun 1.3+), real ports, Docker and local quick starts,
  no npm-publish promises. `CORE.md` and `ARCHITECTURE.md` rewritten in
  English; `docs/QUICKSTART.md` corrected (ports, pnpm, UUID dataset routes,
  MCP without `npx`).
- `.env.production.example` only lists variables the compose files and
  `scripts/deploy.sh` read (added `SITE_NAME`, `SITE_LOCALE`,
  `KITSUDEN_SEGMENTOS_RESERVADOS`, `KITSUDEN_OVERLAYS`, image and port
  overrides; removed variables only a private website used; S3 keys no longer
  described as required with local storage).
- Package READMEs (`@kitsuden/sdk`, `@kitsuden/shared`,
  `@kitsuden/mcp-server`) no longer tell you to install from npm: nothing is
  published; packages are used from the monorepo.

#### Removed

- `BETA.md` (a July 2026 audit, out of date), the root `QUICKSTART.md` and
  `START-GUIDE.md` (they described `npx kitsuden init`, published images and
  commands that do not exist). Their still-valid content lives in `README.md`
  and `docs/install/`.

#### Fixed

- Kon rate limits are no longer counted twice: each kon's limits have their
  own namespace (`kon:<id>`).
- `DELETE /api/media/cache/:id` works: storage gained a `list` operation, so
  the cached transforms of a file can be found and removed.
- `docker/start-with-check.sh` tells a missing database (created in step
  `[2/6]`, or a clear error if it cannot be) apart from a rejected user, by
  authenticating against the `postgres` maintenance database.
- The Inti adapter's error for a contract missing from `/api/version` now
  names the kon that serves it (usually it is disabled).

### Core fixes (2026-10-18 and 2026-10-19)

#### Fixed

- Rate limiters **fail closed** when Valkey is unavailable; the Valkey client
  fails fast, and a Valkey that goes down after connecting no longer hangs
  every `/api/*` request.
- The API image no longer hides build failures (`|| echo` removed) and runs as
  the `bun` user (uid 1000); the backup service runs as root explicitly.
  Existing media volumes need a one-time `chown -R 1000:1000` (see
  `docs/install/server.md`).
- `kon-broadcast` compiles again (a TypeScript error had been hidden by the
  image build).
- Image presets (`/api/media/preset/:id/:preset`) go through the storage
  abstraction; `sharp` import fixed.
- `/api/version` only announces contracts whose kon is mounted (before, it
  announced `games` with `kon-games` disabled).
- Failed agent authentications are audited (agent id nullable, migration
  0044).
- A race when loading kons (engine preloaded before kon imports).
- Lint errors (`no-control-regex`) in the block and blog sanitizers.

#### Added

- `HOST` to choose the API's listen address (default `0.0.0.0`).
- Database pool exhaustion answers `503` with `Retry-After` instead of `500`;
  `DB_POOL_MAX`, `DB_POOL_CONNECTION_TIMEOUT_MS`, `DB_POOL_IDLE_TIMEOUT_MS`.
- An authorization matrix (`apps/api/src/middleware/matriz-de-autorizacion.ts`
  and `apps/api/scripts/matriz-de-autorizacion.ts`) that checks every route
  against six identities; on 2026-10-19 it covered 1,020 routes with no
  mismatches.

### Security round (2026-10-15)

#### Security

- `/api/graph/<table>` could read about 170 tables with any account: closed.
- The first administrator could not be created (`POST /api/system/setup`
  answered 401 behind the early admin gate): the route is exempt and still
  only works with zero users.
- Agent keys created from the panel never authenticated (stored without
  `key_id`; a `_` inside the secret broke the parser): fixed.
- Origin (CSRF) check on every cookie-authenticated write, a 10 MB body
  limit, and generic bodies for 5xx errors.
- Kons: dataset calculated fields no longer evaluate code with
  `new Function`; promote-from-source could read `auth_users`; `ocr-training`
  leaked an LLM key and allowed SSRF; an IDOR in the payments portal; quiz
  answers exposed in the LMS; DMS, agile and accounting routes were open.
  All fixed, with tests.

#### Added

- `GET /api/version` with versioned API contracts (`packages/shared/src/contratos.ts`)
  and reference responses (`packages/shared/contratos/inti/respuestas-de-referencia.json`)
  checked by both Kitsuden and the Inti adapter.
- Installation guide in Spanish (`docs/instalacion/`).

### Earlier unreleased work (July 2026)

#### Added

- Docs: Sección de estado actual en `STABILIZATION_PLAN.md` con métricas reales del proyecto.
- Docs: Nuevo `packages/admin/ROADMAP.md` documentando vistas funcionales, rotas y pendientes para beta.
- Docs: Actualización de `docs/TEST_REPORT.md` con hallazgos críticos de calidad de tests.

#### Changed

- STABILIZATION_PLAN.md: Métricas actualizadas (604 tests, TypeScript limpio, builds funcionando).
- Root `package.json`: versiones vacías en `@hono/swagger-ui` y `@hono/zod-openapi` corregidas.
- `.env.example` y `apps/api/.env.example`: puertos alineados a API `3000` para consistencia con Docker y documentación.
- `scripts/test-db-up.ps1` y `scripts/test-db-up.sh`: URL de test corregida para coincidir con `docker-compose.test.yml`.
- `docker-compose.test.yml`: valores de PostgreSQL hardcodeados y puerto cambiado a `5434` para evitar conflictos con instancias locales de PostgreSQL en el host.
- `.env.test`: puerto y contraseña alineados con `docker-compose.test.yml`.
- Root `package.json`: scripts `test:api` y `test:api:all` ahora fuerzan `NODE_ENV=test KITSUDEN_TEST_DB=postgres` y ejecutan migraciones antes de los tests.
- Root `package.json`: `typecheck` ahora usa `NODE_OPTIONS=--max-old-space-size=8192` para evitar OOM en `svelte-check`.

#### Fixed

- Docs: Corrección de documentación desfasada respecto al estado real de tests y admin.
- Admin: Configuración de Vitest ahora resuelve `$app/navigation` y `$app/stores` de SvelteKit.
- Admin: Tests de `kon-loader.test.ts` ahora pasan (33/33).
- Admin: Links rotos del dashboard corregidos (`/posts`, `/media`, `/users`, `/blocks` → `/g/kon-*`).
- Admin: Reducidos warnings de accesibilidad en múltiples vistas y componentes.
- Admin: `/data-viewer` protegido detrás de rol `admin`.
- Repo: `bun.lock` eliminado del tracking de git e ignorado.
- Lint/Format: `pnpm lint` y `pnpm format:check` ahora pasan sin errores.
- Tests: Aserciones débiles reescritas en `rls-e2e.test.ts`, `datasets-http.test.ts`, `mcp.test.ts` y `critical-features.test.ts`; ahora verifican valores estrictos en lugar de tipos o rangos de status.
- Tests: `mcp.test.ts` ahora usa un token Agent NHI real con scope `mcp:connect` en lugar de cookies.
- Tests: `critical-features.test.ts` ahora usa rutas correctas (`/health`, `/admin/stats`, etc.) y aserciones estrictas de status/respuesta.
- Tests: `pnpm test:api:all` pasa 225 tests contra PostgreSQL real (migraciones + teardown incluidos).
- Typecheck: `pnpm typecheck` pasa con 0 errores (71 warnings en admin por `css-unknown-at-rule`).

## [0.9.0-beta] - 2026-06-04

### Added

- SDK: Subpath export `@kitsuden/sdk/realtime` with full type definitions
- SDK: `getClientId()` and `getUserId()` getters on `KitsudenRealtime`
- Auth: Migration script `migrate-api-keys-to-agents.ts` for legacy API key migration
- Auth: Deprecation headers (`Deprecation: kitsuden_sk_*; grm_agent_*`) on all legacy API key endpoints

### Changed

- **TypeScript strict mode enabled across the entire monorepo**
  - `apps/api`: `strict: true` (was `false`) — passes `tsc --noEmit` with 0 errors
  - `packages/shared`: strict mode verified clean
  - `packages/mcp-server`: strict mode verified clean
  - `packages/sdk`: strict mode verified clean
  - `packages/cli`: strict mode verified clean
  - `packages/admin`: strict mode verified clean
- SDK: `realtime.ts` — removed `@ts-nocheck`, fully typed with strict mode
- SDK: `tsup.config.ts` — now builds both `index` and `realtime` as separate entries
- SDK: `README.md` — completely rewritten with correct `from()` API, TOON, error handling, and edge runtime examples
- README (root): Updated architecture diagram (`packages/admin` instead of `apps/admin`, Svelte 5 instead of Vue, `packages/grimoires` instead of `packages/themes`)
- Docs: `PUBLISH_GUIDE.md` and `MCP_SDK_AUDIT.md` updated to reflect current SDK version and API
- Docs: AI prompts (`mcp-tools.md`, `claude-system-prompt.md`, `troubleshooting.md`) now recommend Agent NHI (`grm_agent_*`) over deprecated legacy API keys (`kitsuden_sk_*`)
- Auth: Legacy API keys (`kitsuden_sk_*`) now log deprecation warnings on every use
- Docker: `Dockerfile.prod` updated to copy full package directories instead of non-existent `dist/` for packages without build steps

### Fixed

- SDK: TypeScript strict mode now passes (`tsc --noEmit`) for both `index.ts` and `realtime.ts`
- SDK: Build artifacts cleaned from `src/` (`.js`, `.d.ts`, `.map` files)
- Repo: Removed 21 tracked compiled artifacts (`.js`, `.d.ts`) from `src/` directories
- Auth: Unified auth system — Better-Auth (humans) + Agents NHI (machines); legacy API keys deprecated but functional

## [0.7.0-beta] - 2026-03-06

### Added

- Structured logging system with Pino
- Centralized configuration with Zod validation
- Rate limiting middleware (hono-rate-limiter)
- Enhanced health checks with multi-component status
- Request ID tracing for debugging
- Security event logging
- Performance monitoring
- Comprehensive test suite (71 tests)
- ESLint + Prettier configuration
- GitHub Actions CI/CD pipeline
- Pre-commit hooks with Husky

### Changed

- Improved error handling with structured logging
- Migrated to type-safe configuration
- Enhanced health check endpoint with detailed status

### Fixed

- Resolved 60 TypeScript errors (now 0)
- Cleaned 445 legacy files
- All tests passing (71/71)

## [0.6.0] - 2026-02-15

### Added

- Svelte 5 migration complete
- Kon system with 21 kons
- Grimoire Esports bundle
- MCP server for AI agents
- pgvector integration for AI features

## [0.5.0] - 2026-01-20

### Added

- 3-tier architecture (Engine, Core, Kons)
- Row Level Security (RLS) implementation
- Dynamic schema system
- Better Auth integration
- BullMQ queues

[Unreleased]: https://github.com/Victor-Antinori-Broce/kitsuden/compare/v0.9.0-beta...HEAD
[0.9.0-beta]: https://github.com/Victor-Antinori-Broce/kitsuden/compare/v0.7.0-beta...v0.9.0-beta
[0.7.0-beta]: https://github.com/Victor-Antinori-Broce/kitsuden/compare/v0.6.0...v0.7.0-beta
[0.6.0]: https://github.com/Victor-Antinori-Broce/kitsuden/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Victor-Antinori-Broce/kitsuden/releases/tag/v0.5.0
