# 🚀 Gremius Basic Starter

> Zero to production in 5 minutes. The Django of the AI era.

## Quick Start

```bash
# 1. Create project
gremius new myapp --quickstart

# 2. Start everything (Docker + Database + Dev servers)
cd myapp
pnpm setup

# 3. Open browser
# API:    http://localhost:3000
# Admin:  http://localhost:3001
# Web:    http://localhost:3002
```

## What's Included

- ✅ **API** (Bun + Hono) - High-performance backend
- ✅ **Admin** (Svelte 5) - Auto-generated admin panel
- ✅ **Web** (Astro 5) - Frontend starter
- ✅ **Database** (PostgreSQL + pgvector)
- ✅ **Cache** (Valkey/Redis)
- ✅ **Storage** (MinIO S3-compatible)
- ✅ **Auth** (Better Auth with email/password)
- ✅ **MCP Server** - AI agents ready

## Project Structure

```
myapp/
├── apps/
│   ├── api/          # Backend API
│   ├── admin/        # Admin panel
│   └── web/          # Frontend website
├── packages/
│   └── shared/       # Shared types & utilities
├── docker-compose.yml
└── package.json
```

## Available Commands

```bash
pnpm dev          # Start all development servers
pnpm build        # Build for production
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
pnpm db:seed      # Seed with test data
```

## Default Credentials

After running `pnpm db:seed`:

- Email: `admin@gremius.dev`
- Password: `admin123`

## Next Steps

1. **Create your first content type:**

   ```bash
   gremius grimoire create posts
   ```

2. **Add AI agents:**
   - Go to Admin → AI Agents
   - Create an agent
   - Generate API key

3. **Deploy:**
   ```bash
   gremius deploy
   ```

## Documentation

- [Full Docs](https://docs.gremius.dev)
- [API Reference](https://docs.gremius.dev/api)
- [Grimoires Guide](https://docs.gremius.dev/grimoires)

## Support

- Discord: [discord.gg/gremius](https://discord.gg/gremius)
- GitHub Issues: [github.com/gremiuscms/gremius/issues](https://github.com/gremiuscms/gremius/issues)
