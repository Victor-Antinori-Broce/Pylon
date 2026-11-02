# Environment variables

Three different places, best not mixed up:

| File                                            | Read by                                                                                                  | For                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `.env` at the root                              | `docker compose` (interpolates `docker-compose*.yml`) and `scripts/deploy.sh` (only `KITSUDEN_OVERLAYS`) | a Docker server. Template: `.env.production.example`       |
| `apps/api/.env`                                 | the API when it runs **outside** Docker (`bun run dev`) and the scripts in `apps/api/scripts`            | development. Template: `apps/api/.env.example`             |
| `packages/starters/kitsuden-starter-basic/.env` | the website (Astro) at build time and at start                                                           | the public website. Template: the starter's `.env.example` |

With Docker, connection URLs (`DATABASE_URL`, `REDIS_URL`…) are **not**
written by hand: `docker-compose.yml` builds them from the variables below.
Generate each secret with `openssl rand -hex 32` and do not paste it into
loose scripts.

Legend: **required** = without it nothing starts (or compose refuses to
interpolate). **public** = only required by the public mode
(`docker-compose.tls.yml`, `KITSUDEN_PUBLIC=true`), which **aborts the start**
if it is missing or points to localhost (`apps/api/src/lib/config-publica.ts`).

## Docker server (root `.env`)

