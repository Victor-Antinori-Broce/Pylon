# Kitsuden walkthrough — from a running API to datasets, GraphQL and MCP

This walkthrough starts where the installation ends: an API running on
`http://127.0.0.1:3000`. It takes you through the first administrator, a
first dataset, GraphQL, the framework layer and an AI agent over MCP.

> **Test status.** Sections 1 and 2 follow the installation guide, whose
> commands were tested on 2026-10-15. Sections 3 to 6 were checked against the
> code (routes, request bodies) but **not run** end to end in this revision.

---

## 1. Have an API running

Either way works:

- **Docker** (recommended): [README → Quick start with Docker](../README.md#quick-start-with-docker),
  or the full [server guide](install/server.md).
- **Local development**: [install/local.md](install/local.md) (pnpm 9, Node
  22.12+, Bun 1.3+, Postgres 16 + pgvector, Valkey).

Check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/live   # 200
curl -s http://127.0.0.1:3000/api/version
```

| URL                                               | What                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `http://127.0.0.1:3000/live`, `/ready`, `/health` | liveness, readiness, deep health (at the root, no `/api`)          |
| `http://127.0.0.1:3000/api/docs`                  | OpenAPI reference (when `ENABLE_SWAGGER` is on)                    |
| `http://127.0.0.1:3000/api/graphql`               | GraphQL endpoint                                                   |
| `http://127.0.0.1:3001`                           | admin panel (Docker) or `http://localhost:5173` (`pnpm dev:admin`) |

---

## 2. Create the first administrator

The panel shows a sign-up screen while there are no users. Or through the
API, which only accepts this while the user table is empty:

```bash
curl -s -X POST http://127.0.0.1:3000/api/system/setup \
  -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"name":"Admin","email":"admin@example.com","password":"<a long password>"}'
```

Sign in and keep the session cookie (the `Origin` must be one of the API's
`ALLOWED_ORIGINS`):

```bash
curl -s -c cookies.txt -X POST http://127.0.0.1:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"email":"admin@example.com","password":"<a long password>"}'
```

Details: [install/first-run.md](install/first-run.md).

---

## 3. A first dataset — instant CRUD

Datasets are collections whose schema you define at runtime; their rows are
stored as JSONB (see [ARCHITECTURE.md](../ARCHITECTURE.md)).

```bash
# Create the dataset (staff only); the response carries its id
curl -s -b cookies.txt -H 'origin: http://localhost:3001' -H 'content-type: application/json' \
  -X POST http://127.0.0.1:3000/api/data-sets \
  -d '{"name":"Products","slug":"products","schema":[]}'

# Look it up by slug, if you need the id again
curl -s -b cookies.txt http://127.0.0.1:3000/api/data-sets/slug/products

# Insert an entry and list them (entries are addressed by the dataset's id, a UUID)
curl -s -b cookies.txt -H 'origin: http://localhost:3001' -H 'content-type: application/json' \
  -X POST http://127.0.0.1:3000/api/data-sets/<id>/entries \
  -d '{"data":{"title":"Keyboard","price":49,"stock":120}}'
curl -s -b cookies.txt http://127.0.0.1:3000/api/data-sets/<id>/entries
curl -s -b cookies.txt "http://127.0.0.1:3000/api/data-sets/<id>/entries?format=toon"   # TOON instead of JSON
```

With a non-empty `schema`, entries are validated against it. The same can be
done from the panel (**DataSets**).

---

## 4. GraphQL

The GraphQL schema is generated from the database schema. Every query needs
a session or a key and runs inside a row-level-security transaction:

```bash
curl -s -b cookies.txt -H 'origin: http://localhost:3001' -H 'content-type: application/json' \
  -X POST http://127.0.0.1:3000/api/graphql -d '{"query":"{ __schema { queryType { name } } }"}'
```

---

## 5. Framework layer — policies, validation, `repo()`

Inside a kon or a route, everything comes from `@kitsuden/engine` (see
[CORE.md](../CORE.md)). The CLI generates the patterns; it is **not on npm**,
so build it and run it from the repository:

```bash
pnpm --filter @kitsuden/cli build
node packages/cli/dist/index.js make policy Product --kon my-kon
```

```typescript
// product.policy.ts (generated — edit the rules)
import { definePolicy } from "@kitsuden/engine";

definePolicy<{ ownerId?: string | null }>("product", {
  view: () => true,
  update: (user, p) => user?.role === "admin" || (!!p.ownerId && p.ownerId === user?.id),
  delete: (user) => user?.role === "admin",
});
```

```typescript
// In a route: validation + authorization + the request's RLS transaction
import { repo, can, validateRequest } from "@kitsuden/engine";

app.put("/products/:id", validateRequest(UpdateProduct), async (c) => {
  const product = await repo(products).find(c.req.param("id")); // runs under the RLS transaction
  if (!product || !(await can(c.get("user"), "update", product, "product"))) {
    return c.json({ error: "Not found" }, 404); // do not leak existence
  }
  const updated = await repo(products).filter({ id: product.id }).update(c.get("validated"));
  return c.json(updated[0]);
});
```

- `repo()` picks up the RLS transaction from the request scope.
- Policies are **deny-by-default**: an action without a rule is denied.
- `validateRequest` answers a uniform `422` envelope with per-field errors.

### Sending email

Emails are **mailables**: a name, an envelope and content. A kon registers
its own in `onStartup`; the host never needs to know about them.

```typescript
import { mail, layout, heading, button } from "@kitsuden/engine";

mail.register({
  name: "product.published", // also the queue job name
  envelope: (d, ctx) => ({ to: d.to, subject: ctx.t("product.published.subject") }),
  content: (d, ctx) => ({
    html: layout({ appName: ctx.appName, body: heading("Published!") + button("View", d.url) }),
  }),
});

await emailQueue.add("product.published", { to: "ada@example.com", url, locale: "es" });
```

The driver comes from the environment: `RESEND_API_KEY` → Resend, `SMTP_HOST`
→ SMTP, neither → console (`log`). In tests, `mail.fake()` and
`mail.assertSentTo(...)` need no SMTP.

---

## 6. An AI agent over MCP

Create an **agent** in the panel (**Agents**) with only the scopes it needs
(for example `mcp:connect` plus read scopes). The API serves MCP itself at
`/api/mcp` (`ENABLE_MCP=true`, the default in Docker). There is also a
standalone server in `packages/mcp-server` (not on npm; run it with Bun from
the repository):

```bash
pnpm --filter @kitsuden/mcp-server build
```

```json
{
  "mcpServers": {
    "kitsuden": {
      "command": "bun",
      "args": ["run", "/path/to/kitsuden/packages/mcp-server/dist/standalone.js"],
      "env": {
        "KITSUDEN_API_URL": "http://127.0.0.1:3000",
        "KITSUDEN_API_TOKEN": "kitsuden_agent_..."
      }
    }
  }
}
```

See [packages/mcp-server/README.md](../packages/mcp-server/README.md) and
[docs/ai/](ai/mcp-tools.md) for the tools.

---

## 7. Production notes

1. **RLS is only real if the database role is not a superuser.** Docker does
   this for you (`APP_DB_USER`); outside Docker see
   [RLS_SETUP_GUIDE](../apps/api/docs/RLS_SETUP_GUIDE.md).
2. Public mode (`docker-compose.tls.yml`) sets `KITSUDEN_PUBLIC=true`, and the
   API refuses to start with localhost URLs or without a mail transport.
3. Health: `/live`, `/ready`, `/health`; public SLO summary: `/slo`.
4. Never commit `.env`. Back up `.env` (and `KITSUDEN_SECRETS_KEY`) off the
   server: [install/upgrade-and-backups.md](install/upgrade-and-backups.md).

## Where to go next

- [README](../README.md) — what Kitsuden is, ports, quick start
- [install/](install/README.md) — the full installation guide
- [ARCHITECTURE.md](../ARCHITECTURE.md) and [CORE.md](../CORE.md)
- [packages/sdk/README.md](../packages/sdk/README.md) — `@kitsuden/sdk` for frontends
