# kon-example

A minimal example kon for Kitsuden. Use this as a template to build your own npm-installable kons.

## Quick Start

1. **Copy this template:**

   ```bash
   cp -r packages/cli/templates/kon packages/kons/kon-myfeature
   cd packages/kons/kon-myfeature
   ```

2. **Edit the manifest** (`package.json` or `kon.json`):
   - Change `name`, `id`, `description`
   - Update `kitsuden.tables` if you expose database tables
   - Add `kitsuden.dependencies.kons` if you depend on other kons

3. **Implement your schema** in `src/schema.ts`:
   - Export Drizzle `pgTable` definitions
   - The schema-merger auto-discovers this file at runtime

4. **Implement your router** in `src/index.ts`:
   - Export a `KonDefinition` with `createRouter()`
   - Or export a Hono router directly (legacy mode)

5. **Add migrations** in `migrations/init.sql`:
   - These run automatically when the kon is installed via `kitsuden install`

6. **Build & publish:**
   ```bash
   npm run build
   npm publish --access public
   ```

## Manifest Fields

| Field               | Required | Description                                     |
| ------------------- | -------- | ----------------------------------------------- |
| `id`                | ✅       | Unique kon ID (e.g. `kon-myfeature`)            |
| `name`              | ✅       | Human-readable name                             |
| `version`           | ✅       | Semver version                                  |
| `type`              | ✅       | Always `"kon"`                                  |
| `mount.path`        | ❌       | Router mount path (default: `/api/custom/{id}`) |
| `dependencies.kons` | ❌       | Array of kon IDs this depends on                |
| `tables`            | ❌       | Tables exposed for the admin UI                 |
| `selfMigrating`     | ❌       | If `true`, schema-merger skips this kon         |

## Installation

Users install your kon with:

```bash
kitsuden install kon-myfeature
```

Or for scoped packages:

```bash
kitsuden install @mycompany/kon-myfeature
```

## License

MIT
