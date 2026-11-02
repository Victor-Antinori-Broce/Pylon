# @kitsuden/shared

Shared types, schemas, and utilities for Kitsuden.

## Installation

`@kitsuden/shared` is **not published on npm**. It is a workspace package of
the Kitsuden monorepo (`"@kitsuden/shared": "workspace:*"`). `pnpm install`
at the root builds it (its `prepare` script uses Bun); after changing
`src/`, rebuild it with `pnpm --filter @kitsuden/shared build`.

## Usage

### Types

```typescript
import type { DataSet, DataEntry, Game, BlogPost, SiteSettings } from "@kitsuden/shared/types";
```

### Schemas (Zod)

```typescript
import { DatasetDefinitionSchema, validateDatasetDefinition } from "@kitsuden/shared/schemas";

// Validate data
const result = validateDatasetDefinition(data);
if (result.success) {
  console.log("Valid:", result.data);
} else {
  console.error("Invalid:", result.error);
}
```

### Utilities

```typescript
import { formatDate, truncate, buildCmsUrl, gameJsonLd } from "@kitsuden/shared/utils";

const formatted = formatDate(new Date());
const excerpt = truncate(longText, 100);
const structuredData = gameJsonLd(game);
```

### Constants

```typescript
import { SITE_CONFIG, BREAKPOINTS, NEON_COLORS } from "@kitsuden/shared/constants";
```

## Exports

| Export Path                  | Description          |
| ---------------------------- | -------------------- |
| `@kitsuden/shared`           | All exports combined |
| `@kitsuden/shared/types`     | TypeScript types     |
| `@kitsuden/shared/schemas`   | Zod schemas          |
| `@kitsuden/shared/utils`     | Utility functions    |
| `@kitsuden/shared/constants` | Constants            |

## License

MIT © Kitsuden Contributors