| Variable                                                                          |                                                | What and why                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`                                                            | recommended                                    | Prefix of the only volume without `name:` (media: `<project>_kitsuden_uploads_prod`). Set it: if it depends on the folder name, renaming the folder "loses" the media (they stay in the old volume).                                                                                                                              |
| `KITSUDEN_OVERLAYS`                                                               | optional                                       | Only for `scripts/deploy.sh`: your own compose overlays (another website, extra services), comma-separated, added **after** `docker-compose.tls.yml`. From `.env` the script reads only this line.                                                                                                                                |
| `POSTGRES_USER`                                                                   | optional (`kitsuden`)                          | Superuser. It **only** migrates, creates the app role and makes backups; the API does not serve traffic with it. The Postgres image creates it **only the first time**, on an empty volume: changing it later changes nothing in the database ([troubleshooting.md](troubleshooting.md#postgresql-answers-but-rejects-the-user)). |
| `POSTGRES_PASSWORD`                                                               | **required**                                   | Its password (compose aborts without it).                                                                                                                                                                                                                                                                                         |
| `DDL_DB_PASSWORD` | recommended | Password of the limited role that creates tables at runtime (enabling a kon from the panel, the Vault). Without it, enabling a kon fails. |
| `KITSUDEN_INSTANCE` | optional | Prefix of containers, volumes and network, default `kitsuden`. For a second install on one machine; `install.sh` picks it. Do not change it on an install with data: it would point at empty volumes. |
| `POSTGRES_DB`                                                                     | optional (`kitsuden_prod`)                     | Database name.                                                                                                                                                                                                                                                                                                                    |
| `APP_DB_USER`                                                                     | optional (`kitsuden_app`)                      | **Non-superuser** role the API runs as. Postgres ignores RLS policies for a superuser: with a single account, isolation between users would be decorative. Created by the startup script, with its `GRANT`s.                                                                                                                      |
| `APP_DB_PASSWORD`                                                                 | **required**                                   | Its password; the startup script (re)applies it with `ALTER ROLE` on every start.                                                                                                                                                                                                                                                 |
| `BETTER_AUTH_SECRET`                                                              | **required**, ≥ 32 characters                  | Signs the sessions. The API does not start with a shorter one. Changing it signs everybody out.                                                                                                                                                                                                                                   |
| `KITSUDEN_SECRETS_KEY`                                                            | recommended                                    | AES-256-GCM key for secrets stored in the database (secrets manager). Without it, it is derived from `BETTER_AUTH_SECRET` (acceptable in development), and rotating one would break the other. **Losing it = losing those secrets**: keep it with the backups.                                                                    |
| `SITIO_API_CLAVE`                                                                 | recommended; **required** with the TLS overlay | Shared by the API and the website (the website calls it `KITSUDEN_SITE_KEY`). With it the rate limit is counted per **visitor**; without it, the whole website is a single client and once over the quota it serves errors to everybody.                                                                                          |
| `SITE_DOMAIN`                                                                     | **public**                                     | The website (`example.com`). `SITE_URL` (written into the website at build time), `APP_URL` and `ALLOWED_ORIGINS` come from it.                                                                                                                                                                                                   |
| `KITSUDEN_DOMAIN`                                                                 | optional (`panel.<SITE_DOMAIN>`)               | The panel and the API the browser uses (the panel's nginx forwards `/api/*`). `BETTER_AUTH_URL` and `ADMIN_URL` come from it.                                                                                                                                                                                                     |
| `ACME_EMAIL`                                                                      | **public**                                     | Let's Encrypt notices.                                                                                                                                                                                                                                                                                                            |
| `RESEND_API_KEY` or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE` | **public** (one of them)                       | Without a transport the Mailer falls back to the `log` driver (password reset mails go to the console). In public mode that **aborts the start**, on purpose.                                                                                                                                                                     |
| `MAIL_FROM`                                                                       | **public**                                     | Sender on the real domain (`Name <noreply@example.com>`); providers reject `@localhost`.                                                                                                                                                                                                                                          |
| `MAIL_DRIVER`                                                                     | optional                                       | Forces a driver (`resend`, `smtp`, `log`). Default: Resend if there is a key, SMTP if there is a host, `log` otherwise.                                                                                                                                                                                                           |
| `DEFAULT_STORAGE_PROVIDER`                                                        | optional (`local`)                             | `local` = the API's volume (`/app/data`, served at `/media`). `s3` (or `minio`) = S3 storage.                                                                                                                                                                                                                                     |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`                                                  | only with `s3`                                 | Not needed with local storage (`apps/api/src/lib/config.ts` only requires them with `s3`/`minio`). An image built before that change asked for them (`S3_ACCESS_KEY: Required`).                                                                                                                                                  |
| `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_URL`                                         | with `s3`                                      | Bucket, region and public URL the files are served from. The endpoint is fixed by `docker-compose.yml` (internal SeaweedFS): for an external S3, change it in an overlay.                                                                                                                                                         |
| `BACKUP_INTERVAL_HOURS`                                                           | optional (`24`)                                | How often `pg_dump` runs.                                                                                                                                                                                                                                                                                                         |
| `BACKUP_KEEP`                                                                     | optional (`14`)                                | Dumps kept.                                                                                                                                                                                                                                                                                                                       |
| `BACKUP_MEDIA_DIAS` / `BACKUP_MEDIA_KEEP`                                         | optional (`7` / `2`)                           | Full copy (tar) of the media volume every N days; how many are kept.                                                                                                                                                                                                                                                              |
| `SITE_NAME`, `SITE_LOCALE`                                                        | optional (`Kitsuden`, `en`)                    | TLS overlay: name and interface language of the starter. **Written at build time** of `kitsuden_web`.                                                                                                                                                                                                                             |
| `TZ`                                                                              | optional (`UTC`)                               | TLS overlay: the website's time zone. API, database and backups always use UTC.                                                                                                                                                                                                                                                   |
| `KITSUDEN_SEGMENTOS_RESERVADOS`                                                   | optional (empty)                               | First-level paths of **your** website that a game (`kon-games`) cannot take as its slug, comma-separated (`tournaments,shop`). Added to the common ones in `packages/shared/src/sitio-publico.ts` (`blog`, `api`, `media`, `img`, `legal`…).                                                                                      |
| `KITSUDEN_VAULT_ENABLED`                                                          | optional (`false`)                             | Enables Vault (collections backed by real `CREATE TABLE`s). Off by default on purpose.                                                                                                                                                                                                                                            |
| `LOG_LEVEL`                                                                       | optional (`info`)                              | `debug`/`info`/`warn`/`error`.                                                                                                                                                                                                                                                                                                    |
| `ENABLE_SWAGGER`                                                                  | optional                                       | Interactive API docs at `/api/docs`. On in the base compose file; the TLS overlay turns it off unless you ask for it.                                                                                                                                                                                                             |
| `BIND_ADDRESS`                                                                    | optional (`127.0.0.1`)                         | Interface where API, panel, Postgres and Valkey are published. `0.0.0.0` exposes them **without TLS** (and Docker bypasses `ufw`).                                                                                                                                                                                                |
| `API_PORT`, `ADMIN_PORT`, `DB_PORT`, `VALKEY_PORT`                                | optional (`3000`, `3001`, `5432`, `6379`)      | Host ports.                                                                                                                                                                                                                                                                                                                       |
| `KITSUDEN_API_IMAGE`, `KITSUDEN_ADMIN_IMAGE`, `KITSUDEN_WEB_IMAGE`                | optional                                       | Image names (default `kitsuden/*:latest`). Useful for a second installation ([server.md](server.md#a-second-installation-on-the-same-machine)).                                                                                                                                                                                   |
| OAuth (GitHub/Google/Discord)                                                     | —                                              | `docker-compose.yml` does **not** pass these variables to the API container today: to use them, add them to its `environment:` with an overlay.                                                                                                                                                                                   |

## What `docker-compose.yml` sets in the API (not written by hand)

Useful to read a log, or for the install without Docker, where you do write
them:

| Variable                                   | Value in Docker                                                                      | What it is                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                     | `3000`                                                                               | Port inside the container (outside Docker, without `PORT`, the API uses 3001).                                                                                                           |
| `DATABASE_URL`                             | `postgresql://APP_DB_USER:…@kitsuden_db_prod:5432/POSTGRES_DB`                       | What the API **serves** with (non-superuser role).                                                                                                                                       |
| `DATABASE_ADMIN_URL`                       | the superuser's                                                                      | What the startup script migrates with, creates the roles with and verifies RLS with. Since 2026-10-26 the script **unsets it before starting the API** (the running API never holds the superuser; `KITSUDEN_API_KEEP_ADMIN_URL=true` restores the old behaviour). See [the code sandbox](../agents/sandbox.md#database-credentials-the-api-no-longer-holds-the-superuser). |
| `DATABASE_DDL_URL`                         | unset                                                                                | Optional limited role (no superuser, no BYPASSRLS, only CREATE on `public`) that the startup script creates and the API uses to create tables at runtime: enabling a kon from the panel, Vault collections. Without it those fail with a message telling you to run `migrate.ts --kon <id>` or restart. |
| `REDIS_URL` / `VALKEY_URL`                 | `redis://kitsuden_state_prod:6379`                                                   | Valkey, **optional** since 2026-10-28: only needed with several API replicas (shared cache, rate-limit counters and Pub/Sub). Unset = single instance: process memory + Postgres LISTEN/NOTIFY. |
| `QUEUE_*`, `DATABASE_LISTEN_URL`           | unset                                                                                | Background jobs live in Postgres; see [the queue](queue.md).                                                                                                                             |
| `BETTER_AUTH_URL`                          | `http://localhost:3000`; with TLS `https://KITSUDEN_DOMAIN`                          | Public URL of the API for better-auth (OAuth callbacks, cookie origin).                                                                                                                  |
| `ADMIN_URL`, `APP_URL`, `SITE_URL`         | localhost; with TLS, the domains                                                     | Panel, "main website" and site. In public mode they cannot be localhost.                                                                                                                 |
| `ALLOWED_ORIGINS`                          | localhost:5173, :3000, :3001; with TLS `https://SITE_DOMAIN,https://KITSUDEN_DOMAIN` | CORS with credentials, and the origin check on writes. **Every public website the browser uses with a session needs its origin here**: if it is missing, pages load but sign-in fails.   |
| `KITSUDEN_PUBLIC`                          | `false`; with TLS `true`                                                             | Turns on the public-mode startup checks.                                                                                                                                                 |
| `STORAGE_LOCAL_PATH` / `STORAGE_LOCAL_URL` | `/app/data` / `/media`                                                               | Where files are stored and with which **relative** URL they are written to the database.                                                                                                 |
| `RATE_LIMIT_ENABLED`, `ENABLE_MCP`         | `true`                                                                               | Rate limit and the MCP server (`/api/mcp`).                                                                                                                                              |

## API without Docker (`apps/api/.env`)

The same variables, written by hand. Minimum to start **(tested 2026-10-15)**:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://kitsuden:<pass>@127.0.0.1:5432/kitsuden_dev
# REDIS_URL=redis://127.0.0.1:6379   # optional: several replicas only
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
ADMIN_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:4321,http://localhost:5173
DEFAULT_STORAGE_PROVIDER=local
```

This way the API uses the superuser for everything and the migrator warns
that the policies are decorative: fine for development, **never** in
production. To reproduce production, create the app role and set
`DATABASE_ADMIN_URL` (superuser) and `DATABASE_URL` (app role).

Optional ones you may want: `HOST` (listen address, default `0.0.0.0`;
`127.0.0.1` for this machine only, `::` for IPv6 too), `DB_POOL_MAX` (20) /
`DB_POOL_CONNECTION_TIMEOUT_MS` (5000) / `DB_POOL_IDLE_TIMEOUT_MS` (with the
pool exhausted the API answers `503` with `Retry-After`),
`KITSUDEN_SECRETS_KEY`, `KITSUDEN_SEGMENTOS_RESERVADOS`, `LOG_LEVEL`,
`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`DEEPSEEK_API_KEY`/`OLLAMA_BASE_URL`
(AI features, each optional), `ENABLE_SWAGGER`, `HEADLESS`,
`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`.

Idempotency of writes (`Idempotency-Key`, see
[errors-and-retries.md](errors-and-retries.md#idempotency-key)):
`IDEMPOTENCY_TTL_SECONDS` (86400), `IDEMPOTENCY_LOCK_SECONDS` (60),
`IDEMPOTENCY_MAX_RESPONSE_BYTES` (1048576), `IDEMPOTENCY_FAIL_MODE`
(`closed`; `open` runs the write unprotected when neither Valkey nor the
fallback table is available). `docker-compose.yml` does not pass these to the
API container: the defaults apply unless you add them with an overlay.

## Public website (starter)

Full table in the starter's README
(`packages/starters/kitsuden-starter-basic/README.md`) and in
[starter.md](starter.md#variables). In short: `SITE_URL`, `SITE_NAME` and
`SITE_LOCALE` are **written at build time**; `KITSUDEN_API_URL`,
`KITSUDEN_SITE_KEY`, `KITSUDEN_TRUST_PROXY`, `PORT`, `HOST` and
`INTI_KITSUDEN_TOKEN` are read **at start**.

## Inti

`INTI=true` (build with the editor), `INTI_KITSUDEN_TOKEN` (agent key, only at
start, never at build time), `INTI_ADAPTER=kitsuden` and
`INTI_KITSUDEN_ENDPOINT` (filled in by the middleware if missing). See
[inti.md](inti.md).
