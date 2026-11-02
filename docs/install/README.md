# Installing Kitsuden

How to install Kitsuden, a backend built for AI agents (efficient and secure
by default), on a new machine; and, if you want, a public website built from
the starter and the optional Inti layer. Written for someone who is **not** the
project's owner. Spanish version: [`../instalacion/`](../instalacion/README.md).

**Just want it running on your machine?** `./install.sh` (Windows:
`powershell -ExecutionPolicy Bypass -File install.ps1`) does everything; it only
needs Docker. The guides below are for doing it by hand, on a server, or for
development.

Each command carries its status:

- **(tested 2026-10-15)**: it was run exactly like this on that day, on a clean
  copy with its own Docker stack, and the result is written down.
- **(not tested)**: what it does and why is explained, but it could not be run
  in the test (real domain, TLS, mail…).

A command that changed after that date carries no test mark.

## Contents

|                                                         |                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| [What gets installed](#what-gets-installed)             | the pieces and the requirements                             |
| [Local install](local.md)                               | for development, on your computer                           |
| [Server install (Docker)](server.md)                    | the recommended way; includes a VPS, domain and TLS         |
| [Environment variables](variables.md)                   | one by one: required, optional, and why                     |
| [First run](first-run.md)                               | migrations, first administrator, enabling kons              |
| [Installing kons](../kons/installing.md)                | `kitsuden kon add`, `KITSUDEN_KONS`, kons in the Docker image |
| [A website with the starter](starter.md)                | `kitsuden-starter-basic`: development, build, Docker        |
| [Connecting Inti](inti.md)                              | visual editing: adapter, agent key, editor session, cookie  |
| [Agent permissions, keys and quotas](../agents/permissions.md) | broad + fine-grained scopes, deny, key rotation, quotas |
| [Human approval](../agents/approvals.md) | proposals: what an agent may not do without a human, the inbox, the audit |
| [Upgrades and backups](upgrade-and-backups.md)          | new code, migrations, backups, restore, rolling back        |
| [Versions and compatibility](versions.md)               | semver, API contracts, Kitsuden ↔ Inti matrix               |
| [Troubleshooting](troubleshooting.md)                   | symptoms, causes and fixes                                  |
| [Errors and safe retries](errors-and-retries.md)        | `problem+json` error codes, `Idempotency-Key`               |
| [The request transaction in a kon](kon-transactions.md) | parallel queries, swallowed SQL errors, slow external calls |
| [Background jobs: the Postgres queue](queue.md)         | outbox, retries, dead letter, Valkey optional, measured throughput |
| [PgBouncer (transaction mode)](pgbouncer.md)             | what goes through it, what must go direct, the probe script |
| [Runtimes](runtimes.md)                                  | Bun, Node 22+, why not a single binary, why not edge        |
| [Threat model](../threat-model.md)                       | what Kitsuden defends against, and what it does not         |

## What gets installed

```
  browser ──► public website (Astro, starter) ──► Kitsuden API (Bun + Hono) ──► PostgreSQL 16 + pgvector
          └─► admin panel (SvelteKit + nginx) ─┘        │                     └─► Valkey (cache, queues)
                                                        └─► /app/data (media, or S3)
  editor  ──► public website with INTI=true ──(agent key)──► API
```

| Piece               | Where it lives                                                                   | Required                     |
| ------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| API                 | `apps/api`                                                                       | yes                          |
| Database            | Postgres **16** with the **pgvector** extension (image `pgvector/pgvector:pg16`) | yes                          |
| Valkey (or Redis 7) | cache, queues, rate limits                                                       | yes                          |
| Admin panel         | `packages/admin` (static SvelteKit build served by nginx)                        | yes, to administer it        |
| Kons (plugins)      | core: `packages/core/*`; the rest installed from [kitsuden-kons](https://github.com/Victor-Antinori-Broce/kitsuden-kons) with `kitsuden kon add` ([kons](../kons/installing.md)) | the ones you install and enable |
| Public website      | `packages/starters/kitsuden-starter-basic` (Astro 7, server-rendered)            | no (Kitsuden is headless)    |
| Inti                | a separate repository (`@intijs/*`), installed from git                          | no: only for on-page editing |
| Backups             | the `kitsuden_backup` service (same image as the API)                            | yes in production            |

The monorepo packages (`@kitsuden/*`) are **not** published on npm: they are
used from this repository, as a pnpm workspace.

### Requirements

**Server with Docker (recommended):**

- Linux x86_64 with Docker Engine 24+ and the `docker compose` v2 plugin.
  Tested with Docker Desktop (Windows, Linux engine) and compose v2; for a VPS,
  Ubuntu 24.04 ([server.md](server.md#7-preparing-a-vps)).
- BuildKit (on by default in a modern Docker): the Dockerfiles use
  `COPY --parents` and cache mounts.
- **Memory to build**: the API image took **21 min** to build in the
  2026-10-15 test (with other load on the machine). 4 GB of RAM is tight: add
  swap ([server.md](server.md#7-preparing-a-vps)).
- Disk: API image ≈ 1.4 GB, panel ≈ 110 MB, plus the build cache (several GB)
  and your media.

**Local development, in addition:**

- [Bun](https://bun.sh) 1.3+ (the API runs on Bun; tested 1.3.14). Install it
  **before** `pnpm install`: the `prepare` script of `@kitsuden/shared` builds
  with Bun.
- Node.js **22.12** or newer (the starter needs it; tested 22.19) and
  **pnpm 9** (`npm i -g pnpm@9.15.4`, the `packageManager` version and the one
  the images use; `pnpm-lock.yaml` is written by it).
- Postgres 16 + pgvector and Valkey 7 (easiest: the containers in
  [local.md](local.md)).
- On **Windows**, a short path for the repository (for example
  `C:\src\kitsuden`): see [troubleshooting.md](troubleshooting.md#installing).

**For Inti:** `@intijs/core` and `@intijs/adapter-kitsuden` (from git, see
[inti.md](inti.md)) and a Kitsuden with `kon-blocks` (pages) and, to edit game
pages, `kon-games`.

## Status of the clean-install blockers

When this guide was first written (2026-10-15) six things prevented installing
from a `git clone`. Status on 2026-10-19:

1. **Files missing from git — resolved.** The public set is defined by the
   root `.gitignore` (an allowlist): a clean clone contains the core (since
   2026-10-24 without kons: they are installed from kitsuden-kons, see
   [../kons/installing.md](../kons/installing.md)), the neutral starter, the startup and migration scripts, the compose files and
   the `Caddyfile`.
2. **The starter linked Inti through a local path — resolved.** The neutral
   starter (`kitsuden-starter-basic`) has no Inti dependency; Inti is installed
   from git when you want it ([inti.md](inti.md)).
3. **The first administrator could not be created — fixed.**
   `POST /api/system/setup` is exempt from the early admin gate
   (`apps/api/src/middleware/auth-guard.ts`); the panel opens the sign-up
   screen while there are no users ([first-run.md](first-run.md#2-the-first-administrator)).
4. **Agent keys created from the panel did not authenticate — fixed.** They
   are now stored with their `key_id`, and the parser is no longer confused by
   a `_` inside the secret ([inti.md](inti.md#2-the-agent-key)).
5. **Fixed names in the compose file — still true.** `container_name`, volumes
   with `name:` and the `kitsuden_net_prod` network are fixed: only **one**
   installation fits on a machine. A second one (for testing) needs an overlay
   that renames them ([server.md](server.md#a-second-installation-on-the-same-machine)).
6. **`docker compose up` without `-f` merges `docker-compose.override.yml` —
   still true** wherever that file exists (it is a local development file, not
   in a clean clone; it starts SeaweedFS). On a server always use
   `-f docker-compose.yml` (plus the TLS overlay).
