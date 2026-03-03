# 🎮 Gremius Blog Starter Template

Official Astro + Vue starter template for building public-facing sites powered by the **Gremius BaaS** API.

## Quick Start

```bash
# From the monorepo root
pnpm install
pnpm --filter @gremius/starter-blog dev
```

## Configuration

Create a `.env` file:

```env
PUBLIC_API_URL=http://localhost:3001
PUBLIC_SITE_URL=http://localhost:4321
```

## Architecture

```
src/
├── components/        # Astro components + Vue islands
│   ├── blocks/        # Block-based content rendering
│   ├── islands/       # Vue interactive components (client:load)
│   ├── games/         # Game-specific components
│   └── themes/        # Theme-specific overrides
├── layouts/           # BaseLayout.astro
├── lib/
│   └── cms.ts         # Typed API client for Gremius BaaS
├── pages/             # Astro file-based routing
│   ├── blog/          # Blog listing + [slug] detail
│   ├── games/         # Games catalog + [slug] detail
│   ├── data/          # Public datasets
│   ├── academy/       # Academy / courses
│   └── share/form/    # Public forms
├── stores/            # State management
└── styles/            # Global CSS
```

## Data Fetching

All data is fetched from the Gremius REST API via the typed `cms` client:

```typescript
import { cms } from "../lib/cms";

// List games
const { docs: games } = await cms.games.list({ limit: 12 });

// Get a single post by slug
const post = await cms.posts.getBySlug("my-post");
```

## Stack

- **[Astro 5](https://astro.build)** — Static-first with hybrid SSR
- **[Vue 3](https://vuejs.org)** — Interactive islands
- **[Tailwind CSS](https://tailwindcss.com)** — Styling
- **[Gremius BaaS](https://github.com/gremiuscms)** — Backend API

## License

MIT
