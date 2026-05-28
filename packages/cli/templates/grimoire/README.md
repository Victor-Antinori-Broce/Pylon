# grimoire-example

A minimal example grimoire for GremiusCMS. Use this as a template to build your own npm-installable grimoires.

## Quick Start

1. **Copy this template:**
   ```bash
   cp -r packages/cli/templates/grimoire packages/grimoires/grimoire-myfeature
   cd packages/grimoires/grimoire-myfeature
   ```

2. **Edit the manifest** (`package.json` or `grimoire.json`):
   - Change `name`, `id`, `description`
   - Update `gremius.tables` if you expose database tables
   - Add `gremius.dependencies.grimoires` if you depend on other grimoires

3. **Implement your schema** in `src/schema.ts`:
   - Export Drizzle `pgTable` definitions
   - The schema-merger auto-discovers this file at runtime

4. **Implement your router** in `src/index.ts`:
   - Export a `GrimoireDefinition` with `createRouter()`
   - Or export a Hono router directly (legacy mode)

5. **Add migrations** in `migrations/init.sql`:
   - These run automatically when the grimoire is installed via `gremius install`

6. **Build & publish:**
   ```bash
   npm run build
   npm publish --access public
   ```

## Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique grimoire ID (e.g. `grimoire-myfeature`) |
| `name` | ✅ | Human-readable name |
| `version` | ✅ | Semver version |
| `type` | ✅ | Always `"grimoire"` |
| `mount.path` | ❌ | Router mount path (default: `/api/custom/{id}`) |
| `dependencies.grimoires` | ❌ | Array of grimoire IDs this depends on |
| `tables` | ❌ | Tables exposed for the admin UI |
| `selfMigrating` | ❌ | If `true`, schema-merger skips this grimoire |

## Installation

Users install your grimoire with:

```bash
gremius install grimoire-myfeature
```

Or for scoped packages:

```bash
gremius install @mycompany/grimoire-myfeature
```

## License

MIT
