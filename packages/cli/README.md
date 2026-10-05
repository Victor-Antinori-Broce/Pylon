# @kitsuden/cli

Kitsuden CLI - Manage plugins, starters, and deployments

## Installation

```bash
npm install -g @kitsuden/cli
# or
pnpm add -g @kitsuden/cli
```

Or use without installing:

```bash
npx @kitsuden/cli <command>
```

## Commands

### `kitsuden new <name>`

Create a new Kitsuden project from a starter/grimoire.

```bash
# Create project with default starter
kitsuden new my-website

# Create project with specific grimoire
kitsuden new my-game --grimoire esports

# Create project with additional kons
kitsuden new my-shop --grimoire ecommerce --kons stripe payments
```

**Available Grimoires (Starters):**

- `default` - Core functionality (datasets, media, blocks)
- `esports` - Gaming platform with tournaments, teams, matches
- `blog` - Content publishing with SEO
- `corporate` - Company website with team/services
- `lms` - Learning Management System with courses

### `kitsuden plugin install <package>`

Install a kon plugin from npm or marketplace.

```bash
# Install official kon (auto-resolves @kitsuden/kon-xxx)
kitsuden plugin install blog
kitsuden plugin install stripe
kitsuden plugin install shopify

# Install with specific version
kitsuden plugin install blog --version 1.2.0

# Install from scoped package
kitsuden plugin install @mycompany/kon-custom

# Install from GitHub
kitsuden plugin install owner/repo --source github
```

### `kitsuden plugin uninstall <package>`

Uninstall a kon plugin.

```bash
kitsuden plugin uninstall blog

# Uninstall and remove all data
kitsuden plugin uninstall blog --purge
```

### `kitsuden plugin list`

List installed kons.

```bash
# List installed
kitsuden plugin list

# List all (including available)
kitsuden plugin list --all

# Output as JSON
kitsuden plugin list --json
```

### `kitsuden plugin search <query>`

Search for kons in npm registry.

```bash
kitsuden plugin search payment
kitsuden plugin search ecommerce --limit 10
```

### `kitsuden plugin enable|disable <package>`

Enable or disable a kon without uninstalling.

```bash
kitsuden plugin enable blog
kitsuden plugin disable blog
```

### `kitsuden plugin update [package]`

Update kon(s) to latest version.

```bash
# Update specific kon
kitsuden plugin update blog

# Update all kons
kitsuden plugin update --all
```

### `kitsuden dev`

Start development server.

```bash
# Start all services
kitsuden dev

# Start only API
kitsuden dev --api-only

# Start only Admin
kitsuden dev --admin-only

# Custom port
kitsuden dev --port 4000
```

### `kitsuden build`

Build for production.

```bash
kitsuden build

# Analyze bundle
kitsuden build --analyze
```

### `kitsuden deploy`

Deploy to Kitsuden Cloud.

```bash
# Deploy preview
kitsuden deploy --preview

# Deploy to production
kitsuden deploy --prod
```

### `kitsuden grimoire list`

List available grimoires (starters).

```bash
kitsuden grimoire list
```

### `kitsuden grimoire switch <grimoire>`

Switch to a different grimoire.

```bash
kitsuden grimoire switch esports
```

## Creating a Kon Plugin

A kon is an npm package with a special structure:

```
my-kon/
├── package.json          # Must have "kitsuden.type": "kon"
├── kon.json         # Kon metadata
├── index.ts              # Entry point
├── schema.ts             # Database schema (optional)
└── migrations/
│   └── init.sql          # SQL migrations (optional)
└── admin/                # Admin UI components (optional)
    └── MyView.svelte
```

### package.json

```json
{
  "name": "@myscope/kon-myfeature",
  "version": "1.0.0",
  "kitsuden": {
    "type": "kon",
    "id": "kon-myfeature",
    "minVersion": "2.0.0"
  },
  "peerDependencies": {
    "@kitsuden/engine": "^2.0.0"
  }
}
```

### kon.json

```json
{
  "id": "kon-myfeature",
  "name": "My Feature",
  "description": "Adds awesome functionality",
  "version": "1.0.0",
  "icon": "Star",
  "tables": ["my_table"],
  "mount": {
    "path": "/api/my-feature"
  }
}
```

### index.ts

```typescript
import { defineKon, createKonRouter } from "@kitsuden/shared";

export const kon = defineKon({
  id: "kon-myfeature",
  name: "My Feature",
  version: "1.0.0",

  createRouter: (ctx) => {
    const router = new Hono();

    router.get("/", async (c) => {
      const data = await ctx.db.instance.select().from(myTable);
      return c.json(data);
    });

    return router;
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("MyFeature kon started!");
    },
  },
});
```

## Publishing Kons

```bash
# Build your kon
npm run build

# Publish to npm
npm publish --access public

# Or publish to Kitsuden Marketplace (coming soon)
kitsuden publish
```

## Environment Variables

- `KITSUDEN_TOKEN` - Auth token for cloud deployments
- `KITSUDEN_API_URL` - Custom API endpoint
- `KITSUDEN_MARKETPLACE_URL` - Custom marketplace endpoint

## License

MIT
