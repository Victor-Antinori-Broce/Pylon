# Kitsuden with Claude Code, Codex and Antigravity

The same three pieces work in every coding agent; only where each tool reads them changes.
For Orca, see [orca.md](orca.md).

| Piece                        | Claude Code                                          | Codex                                                  | Antigravity                                                                    |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Instructions                 | `CLAUDE.md` (imports `AGENTS.md`)                    | `AGENTS.md`                                            | `AGENTS.md`                                                                    |
| Skill                        | `npx skills add <repo> --skill kitsuden`             | same                                                   | same, if your version reads skills                                             |
| MCP server                   | `.mcp.json` ([kitsuden.mcp.json](kitsuden.mcp.json)) | `config.toml` ([codex.config.toml](codex.config.toml)) | `mcp_config.json` ([antigravity.mcp_config.json](antigravity.mcp_config.json)) |
| Token reaches the server via | `${KITSUDEN_API_TOKEN}` in `.mcp.json`               | `env_vars`                                             | `--agent-env-file` outside the repository                                      |
| Database per worktree        | `SessionStart` hook runs `setup`                     | run `setup` yourself                                   | run `setup` yourself                                                           |

All three start the same server, `kitsuden mcp --stdio` (one process per agent, so the audit
log keeps agents apart). Give each agent its own key: [orca.md § 3](orca.md#3-one-key-per-agent).

## AGENTS.md

`AGENTS.md` at the repository root holds what every agent must know before touching this
repository: what never to touch (port 5432, `kitsuden_*_prod`, the root compose file, the
`.env` files), the per-worktree database commands, how to run the tests and how to talk to a
Kitsuden API. Claude Code does not read `AGENTS.md` itself; `CLAUDE.md` imports it with
`@AGENTS.md`, so there is one text to keep up to date.

## Claude Code

- **MCP:** copy [kitsuden.mcp.json](kitsuden.mcp.json) to `.mcp.json`. Claude Code expands
  `${KITSUDEN_API_URL}` and `${KITSUDEN_API_TOKEN}` from the environment it was started in.
- **Database per worktree:** `.claude/settings.json` registers a `SessionStart` hook
  (`startup` only) that runs `scripts/claude/worktree-session.mjs`:
  - in the primary checkout it does nothing;
  - in a worktree without a database it runs `node scripts/orca/worktree.mjs setup`;
  - either way it tells the agent which database and API URL the worktree has, and exports
    `KITSUDEN_API_URL` for the session's shell commands (`CLAUDE_ENV_FILE`);
  - if setup fails, the session still starts and the agent is told why.

  It is a `SessionStart` hook and not `WorktreeCreate` on purpose: a `WorktreeCreate` hook
  _replaces_ Claude Code's own `git worktree` step (and its `.worktreeinclude` copy), and
  `WorktreeRemove` only fires for worktrees such a hook created. So nothing drops the database
  when Claude Code removes a worktree: run `archive` first, or clean up later with `prune`.

## Codex

- **MCP:** copy [codex.config.toml](codex.config.toml) into `~/.codex/config.toml`, or into
  `.codex/config.toml` in the project (Codex reads a project file only when the project is
  trusted). `env_vars = ["KITSUDEN_API_URL", "KITSUDEN_API_TOKEN"]` forwards both variables
  from Codex's environment, so neither value is written in the file.
- **Database per worktree:** Codex has no per-worktree setup hook, so `AGENTS.md` tells the
  agent to run `node scripts/orca/worktree.mjs setup` before tests or migrations.

## Antigravity

- **MCP:** copy [antigravity.mcp_config.json](antigravity.mcp_config.json) to
  `.agents/mcp_config.json` in the workspace, or merge it into
  `~/.gemini/config/mcp_config.json` for every project.
- **Why `--agent-env-file`:** Antigravity's documentation does not say that `env` values expand
  `${VAR}`, and MCP clients built on the reference SDK pass the server only a small safe set
  of variables (`PATH`, `HOME`, `TEMP`…), not `KITSUDEN_API_TOKEN`. So the server reads the
  URL and token from a file you keep **outside** any repository:

  ```bash
  mkdir -p ~/.kitsuden
  printf 'KITSUDEN_API_URL=%s\nKITSUDEN_API_TOKEN=%s\n' "http://localhost:13000" "kitsuden_agent_…" > ~/.kitsuden/antigravity.env
  ```

  `kitsuden mcp --stdio --agent-env-file <path>` expands a leading `~`, reads only those two
  variables, and refuses a file that sits inside a git repository (a `git add .` or a
  `.worktreeinclude` would hand it to every agent).

- **Database per worktree:** as in Codex, `AGENTS.md` tells the agent to run `setup`.

## Without the CLI on the PATH

The CLI is not published yet. Build it once (`pnpm --filter @kitsuden/cli build`) and use
`node <repo>/packages/cli/dist/index.js mcp --stdio` wherever the examples say
`kitsuden mcp --stdio`, with an absolute path. `KITSUDEN_MCP_ENTRY` overrides where the CLI
looks for the server.

## Cleaning up worktree databases

```bash
node scripts/orca/worktree.mjs prune          # lists kitsuden_test_wt_* whose worktree is gone
node scripts/orca/worktree.mjs prune --apply  # drops them
```

A database is kept when its hash matches a path in `git worktree list`, when a live
worktree's `.kitsuden/worktree.json` names it, or when it has open connections (it may belong
to another clone of the repository on the same test server).
