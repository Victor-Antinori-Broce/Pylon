# Grimoire NPM Package Template

Standard structure for a GremiusCMS grimoire distributed via npm.

## Directory Structure

```
grimoire-<name>/
├── package.json          # Must include "gremius.type": "grimoire"
├── grimoire.json         # Manifest: tables, dependencies, admin views
├── index.ts              # Entry point: exports grimoire definition
├── schema.ts             # Drizzle ORM schema (exported for schema-merger)
├── routes.ts             # Hono router factory
├── migrations/           # SQL migrations (run by `gremius install`)
│   └── 0000_initial.sql
├── tsconfig.json
└── README.md
```

## Key Files

### package.json
```json
{
  "name": "grimoire-<name>",
  "type": "module",
  "main": "./dist/index.js",
  "gremius": {
    "type": "grimoire",
    "id": "grimoire-<name>",
    "name": "My Grimoire",
    "minVersion": "0.8.0"
  }
}
```

### grimoire.json
```json
{
  "id": "grimoire-<name>",
  "name": "My Grimoire",
  "version": "1.0.0",
  "type": "grimoire",
  "tables": [{ "name": "my_table", "label": "My Table" }],
  "dependencies": {
    "grimoires": ["grimoire-media"],
    "core": ["auth"]
  },
  "admin": {
    "category": "content",
    "views": [{ "id": "grid", "type": "grid", "title": "All", "table": "my_table" }]
  }
}
```

### index.ts
Must export a `GrimoireDefinition` via `defineGrimoire()`:
- `id`: unique grimoire identifier
- `createRouter`: factory function `(ctx: GrimoireContext) => Hono`
- `mountPath`: API route prefix (e.g. `/api/my-table`)
- `tables`: list of table names managed by this grimoire
- `dependencies.grimoires`: other grimoires required

### schema.ts
Export Drizzle `pgTable` definitions. The schema-merger will dynamically
import this file at runtime. Use `migrations/` for production DDL to avoid
PostgreSQL enum conflicts with other grimoires.

### migrations/
Place `.sql` files here. They are executed in alphabetical order by
`gremius install`. Use `IF NOT EXISTS` for safe idempotent execution.

## Publishing

```bash
npm run build
npm publish --access public
```

## Installation

Users install your grimoire with:

```bash
gremius install grimoire-<name>
```

Or scoped:

```bash
gremius install @my-org/grimoire-<name>
```
