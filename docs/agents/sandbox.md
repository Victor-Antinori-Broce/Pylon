# The code sandbox

Kitsuden can run JavaScript that users write, or that an AI agent writes for
them: **code actions** (`/api/actions`, `type: "code"`) and the legacy
**functions** (`/api/functions`, which run through the same engine). This page
explains where that code runs, what it can reach, and what it cannot.

The short version: user code runs in a **WebAssembly JavaScript interpreter
(QuickJS) inside a separate process with an empty environment**. It cannot read
files, environment variables or the API's secrets, open sockets, start
processes, or talk to the database. It can only ask the API for two things:
an HTTP `fetch` to hosts on an allow-list, and calls to the Kitsuden API **as
an identity with the scopes the action declares, never more than whoever runs
it has**.

## Contents

- [Turning it on](#turning-it-on)
- [What the code sees](#what-the-code-sees)
- [Calling the Kitsuden API from code](#calling-the-kitsuden-api-from-code)
- [Calling other services (`fetch`)](#calling-other-services-fetch)
- [Limits](#limits)
- [How the isolation works](#how-the-isolation-works)
- [Database credentials: the API no longer holds the superuser](#database-credentials-the-api-no-longer-holds-the-superuser)
- [Other places that evaluate user input](#other-places-that-evaluate-user-input)
- [Migrating code written for the old sandbox](#migrating-code-written-for-the-old-sandbox)
- [Tests](#tests)

## Turning it on

Code actions are **off in production** unless you set:

```
ENABLE_CODE_ACTIONS=true
```

In development and tests they are on. Only admins (the `admin` role, or an
agent with the `admin` scope) can create, change or run actions and functions.

## What the code sees

The code is the body of an `async` function. It receives:

| Name | What it is |
| --- | --- |
| `event` | The trigger payload: `{ action, trigger, event, request, timestamp }`. |
| `env` | The action's declared `envVars` (frozen). There is **no** `process.env`. |
| `console` | `log`, `info`, `debug`, `warn`, `error`: captured into the execution log (50 KB max). |
| `fetch(url, { method, headers, body })` | HTTP to allow-listed hosts only (see below). Returns `{ status, ok, headers, text(), json() }`. |
| `kitsuden.api.get/post/put/patch/delete(path, body?)`, `kitsuden.api.request(method, path, body?)` | The Kitsuden API, as the action's identity. |
| `kitsuden.fetch`, `kitsuden.env`, `kitsuden.event`, `kitsuden.log` | Aliases kept for compatibility. |

Whatever the code `return`s must be JSON-serialisable; it is stored as the
execution result (1 MB max).

There is no `process`, `require`, `import` of modules, `Bun`, `Deno`, file
system, sockets, timers that outlive the run, or global `fetch` other than the
one above. They are not hidden: the interpreter does not have them.

Code written by an **agent** reaches an action only through the
[code promotion pipeline](promotion.md), whose tests run here with a
simulated `kitsuden.api` and `fetch` (even with `ENABLE_CODE_ACTIONS` off,
because nothing leaves the process).

## Calling the Kitsuden API from code

An action declares what its code may do in `config.scopes`, using the same
scopes as agent keys ([permissions](permissions.md)):

```json
{
  "name": "nightly-report",
  "type": "code",
  "trigger": "cron",
  "triggerConfig": { "cronExpression": "0 3 * * *" },
  "config": {
    "scopes": ["datasets:orders:read"],
    "code": "const r = await kitsuden.api.get('/api/datasets/<id>/entries'); return (await r.json()).docs.length;"
  }
}
```

**No `scopes`, no API.** Calls fail with *"This code has no Kitsuden API
identity"*. That is the default.

Every call goes back into the app through `app.fetch`, as an **agent
identity**. It passes the same deny rules, prefix gates, operation permissions
(`can()`), row-level security, quotas and [approval rules](approvals.md) as a
request from the network with that identity. Nothing skips them, and there is
no path to the database or to any secret other than through those routes.

Which identity:

| Who runs the action | Identity of `kitsuden.api` |
| --- | --- |
| An **agent** (`POST /api/actions/:id/execute` with its key) | **That agent**: its quotas, approval mode and audit trail, with only the declared scopes that the agent **already has**. Its `!deny` patterns travel with it. |
| A **person** (session) | A synthetic agent `action:<id>` with the declared scopes, only if that person is an **admin now** (re-read from the database). |
| **Cron or an event** | The same synthetic agent, on behalf of the account that **created** the action (`created_by_id`), only if that account is still an admin. If it was demoted or deleted, the code keeps running but has no API. |

`created_by_id` comes from the session (or the agent's valid sponsor), never
from the request body. Before 2026-10-26 the functions route took it from the
body, so anyone could attribute a function to someone else.

Headers, cookies or tokens the code puts anywhere (in the body, the query
string, a `fetch` to the API's own URL) do not change the identity: the
identity is set by the process, with a marker that cannot come from the
network. `fetch` to the API's own host is just another host and is rejected
unless you allow-list it (do not).

Paths must start with `/api/`. The code cannot call `/api/actions/*` or
`/api/functions/*` (no recursion) or `/api/auth/*` (no sessions), and paths
with `..`, `//`, `\` or `#` are rejected.

## Calling other services (`fetch`)

`fetch` only reaches hosts on the allow-list:

- per action: `config.fetchAllow: ["api.example.com", "*.example.org"]`;
- per server: `KITSUDEN_SANDBOX_FETCH_ALLOW=api.example.com,*.example.org`.

Only `http:` and `https:`; no credentials in the URL; redirects are **not
followed** (the code gets the `3xx` and can decide, which keeps the allow-list
meaningful); 10 s per request; 1 MB per response body. Request headers are
limited to simple names and values without line breaks.

## Limits

| Limit | Default | Maximum |
| --- | --- | --- |
| Time (`timeoutMs`) | 5 s | 60 s |
| Interpreter memory (`memoryLimitMb`) | 64 MB | 256 MB |
| Host calls (`maxCalls`, fetch + API) | 50 | 500 |
| Logs | 50 KB | |
| Result | 1 MB | |
| Each response to the code | 1 MB | |

Time is enforced twice: inside QuickJS by its interrupt handler (an infinite
loop ends with *"Function timed out"*), and outside by killing the process.
Memory is a **hard cap on the whole WebAssembly memory** of the interpreter
(`WebAssembly.Memory({ maximum })`), not just QuickJS's allocator limit: with
only the allocator limit, `new Array(1e5).fill(…)` in a loop grew the process
to 1.6 GB before failing. Now it fails with *"out of memory"* in well under a
second and the API process does not grow.

## How the isolation works

```
API process (has DATABASE_URL, auth secret, ...)
  │  spawn, env = {}  (Windows: SystemRoot only)
  ▼
child process: node --permission --allow-fs-read=<QuickJS packages, hijo.mjs>
  │  (falls back to Bun without --permission if no Node >= 22)
  ▼
QuickJS (WebAssembly)  ←  user code runs here
     ↑ ↓  JSON lines over stdin/stdout: {op: "fetch" | "api", args}
API process: checks allow-list / identity, does the call, answers with text
```

Two independent layers:

1. **Language.** QuickJS compiled to WebAssembly has no host objects. Only
   strings cross the boundary; no host object is ever handed to user code, so
   the classic `this.constructor.constructor("return process")()` escape of
   `vm` and `new Function` sandboxes returns the interpreter's own global, which
   has no `process`.
2. **Process.** Even if the interpreter were broken out of, the child has an
   empty environment (no secrets), and with Node's permission model it can only
   read the QuickJS files: no writing, no child processes, no worker threads,
   no native addons. A crash, an out-of-memory or a hang kills only the child.

Files: `apps/api/src/lib/worker-sandbox.ts` (parent),
`apps/api/src/lib/sandbox/hijo.mjs` (child),
`apps/api/src/lib/sandbox/identidad.ts` (identity of `kitsuden.api`).
Knobs: `KITSUDEN_SANDBOX_RUNTIME=node|bun|<path to node>`,
`KITSUDEN_SANDBOX_HIJO=<path to hijo.mjs>`.

The production image installs `nodejs` for this. Node's permission model does
not restrict the network, but the child does not need it and the interpreter
cannot reach it; an OS-level sandbox (a separate container or user, seccomp)
would add a third layer and is not set up by default.

### Options considered

| Option | Why not (or why) |
| --- | --- |
| A `Worker` in the API process | Shares the process: `process.env`, `import("node:child_process")`. This was the sandbox until 2026-10-25. |
| A Bun child process with an empty env | Still host JavaScript: reads any file the user can read (including `.env`), opens sockets, spawns processes. On Windows Bun also passed the user's environment (`USERPROFILE`, `USERNAME`, `TEMP`...). This was the sandbox on 2026-10-25. |
| `node:vm` / `isolated-vm` | `vm` is not a security boundary. `isolated-vm` is a native addon (build toolchain, prebuilt binaries per platform and runtime, does not run under Bun). |
| A separate container per run | Strongest OS isolation, but needs the Docker socket in the API (which is root on the host) or a runner service; heavy for "run 30 lines of JS". Good future third layer. |
| **QuickJS in WebAssembly, in a child process** | No host access by construction, pure WASM (same on Windows and Linux, Bun and Node), hard memory and time limits, plus a process boundary with no secrets. **Chosen.** |

## Database credentials: the API no longer holds the superuser

Until 2026-10-26 the API container received `DATABASE_ADMIN_URL` (a Postgres
superuser) and kept it in the environment of the running API, because two
features create tables at runtime: activating a kon from the panel (its
migrations) and the Vault. A superuser can do anything, including
`COPY ... FROM PROGRAM` (commands on the database server).

Now (`docker/start-with-check.sh`):

1. The startup script still uses the admin URL for what needs it: create the
   database, pgvector, run migrations (core and enabled kons), create the
   application role, verify RLS.
2. Right before `exec`-ing the API it **unsets `DATABASE_ADMIN_URL`**. The API
   process (PID 1 of the container) never has it: not in `process.env`, not in
   `/proc/1/environ`.
3. `docker exec <api container> ...` is not affected: it takes the container's
   configured environment, so an operator can still run
   `bun run scripts/migrate.ts --kon <id>` with the admin account.

For runtime DDL there is an optional, **limited** role:

```
DATABASE_DDL_URL=postgresql://kitsuden_ddl:<password>@db:5432/kitsuden
```

If set, the startup script creates it: `NOSUPERUSER NOBYPASSRLS NOCREATEDB
NOCREATEROLE`, `CREATE` on schema `public`, DML and `REFERENCES` on existing
tables, and default privileges so the app role can use what it creates. The
API uses it (before any admin URL) for kon migrations and Vault DDL
(`apps/api/src/lib/conexion-ddl.ts`).

| Setup | Hot kon activation and Vault | If the API is compromised |
| --- | --- | --- |
| Default (no `DATABASE_DDL_URL`) | Kons whose migrations already ran at boot work; a new kon's migrations fail with a clear message: run `migrate.ts --kon <id>` via `docker exec`, or restart. Vault collection DDL fails the same way. | App role only: what RLS allows. |
| `DATABASE_DDL_URL` | Works for migrations that only create new objects (the usual case). A migration that alters a core table or creates an extension fails with a clear message (same fix). | App role + owner of the tables it created (kon tables created at runtime, Vault collections): it could change those, not core tables, not other roles, no server commands. |
| `KITSUDEN_API_KEEP_ADMIN_URL=true` | Everything, as before. | Superuser: the whole database and the database server. |

`DATABASE_DDL_URL` cannot be set from the panel's secrets manager (it is a
reserved key, like the other database URLs).

## Other places that evaluate user input

None of these run user code; they were checked for this page:

- **Calculated fields** (`packages/core/datasets/expresion-segura.ts`): a
  tokenizer and interpreter with a whitelist (numbers, strings, `{field}`,
  arithmetic, comparisons, `min/max/round/...`). No identifiers, property
  access or brackets: nothing to reach. Size, token and depth limits.
- **Formulas** (`kon-formulas`): its own whitelist parser, no `eval`.
- **Accounting templates** (`kon-conta`): a `Decimal` evaluator for `+ - * /`
  and parentheses, no `eval` or `new Function`.
- **Webhooks**: `webhook_in` validates HMAC/bearer and stores the request;
  `webhook_out` posts a fixed payload. No transformation code.
- **Agent actions**: `{{a.b.c}}` templates that only read own properties
  (`__proto__`, `constructor`, `prototype` are refused).
- **The admin panel's formula preview** (`packages/admin/.../calculated-fields`)
  uses `new Function` in the **browser** after stripping everything but
  digits and operators; low risk, but it should move to the same interpreter
  as the server.
- `packages/engine/src/actions.ts` registers `event:` handlers on the Postgres queue (server code).

## Migrating code written for the old sandbox

Production had **0** functions and **0** actions when this changed
(2026-10-26), so nothing needed migrating there. For other installations:

| Old code | Now |
| --- | --- |
| `process.env.X` | `env.X` (declare it in `envVars`). |
| `require(...)`, `import(...)` | Not available. Inline the logic, or move it to a kon. |
| `fetch("https://api.example.com/...")` | Same, after adding `api.example.com` to `config.fetchAllow`. |
| `Bun.*`, `fs`, `child_process`, sockets | Not available, by design. |
| Talking to the database (a `pg` client) | `kitsuden.api.*` with declared `scopes`. |
| `setTimeout` waits | Not available; the run is one async function. |

## Tests

- `apps/api/src/tests-unit/sandbox-hostil.test.ts`: hostile code, with effects
  checked outside the sandbox (a marker file that must not appear, a local
  server that must receive nothing). Reads of `process.env`, `child_process`,
  `fs`, `net`, `pg`, `bun` imports, a file with a secret, prototype escapes,
  database access with credentials in hand, exfiltration to a non-listed host,
  redirects, an infinite loop, unbounded memory, too many host calls, a huge
  result. Against the previous sandbox: 3 pass, 22 fail.
- `apps/api/src/tests/sandbox-identidad.test.ts` (real app and Postgres):
  no scopes means no API; declared dataset scope reads that dataset and nothing
  else (no writes, no admin routes, no agent created); headers do not change
  identity; an agent running an action gains no scopes and keeps its denies;
  cron uses the creator's role as of now.
