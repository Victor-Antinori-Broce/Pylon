# @kitsuden/sdk

Official JavaScript/TypeScript SDK for Kitsuden — The Modular BaaS/CMS.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎮 **Gaming-First** — Built for game data, tournaments, and esports
- 🔥 **Edge-Ready** — Works in Cloudflare Workers, Vercel Edge, Deno Deploy
- 📝 **Type-Safe** — Full TypeScript support with generic table types
- 🚀 **Zero Dependencies** — Lightweight, only uses native `fetch` and `WebSocket`
- ⚡ **Lean on the wire** — reads TOON and lets the server pick the shorter of compact JSON / TOON per response
- 🔒 **Secure** — Agent NHI tokens (`kitsuden_agent_*`) + Bearer auth
- 🔄 **Real-time** — Live Query subscriptions via WebSocket

## Installation

`@kitsuden/sdk` is **not published on npm**. Use it from the Kitsuden
monorepo: inside the workspace, depend on it with `"@kitsuden/sdk": "workspace:*"`
and build it with `pnpm --filter @kitsuden/sdk build`. Outside the monorepo,
build it and install the folder (or a `pnpm pack` tarball) by path.

## Typed client: 5 lines to your first call

Generated from the API's OpenAPI 3.1 (every `defineOperacion` of the installed kons and
the core: 700+ operations, one property per kon). Set `KITSUDEN_API_URL` (the API origin)
and `KITSUDEN_API_TOKEN` (`kitsuden_agent_…`):

```typescript
import { createKitsuden } from "@kitsuden/sdk";

const kitsuden = createKitsuden();
const res = await kitsuden.datasets.listarDatasets({ limit: 5 });
if (res.kind === "ok") console.log(res.data.docs.map((d) => d.name));
```

