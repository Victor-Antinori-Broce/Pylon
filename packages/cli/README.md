# @gremius/cli

GremiusCMS CLI - Manage plugins, starters, and deployments

## Installation

```bash
npm install -g @gremius/cli
# or
pnpm add -g @gremius/cli
```

Or use without installing:

```bash
npx @gremius/cli <command>
```

## Commands

### `gremius new <name>`

Create a new GremiusCMS project from a starter/realm.

```bash
# Create project with default starter
gremius new my-website

# Create project with specific realm
gremius new my-game --realm esports

# Create project with additional grimoires
gremius new my-shop --realm ecommerce --grimoires stripe payments
```

**Available Realms (Starters):**

- `default` - Core functionality (datasets, media, blocks)
- `esports` - Gaming platform with tournaments, teams, matches
- `blog` - Content publishing with SEO
- `corporate` - Company website with team/services
- `lms` - Learning Management System with courses

### `gremius plugin install <package>`

Install a grimoire plugin from npm or marketplace.

```bash
# Install official grimoire (auto-resolves @gremius/grimoire-xxx)
gremius plugin install blog
gremius plugin install stripe
gremius plugin install shopify

# Install with specific version
gremius plugin install blog --version 1.2.0

# Install from scoped package
gremius plugin install @mycompany/grimoire-custom

# Install from GitHub
gremius plugin install owner/repo --source github
```

### `gremius plugin uninstall <package>`

Uninstall a grimoire plugin.

```bash
gremius plugin uninstall blog

# Uninstall and remove all data
gremius plugin uninstall blog --purge
```

### `gremius plugin list`

List installed grimoires.

```bash
# List installed
gremius plugin list

# List all (including available)
gremius plugin list --all

# Output as JSON
gremius plugin list --json
```

### `gremius plugin search <query>`

Search for grimoires in npm registry.

```bash
gremius plugin search payment
gremius plugin search ecommerce --limit 10
```

### `gremius plugin enable|disable <package>`

Enable or disable a grimoire without uninstalling.

```bash
gremius plugin enable blog
gremius plugin disable blog
```

### `gremius plugin update [package]`

Update grimoire(s) to latest version.

```bash
# Update specific grimoire
gremius plugin update blog

# Update all grimoires
gremius plugin update --all
```

### `gremius dev`

Start development server.

```bash
# Start all services
gremius dev

# Start only API
gremius dev --api-only

# Start only Admin
gremius dev --admin-only

# Custom port
gremius dev --port 4000
```

### `gremius build`

Build for production.

```bash
gremius build

# Analyze bundle
gremius build --analyze
```

### `gremius deploy`

Deploy to Gremius Cloud.

```bash
# Deploy preview
gremius deploy --preview

# Deploy to production
gremius deploy --prod
```

### `gremius realm list`

List available realms (starters).

```bash
gremius realm list
```

### `gremius realm switch <realm>`

Switch to a different realm.

```bash
gremius realm switch esports
```

## Creating a Grimoire Plugin

A grimoire is an npm package with a special structure:

```
my-grimoire/
├── package.json          # Must have "gremius.type": "grimoire"
├── grimoire.json         # Grimoire metadata
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
  "name": "@myscope/grimoire-myfeature",
  "version": "1.0.0",
  "gremius": {
    "type": "grimoire",
    "id": "grimoire-myfeature",
    "minVersion": "2.0.0"
  },
  "peerDependencies": {
    "@gremius/engine": "^2.0.0"
  }
}
```

### grimoire.json

```json
{
  "id": "grimoire-myfeature",
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
import { defineGrimoire, createGrimoireRouter } from "@gremius/shared";

export const grimoire = defineGrimoire({
  id: "grimoire-myfeature",
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
      ctx.logger.info("MyFeature grimoire started!");
    },
  },
});
```

## Publishing Grimoires

```bash
# Build your grimoire
npm run build

# Publish to npm
npm publish --access public

# Or publish to Gremius Marketplace (coming soon)
gremius publish
```

## Environment Variables

- `GREMIUS_TOKEN` - Auth token for cloud deployments
- `GREMIUS_API_URL` - Custom API endpoint
- `GREMIUS_MARKETPLACE_URL` - Custom marketplace endpoint

## License

MIT
