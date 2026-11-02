# Writing a kon with the kon SDK

A **kon** is a pluggable module of Kitsuden (a blog, a CRM, a booking engine…).
With the **kon SDK** you write a kon by *declaring operations*, not by wiring
routes by hand. Each operation is declared **once**, and from that declaration
Kitsuden generates:

| What | How |
| --- | --- |
| The **REST route** | Mounted under the kon's path, with input validation (`422 application/problem+json`), authentication, authorization (scopes + your kon policy), `Idempotency-Key` support and per-request Row-Level Security — all inherited, nothing to wire. |
| The **OpenAPI 3.1** operation | Real JSON Schemas generated from your zod schemas (request *and* response), the error responses your operation can return, its security, and an `x-kitsuden-operation` extension (scope, sensitivity, idempotency, MCP tool). Served in `GET /api/docs/openapi.json`. |
| The **MCP tool** | Same schemas, exposed to AI agents through `/api/mcp`. A tool call runs through the very same pipeline as a REST request with that agent's key, so an agent can never do over MCP what its key could not do over REST. |
| The **authorization** | A stable fine-grained scope per operation (`kon:<kon>:<operation>`) plus the broad scopes and policy you declare. |

The SDK contract is versioned: `GET /api/version` publishes `sdk.kons` (currently
`1`). A kon declares the version it was written for (`defineKonSdk` sets it);
Kitsuden refuses to mount a kon that asks for a newer SDK than it provides.

> Quick start: `kitsuden make kon recipes` generates a complete kon written
> with the SDK (operations, policy, schema, migration and route tests).

