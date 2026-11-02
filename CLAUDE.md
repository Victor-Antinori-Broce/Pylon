@AGENTS.md

In a worktree, the `SessionStart` hook in `.claude/settings.json` runs
`node scripts/orca/worktree.mjs setup` and tells you the database and API URL it got. If it
says setup failed, fix that before running tests or migrations.
