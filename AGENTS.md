# Kitsuden: notes for coding agents

Read by Codex, Antigravity and other agents; Claude Code reads it through `CLAUDE.md`.
Human documentation for agent setups: `docs/agents/coding-agents.md`.

## Never

- Connect to Postgres on port **5432**, to a database whose name contains `prod`, or to
  any `kitsuden_*_prod` container. On the owner's machine that is the live site.
- Run `docker compose` against the root `docker-compose.yml` (it is the production stack)
  or `pnpm prod:*`.
- Print `.env` files. In the primary checkout, `/.env` and `apps/api/.env` hold production
  credentials. If you must check a value, print key names only and mask URLs.
- Run the test suite against a database whose name lacks `test`: `clearTestData()` deletes
  whole tables without `WHERE`.

## One database per worktree

If you work in a git worktree (not the primary checkout), it must have its own database:

```bash
pnpm install --frozen-lockfile
node scripts/orca/worktree.mjs setup     # creates kitsuden_test_wt_<name>_<hash>, writes apps/api/.env, migrates
node scripts/orca/worktree.mjs status    # which database and ports this worktree has
node scripts/orca/worktree.mjs archive   # before the worktree is removed: drops its database
```

Orca runs `setup` and `archive` itself (`orca.yaml`); Claude Code runs `setup` from its
session hook. Codex and Antigravity do not: run `setup` yourself before tests or migrations.
`node scripts/orca/worktree.mjs prune` lists databases whose worktree is gone (`--apply` drops them).
The test Postgres must be up first: `pnpm test:db:up` (port 5434).

## Tests

- `pnpm test:unit`: the vitest suite in `tests/unit`. Kon tests that use the full stack belong
  here, not in `bun test` (Bun's `mock.module` leaks across files).
- `pnpm test:api`: the API suite on real Postgres; needs the worktree database above.
- Run a long suite in the background and read its summary; do not re-run blindly when a worker
  fails to start: repeat that file alone.

## Talking to a Kitsuden API

- Use the `kitsuden` skill (`skills/kitsuden/SKILL.md`) and read `GET <api>/llms.txt` before
  the first call. Never invent routes, flags or scopes.
- The API URL comes from `KITSUDEN_API_URL` or `.kitsuden/worktree.json`; the token from
  `KITSUDEN_API_TOKEN`. Never write a token into a file in the repository.
- A `202 KITSUDEN_E_APPROVAL_REQUIRED` means a human must approve: report the proposal, do not retry.
