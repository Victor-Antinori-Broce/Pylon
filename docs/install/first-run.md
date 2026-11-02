# First run

What the API does by itself the first time, how to create the first
administrator and how to enable kons. Tested on **2026-10-15** on a new Docker
installation (empty volumes) and on a local one.

## 1. What the first start does by itself

In Docker, the API container runs `docker/start-with-check.sh` before it
listens. In the log (`docker compose -f docker-compose.yml logs kitsuden_api`)
**(tested 2026-10-15)**:

| Step            | What it does                                                                                                                         | If it fails                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `[0/6]`         | With `KITSUDEN_PUBLIC=true`, checks public URLs, mail and the secret's length                                                        | aborts (on purpose)                                                                                        |
| `[1/6]`         | Waits for Postgres and tries to **authenticate** against the `postgres` maintenance database                                         | tells "the user is rejected" (and explains the changed-user case) apart from "the database does not exist" |
| `[2/6]` `[3/6]` | Creates the database and the `vector` extension if missing                                                                           | if `CREATE DATABASE` fails, it stops with that error instead of going on                                   |
| `[4/6]`         | Creates the app role if missing, because migrations grant it permissions. `scripts/migrate.ts` with the superuser: the full migration chain (core + active kons) and RLS policies; then `verificar-esquema.ts` | **stops the start**: a half-built schema does not start                                                    |
|                 | Creates/updates the app role (`APP_DB_USER`) with its `GRANT`s and `ALTER DEFAULT PRIVILEGES`                                        | —                                                                                                          |
| `[4.5/6]`       | `verify-rls.ts`: with a non-existent user, the isolated tables must return 0 rows                                                    | **stops the start**                                                                                        |
| `[5/6]`         | Registers the kons found in `packages/kons` (in the test: "Found 27 kons (6 active)")                                                | warns and goes on                                                                                          |
| `[6/6]`         | Starts the API                                                                                                                       | —                                                                                                          |

The public image carries the core only (media, datasets and pages among it).
Everything else is a kon you add first: see
[Installing kons](../kons/installing.md). Turning on a kon that is not
installed answers `409` and says how to install it.

## Migrations

- In Docker there is nothing to do: every start applies the pending ones.
- Outside Docker: `cd apps/api && bun run scripts/migrate.ts` (or `pnpm db:migrate`).
- The history is in the `kitsuden_migrations` table (name, checksum,
  duration). An applied migration is **never edited**: the migrator refuses if
  its checksum changes.
- **A database that already existed without that history** (set up by hand or
  with another tool): first run `bun run scripts/migrate.ts --baseline`, which
  marks what is present as applied without running it. Without it, it would
  try to apply everything again.
- **Never** `--todos-los-kons` on a server (it creates the tables of every
  kon; it is a CI check) or `pnpm db:push`.

## 2. The first administrator

With **zero** users, the panel (`http://127.0.0.1:3001`, or
`https://panel.your-domain`) opens the sign-up screen for the first
administrator, which calls `POST /api/system/setup`. That route only works
with zero users (afterwards it answers `403 System already initialized`) and
creates the account as `admin` with the email already verified (a new
installation cannot send mail yet).

```bash
curl -s http://127.0.0.1:3000/api/system/init-check     # {"initialized":false}
```

Without the panel, through the API:

```bash
curl -s -X POST http://127.0.0.1:3000/api/system/setup \
  -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"name":"Your name","email":"you@example.com","password":"<a long password>"}'
# → {"success":true,"user":{…}}
```

Use one of the API's `ALLOWED_ORIGINS` as `Origin`: better-auth checks it on
its routes (`/api/auth/*`), and the API checks it on every write made with the
session cookie. Check:

```bash
curl -s -c cookies.txt -X POST http://127.0.0.1:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"email":"you@example.com","password":"…"}' -o /dev/null -w "%{http_code}\n"    # 200
```

In the 2026-10-15 version that route answered `401 Session required` and a
SQL workaround was needed; not any more: the route is exempt from the early
admin gate (`RUTAS_SOLO_ADMIN_TEMPRANAS` in
`apps/api/src/middleware/auth-guard.ts`).

Do this **before** opening the installation to the public: while there is no
administrator, sign-up belongs to whoever arrives first.

## 3. Enabling kons

From the panel: the **Kons** section, the kon's toggle. Through the API, with
an administrator session **(tested 2026-10-15)**:

```bash
curl -s -b cookies.txt -H 'origin: http://localhost:3001' http://127.0.0.1:3000/api/modules       # list and state
curl -s -b cookies.txt -H 'origin: http://localhost:3001' -H 'content-type: application/json' \
  -X PATCH http://127.0.0.1:3000/api/modules/kon-games -d '{"enabled":true}'
# → {"key":"kon-games",…,"enabled":true,…,"requiresRestart":false,"mountedNow":true}
```

- The **tables** are created at that moment with `DATABASE_ADMIN_URL` (Docker
  sets it). Without it, the panel says which command to run
  (`bun run scripts/migrate.ts`) instead of leaving the kon half installed.
- The **routes** are mounted without a restart (`mountedNow: true`):
  `GET /api/games` went from 404 to 200 in the test.
- In the 2026-10-15 test, writing with an **agent key** (Inti) to a kon that
  had just been enabled at runtime returned `401 Unauthorized - Authentication
required` until the API was restarted (`docker restart <API container>`).
  It has not been tested again: if it happens to you, restart.
- The `modules` table is the truth about what is enabled;
  `apps/api/kitsuden.config.ts` only **seeds** the missing ones the first time.

The neutral starter only needs the core (pages and media) and `kon-blog`,
enabled by default. A website that calls routes of disabled kons still loads,
with gaps.

## 4. Site settings

In the panel, **Settings**: site name and **Site URL** (the public URL of the
website; it wins over environment variables for whatever the API writes with
an absolute address).

## 5. Final check

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/live                 # 200
curl -s http://127.0.0.1:3000/api/system/init-check                                 # {"initialized":true}
curl -s http://127.0.0.1:3000/api/version                                           # version and contracts
docker compose -f docker-compose.yml ps                                              # everything healthy
```

`/api/version` only announces the contracts whose kon is enabled
([versions.md](versions.md)).