- Typed arguments (path and query flat, body under `body`: the MCP tool's shape) and typed
  responses; `KitsudenErrorCode` is the closed union of `KITSUDEN_E_*` codes.
- `202 KITSUDEN_E_APPROVAL_REQUIRED` comes back as `{ kind: "proposal_pending", proposal }`,
  never retried.
- Automatic `Idempotency-Key` on writes; retries only when safe, honouring `Retry-After`.
- `format: "json" | "toon" | "tron" | "auto"`, always decoded; `provenance: true` gives
  `meta.provenance` and `provenanceOf(row)`.
- `kitsuden.blog.listarEntradas.iterate({ limit: 50 })` walks every page.
- Streaming operations (`salida.flujo` on the server) return a typed `AsyncIterable`:
  `for await (const step of kitsuden.imports.progreso({ id })) …`. Standard Server-Sent
  Events underneath (no custom protocol); `event: error` throws `KitsudenApiError`, and
  breaking out of the loop aborts the request.
- Validate before sending with any Standard Schema consumer (Zod, Valibot, ArkType, form
  libraries): `operationSchemas(spec, "blog.crear-entrada").body` turns the operation's
  JSON Schema into a Standard Schema v1 validator; the spec ships as
  `@kitsuden/sdk/openapi.json`. `toStandardSchema(jsonSchema)` does it for any schema.
- Zero runtime dependencies: Node 18+, Bun, Deno and browsers.

Full guide: [docs/agents/clients.md](../../docs/agents/clients.md). Regenerate after an API
change with `pnpm sdk:openapi && pnpm sdk:generate` (CI runs `pnpm sdk:check`), or keep
`pnpm sdk:watch` running: it regenerates on every change to a `defineModelo` or
`defineOperacion` (about 3 s) and only rewrites the files that changed, so your editor
picks up the new types at once.

## Quick Start (CRUD helpers)

```typescript
import { KitsudenClient } from "@kitsuden/sdk";

const kitsuden = new KitsudenClient({
  url: "https://api.yourgame.com",
  apiKey: "kitsuden_agent_your_agent_token",
});

// Explorer API — primary way to interact with data
const games = await kitsuden.from("games").list();
const game = await kitsuden.from("games").get("uuid-123");
const newGame = await kitsuden.from("games").create({ title: "New Game" });
await kitsuden.from("games").update(newGame.id, { status: "published" });
await kitsuden.from("games").delete(newGame.id);
```

## Usage

### Initialize Client

```typescript
import { KitsudenClient } from "@kitsuden/sdk";

const kitsuden = new KitsudenClient({
  url: "https://api.yourgame.com",
  // Optional: Agent NHI token for authentication
  apiKey: process.env.KITSUDEN_API_KEY,
});
```

### CRUD via Explorer API (Recommended)

The `.from(table)` method returns a `TableRef` with full CRUD capabilities:

#### List with pagination, sorting, and filtering

```typescript
const games = await kitsuden.from("games").list();
console.log(games.data); // Array of records
console.log(games.pagination); // { page, limit, total, totalPages, hasNextPage, hasPrevPage }

// With options
const filtered = await kitsuden.from("games").list({
  limit: 10,
  page: 1,
  sort: "title",
  dir: "asc",
  filter_field: "status",
  filter_op: "equals",
  filter_value: "published",
});
```

#### Get by ID

```typescript
const game = await kitsuden.from("games").get("uuid-123");
```

#### Create

```typescript
const newGame = await kitsuden.from("games").create({
  title: "Elden Ring",
  slug: "elden-ring",
  platforms: ["ps5", "pc"],
});
```

#### Update

```typescript
await kitsuden.from("games").update("uuid-123", {
  status: "published",
});
```

#### Delete

```typescript
await kitsuden.from("games").delete("uuid-123");
```

#### Dropdown options (for foreign keys)

```typescript
const platforms = await kitsuden.from("platforms").options();
// [{ value: 'uuid-1', label: 'PlayStation 5' }, ...]
```

### TypeScript Support

```typescript
interface Game {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  platforms: string[];
  createdAt: string;
}

// Type-safe table reference
const games = kitsuden.from<Game>("games");
const allGames = await games.list();
// allGames.data is typed as Game[]
```

### Schema Introspection

```typescript
// Get column types, editability, and relations for a table
const schema = await kitsuden.schema("games");
console.log(schema.columns);
// [{ name: 'title', type: 'text', editable: true, nullable: false }, ...]

// List all available tables
const tables = await kitsuden.tables();
// [{ key: 'games', label: 'Games', icon: 'gamepad', rowCount: 42 }, ...]
```

### Module Management

```typescript
// List all kons (modules)
const modules = await kitsuden.modules.list();

// Toggle a kon on/off
await kitsuden.modules.toggle("academy");

// Get only enabled modules
const enabled = await kitsuden.modules.enabled();
```

### Wire formats: JSON, TOON, auto

The SDK always returns plain objects; `format` only changes what travels over
the wire:

- `"json"` (default): compact JSON.
- `"toon"`: [TOON](https://toonformat.dev). Shorter than JSON for flat, uniform
  lists (categories, tags, page lists); **longer** for nested records such as
  dataset entries. Measured numbers: `docs/agents/benchmarks.md` in the
  Kitsuden repository.
- `"auto"`: the server encodes each response as compact JSON and as TOON,
  checks that the TOON version decodes back to exactly the same data, and
  sends the shorter one (`Content-Type` says which).

```typescript
const agent = new KitsudenClient({
  url: "https://api.yourgame.com",
  apiKey: "kitsuden_agent_xxx",
  format: "auto",
});

const games = await agent.from("games").list(); // same objects as with "json"
```

The TOON codec is exported too: `import { encodeToon, decodeToon } from "@kitsuden/sdk"`.
The API can also answer in TRON (`Accept: application/vnd.tron`); the SDK does
not decode TRON, to stay dependency-free.

### Error Handling

```typescript
import { KitsudenClient, KitsudenError } from "@kitsuden/sdk";

try {
  const games = await kitsuden.from("games").list();
} catch (error) {
  if (error instanceof KitsudenError) {
    console.error(`HTTP ${error.statusCode}:`, error.message);
  } else {
    console.error("Network or unknown error:", error);
  }
}
```

### Real-time Subscriptions

```typescript
import { createRealtime } from "@kitsuden/sdk/realtime";

const rt = createRealtime("https://api.yourgame.com");

rt.onStateChange((state) => {
  console.log("Connection:", state); // 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
});

await rt.connect();

// Subscribe to dataset changes
const unsub = rt.subscribeToDataset("games-dataset-id", (event) => {
  console.log("Change:", event.event, event.entry);
});

// Presence (who's online)
rt.joinRoom("editor:doc-123");
rt.onPresence("editor:doc-123", (users) => {
  console.log("Online users:", users);
});

// Cleanup
unsub();
rt.disconnect();
```

### Health Check

```typescript
const healthy = await kitsuden.ping();
console.log("API is", healthy ? "up" : "down");
```

## Edge Runtime Support

Works in all edge runtimes with zero dependencies:

```typescript
// Cloudflare Workers
export default {
  async fetch(request: Request, env: Env) {
    const kitsuden = new KitsudenClient({
      url: env.KITSUDEN_URL,
      apiKey: env.KITSUDEN_API_KEY,
    });

    const games = await kitsuden.from("games").list();
    return Response.json(games);
  },
};

// Vercel Edge
export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const kitsuden = new KitsudenClient({
    url: process.env.KITSUDEN_URL!,
    apiKey: process.env.KITSUDEN_API_KEY,
  });

  const games = await kitsuden.from("games").list();
  return new Response(JSON.stringify(games));
}
```

## Configuration Options

```typescript
interface KitsudenClientConfig {
  /** Base URL of your Kitsuden API */
  url: string;
  /** Agent NHI token for authentication (optional) */
  apiKey?: string;
  /** Wire format: 'json' (default), 'toon' or 'auto' */
  format?: "json" | "toon" | "auto";
}
```

## API Reference

### KitsudenClient

Main class for interacting with Kitsuden API.

#### `new KitsudenClient(config)`

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

| Method    | Signature                                             | Description                        |
| --------- | ----------------------------------------------------- | ---------------------------------- |
| `list`    | `(options?: ListOptions) => Promise<ListResponse<T>>` | List with pagination, sort, filter |
| `get`     | `(id: string) => Promise<T>`                          | Get single record by ID            |
| `create`  | `(data: Partial<T>) => Promise<T>`                    | Create new record                  |
| `update`  | `(id: string, data: Partial<T>) => Promise<T>`        | Update existing record             |
| `delete`  | `(id: string) => Promise<void>`                       | Delete record                      |
| `options` | `() => Promise<OptionItem[]>`                         | Get dropdown options for FKs       |

### KitsudenError

```typescript
class KitsudenError extends Error {
  statusCode: number; // HTTP status code
}
```

## Examples

### Next.js App Router

```typescript
// app/games/page.tsx
import { KitsudenClient } from '@kitsuden/sdk';

const kitsuden = new KitsudenClient({
  url: process.env.KITSUDEN_URL!,
  apiKey: process.env.KITSUDEN_API_KEY
});

export default async function GamesPage() {
  const games = await kitsuden.from('games').list({ limit: 10 });

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
import { KitsudenClient } from '@kitsuden/sdk';

const kitsuden = new KitsudenClient({
  url: import.meta.env.KITSUDEN_URL,
  apiKey: import.meta.env.KITSUDEN_API_KEY
});

const games = await kitsuden.from('games').list();
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
import { KitsudenClient } from "@kitsuden/sdk";

const kitsuden = new KitsudenClient({
  url: import.meta.env.VITE_KITSUDEN_URL,
  apiKey: import.meta.env.VITE_KITSUDEN_API_KEY,
});

export async function load() {
  const games = await kitsuden.from("games").list();
  return { games };
}
```

## License

MIT © Kitsuden Contributors

## Links

- [GitHub](https://github.com/Victor-Antinori-Broce/kitsuden)
- [Issues](https://github.com/Victor-Antinori-Broce/kitsuden/issues)

---

Made with ❤️ for game developers
