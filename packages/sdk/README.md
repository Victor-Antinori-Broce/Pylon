# @gremius/sdk

Official JavaScript/TypeScript SDK for GremiusCMS - The Gaming-First BaaS/CMS.

[![npm version](https://badge.fury.io/js/@gremius%2Fsdk.svg)](https://www.npmjs.com/package/@gremius/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎮 **Gaming-First** - Built for game data, tournaments, and esports
- 🔥 **Edge-Ready** - Works in Cloudflare Workers, Vercel Edge, Deno Deploy
- 📝 **Type-Safe** - Full TypeScript support with auto-generated types
- 🚀 **Zero Dependencies** - Lightweight, only uses native fetch
- ⚡ **Fast** - Optimized for performance with caching support
- 🔒 **Secure** - Built-in authentication and API key support

## Installation

```bash
# npm
npm install @gremius/sdk

# bun
bun add @gremius/sdk

# yarn
yarn add @gremius/sdk

# pnpm
pnpm add @gremius/sdk
```

## Quick Start

```typescript
import { GremiusClient } from '@gremius/sdk';

// Initialize client
const gremius = new GremiusClient({
  url: 'https://api.yourgame.com',
  apiKey: 'gremius_sk_your_api_key'
});

// Read data
const posts = await gremius.collection('posts').get();

// Create entry
const newPost = await gremius.collection('posts').insert({
  title: 'Hello World',
  content: 'My first post!'
});

// Update entry
await gremius.collection('posts').update(newPost.id, {
  title: 'Updated Title'
});

// Delete entry
await gremius.collection('posts').delete(newPost.id);
```

## Usage

### Initialize Client

```typescript
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: 'https://api.yourgame.com',
  // Optional: API key for authentication
  apiKey: process.env.GREMIUS_API_KEY
});
```

### CRUD Operations

#### Read (Get All)

```typescript
const posts = await gremius.collection('posts').get();
console.log(posts.docs); // Array of entries
console.log(posts.totalDocs); // Total count
```

#### Read (With Pagination)

```typescript
const posts = await gremius.collection('posts').get({
  limit: 10,
  page: 1,
  sort: '-createdAt',
  status: 'published'
});
```

#### Read (By ID)

```typescript
const post = await gremius.collection('posts').getById('123');
if (post) {
  console.log(post.title);
}
```

#### Create

```typescript
const newPost = await gremius.collection('posts').insert({
  title: 'New Post',
  content: 'Content here...',
  tags: ['gaming', 'news']
});
```

#### Update

```typescript
await gremius.collection('posts').update('123', {
  title: 'Updated Title'
});
```

#### Delete

```typescript
await gremius.collection('posts').delete('123');
```

### TypeScript Support

```typescript
interface Post {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

// Type-safe collection
const posts = gremius.collection<Post>('posts');
const allPosts = await posts.get();
// allPosts.docs is typed as Post[]
```

### Error Handling

```typescript
try {
  const posts = await gremius.collection('posts').get();
} catch (error) {
  if (error.message.includes('401')) {
    console.error('Authentication failed');
  } else if (error.message.includes('404')) {
    console.error('Collection not found');
  } else {
    console.error('Request failed:', error.message);
  }
}
```

## Configuration Options

```typescript
interface GremiusClientConfig {
  /** Base URL of your Gremius API */
  url: string;
  
  /** API Key for authentication (optional) */
  apiKey?: string;
}
```

## API Reference

### GremiusClient

Main class for interacting with GremiusCMS API.

#### `new GremiusClient(config)`

Creates a new client instance.

#### `collection<T>(name: string): CollectionRef<T>`

Returns a collection reference for CRUD operations.

### CollectionRef

Reference to a dataset/collection.

#### `get(options?: GetOptions): Promise<ListResponse<T>>`

Get all entries with optional filtering.

#### `getById(id: string): Promise<T | null>`

Get a single entry by ID.

#### `insert(data: Omit<T, 'id'>): Promise<T>`

Create a new entry.

#### `update(id: string, data: Partial<T>): Promise<T>`

Update an existing entry.

#### `delete(id: string): Promise<void>`

Delete an entry.

## Edge Runtime Support

Works in all edge runtimes:

```typescript
// Cloudflare Workers
export default {
  async fetch(request: Request, env: Env) {
    const gremius = new GremiusClient({
      url: env.GREMIUS_URL,
      apiKey: env.GREMIUS_API_KEY
    });
    
    const posts = await gremius.collection('posts').get();
    return Response.json(posts);
  }
};

// Vercel Edge
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const gremius = new GremiusClient({
    url: process.env.GREMIUS_URL!,
    apiKey: process.env.GREMIUS_API_KEY
  });
  
  const posts = await gremius.collection('posts').get();
  return new Response(JSON.stringify(posts));
}
```

## Examples

### Next.js App Router

```typescript
// app/posts/page.tsx
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: process.env.GREMIUS_URL!,
  apiKey: process.env.GREMIUS_API_KEY
});

export default async function PostsPage() {
  const posts = await gremius.collection('posts').get();
  
  return (
    <ul>
      {posts.docs.map(post => (
        <li key={post.id}>{post.title}</li>
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

const posts = await gremius.collection('posts').get();
---

<ul>
  {posts.docs.map(post => (
    <li>{post.title}</li>
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
  const posts = await gremius.collection('posts').get();
  return { posts };
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
