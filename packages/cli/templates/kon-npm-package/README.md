# Kon NPM Package Template

Standard structure for a Kitsuden kon distributed via npm.

## Directory Structure

```
kon-<name>/
├── package.json          # Must include "kitsuden.type": "kon"
├── kon.json         # Manifest: tables, dependencies, admin views
├── index.ts              # Entry point: exports kon definition
├── schema.ts             # Drizzle ORM schema (exported for schema-merger)
├── routes.ts             # Hono router factory
├── migrations/           # SQL migrations (run by `kitsuden install`)
│   └── 0000_initial.sql
├── tsconfig.json
└── README.md
```

## Key Files

### package.json

```json
{
  "name": "kon-<name>",
  "type": "module",
  "main": "./dist/index.js",
  "kitsuden": {
    "type": "kon",
    "id": "kon-<name>",
    "name": "My Kon",
    "minVersion": "0.8.0"
  }
}
```

### kon.json

```json
{
  "id": "kon-<name>",
  "name": "My Kon",
  "version": "1.0.0",
  "type": "kon",
  "tables": [{ "name": "my_table", "label": "My Table" }],
  "dependencies": {
    "kons": ["kon-media"],
    "core": ["auth"]
  },
  "admin": {
    "category": "content",
    "views": [{ "id": "grid", "type": "grid", "title": "All", "table": "my_table" }]
  }
}
```

### index.ts

Must export a `KonDefinition` via `defineKon()`:

- `id`: unique kon identifier
- `createRouter`: factory function `(ctx: KonContext) => Hono`
- `mountPath`: API route prefix (e.g. `/api/my-table`)
- `tables`: list of table names managed by this kon
- `dependencies.kons`: other kons required

### schema.ts

Export Drizzle `pgTable` definitions. The schema-merger will dynamically
import this file at runtime. Use `migrations/` for production DDL to avoid
PostgreSQL enum conflicts with other kons.

### migrations/

Place `.sql` files here. They are executed in alphabetical order by
`kitsuden install`. Use `IF NOT EXISTS` for safe idempotent execution.

## Publishing

```bash
npm run build
npm publish --access public
```

## Installation

Users install your kon with:

```bash
kitsuden install kon-<name>
```

Or scoped:

```bash
kitsuden install @my-org/kon-<name>
```
