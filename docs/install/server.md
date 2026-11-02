# Server install (Docker)

The recommended way: API, admin panel, database, Valkey and backups in
containers, with a single `docker compose`. Two variants that share almost
everything:

- **No domain / internal network** (sections 1 to 6): everything listens on
  `127.0.0.1`; you reach it through an SSH tunnel or from the machine itself.
  It is also how to try an installation before opening it.
- **Public, with a domain and TLS** (sections 7 to 12): the same plus the
  `docker-compose.tls.yml` overlay (Caddy on 80/443 and the public website in a
  container), on a VPS.

Everything marked **(tested 2026-10-15)** was run on a clean copy of the
folder, with a stack using other names (see
[the end](#a-second-installation-on-the-same-machine)) so as not to touch the
installation already on the machine. The public mode has **not** been tested
with a real domain.

```
                Internet ──► :80/:443  Caddy (kitsuden_proxy_prod)  TLS from Let's Encrypt
                               │
    ┌──────────────────────────┼───────────────────────────────────────┐
    │ SITE_DOMAIN              │ KITSUDEN_DOMAIN (panel.<domain>)       │
    │  everything ──► web :4321│  /media/* ──► API :3000               │
    │  (the site proxies       │  the rest ──► panel (nginx :80)       │
    │   /img and /media)       │               └─ /api/* ──► API :3000 │
    └──────────────────────────┴───────────────────────────────────────┘
       API (bun) ──► Postgres 16 + pgvector, Valkey     (no ports to the outside)
       backup    ──► daily pg_dump + weekly tar of the media
```

| Service           | Image                                      | Port on the host               |
| ----------------- | ------------------------------------------ | ------------------------------ |
| `kitsuden_api`    | `docker/Dockerfile.prod --target api`      | 127.0.0.1:3000                 |
| `kitsuden_admin`  | `docker/Dockerfile.prod --target admin`    | 127.0.0.1:3001                 |
| `kitsuden_db`     | `pgvector/pgvector:pg16`                   | 127.0.0.1:5432                 |
| `kitsuden_state`  | `valkey/valkey:7-alpine`                   | 127.0.0.1:6379                 |
| `kitsuden_backup` | the API image                              | none                           |
| `kitsuden_proxy`  | `caddy:2.10-alpine` (TLS overlay only)     | 80, 443 (the only public ones) |
| `kitsuden_web`    | `docker/Dockerfile.web` (TLS overlay only) | none (only Caddy reaches it)   |

## 1. Get the code

```bash
git clone https://github.com/Victor-Antinori-Broce/kitsuden.git /opt/kitsuden
cd /opt/kitsuden
```

The clone has everything needed to build the images (the root `.gitignore`
decides what is public). The folder can have any name: the compose project
name is set by `COMPOSE_PROJECT_NAME` in `.env`.

## 2. Configure `.env`

```bash
cp .env.production.example .env
chmod 600 .env
openssl rand -hex 32                   # one per secret
nano .env
```

The template has `<...>` placeholders; `scripts/deploy.sh` refuses to go on
while any is left. For an installation **without a domain** this is enough
(each variable is explained in [variables.md](variables.md)):

```dotenv
COMPOSE_PROJECT_NAME=kitsuden
POSTGRES_USER=kitsuden
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=kitsuden_prod
APP_DB_USER=kitsuden_app
APP_DB_PASSWORD=<openssl rand -hex 24>
BETTER_AUTH_SECRET=<openssl rand -hex 32>
KITSUDEN_SECRETS_KEY=<openssl rand -hex 32>
SITIO_API_CLAVE=<openssl rand -hex 32>
```

The domain and mail variables (`SITE_DOMAIN`, `ACME_EMAIL`, `MAIL_FROM`,
`RESEND_API_KEY`/`SMTP_*`) are only required by the TLS overlay; without it,
delete those lines or leave them empty.

Check without printing secrets **(tested 2026-10-15)**:

```bash
docker compose -f docker-compose.yml config -q && echo OK
```

A plain `docker compose config` prints the connection strings with the
password inside: do not run it in a shared terminal or paste it in a ticket.

## 3. Build the images

```bash
docker compose -f docker-compose.yml build kitsuden_api kitsuden_admin
```

**(tested 2026-10-15)**: 21 min in the test (the API builds every kon; the
panel, SvelteKit). It ends with `kitsuden/api:latest Built` and
`kitsuden/admin:latest Built`.

- Always use `-f docker-compose.yml`: without `-f`, compose merges
  `docker-compose.override.yml` if it exists (a local development file that
  starts SeaweedFS).
- Never `docker build -f docker/Dockerfile.prod` without `--target`: it has
  two final stages, and without `--target api` you get the panel's nginx
  tagged as the API. `docker compose build` already sets the right `target`.
- There are no published images of this project. Without `build`, `up -d`
  would try to **pull** `kitsuden/api:latest` from Docker Hub, a name that
  does not necessarily belong to this project. The TLS overlay prevents it
  with `pull_policy: build`; without it, always build first.

## 4. Start

```bash
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml ps
```

**(tested 2026-10-15)**: 2 min 20 s until `kitsuden_api … Healthy` and the
panel running. What the API does on its first start
(`docker/start-with-check.sh`) is in [first-run.md](first-run.md#1-what-the-first-start-does-by-itself).

Checks **(tested 2026-10-15)**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/live                    # 200
curl -s http://127.0.0.1:3000/api/system/init-check                                    # {"initialized":false}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/page-builder/block-types   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/                        # 200 (panel)
```

`/health` runs deep checks (database, cache, queue) and is slower; to know
whether the process is alive, use `/live` (at the root, without `/api`).

From another computer, through an SSH tunnel:

```bash
ssh -L 3001:127.0.0.1:3001 -L 3000:127.0.0.1:3000 user@server
# then in the browser: http://localhost:3001
```

### The API runs without root (uid 1000)

The API image (`docker/Dockerfile.prod`) runs as the `bun` user (uid/gid
1000). On a new installation there is nothing to do: the media volume starts
empty and inherits the owner of `/app/data` from the image.

**If you upgrade an installation that already existed** (an older image that
ran as root, media copied with `docker cp`, or restored), the volume belongs
to root and uploads from the panel fail with `EACCES`. Once, with the API
stopped:

```bash
docker compose -f docker-compose.yml stop kitsuden_api
docker volume ls | grep uploads          # e.g. kitsuden_kitsuden_uploads_prod
docker run --rm -v <volume>:/d alpine chown -R 1000:1000 /d
docker run --rm -v <volume>:/d alpine sh -c 'find /d ! -uid 1000 | wc -l'   # 0
docker compose -f docker-compose.yml up -d kitsuden_api
```

The volume name starts with the `COMPOSE_PROJECT_NAME`. The backup container
(`kitsuden_backup`) uses the same image but runs as root (`user: "0:0"` in
`docker-compose.yml`): it writes to a backup volume owned by root and reads
the media mounted read-only.

## 5. First run

Create the administrator, enable kons and check: [first-run.md](first-run.md).

## 6. The public website

On a public server the website runs in the `kitsuden_web` container of the
TLS overlay: the neutral starter (`packages/starters/kitsuden-starter-basic`)
built by `docker/Dockerfile.web` and served by Node on :4321, behind Caddy. To
build it or serve another website, see [starter.md](starter.md).

---

## 7. Preparing a VPS

To open it to the public with a domain and TLS **(not tested with a real
domain)**. A clean Ubuntu 24.04, with a non-root user with `sudo` and an SSH
key:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw unattended-upgrades

# Docker from its official repository (not Ubuntu's docker.io package)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # then log in again

# Firewall: SSH, HTTP, HTTPS.
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable

# With 4 GB of RAM or less: swap, or the builds may run out of memory
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Docker bypasses `ufw`** for published ports: what protects Postgres, Valkey
and the API is that they listen on `127.0.0.1` (`BIND_ADDRESS`), not the
firewall. Do not set `BIND_ADDRESS=0.0.0.0` on a server.

Rough resources: with the stack idle and a small database, about 1–1.5 GB of
RAM; what needs the most is **building** on the server itself (the API builds
every kon). 2 vCPU and 8 GB are comfortable; with 4 GB, add the swap above.

### DNS

At your domain provider, **A** records pointing to the server's IP for the
three names Caddy serves (`docker/Caddyfile`):

| Name                                            | What it is                                              |
| ----------------------------------------------- | ------------------------------------------------------- |
| `SITE_DOMAIN` (`example.com`)                   | the public website                                      |
| `www.SITE_DOMAIN`                               | redirects to the one above                              |
| `KITSUDEN_DOMAIN` (default `panel.example.com`) | the admin panel and the API the browser uses (`/api/*`) |

Caddy cannot get certificates until they resolve and ports 80 and 443 reach
the server.

**IPv6 (AAAA):** without IPv6 enabled in Docker, IPv6 connections come in
through `docker-proxy`, and Caddy sees the Docker gateway (172.x) as the
source of **every** IPv6 visitor: the rate limit would count them all as one.
The simple choice: **do not publish AAAA records** at first. Real IPv6 needs
it enabled in Docker (`/etc/docker/daemon.json`: `"ipv6": true, "ip6tables": true`)
and `enable_ipv6: true` on the `kitsuden_net_prod` network (not tested).

## 8. Configure the public mode

In addition to [section 2](#2-configure-env), in `.env`:

```dotenv
SITE_DOMAIN=example.com
KITSUDEN_DOMAIN=                       # empty = panel.example.com
ACME_EMAIL=ops@example.com             # Let's Encrypt notices
RESEND_API_KEY=<key>                   # or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_SECURE
MAIL_FROM=My site <noreply@example.com>
```

- **Mail is required.** The overlay sets `KITSUDEN_PUBLIC=true`, and in that
  mode the API **does not start** without a mail transport or with `MAIL_FROM`
  on `@localhost` (step `[0/6]`): password resets would be printed to the
  console. That is on purpose.
- **TLS** is handled by Caddy (Let's Encrypt), with the certificates in the
  `kitsuden_caddy_data` volume. Without that volume they would be requested
  again on every recreation, and Let's Encrypt limits how many it issues per
  week.
- Use **new** secrets on the server: do not reuse the ones from your
  development machine.

Check without printing secrets:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml config -q && echo OK
./scripts/deploy.sh --comprobar        # the same, plus the <...> placeholders and the .env permissions
```

## 9. First public start

```bash
./scripts/deploy.sh
```

The script builds (API, panel and website), starts with
`docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --remove-orphans`
and waits up to 5 minutes for everything to be healthy; it never prints
`.env` or `docker compose config`. By hand it is the same:

```bash
C="docker compose -f docker-compose.yml -f docker-compose.tls.yml"
$C build
$C up -d
$C ps                      # everything "healthy" in 2-3 min; the backup takes longer
$C logs -f kitsuden_api    # [0/6] must pass the public configuration check
```

Then create the first administrator at `https://panel.example.com`
([first-run.md](first-run.md#2-the-first-administrator)) and, in the panel,
set **Settings → Site URL** to `https://example.com`.

### Another website instead of the starter

`kitsuden_web` is the neutral starter. To serve a different website, add one
more overlay that redefines `kitsuden_web` (and, if needed, mounts another
`Caddyfile` in `kitsuden_proxy`), passed **after** the TLS one:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml -f docker-compose.mysite.yml up -d --build
```

`scripts/deploy.sh` adds it when you tell it with `KITSUDEN_OVERLAYS`
(comma-separated files), from the environment or as a line in `.env`:

```bash
KITSUDEN_OVERLAYS=docker-compose.mysite.yml ./scripts/deploy.sh
```

From `.env` the script reads **only** that line; nothing else is loaded into
its shell.

## 10. Check from the outside

```bash
curl -sI https://example.com/ | head -1                    # 200
curl -sI https://www.example.com/ | grep -i location       # → https://example.com/
curl -s  https://panel.example.com/api/version
curl -sI https://panel.example.com/ | head -1              # 200 (panel)
nc -zv <IP> 5432 3000 3001 6379                            # must FAIL: only 80/443 are open
```

## 11. Logs, time and memory

- The TLS overlay rotates the logs (`json-file`, 5 × 10 MB per container).
  `docker compose -f docker-compose.yml -f docker-compose.tls.yml logs --since 1h kitsuden_api`.
- API, database and backups work in UTC; the website uses `TZ` (default `UTC`).
- Memory limits in the overlay: database 2 GB, API 1.5 GB, website 512 MB,
  Valkey 384 MB, backups 512 MB, Caddy 256 MB, panel 128 MB. A container that
  dies with exit code 137 hit its limit.

## 12. Before opening

- [ ] `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` and the other secrets new and long.
- [ ] Real mail configured and tested (password reset).
- [ ] First administrator created; the panel's **Site URL** = the real domain.
- [ ] An off-machine backup decided and tested ([upgrade-and-backups.md](upgrade-and-backups.md)).
- [ ] The `nc -zv` from section 10: only 80/443 open.

## A second installation on the same machine

`docker-compose.yml` fixes `container_name` (`kitsuden_api_prod`…), the volume
names (`kitsuden_postgres_prod`…) and the network (`kitsuden_net_prod`). A
second stack with those names **would clash with the first or, worse, use its
volumes**. The images are also tagged `kitsuden/api:latest`: building a second
copy **overwrites the tag** of the existing installation.

To test (what was done for this guide), an overlay that renames everything
**(tested 2026-10-15)**:

```yaml
# compose.test.yml — own names, volumes, network, images and ports.
# The *_prod names the compose file uses as HOSTS are given as aliases INSIDE
# this isolated network (the API connects to kitsuden_db_prod, the panel to kitsuden_api_prod).
services:
  kitsuden_db:
    container_name: kprueba_db
    networks: { kitsuden_net_prod: { aliases: [kitsuden_db_prod] } }
  kitsuden_state:
    container_name: kprueba_state
    networks: { kitsuden_net_prod: { aliases: [kitsuden_state_prod] } }
  kitsuden_api:
    container_name: kprueba_api
    networks: { kitsuden_net_prod: { aliases: [kitsuden_api_prod] } }
  kitsuden_admin:
    container_name: kprueba_admin
  kitsuden_backup:
    container_name: kprueba_backup
volumes:
  kitsuden_uploads_prod: { name: kprueba_uploads }
  kitsuden_postgres_prod: { name: kprueba_postgres }
  kitsuden_seaweedfs_prod: { name: kprueba_seaweedfs }
  kitsuden_valkey_prod: { name: kprueba_valkey }
  kitsuden_backups_prod: { name: kprueba_backups }
networks:
  kitsuden_net_prod: { name: kprueba_net }
```

and in its `.env`, besides the secrets:

```dotenv
COMPOSE_PROJECT_NAME=kprueba
KITSUDEN_API_IMAGE=kprueba/api:prueba
KITSUDEN_ADMIN_IMAGE=kprueba/admin:prueba
KITSUDEN_WEB_IMAGE=kprueba/web:prueba
API_PORT=3390
ADMIN_PORT=3391
DB_PORT=5490
VALKEY_PORT=6390
```

```bash
docker compose -f docker-compose.yml -f compose.test.yml config | grep -E "container_name|name: k|image:"   # review BEFORE up
docker compose -f docker-compose.yml -f compose.test.yml up -d
# … and to remove it entirely, with its volumes:
docker compose -f docker-compose.yml -f compose.test.yml down -v
docker image rm kprueba/api:prueba kprueba/admin:prueba
```

(That `config | grep` only shows names and images, not secrets.) It does
**not** work as is with the TLS overlay: Caddy publishes 80/443, which only
one stack per machine can have.
