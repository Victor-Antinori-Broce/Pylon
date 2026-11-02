# Kitsuden with agent IDEs (works with Orca)

Orca (an MIT-licensed agent IDE) runs coding agents such as Claude Code, Codex
and OpenCode side by side, each in its own git worktree. This page explains how
to give those agents what they need to use Kitsuden well:

1. [A skill](#1-install-the-kitsuden-skill) that tells an agent when to use
   Kitsuden and makes it load the API's live guide.
2. [The MCP server over stdio](#2-connect-the-mcp-server), one process per agent.
3. [One key per agent](#3-one-key-per-agent), with fine scopes and human approval.
4. [One database per worktree](#4-one-database-per-worktree), so parallel
   agents never delete each other's data.
5. [Automations](#5-automations-that-call-kitsuden) that call Kitsuden on a schedule.
6. [A recipe for per-workspace environments](#6-kitsuden-in-a-per-workspace-environment).

Nothing here depends on Orca's code. `orca.yaml`, `.worktreeinclude` and the
skill format are plain files that Orca reads; other tools can read them too.

## 1. Install the Kitsuden skill

The skill is `skills/kitsuden/SKILL.md`: a short stub, not a manual. It tells the
agent when to engage Kitsuden and to load the guide that the running API
generates from its own routes (`GET <api>/llms.txt`). The guide therefore never
falls behind the API, while the stub barely changes.

```bash
npx skills add <kitsuden-repo> --skill kitsuden            # from the published repository
npx skills add ./path/to/kitsuden --skill kitsuden         # from a local checkout
```

Add `--global` to install it for every project instead of the current one. To
check what is installed: `npx skills list`.

The stub tells the agent to:

- find the API URL in `KITSUDEN_API_URL`, else in `.kitsuden/worktree.json`
  (written by the worktree setup), else to ask. It never assumes
  `localhost:3000`, which on some machines is a production API;
- read `GET <api>/llms.txt` (or the MCP tool `kitsuden_guide`) before the first write;
- prefer JSON, read `problem+json` errors, and send `Idempotency-Key` on retried writes;
- never invent routes, flags or scopes: if neither the guide, the OpenAPI
  document nor `--help` lists something, it does not exist;
- stop at a `202 KITSUDEN_E_APPROVAL_REQUIRED` and report the proposal.

## 2. Connect the MCP server

`kitsuden mcp --stdio` runs the MCP server (`packages/mcp-server`) over
stdin/stdout. The agent's MCP client starts it, so every agent has its own
process and its own token. Copy [`kitsuden.mcp.json`](kitsuden.mcp.json) to
`.mcp.json` at the root of the project:

```json
{
  "mcpServers": {
    "kitsuden": {
      "type": "stdio",
      "command": "kitsuden",
      "args": ["mcp", "--stdio"],
      "env": {
        "KITSUDEN_API_URL": "${KITSUDEN_API_URL}",
        "KITSUDEN_API_TOKEN": "${KITSUDEN_API_TOKEN}"
      }
    }
  }
}
```

- The token is **never written in the file**: `${KITSUDEN_API_TOKEN}` is
  expanded from the environment of the agent that starts the server. In stdio
  mode the CLI's `--token` flag is ignored, so it cannot end up in the file.
- `KITSUDEN_API_URL` is required on purpose: with no URL, nothing falls back to
  a default port.
- Inside the Kitsuden monorepo without the CLI on the `PATH`, use
  `"command": "bun"` and
  `"args": ["run", "packages/mcp-server/src/standalone.ts", "--stdio"]`.
- Codex and OpenCode take the same command and arguments in their own MCP
  settings; pass the two variables through their environment settings, not as
  literal values.

The HTTP mode (`bun run packages/mcp-server/dist/standalone.js`, port 3002) is
still there. It serves every client with one token, so the audit log cannot tell
agents apart. Prefer stdio when several agents run at once.

## 3. One key per agent

Give **each** agent its own Kitsuden identity and key: one for the Claude Code
agent that writes content, another for the Codex agent that reviews it, and so
on. The audit log, the quotas and the approval inbox are per agent, so a shared
key makes all three useless.

All of these are admin calls (`$ADMIN_KEY` is an admin's key, `$API` the API):

```bash
# 1. Create the identity. The token is in the response ONCE: store it now.
curl -X POST "$API/api/v1/agents" -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"orca-claude-content","description":"Claude Code in Orca: blog drafts"}'

# 2. Grant only what it needs (union of grants; a "!" deny always wins)
curl -X PUT "$API/api/v1/agents/$AGENT/scopes" -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scopes":["mcp:connect","kon:blog:crear-entrada","datasets:juegos:read","!kon:blog:borrar-entrada"]}'

# 3. Untrusted agents: every write becomes a proposal a human approves
curl -X PUT "$API/api/approvals/agents/$AGENT/mode" -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"mode":"propose"}'

# 4. A ceiling, in case it loops
curl -X PUT "$API/api/v1/agents/$AGENT/quotas" -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"writesPerDay":200}'
```

- `propose` only takes effect while the global approvals switch is on
  (**Approvals → Settings**, or `PUT /api/approvals/settings {"enabled":true}`).
  With it off, no agent is asked for approval. Details: [approvals.md](approvals.md).
- Scope syntax, presets and the merged view of what an agent can do:
  [permissions.md](permissions.md). The same steps are in the admin panel under
  **Agents → (agent) → Permissions / Keys / Quotas / Approval**.
- Keys expire, rotate and revoke without touching the identity
  (`POST /api/v1/agents/:id/keys`, `…/rotate`, `…/revoke`).

**Where the token lives.** Set `KITSUDEN_API_TOKEN` in the environment of the
terminal that starts that agent, from your secret manager or a file outside the
repository. Do not put it in a file inside the worktree, and do not list such a
file in `.worktreeinclude`: every new worktree would get a copy, and every agent
the same key.

## 4. One database per worktree

The repository root has an `orca.yaml`:

```yaml
scripts:
  setup: |
    pnpm install --frozen-lockfile
    node scripts/orca/worktree.mjs setup
  archive: |
    node scripts/orca/worktree.mjs archive
setupAgentStartupPolicy: wait-for-setup
```

**Why.** Agents in parallel worktrees used to share one database, and the test
suite does not only read: `clearTestData()` deletes every dataset. One agent's
test run emptied the data another agent's authorization matrix was checking.
Now each worktree has its own database, and the agent does not start until it
exists (`wait-for-setup`).

**What setup does** (`scripts/orca/worktree.mjs`):

| Step                      | Result                                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database                  | `kitsuden_test_wt_<workspace>_<hash>` on the **test** Postgres (`docker-compose.test.yml`, port 5434, credentials from `.env.test`). The hash comes from the worktree path, so two repositories with the same workspace name do not collide. The name contains `test` so the suite accepts it. |
| Ports                     | A block of ten from 13000 upwards, derived from the same hash and moved to the next block if busy: API, admin, MCP, site.                                                                                                                                                                      |
| `apps/api/.env`           | `DATABASE_URL` of that database, the ports, a random auth secret. Marked as generated.                                                                                                                                                                                                         |
| `.kitsuden/worktree.json` | Database, ports and `apiUrl` (no password). The skill reads `apiUrl` from it.                                                                                                                                                                                                                  |
| Migrations                | `bun run scripts/migrate.ts` against that database.                                                                                                                                                                                                                                            |

`archive` drops the database (`DROP DATABASE … WITH (FORCE)`) and removes the
two generated files. Orca runs it before removing a worktree when hooks are
enabled; from Orca's CLI that needs `--run-hooks`.

Run it by hand too: `node scripts/orca/worktree.mjs status | setup | archive`,
with `--dry-run` to see the plan and `--no-migrate` to skip migrations.
`prune` lists the databases whose worktree is gone (`--apply` drops them); see
[coding-agents.md](coding-agents.md) for Claude Code, Codex and Antigravity, which
remove worktrees without running `archive`.

**What it refuses**, each check on its own:

- any database whose name is not `kitsuden_test_wt_…`;
- port 5432, the production database's port on the machine that runs `kitsuden_db_prod`;
- a Postgres host that is not local;
- a server that hosts any database with `prod` in its name;
- an `apps/api/.env` it did not write (it could point at production; delete or move it first).

**What it does not copy.** `.worktreeinclude` lists the ignored files copied
into new worktrees. It deliberately leaves out `/.env` and `apps/api/.env`: on a
machine that also runs production they hold the production database URL and
secrets. Each worktree gets its own `apps/api/.env` from setup instead.
`.env.test` is tracked, so it needs no entry.

**Before the first worktree**, start the test server once: `pnpm test:db:up`.

**Windows.** Orca runs setup through a `.cmd` runner on native Windows. Every
line above is a plain command, and the script is Node, so it runs the same in
`cmd`, PowerShell and Bash.

**The starter site.** `packages/starters/kitsuden-starter-basic` has its own
`orca.yaml`, used once the site is its own repository (`kitsuden new`). The
site has no database: setup gives each worktree its own dev-server port and an
`.env`, and `node scripts/orca-worktree.mjs dev` starts Astro on that port. Its
`.worktreeinclude` copies `.env`, so keep development values there; a
production site key belongs in the deployment's environment.

## 5. Automations that call Kitsuden

Orca automations run a prompt on a schedule. Give each automation its own
agent identity, as in [section 3](#3-one-key-per-agent), and start it disabled
while you tune it. A precheck skips the run when the API is down:

```bash
orca automations create \
  --name "Tier list sync" \
  --trigger weekdays --time 09:00 \
  --precheck "curl -fsS $KITSUDEN_API_URL/api/health" \
  --prompt "Use the kitsuden skill. Sync every tier list with its catalog (tierlist_sync) and report what changed. Do not place new entries." \
  --provider claude \
  --repo my-site \
  --disabled --json
```

Patterns that work well:

- **Read-only reports** (content QA, broken links, missing translations): an
  identity with only read scopes, in `direct` mode. Nothing to approve.
- **Writes a human checks** (tier list syncs, catalog imports, blog drafts): an
  identity in `propose` mode. The run ends with proposals in **Approvals**; the
  agent cannot approve them, because no approval route is an MCP tool and agents
  are never staff.
- **Tests and migrations**: target a worktree (`--workspace`), so the run uses
  that worktree's own database from section 4.

## 6. Kitsuden in a per-workspace environment

Orca can create a disposable environment per workspace (a cloud sandbox, a VM,
an SSH host or a local container) through `environmentRecipes` in `orca.yaml`.
Orca's `orca-per-workspace-env` skill scaffolds the provider's create, suspend,
resume and destroy scripts; this section covers only what Kitsuden needs inside
the environment.

1. **Base image.** Node 20+, pnpm, Bun, Docker (or a Postgres 16 with pgvector)
   and the agent CLI. Do not bake any Kitsuden key or `.env` into it.
2. **Inside the environment**, after Orca creates the worktree:

   ```bash
   docker compose -f docker-compose.test.yml --env-file .env.test up -d   # test Postgres on 5434
   pnpm install --frozen-lockfile
   node scripts/orca/worktree.mjs setup                                    # its own database
   (cd apps/api && bun run dev)                                            # API on the port in .kitsuden/worktree.json
   ```

   This is the same `scripts.setup` as on a laptop, so no extra configuration
   is needed beyond starting Postgres in the base image's boot step.

3. **Credentials.** The agent in the environment talks to the API **inside**
   it, with a key created on that API. Never pass a production URL or token
   into the environment; if the agent must touch a shared Kitsuden, give it a
   `propose`-mode key and let a human approve.
4. **Destroy** removes the environment and its database with it; `archive` is
   still worth running so a reused environment does not keep stale databases.

The recipe entry itself is ordinary Orca configuration. Put it next to the
`scripts` block once the scripts exist, for example:

```yaml
environmentRecipes:
  - id: kitsuden-docker
    name: Kitsuden (local Docker)
    create: ./scripts/orca-vm/kitsuden-docker-create.cmd
    destroy: ./scripts/orca-vm/kitsuden-docker-destroy.cmd
```

`scripts/orca-vm/` does not exist in this repository: generate it for your
provider with that skill and check it with `orca vm recipe doctor`.

## Troubleshooting

| Symptom                                                       | Cause                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup: `No conecto con postgres://…:5434`                     | The test server is not running: `pnpm test:db:up`.                                                                                          |
| Setup: `apps/api/.env ya existe y no lo escribió este script` | An `.env` was copied in (Settings → shared paths, or a manual copy). It may point at production: remove it and run setup again.             |
| The suite runs on pg-mem instead of the worktree database     | `DATABASE_URL` in the shell overrides `apps/api/.env`; unset it.                                                                            |
| Orca ignores `orca.yaml`                                      | Invalid YAML or a duplicate key anywhere rejects the whole file. Check it with a parser that rejects duplicate keys.                        |
| `.worktreeinclude` copies nothing                             | Orca copies only files that exist in the primary checkout and are gitignored, one literal path per line.                                    |
| MCP client shows no tools                                     | `kitsuden mcp --stdio` could not find `packages/mcp-server`: run it from the monorepo or set `KITSUDEN_MCP_ENTRY`. The reason is on stderr. |
