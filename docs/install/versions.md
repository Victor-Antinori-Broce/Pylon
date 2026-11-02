# Versions and compatibility (Kitsuden ↔ Inti)

Kitsuden and the Inti packages (`@intijs/*`) live in different repositories
and neither is published on npm (Inti is installed from git at a pinned
commit). Each has its own semver version, and between them something else
rules: the **contract version** of each API surface that an outside client
uses.

## `GET /api/version`

Public, no session, no deployment details:

```json
{
  "producto": "kitsuden",
  "version": "0.9.0-beta",
  "contratos": { "page-builder": 1, "games": 1, "games-editorial": 1, "admin-registry": 1 }
}
```

(The field names are Spanish: `producto` = product, `contratos` = contracts.)

- `version`: semver of the API (`VERSION_DE_KITSUDEN` in
  `packages/shared/src/contratos.ts`; a test requires it to match
  `apps/api/package.json` and the root `package.json`).
- `contratos`: **major** version (an integer) of each contract, from
  `CONTRATOS` in the same file. Only the contracts this installation actually
  **serves** appear: with `kon-blocks` disabled there is no `page-builder`,
  and with `kon-games` disabled there is no `games` or `games-editorial` (the
  contract → kon map is `KON_DE_CONTRATO` in `apps/api/src/routes/version.ts`;
  the Inti adapter keeps a copy to say which kon to enable).

| Contract          | Routes                                                                                                                                                                                                     | Client                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `page-builder`    | `GET /api/page-builder/pages`, `/pages/:id` (uuid or slug), `/block-types`; `POST /pages/:pageId/blocks`, `PATCH`/`DELETE /blocks/:id`, `POST /pages/:pageId/blocks/reorder`, `POST /blocks/:id/duplicate` | `@intijs/adapter-kitsuden` |
| `games`           | `GET /api/games/slug/:slug`, `GET /api/games/:id` (especially `blocks[]`: `id`, `type`, `order`, `data`, `editorial`)                                                                                      | adapter, websites          |
| `games-editorial` | `PATCH /api/games/:id/bloques/:bloqueId/editorial`, `PUT /api/games/:id/bloques/orden`                                                                                                                     | adapter                    |
| `admin-registry`  | `GET /api/admin/registry` (header `X-Kitsuden-Contract`)                                                                                                                                                   | alternative admin panels   |

## Policy

### Kitsuden API (semver)

- **patch** (`0.9.1`): fixes without contract changes.
- **minor** (`0.10.0`): new features; contracts only grow in a compatible way.
  While Kitsuden is `0.x`, a minor **may** bump a contract (semver allows
  breaking in 0.x), and the release notes say so.
- **major** (`1.0.0` → `2.0.0`): whenever any contract is bumped, from 1.0 on.

### What is an incompatible contract change

It bumps the contract's number (in `CONTRATOS`):

- removing or renaming a field of a response or a request body;
- changing its type or its **meaning** (`sortOrder` no longer a number,
  `order` starting at 1, `editorial.oculto` inverted);
- making something required that was optional in a request;
- changing the envelope of a response (`{ "blockTypes": [...] }` → array);
- removing or moving a route, or changing the status code of a documented
  case (404 ↔ 403, 200 ↔ 201);
- requiring another permission or scope for something already allowed.

It does **not** bump it (compatible): adding fields to a response, new routes,
optional parameters, new block types in `/block-types`, accepting more input
shapes. A client must ignore what it does not know.

A **new** contract appears in `contratos`; a **retired** one disappears (and a
client that needs it must treat that as incompatible).

### `@intijs/*` (semver)

- `@intijs/adapter-kitsuden` declares which versions of each contract it
  understands (`CONTRATOS_ADMITIDOS`, `[min, max]`). Supporting a new version
  **in addition** to the previous ones is a minor; dropping one is a major.
- In `0.x`, a minor may break (and the changelog says so).
- `@intijs/core` follows its own semver; its relation with Kitsuden always
  goes through the adapter.

### What the adapter does with all this

Lazily: building the adapter and **reading** do not query anything. Before
the **first write** it asks `/api/version` once:

| The API answers                                                      | The adapter                                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| contracts within `CONTRATOS_ADMITIDOS`                               | writes                                                                                                      |
| a contract the write uses **above** the supported one                | does not write; error asking to update `@intijs/adapter-kitsuden`                                           |
| a contract **below** the minimum                                     | does not write; error asking to update Kitsuden                                                             |
| does not declare a contract the write needs (e.g. `games-editorial`) | does not write that part; the error names the kon that serves it (usually it is disabled). The rest goes on |
| 404/405 (Kitsuden without the route)                                 | **warns** once and writes                                                                                   |
| network error, 5xx or something that is not Kitsuden                 | warns, writes, and asks again on the next write                                                             |

The adapter's messages are in Spanish. `checkCompatibility: false` turns the
check off; `adapter.checkCompatibility()` runs it by hand (for example, at
start).

## Compatibility matrix

| `@intijs/adapter-kitsuden` | understands `page-builder` / `games` / `games-editorial` | Kitsuden                                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.x (with the check)     | 1 / 1 / 1                                                | 0.9.0-beta with `/api/version` mounted: checked. Older Kitsuden (without the route): works with a warning, without the check; without the games editorial layer (before 2026-10-14), edits of game pages fail with 404 |

When a contract is bumped, add a new row here (and in Inti's documentation,
`apps/docs/src/content/docs/adapters/kitsuden.mdx`).

## The shared contract test

So that "still compatible" does not depend on memory:

- **Reference responses**: `packages/shared/contratos/inti/respuestas-de-referencia.json`.
  They are **real** responses: `tests/unit/contrato-inti.test.ts` generates
  them by mounting the real routers (page-builder, games, `/api/version`) on
  PGlite with a fixed seed, with the tables generated from the Drizzle schemas.
- **Kitsuden side** (vitest): on every run it repeats those requests and
  requires the same HTTP status and every field of the reference to still
  exist with the same type (new fields are allowed). It also checks that the
  file matches the current `CONTRATOS`.
- **Inti side** (`bun test`, `packages/adapter-kitsuden/tests/contrato.test.ts`):
  the adapter reads, orders and writes against those same responses and
  bodies. It keeps a copy in `tests/contrato/`; if the Kitsuden repository is
  next to it (by default it looks for `../cms`; with a clone named `kitsuden`,
  pass `KITSUDEN_REPO=../kitsuden`), it uses the canonical one and requires the
  copy to be identical.

When an API change is **intended**:

```bash
# 1. if it is incompatible, bump the contract in packages/shared/src/contratos.ts
# 2. regenerate the responses
ACTUALIZAR_CONTRATO_INTI=1 pnpm vitest run --config=tests/unit/vitest.config.ts tests/unit/contrato-inti.test.ts
# 3. copy them to the adapter and adjust whatever it no longer understands
cp packages/shared/contratos/inti/respuestas-de-referencia.json ../inti/packages/adapter-kitsuden/tests/contrato/
cd ../inti && KITSUDEN_REPO=../kitsuden bun test packages/adapter-kitsuden   # the path of your clone
```

If the change was **not** intended, the Kitsuden test fails with the route and
the field (`GET /api/games/slug/:slug → $.blocks[0].order: falta`, "missing")
before any editor notices.
