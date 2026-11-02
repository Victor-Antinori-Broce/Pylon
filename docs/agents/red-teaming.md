# Red-teaming the MCP server with AI-Infra-Guard

Kitsuden's MCP server, the official kons and the `kitsuden` skill can be
audited with **AI-Infra-Guard** by Tencent Zhuque Lab:

> This project uses [AI-Infra-Guard](https://github.com/Tencent/AI-Infra-Guard)
> by **Tencent Zhuque Lab** (Apache License 2.0) — `aig-mcp-scan` and
> `aig-skill-scan` — to red-team its MCP server and agent skill.

Only its two command-line scanners from PyPI are used, at pinned versions. No
code of AI-Infra-Guard is copied into this repository.

**Never deploy the AI-Infra-Guard web UI** (`docker-compose … up`, port 8088).
Its own README says it has no authentication and must not be exposed. Nothing
here starts it.

## What runs

| Target | Tool | How |
| --- | --- | --- |
| MCP server code (`routes/mcp.ts`, `services/mcp-tools.ts`, `lib/*mcp*`, `lib/procedencia.ts`, `packages/mcp-server`) | `aig-mcp-scan==0.2.0 --repo` | a temp copy of only those files |
| Official kons (`../kitsuden-kons/kons`) | `aig-mcp-scan==0.2.0 --repo` | `--objetivo=kons` |
| A running **test** MCP server | `aig-mcp-scan==0.2.0 --server_url` | `--objetivo=servidor`, local only |
| `skills/kitsuden` | `aig-skill-scan==0.2.2 --repo` | always with `codigo` |

Each writes SARIF 2.1.0 to `.aig/` (gitignored).

## Locally

```bash
# Free, no key, nothing leaves the machine: AIG's own regex pre-scan
node scripts/seguridad/aig.mjs --solo-preescaneo --objetivo=codigo,skill,kons

# Full LLM audit (costs money, sends the code to the LLM endpoint)
LLM_API_KEY=… node scripts/seguridad/aig.mjs                      # MCP code + skill
LLM_API_KEY=… node scripts/seguridad/aig.mjs --objetivo=todo      # + kons + test server

# Dynamic scan of a TEST stack (never prod: the script refuses non-local hosts and port 3000)
KITSUDEN_AIG_URL=http://127.0.0.1:3941/api/mcp KITSUDEN_AIG_TOKEN=kitsuden_agent_… \
LLM_API_KEY=… node scripts/seguridad/aig.mjs --objetivo=servidor
```

Needs `uv`/`uvx` and Node. `AIG_BASE_URL` (any OpenAI-compatible endpoint) and
`AIG_MODEL` choose where the code goes and which model reads it.

**Trap found while integrating (0.2.0):** `-u/--base_url` only moves AIG's
*main* model. Its "thinking" and "coding" phases default to
`google/gemini-2.5-pro` and `anthropic/claude-sonnet-4.5` **on OpenRouter**,
read from `THINKING_*` / `CODING_*` / `FAST_*` environment variables. The
script sets all four phases to the same endpoint and model, so the code goes
to one place and the cost is predictable.

## In CI

Job `aig-red-team` in `.github/workflows/ci.yml`:

- **Non-blocking** (`continue-on-error: true`): findings are an LLM's opinion,
  to be reviewed by a person, not a gate.
- Runs only if the repository secret **`LLM_API_KEY`** exists, and only on push
  to `main` or by hand (*Actions → CI → Run workflow*). Pull requests do not
  run it: each pass sends code to the LLM and costs money.
- Optional repository variables: `AIG_BASE_URL`, `AIG_MODEL`, and
  `KITSUDEN_KONS_REPO` (`owner/kitsuden-kons`) to also scan the kons; a private
  kons repo also needs the secret `KITSUDEN_KONS_TOKEN` (read-only).
- Uploads `.aig/` as the `aig-sarif` artifact (30 days). It does not upload to
  GitHub code scanning (that would need `security-events: write`; the
  workflow is read-only on purpose).

## Cost

AIG's code audit is an agent loop (up to 80 iterations per target, file reads
and greps as tools), so cost depends on the model and the code size, not on a
fixed prompt. Rough order of magnitude, to be confirmed with a first paid run:

- **What goes out per run:** the MCP code copy (21 files, ~370 KB) and the
  skill (~3 KB); with `kons`, a much larger tree. Each iteration re-sends the
  growing conversation.
- **With the default `deepseek/deepseek-v3.2-exp` on OpenRouter** (cheap
  tier) for every phase: expect cents to low single-digit dollars per target.
- **With AIG's own defaults** (thinking on Gemini 2.5 Pro, coding on Claude
  Sonnet 4.5) a run costs several times more; the script avoids that unless
  `AIG_MODEL` asks for an expensive model.
- On push to `main` only, so the monthly cost is (merges to main) × (cost per
  run). Set a spending limit on the key.

Check the provider's usage page after the first run and write the real number
here.

## Results so far (2026-10-28, without a key)

The LLM audit could not run (no `LLM_API_KEY`; the tool refuses to start
without one). AIG's static pre-scan (`--solo-preescaneo`) did run:

- MCP server code: 12 hits — `mcp_tool_poisoning` (7), `mcp_token_steal` (4),
  `outbound_data_exfil` (1). All false positives on review: the regexes span
  the whole file (`tool … description … replace`, `claude … config … key`)
  and match any MCP server; the "exfil" is `packages/mcp-server` sending
  `KITSUDEN_API_TOKEN` as `Authorization` to the configured Kitsuden API; the
  "config" hits are the generator of `.cursor/mcp.json` snippets with a
  `<your-api-key>` placeholder.
- `kitsuden-kons/kons`: 21 hits, all expected on review: payment and mail
  providers sending their API keys to their own APIs (Stripe, PayPal, Paddle,
  Lemon Squeezy, Mailgun Basic auth, SES), start.gg import, the broadcast
  ingest agent posting its ingest token to the configured server, and the word
  `cursor` in pagination code.
- `skills/kitsuden`: no hits.
