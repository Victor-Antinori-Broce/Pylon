# @gremius/shared

Shared types, schemas, and utilities for GremiusCMS.

## Installation

```bash
npm install @gremius/shared
# or
bun add @gremius/shared
```

## Usage

### Types

```typescript
import type { 
  DataSet, 
  DataEntry, 
  Game, 
  BlogPost,
  SiteSettings 
} from '@gremius/shared/types';
```

### Schemas (Zod)

```typescript
import { 
  DatasetDefinitionSchema,
  validateDatasetDefinition 
} from '@gremius/shared/schemas';

// Validate data
const result = validateDatasetDefinition(data);
if (result.success) {
  console.log('Valid:', result.data);
} else {
  console.error('Invalid:', result.error);
}
```

### Utilities

```typescript
import { 
  formatDate, 
  truncate, 
  buildCmsUrl,
  gameJsonLd 
} from '@gremius/shared/utils';

const formatted = formatDate(new Date());
const excerpt = truncate(longText, 100);
const structuredData = gameJsonLd(game);
```

### Constants

```typescript
import { 
  SITE_CONFIG, 
  BREAKPOINTS, 
  NEON_COLORS 
} from '@gremius/shared/constants';
```

## Exports

| Export Path | Description |
|-------------|-------------|
| `@gremius/shared` | All exports combined |
| `@gremius/shared/types` | TypeScript types |
| `@gremius/shared/schemas` | Zod schemas |
| `@gremius/shared/utils` | Utility functions |
| `@gremius/shared/constants` | Constants |

## License

MIT © GremiusCMS Contributors