Kons are not part of the Kitsuden core: they live in a kons repository (the
official one is [kitsuden-kons](https://github.com/Victor-Antinori-Broce/kitsuden-kons))
and are installed into a project. See also:

- [core-and-kons.md](core-and-kons.md) — what is core and what is a kon, and why;
- [installing.md](installing.md) — `kitsuden kon add|remove|list`, `KITSUDEN_KONS`, Docker;
- [publishing.md](publishing.md) — layout, manifest, dependencies, CI and releases of a kon;
- [registry.md](registry.md) — signed, versioned kon registry: `kon add <id>@<range>`, publish, verify, lockfile;
- [contract-testing.md](contract-testing.md) — Schemathesis against the SDK operations, and its baseline.

---

## A complete example

`packages/kons/kon-recipes/recipes.routes.ts`:

```ts
import {
  AppError,
  defineOperacion,
  esquemaFecha,
  esUuid,
  routerDeOperaciones,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import type { KonContext } from "@kitsuden/shared";
import { desc, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";

import { esStaff, registerRecipesPolicy } from "./recipes.policy";
import { recipes } from "./recipes.schema";

export const KON_ID = "kon-recipes";

// Schemas: used for validation, OpenAPI and the MCP tool at the same time.
const NewRecipe = z.object({
  title: z.string().trim().min(1).max(200),
  minutes: z.number().int().positive().optional(),
  publishedAt: esquemaFecha().nullable().optional(), // ISO 8601 → Date
});
const RecipeId = z.object({ id: z.string() });
const Recipe = z.object({
  id: z.string().uuid(),
  title: z.string(),
  minutes: z.number().int().nullable(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
});

export function recipeOperations(ctx: KonContext): OperacionCualquiera[] {
  registerRecipesPolicy();
  const db = ctx.db.instance; // the request's RLS transaction, resolved per request

  return [
    defineOperacion({
      id: "list-recipes",
      metodo: "GET",
      ruta: "/",
      resumen: "List recipes",
      descripcion: "Newest first. The public sees published recipes; staff see drafts too.",
      acceso: "opcional",
      salida: { esquema: z.object({ docs: z.array(Recipe) }) },
      manejar: async (_entrada, { usuario }) => {
        const rows = await db.select().from(recipes).orderBy(desc(recipes.createdAt));
        return { docs: esStaff(usuario) ? rows : rows.filter((r) => r.publishedAt) };
      },
    }),

    defineOperacion({
      id: "create-recipe",
      metodo: "POST",
      ruta: "/",
      resumen: "Create a recipe",
      descripcion: "Creates a recipe. Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "recipe", accion: "create" } },
      entrada: { cuerpo: NewRecipe },
      salida: { estado: 201, esquema: Recipe },
      manejar: async ({ cuerpo }) => {
        const [row] = await db.insert(recipes).values(cuerpo).returning();
        return row; // served with salida.estado (201)
      },
    }),

    defineOperacion({
      id: "delete-recipe",
      metodo: "DELETE",
      ruta: "/:id",
      resumen: "Delete a recipe",
      descripcion: "Deletes a recipe. Cannot be undone.",
      acceso: "sesion",
      permiso: { politica: { recurso: "recipe", accion: "delete", enHandler: true } },
      entrada: { params: RecipeId },
      salida: { estado: 204 },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      // sensible defaults to true for DELETE (see "Sensitive operations")
      manejar: async ({ params }, { autorizar }) => {
        if (!esUuid(params.id)) throw AppError.notFound("Recipe not found");
        const [row] = await db.select().from(recipes).where(eq(recipes.id, params.id));
        if (!row) throw AppError.notFound("Recipe not found");
        await autorizar(row); // policy checked against the loaded resource
        await db.delete(recipes).where(eq(recipes.id, row.id));
        return null;
      },
    }),
  ];
}

export function createRecipesRouter(ctx: KonContext): Hono {
  return routerDeOperaciones(KON_ID, recipeOperations(ctx), ctx);
}
```

`packages/kons/kon-recipes/index.ts`:

```ts
import { defineKonSdk } from "@kitsuden/engine";
import type { KonContext } from "@kitsuden/shared";

import { recipeOperations } from "./recipes.routes";

export const kon = defineKonSdk({
  id: "kon-recipes",
  name: "Recipes",
  version: "0.1.0",
  mountPath: "/api/recipes",
  operaciones: (ctx: KonContext) => recipeOperations(ctx),
  tables: ["recipes"],
});
export default kon;
```

That is all. The loader mounts `kon` like any other kon, and:

- `POST /api/recipes` validates the body (unknown fields are a `422` with a
  `didYouMean` hint), checks the permission, and inserts inside the request's
  RLS transaction;
- `GET /api/docs/openapi.json` documents the three operations with their
  schemas and errors;
- an agent with `mcp:connect` sees the tools `recipes__list-recipes`,
  `recipes__create-recipe` (if it may create) and `recipes__delete-recipe`.

---

## The operation declaration

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable, kebab-case, unique in the kon. It is part of the contract: it names the MCP tool (`<kon>__<id>`), the OpenAPI `operationId` (`<kon>.<id>`) and the fine scope (`kon:<kon>:<id>`). Do not rename it. |
| `metodo`, `ruta` | yes | HTTP method and path relative to the kon mount (`/pages/:id`). Declare literal paths before parametric ones (`/categories` before `/:id`): the SDK refuses to mount a route that an earlier one shadows. |
| `resumen`, `descripcion` | yes | One line for humans (`summary`) and a description for humans **and agents**: say what it does, when to use it and what it returns. Agents read it to pick the tool. |
| `entrada` | no | zod schemas for `params`, `query` (strings: use `z.coerce`) and `cuerpo` (JSON body; `formato: "multipart"` for uploads). Object bodies are strict by default (unknown keys → 422); use `.passthrough()` only on purpose. |
| `salida` | yes | `{ estado?, esquema?, tipo?, descripcion? }`. JSON outputs need a schema; binary outputs declare `tipo` (`image/*`). `estado: 204` returns no body. |
| `acceso` | yes | `publico` (no credential needed), `opcional` (the operation looks at who asks), `sesion` (an account or a verified agent, otherwise 401). |
| `permiso` | no | What else is needed (see below). Without it, `acceso` is enough. |
| `sensible` | no | For human approval (phase F). Default: `true` for `DELETE`, `false` otherwise. Published in OpenAPI (`x-kitsuden-operation.sensitive`) and as the MCP `destructiveHint`. |
| `idempotente` | no | Whether repeating the same request leaves the same state. Default: HTTP semantics (`GET`/`PUT`/`DELETE` yes, `POST`/`PATCH` no). Non-idempotent MCP tools get an optional `idempotency_key` argument. |
| `coste` | no | Budget units one call spends from the agent's `budget_units_per_day` (integer ≥ 0, default 1). See [Agent permissions, keys and quotas](../agents/permissions.md). |
| `errores` | no | Extra error codes it can return, from the `KITSUDEN_E_*` catalogue (`@kitsuden/shared`, `docs/install/errors-and-retries.md`). Validation, authentication, permission and internal errors are added automatically. |
| `mcp` | no | Exposed by default. `{ excluir: "reason" }` to keep it out of MCP — the reason is mandatory (e.g. "multipart file upload", "returns image bytes"). |
| `antes` | no | Hono middleware that runs after authentication and before permission/validation (e.g. `bodyLimit` on an upload). An escape hatch. |
| `manejar` | yes | `(entrada, h) => data | Response`. `entrada` holds the validated `params`, `query` and `cuerpo`. Return data (served as JSON with `salida.estado`) or a ready `Response` when you need full control (headers, binary, a different status). Throw `AppError` for errors (`AppError.notFound(...)`). |

`h` (the operation context) gives you `c` (the Hono context), `ctx` (the kon
context: `db`, `cache`, `events`, `storage`, `logger`…), `usuario` (who asks, or
`null`), `autorizar(resource?, action?)` (throws 401/403) and
`puede(resource?, action?)` (returns a boolean).

### Permissions

An operation is allowed when **any** of these grants it (the grants are a
*union*: a fine-grained scope never takes away what a broad one gives):

1. the operation's fine scope `kon:<kon>:<id>`, or `kon:<kon>:*`, or `kon:*`;
2. the kon-wide broad scope `<kon>:*` (e.g. `crm:*`);
3. one of the broad scopes in `permiso.scopes` (e.g. `contenido:editar`),
   with the usual wildcards (`contenido:*`, `*:editar`);
4. `admin` / `admin:*`;
5. the kon policy (`permiso.politica`: `can(user, action, resource, type)`,
   which also grants the `<type>:<action>` scope);
6. `permiso.roles` (e.g. `["admin"]`).

Scopes are carried by agent keys (`kitsuden_agent_*`); human accounts are
granted by role through the policy. With `politica.enHandler: true` the policy
needs the loaded resource, so the handler calls `autorizar(resource)` after
loading it; otherwise the check runs **before** validation and the handler, with
an empty resource.

`scopesQueConceden(konId, op)` (from `@kitsuden/shared`) lists every scope that
grants an operation — what the admin panel shows as "granted by".

**Deny wins.** An agent key can carry explicit denies (`!kon:<kon>:<id>`,
`!kon:<kon>:*`, `!<kon>:*`, or a resource scope such as
`!datasets:<slug>:write`). A deny covering the operation closes it for that
key — even when `admin`, a role or the policy would grant it, and even for
public operations. See [Agent permissions, keys and quotas](../agents/permissions.md).

**Resource scopes.** `permiso.scopeDeRecurso(input, resource?)` returns the
scope of the resource the request touches (kon-datasets returns
`datasets:<slug>:write` from the dataset passed to `autorizar(resource)`). It
also grants the operation, and a deny can remove it.

**Cost.** `coste` (integer ≥ 0, default 1) is what one call spends from the
agent's daily budget (`budget_units_per_day`). Declare more for expensive
operations (exports, reindexing, generation).

> The host's prefix gates (`RUTAS_SOLO_ADMIN` in `apps/api`) still apply on top
> of your permission, over REST and over MCP — but they accept the operation's
> fine scope: an agent with `kon:blog:crear-entrada` passes the staff gate of
> `/api/blog` for that operation only.

### Sensitive operations

`sensible` marks operations a human may have to approve when an agent asks for
them. `DELETE` operations are sensitive by default; mark imports, bulk rewrites
or publishing as sensitive too. It is only the **default**: an admin can
override it per operation in the panel (**Approvals → Settings**), and nothing
is held back until an admin turns human approval on (globally, or for one agent
with "propose only"). The key an admin overrides is the operation's fine scope,
`kon:<kon>:<operation>`. See [Human approval](../agents/approvals.md).

### Streaming operations (`salida.flujo`)

An operation can `yield` typed objects instead of returning one value. They go
out as standard **Server-Sent Events** (`text/event-stream`), each one validated
against `salida.esquema`, which here is the schema of **one event**:

```ts
defineOperacion({
  id: "progreso-de-importacion",
  metodo: "GET",
  ruta: "/imports/:id/progress",
  resumen: "Import progress",
  descripcion: "One event per imported batch, then `end`.",
  acceso: "sesion",
  entrada: { params: z.object({ id: z.string().uuid() }) },
  salida: { flujo: true, esquema: z.object({ done: z.number(), total: z.number() }) },
  async *manejar({ params }) {
    for await (const lote of importar(params.id)) yield { done: lote.n, total: lote.total };
  },
});
```

- The stream ends with `event: end`; if the generator throws, `event: error`
  carries a problem+json (internal messages are not leaked).
- Each **step** of the generator (the code between two `yield`) runs in its own
  short RLS transaction with the caller: `ctx.db.instance` and `repo()` see
  that user, and the stream never holds a connection while it waits. What a
  step writes is committed when the next one starts.
- The typed SDK exposes it as an `AsyncIterable` (`for await … of`); MCP returns
  the list of events; the OpenAPI publishes the event schema under
  `x-kitsuden-event-schema`. It is plain SSE, not a custom RPC protocol.
- A client that disconnects closes the generator (its `finally` runs).

---

## Rules for handlers (the request transaction)

Every request to a kon runs in **one** Postgres transaction with the caller's
identity set for RLS. `ctx.db.instance` resolves to that transaction. Three
rules follow:

1. **No `Promise.all` over the request transaction.** It is one connection; it
   runs one query at a time. Run the queries one after another, or use
   `ctx.db.segundoPlano(() => …)` for independent reads that may run outside
   the transaction (they run as the system, so only for public data).
2. **Do not swallow SQL errors inside the transaction.** A failed statement
   aborts the whole transaction and every later query fails. If you want to
   tolerate a failure, run it in a savepoint: `conSavepoint(() => …)` (rethrows)
   or `intentarSql(() => …, fallback)` (returns the fallback), both from
   `@kitsuden/engine`.
3. **Long external calls go out of the transaction.** Call the remote service
   (S3, an HTTP API, mail) before the first query, or afterwards in
   `ctx.db.segundoPlano`. Holding a transaction while waiting on the network
   holds a pool connection hostage.

---

## MCP tools

Tool names are `<kon>__<operation>` (e.g. `blog__crear-entrada`). Arguments:

- path and query parameters, **flat** at the top level;
- the request body, **whole**, under `body`;
- `idempotency_key` (optional) on non-idempotent operations: the same key and
  arguments replay the first result (`structuredContent.idempotentReplayed`).

`tools/list` only shows the tools the session's agent may call (its
`allowedTools` list and the operation permission). A failed call returns the
same `application/problem+json` body as REST in `structuredContent`
(`code`, `retryable`, `hint`…).

---

## Agents in policies and Row-Level Security

An agent reaches a kon as a user with `role: "agent"` and its `scopes`; in
Postgres, `app.current_user_role = 'agent'` and the scopes in
`app.agent_scopes`. Do not write `user.role === "admin"` in a policy or
`current_setting('app.current_user_role', true) = 'admin'` in a policy of the
database: an agent with `admin` (or with your kon's `<kon>:*`) would get
empty lists. Use the core's rule instead, the same in both places:

```ts
import { definePolicy, esAdminEfectivo, esStaffEfectivo } from "@kitsuden/engine";

definePolicy("invoice", {
  view: (u) => esStaffEfectivo(u, "billing"),   // admin/editor, or an agent with billing:*
  delete: (u) => esAdminEfectivo(u, "billing"), // admin, or an agent with billing:*
});
```

```sql
CREATE POLICY invoices_team ON invoices FOR ALL
  USING (kitsuden_staff_efectivo('billing')
         OR kitsuden_agente_puede_en_kon('billing', 'invoice:view'));
```

The SQL functions (`apps/api/src/db/funciones-de-agente.sql`) are applied by
the host before any kon migration, so a migration may use them. `<kon>` is the
kon id without `kon-`. A deny in the agent's key always wins.

## Testing a kon

Mount the generated router on a Hono app with a test kon context
(`createTestKonContext` from `apps/api/src/lib/test-kon-context`) and a real
database (PGlite), as the tests generated by `kitsuden make kon` do. A kon's
tests live with the kon, in its kons repository (kitsuden-kons:
`tests/unit/`, vitest, run against the Kitsuden checkout linked at
`.kitsuden`); its `tests/guards/` check every kon is installable — see
[publishing.md](publishing.md).

`tests/unit/cobertura-de-operaciones.test.ts` checks, in CI, that every mounted
route is an SDK operation (with a valid OpenAPI 3.1 operation, validated with a
real validator, and an MCP tool or an exclusion reason) or is listed in
`apps/api/src/lib/rutas-legadas.ts`. That legacy list can only shrink. For a
measured report on the running app, run `apps/api/scripts/cobertura-de-operaciones.ts`
against a test database.

The declarations are also attacked with generated requests: see
[contract-testing.md](contract-testing.md) (Schemathesis, in CI, with a
baseline of known failures).

---

## Legacy kons and migrating one

Kons written before the SDK (a `createRouter` that builds a Hono router by
hand) keep working unchanged: they are mounted the same way, get the same RLS
and idempotency, and appear in the OpenAPI by route discovery (without output
schemas) — but they are not MCP tools.

To migrate one, turn each `router.<method>(path, …middleware, handler)` into a
`defineOperacion` with the same path, in the same order, move the
authorization middleware into `permiso`, declare the schemas, and replace
`createRouter` with `operaciones` in `defineKonSdk`. Then remove its routes from
`rutas-legadas.ts`. If the kon already published its own `400` validation
responses, declare `entrada.validaElHandler: true` so the SDK documents the
body schema without changing that response (new kons should not need it).
