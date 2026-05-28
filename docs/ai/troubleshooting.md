# Gremius MCP Troubleshooting for AI Assistants

> **Purpose:** Structured error-to-recovery lookup for LLMs operating Gremius via MCP.  
> **Rule:** If a tool call fails, consult this doc before guessing.

---

## Error Index

| Error Pattern | Root Cause | Recovery Tool / Action |
|---------------|------------|------------------------|
| `Dataset not found` / `Dataset "x" not found` | Wrong UUID or slug; dataset never created | `gremius_list_datasets` |
| `RLS blocked the query` / `policy denied` | Auth disabled or user lacks ownership | `gremius_enable_auth` + verify dataset policy |
| `Grimoire not installed` / `module not found` | Grimoire package missing or not registered | `gremius_install_grimoire` |
| `Migration failed` / `SQL syntax error` | Invalid DDL in grimoire migration or manual schema drift | Check migration SQL, fix syntax, retry install |
| `Queue not available` / `BullMQ connection error` | Valkey (Redis) is down or unreachable | Verify `docker compose up -d valkey` |
| `Invalid API key` / `Unauthorized` | Missing or expired `gremius_sk_*` / `grm_agent_*` token | Regenerate token via `bun run seed:mcp` |
| `Entry not found` / `Record not found` | Wrong entryId or record already deleted | Re-query with `gremius_query_dataset` |
| `Unknown tool: x` | Tool name typo or server version mismatch | Verify exact tool name in `docs/ai/tool-reference.json` |
| `Agent does not have MCP scope` | NHI token lacks `mcp:connect` scope | Re-issue agent identity with correct scopes |
| `Conflict` / `unique constraint` | Duplicate slug, email, or key | Change the conflicting field and retry |
| `Timeout` / `Worker did not respond` | Background worker crashed or queue is full | Check worker logs, restart queue consumer |

---

## Recovery Flows

### 1. "Dataset not found"

```
SYMPTOM:  gremius_query_dataset returns "Dataset 'projects' not found"
CAUSE:    You used a slug instead of a UUID, or the dataset was never created.
FIX:
  1. CALL gremius_list_datasets
  2. Inspect result for exact { id, slug, name }
  3. Use the UUID (id field) for all subsequent CRUD calls
  4. If the dataset is missing, decide:
     ├─ A grimoire covers this? → gremius_install_grimoire
     └─ Custom need? → gremius_create_dataset
```

---

### 2. "RLS blocked the query"

```
SYMPTOM:  Query returns empty set or "policy denied" even though records exist.
CAUSE:    The dataset has RLS enabled but no auth context is set, or the current
          user is not the owner of the rows.
FIX:
  1. CALL gremius_enable_auth({ methods: ["email"] })
     └─ Skip if auth is already enabled (check /api/health or admin UI).
  2. Verify the dataset policyJson includes an owner-only rule:
     { "rlsRules": [ { "field": "owner_id", "op": "eq", "value": "{{userId}}" } ] }
  3. If the user wants public read access, add a "published" status rule:
     { "rlsRules": [ { "field": "status", "op": "eq", "value": "published" } ] }
  4. Re-run the query.
```

---

### 3. "Grimoire not installed"

```
SYMPTOM:  Dataset expected by the grimoire is missing; grimoire routes 404.
CAUSE:    The grimoire package is not in node_modules or was not registered.
FIX:
  1. CALL gremius_install_grimoire({ grimoireId: "grimoire-<name>" })
  2. WAIT for installation response (may include migration output).
  3. CALL gremius_list_datasets to verify new datasets appeared.
  4. If it still fails, check dependencies:
     └─ e.g., grimoire-games requires grimoire-media → install media first.
  5. If migration failed, see Flow 4.
```

---

### 4. "Migration failed"

```
SYMPTOM:  grimoire_install returns "Migration failed" or SQL syntax error.
CAUSE:    The grimoire's migration SQL has a syntax issue, or the core schema
          has drifted (e.g., a table was renamed manually).
FIX:
  1. Read the exact SQL error message from the tool response.
  2. Common fixes:
     ├─ "relation already exists" → grimoire was partially installed; skip migration, register manually.
     ├─ "column does not exist" → core schema is outdated; restart API to trigger auto-migrations.
     └─ "syntax error at or near" → fix the migration file in packages/grimoires/<name>/ and retry.
  3. If the grimoire is from npm, open an issue; do NOT edit npm packages inline.
  4. After fix, re-run gremius_install_grimoire.
```

---

### 5. "Queue not available"

```
SYMPTOM:  gremius_dispatch_worker returns "BullMQ connection error" or timeout.
CAUSE:    Valkey (the Redis-compatible queue store) is not running or the
          API cannot reach it.
FIX:
  1. CHECK: docker compose ps | findstr valkey
  2. IF not running: docker compose up -d valkey
  3. IF running but API still errors:
     ├─ Check API env var VALKEY_URL (default: redis://localhost:6379)
     ├─ Verify network between API container and valkey container
     └─ Restart API service
  4. RETRY gremius_dispatch_worker with a small test payload.
```

---

### 6. "Invalid API key" / "Unauthorized"

```
SYMPTOM:  Any MCP call returns 401 or "Invalid API key".
CAUSE:    Token missing, wrong format, expired, or not hashed in DB.
FIX:
  1. VERIFY token format:
     ├─ Human keys: gremius_sk_xxx
     └─ Agent NHI:  grm_agent_xxx
  2. IF token is missing from env:
     └─ Run: bun run apps/api/scripts/seed-mcp-test.ts
     └─ Copy token from progress.txt into env/GREMUS_MCP_TOKEN.
  3. IF token expired:
     └─ Regenerate in Admin → API Keys or Agent Identities.
  4. IF agent NHI:
     └─ Verify scopes include mcp:connect and required dataset scopes.
```

---

### 7. "Entry not found"

```
SYMPTOM:  gremius_update_record or gremius_delete_record returns "Entry not found".
CAUSE:    The entryId was deleted, never existed, or RLS hides it.
FIX:
  1. CALL gremius_query_dataset on the same dataset with limit 100.
  2. IF the entry is visible → you used the wrong ID; copy the correct one.
  3. IF the entry is NOT visible → check auth / RLS (see Flow 2).
  4. IF the entry was deleted → inform the user; offer to recreate.
```

---

### 8. "Unknown tool"

```
SYMPTOM:  MCP server responds "Unknown tool: gremius_X".
CAUSE:    Typo, or the server version does not expose that tool.
FIX:
  1. CHECK exact spelling against docs/ai/tool-reference.json.
  2. IF the tool is new (e.g., gremius_generate_frontend_hook):
     └─ The server may need an update. Use gremius_api_request as escape hatch.
  3. IF connecting via standalone MCP server (port 3002):
     └─ Tool names differ slightly (gremius_query_table vs gremius_query_dataset).
     └─ Prefer the native API MCP endpoint (/api/mcp) for full tool coverage.
```

---

## Preventive Checklist (Run Before Complex Operations)

- [ ] `gremius_list_datasets` — confirm target dataset exists and note its UUID.
- [ ] `gremius_list_datasets` — check if a grimoire already covers the domain.
- [ ] Auth enabled? If dataset has RLS, ensure `gremius_enable_auth` was called.
- [ ] Dependencies satisfied? If installing a grimoire, install upstream grimoires first.
- [ ] Valkey running? If dispatching workers, verify queue health.
- [ ] TOON needed? If expecting >25 records, set `format: "toon"`.
