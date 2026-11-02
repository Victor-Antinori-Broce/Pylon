# @kitsuden/cli

Command-line tools for [Kitsuden](https://github.com/Victor-Antinori-Broce/kitsuden).

This README documents the commands that are tested (`packages/cli/tests`):

- `kitsuden new` creates a **frontend website** that reads from a Kitsuden API.
- `kitsuden make` generates code **inside the Kitsuden monorepo**: a kon, a policy, a request, a job or a test.

`kitsuden --help` also lists other commands (`init`, `dev`, `deploy`, `migrate`, `gen types` and more). They are experimental, they are not covered by these tests, and this README does not document them.

## Requirements

- Node.js 22.12 or newer and pnpm 9 or newer.
- For `kitsuden make`: a clone of the Kitsuden repository with its dependencies installed (`pnpm install`).

From the Kitsuden repository, build the CLI and run it with Node:

```bash
pnpm --filter @kitsuden/cli build
node packages/cli/dist/index.js --help
```

The package is not on npm yet. The examples below call it `kitsuden`.

## `kitsuden new <name>`

Creates a website from the neutral starter (`packages/starters/kitsuden-starter-basic`). The starter is an Astro 7 server-rendered site that shows page-builder pages, the blog and the media library. Inti visual editing is optional. The starter's own README is copied into the project and explains all of this.

```bash
kitsuden new my-site --api-url http://localhost:3000
```

The command:

1. copies the starter into `./my-site`, leaving out `node_modules`, `dist`, `.astro`, `.env` and other local state;
2. renames the package to `my-site` and removes the monorepo's `repository`, `author` and `license` fields;
3. writes `.env` from `.env.example`, setting `KITSUDEN_API_URL`, `SITE_URL` and `SITE_NAME` (`KITSUDEN_SITE_KEY` stays commented out because it is a secret: add it by hand);
4. runs `pnpm install` if you passed `--install` or `--quickstart`;
5. prints the next steps.

Real output (2026-10-18):

```
✔ Created …\my-site
  starter: …\packages\starters\kitsuden-starter-basic (monorepo)
  .env: KITSUDEN_API_URL=http://localhost:3000 SITE_URL=http://localhost:4321

Next steps

  cd my-site
  pnpm install
  pnpm dev            # http://localhost:4321 (needs the API running)
  pnpm build          # production build; it does not call the API
  pnpm start          # serve dist/ (reads KITSUDEN_API_URL at start)
```

| Option               | Effect                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `--api-url <url>`    | `KITSUDEN_API_URL` in `.env`: where the site's server reaches the API. Default `http://localhost:3000`.  |
| `--site-url <url>`   | `SITE_URL`: the public origin, used for canonical URLs and the sitemap. Default `http://localhost:4321`. |
| `--site-name <name>` | `SITE_NAME`. Default: the project name.                                                                  |
| `--install`          | Run `pnpm install` in the new project.                                                                   |
| `--quickstart`       | Ask no questions, use the defaults and run `pnpm install`.                                               |
| `-y`, `--yes`        | Ask no questions and use the options or the defaults.                                                    |
| `--from <dir>`       | Copy this starter folder instead of the default one.                                                     |
| `--api`              | Print how to get a Kitsuden API running. Works with or without a name.                                   |

In a terminal, `new` asks for the API URL unless you passed `--api-url`, `--yes` or `--quickstart`. Without a terminal (CI, pipes) it never asks a question. It refuses to write into a folder that already has files in it.

The command looks for the starter in this order: the `--from` folder, then the copy inside the CLI package (`templates/starter-basic`, which `prepack` adds when the package is packed), then the monorepo's `packages/starters/kitsuden-starter-basic`.

### The API is not created

`kitsuden new` creates only the website. There are no published Kitsuden API images yet, so the CLI does not generate a `docker-compose.yml` for the API. Such a file would point to images that do not exist. Install the API from the Kitsuden repository by following `docs/instalacion/` (written in Spanish):

- `servidor.md`: Docker (recommended).
- `local.md`: local development with Bun, Postgres and Valkey.
- `primer-arranque.md`: migrations and the first admin.

`kitsuden new --api` prints the same pointers.

## `kitsuden kon add|remove|list`

Kons are not part of the Kitsuden core: they are installed from
[kitsuden-kons](https://github.com/Victor-Antinori-Broce/kitsuden-kons) (or any
repository with `kons/<kon-id>/kon.json`).

```bash
kitsuden kon add blog                         # from ../kitsuden-kons, else the official repo
kitsuden kon add shop --from https://github.com/acme/kons.git --ref v1.2.0
kitsuden kon add blog --link                  # use it in place (kon development)
kitsuden kon list [--available] [--json]
kitsuden kon remove blog                      # tables and data stay
```

`add` checks the kon's `sdk` against this Kitsuden (`GET /api/version` of
`--api-url`, or the core's code), installs its kon dependencies, copies it to
`packages/kons/<kon-id>/`, declares it in `kitsuden.kons.json`, runs
`pnpm install` and `apps/api/scripts/migrate.ts --kon <kon-id>`. It refuses to
overwrite a copy with local changes unless `--force`. Details:
[docs/kons/installing.md](../../docs/kons/installing.md).

## `kitsuden make <kind> <name>`

Run it inside the Kitsuden monorepo. It finds the repository root from the current folder. You can also give the root with `--root <dir>`.

### `make kon <name>`

```bash
kitsuden make kon recipes
```

This generates a minimal kon with the same layout as the kons already in `packages/kons`:

```
packages/kons/kon-recipes/
  kon.json                     $schema, tier, icon, tables, admin view, mount path
  package.json                 files[], typecheck script, peerDependencies
  tsconfig.json
  index.ts                     export const kon = defineKon({...})
  recipes.schema.ts            Drizzle table (types only)
  recipes.policy.ts            registerRecipesPolicy(), deny by default
  recipes.routes.ts            CRUD with authorize/can and validateRequest
  migrations/0000_inicial.sql  creates recipes_items
  README.md
tests/unit/kon-recipes.test.ts route tests on PGlite, as a non-superuser role
```

The generated kon is a list of items, each with a title, a body and a status (`draft` or `published`). Anyone can read published items. Only `admin` and `editor` can see drafts and write. The tables are created by the migration, never at runtime.

Options: `--icon <Name>` takes a lucide icon that must be in the admin's icon map (default `Package`). `--title <text>` and `--description <text>` set the kon's name and description. `--force` overwrites the generated files of an existing kon. The command refuses names that are not lowercase-and-dashes, kons that already exist, mount paths or table names that another kon uses, and icons that the admin cannot show.

Next steps after generating:

```bash
pnpm install                         # registers the new workspace package (updates pnpm-lock.yaml)
pnpm test:unit -- kon-recipes
pnpm --filter @kitsuden/kon-recipes typecheck
pnpm db:migrate                      # creates recipes_items
```

Then enable the kon in the admin (Modules).

`create-kon <name>` and `kon:create <name>` are aliases of `make kon`.

### `make policy <Name> --kon <kon>`

```bash
kitsuden make policy Draft --kon recipes
```

Policies live in the kon that owns the resource. The command adds `definePolicy("recipes-draft", …)` inside `registerRecipesPolicy()` in `recipes.policy.ts`. If the kon has no policy file yet, it creates `<kon>.policy.ts` with a `register<Kon>Policy()` function and tells you how to import it from the routes and how to add it to `files[]`. Without `--kon` the command stops with an error, because the API has no policies folder that anything loads.

### `make request`, `make job`, `make test`

| Command                              | Writes                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `make request CreatePost --kon blog` | `packages/kons/kon-blog/create-post.request.ts` (zod schema and `validateRequest` middleware) |
| `make job SendEmail --kon blog`      | `packages/kons/kon-blog/send-email.job.ts`                                                    |
| `make test search --kon blog`        | `tests/unit/kon-blog-search.test.ts` (vitest)                                                 |
| `make request CreatePost`            | `apps/api/src/requests/create-post.request.ts`                                                |
| `make job SendEmail`                 | `apps/api/src/jobs/send-email.job.ts`                                                         |
| `make test payment`                  | `apps/api/src/tests-unit/payment.test.ts` (bun:test)                                          |

These files are not imported by anything until you import them. When `index.ts` imports a new kon file, add that file to the kon's `files[]`.

## Tests

```bash
pnpm --filter @kitsuden/cli build
pnpm --filter @kitsuden/cli test
```

- `tests/new.test.mjs` runs `kitsuden new` in a temporary folder with an API URL where nothing listens. It checks what was copied, the package name and `.env`. Then it runs `pnpm install` and `pnpm build` on the new project, so it needs network access. Set `KITSUDEN_CLI_SIN_INSTALAR=1` to skip that last step.
- `tests/kon.test.mjs` runs `kon add|list|remove` with the built CLI on a fake project and a fake kons repository in a temporary folder: copy without `node_modules`, kon dependencies (manifest and peers), the migration runner called with `--kon <id>`, SDK refusal, local-change protection, `--link`, `--enable`, and `remove` refusing a kon another one depends on.
- `tests/make-kon.test.mjs` copies the parts of the monorepo that the kon guards read into a temporary folder and links the existing `node_modules`. It then runs `make kon` and `make policy` there. It also runs the repository's kon guards (`kon-manifest`, `kon-loadable`, `tablas-de-kons`, `kons-no-crean-tablas`, `iconos-de-kons`, `paquete-publicado-completo`, `kon-typecheck-coverage`, `kon-registry-completo`), the generated route test and `tsc --noEmit` on the new kon. The real repository is not modified.

## License

MIT
