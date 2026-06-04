# @gremius/sdk

Official JavaScript/TypeScript SDK for GremiusCMS — The Modular BaaS/CMS.

[![npm version](https://badge.fury.io/js/@gremius%2Fsdk.svg)](https://www.npmjs.com/package/@gremius/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎮 **Gaming-First** — Built for game data, tournaments, and esports
- 🔥 **Edge-Ready** — Works in Cloudflare Workers, Vercel Edge, Deno Deploy
- 📝 **Type-Safe** — Full TypeScript support with generic table types
- 🚀 **Zero Dependencies** — Lightweight, only uses native `fetch` and `WebSocket`
- ⚡ **Fast** — TOON format support for AI agents (60% fewer tokens)
- 🔒 **Secure** — Agent NHI tokens (`grm_agent_*`) + Bearer auth
- 🔄 **Real-time** — Live Query subscriptions via WebSocket

## Installation

```bash
# npm
npm install @gremius/sdk

# bun
bun add @gremius/sdk

# pnpm
pnpm add @gremius/sdk
```

## Quick Start

```typescript
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: 'https://api.yourgame.com',
  apiKey: 'grm_agent_your_agent_token'
});

// Explorer API — primary way to interact with data
const games = await gremius.from('games').list();
const game = await gremius.from('games').get('uuid-123');
const newGame = await gremius.from('games').create({ title: 'New Game' });
await gremius.from('games').update(newGame.id, { status: 'published' });
await gremius.from('games').delete(newGame.id);
```

## Usage

### Initialize Client

```typescript
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: 'https://api.yourgame.com',
  // Optional: Agent NHI token for authentication
  apiKey: process.env.GREMIUS_API_KEY
});
```

### CRUD via Explorer API (Recommended)

The `.from(table)` method returns a `TableRef` with full CRUD capabilities:

#### List with pagination, sorting, and filtering

```typescript
const games = await gremius.from('games').list();
console.log(games.data);           // Array of records
console.log(games.pagination);     // { page, limit, total, totalPages, hasNextPage, hasPrevPage }

// With options
const filtered = await gremius.from('games').list({
  limit: 10,
  page: 1,
  sort: 'title',
  dir: 'asc',
  filter_field: 'status',
  filter_op: 'equals',
  filter_value: 'published'
});
```

#### Get by ID

```typescript
const game = await gremius.from('games').get('uuid-123');
```

#### Create

```typescript
const newGame = await gremius.from('games').create({
  title: 'Elden Ring',
  slug: 'elden-ring',
  platforms: ['ps5', 'pc']
});
```

#### Update

```typescript
await gremius.from('games').update('uuid-123', {
  status: 'published'
});
```

#### Delete

```typescript
await gremius.from('games').delete('uuid-123');
```

#### Dropdown options (for foreign keys)

```typescript
const platforms = await gremius.from('platforms').options();
// [{ value: 'uuid-1', label: 'PlayStation 5' }, ...]
```

### TypeScript Support

```typescript
interface Game {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  platforms: string[];
  createdAt: string;
}

// Type-safe table reference
const games = gremius.from<Game>('games');
const allGames = await games.list();
// allGames.data is typed as Game[]
```

### Schema Introspection

```typescript
// Get column types, editability, and relations for a table
const schema = await gremius.schema('games');
console.log(schema.columns);
// [{ name: 'title', type: 'text', editable: true, nullable: false }, ...]

// List all available tables
const tables = await gremius.tables();
// [{ key: 'games', label: 'Games', icon: 'gamepad', rowCount: 42 }, ...]
```

### Module Management

```typescript
// List all grimoires (modules)
const modules = await gremius.modules.list();

// Toggle a grimoire on/off
await gremius.modules.toggle('academy');

// Get only enabled modules
const enabled = await gremius.modules.enabled();
```

### TOON Format (for AI Agents)

TOON reduces token usage by ~60% compared to JSON:

```typescript
const agent = new GremiusClient({
  url: 'https://api.yourgame.com',
  apiKey: 'grm_agent_xxx',
  format: 'toon'
});

const toonData = await agent.from('games').list();
// Returns parsed TOON data (same structure, optimized wire format)
```

### Error Handling

```typescript
import { GremiusClient, GremiusError } from '@gremius/sdk';

try {
  const games = await gremius.from('games').list();
} catch (error) {
  if (error instanceof GremiusError) {
    console.error(`HTTP ${error.statusCode}:`, error.message);
  } else {
    console.error('Network or unknown error:', error);
  }
}
```

### Real-time Subscriptions

```typescript
import { createRealtime } from '@gremius/sdk/realtime';

const rt = createRealtime('https://api.yourgame.com');

rt.onStateChange((state) => {
  console.log('Connection:', state); // 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
});

await rt.connect();

// Subscribe to dataset changes
const unsub = rt.subscribeToDataset('games-dataset-id', (event) => {
  console.log('Change:', event.event, event.entry);
});

// Presence (who's online)
rt.joinRoom('editor:doc-123');
rt.onPresence('editor:doc-123', (users) => {
  console.log('Online users:', users);
});

// Cleanup
unsub();
rt.disconnect();
```

### Health Check

```typescript
const healthy = await gremius.ping();
console.log('API is', healthy ? 'up' : 'down');
```

## Edge Runtime Support

Works in all edge runtimes with zero dependencies:

```typescript
// Cloudflare Workers
export default {
  async fetch(request: Request, env: Env) {
    const gremius = new GremiusClient({
      url: env.GREMIUS_URL,
      apiKey: env.GREMIUS_API_KEY
    });

    const games = await gremius.from('games').list();
    return Response.json(games);
  }
};

// Vercel Edge
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const gremius = new GremiusClient({
    url: process.env.GREMIUS_URL!,
    apiKey: process.env.GREMIUS_API_KEY
  });

  const games = await gremius.from('games').list();
  return new Response(JSON.stringify(games));
}
```

## Configuration Options

```typescript
interface GremiusClientConfig {
  /** Base URL of your Gremius API */
  url: string;
  /** Agent NHI token for authentication (optional) */
  apiKey?: string;
  /** Response format: 'json' (default) or 'toon' */
  format?: 'json' | 'toon';
}
```

## API Reference

### GremiusClient

Main class for interacting with GremiusCMS API.

#### `new GremiusClient(config)`

Creates a new client instance.

#### `from<T>(table: string): TableRef<T>`

Returns a table reference for Explorer-based CRUD operations. **This is the recommended API.**

#### `schema(table: string): Promise<SchemaInfo>`

Returns column definitions, types, and relation info for a table.

#### `tables(): Promise<TableListItem[]>`

Lists all available tables with metadata.

#### `collection<T>(name: string): CollectionRef<T>`

Legacy Dataset API (backward compatibility). Use `.from()` for new code.

#### `ping(): Promise<boolean>`

Health check — returns `true` if the API is reachable.

### TableRef

Primary CRUD interface. Returned by `.from(table)`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `list` | `(options?: ListOptions) => Promise<ListResponse<T>>` | List with pagination, sort, filter |
| `get` | `(id: string) => Promise<T>` | Get single record by ID |
| `create` | `(data: Partial<T>) => Promise<T>` | Create new record |
| `update` | `(id: string, data: Partial<T>) => Promise<T>` | Update existing record |
| `delete` | `(id: string) => Promise<void>` | Delete record |
| `options` | `() => Promise<OptionItem[]>` | Get dropdown options for FKs |

### GremiusError

```typescript
class GremiusError extends Error {
  statusCode: number; // HTTP status code
}
```

## Examples

### Next.js App Router

```typescript
// app/games/page.tsx
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: process.env.GREMIUS_URL!,
  apiKey: process.env.GREMIUS_API_KEY
});

export default async function GamesPage() {
  const games = await gremius.from('games').list({ limit: 10 });

  return (
    <ul>
      {games.data.map(game => (
        <li key={game.id}>{game.title}</li>
      ))}
    </ul>
  );
}
```

### Astro

```typescript
---
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: import.meta.env.GREMIUS_URL,
  apiKey: import.meta.env.GREMIUS_API_KEY
});

const games = await gremius.from('games').list();
---

<ul>
  {games.data.map(game => (
    <li>{game.title}</li>
  ))}
</ul>
```

### SvelteKit

```typescript
// +page.ts
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: import.meta.env.VITE_GREMIUS_URL,
  apiKey: import.meta.env.VITE_GREMIUS_API_KEY
});

export async function load() {
  const games = await gremius.from('games').list();
  return { games };
}
```

## License

MIT © GremiusCMS Contributors

## Links

- [Documentation](https://docs.gremius.dev)
- [GitHub](https://github.com/yourorg/gremius)
- [npm](https://www.npmjs.com/package/@gremius/sdk)
- [Issues](https://github.com/yourorg/gremius/issues)

---

Made with ❤️ for game developers
