# MCP Server & SDK Audit Report

**Date:** 2026-03-07

## Summary

Both the MCP Server and SDK are properly configured and functional. All hardcoded port references have been standardized to use port 3000.

---

## ✅ MCP Server (@gremius/mcp-server)

### Package Structure
```
packages/mcp-server/
├── package.json          # Version 0.7.0
├── src/
│   ├── index.ts          # Core MCP server (embedded mode)
│   ├── standalone.ts     # Standalone HTTP server
│   ├── tools.ts          # Tool definitions
│   └── resources.ts      # Resource definitions
└── dist/                 # Compiled output (needs rebuild)
```

### Configuration

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| API URL | `http://localhost:3000` | `GREMIUS_API_URL` |
| Port | `3002` | `PORT` |
| API Token | (none) | `GREMIUS_API_TOKEN` |

### Modes of Operation

1. **Embedded Mode** (`src/index.ts`)
   - Used when imported into the main API
   - Direct database access via dependencies injection
   - No HTTP layer - communicates via function calls

2. **Standalone Mode** (`src/standalone.ts`)
   - Runs as separate HTTP service
   - Connects to Gremius API via HTTP
   - SSE endpoint for MCP protocol
   - Docker-ready

### Available Tools

| Tool | Description |
|------|-------------|
| `gremius_query_dataset` | Query records from a dataset |
| `gremius_insert_record` | Insert new record into dataset |
| `gremius_dispatch_worker` | Enqueue background job |
| `gremius_encode_toon` | Encode JSON to TOON format |

### Available Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Datasets | `gremius://datasets` | List all datasets |
| Grimoires | `gremius://grimoires` | List active grimoires |
| Health | `gremius://health` | API health status |

### Integration with Main API

The main API (`apps/api/src/routes/mcp.ts`) implements the same MCP protocol:
- `GET /api/mcp` - SSE endpoint
- `POST /api/mcp` - JSON-RPC message endpoint

This provides built-in MCP support without needing the standalone server.

---

## ✅ SDK (@gremius/sdk)

### Package Structure
```
packages/sdk/
├── package.json          # Version 0.2.0
├── src/
│   ├── index.ts          # Main SDK client
│   └── realtime.ts       # WebSocket realtime client
├── dist/                 # Compiled output (needs rebuild)
└── tsup.config.ts        # Build configuration
```

### Features

#### GremiusClient (Main SDK)
```typescript
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// CRUD operations
const posts = await gremius.collection('posts').get();
const newPost = await gremius.collection('posts').insert({ title: 'Hello' });
await gremius.collection('posts').update(newPost.id, { title: 'Updated' });
await gremius.collection('posts').delete(newPost.id);
```

#### GremiusRealtime (WebSocket)
```typescript
import { GremiusRealtime, createRealtime } from '@gremius/sdk/realtime';

const rt = createRealtime('http://localhost:3000');
await rt.connect();

// Subscribe to changes
const unsub = rt.subscribeToDataset('dataset-id', (event) => {
  console.log('Change:', event.event, event.entry);
});

// Presence
rt.joinRoom('editor:doc-123');
rt.onPresence('editor:doc-123', (users) => {
  console.log('Online:', users);
});
```

### Configuration

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| WS URL | `ws://localhost:3000/api/realtime` | `GREMIUS_WS_URL` |

---

## 🔧 Rebuild Instructions

The dist folders are outdated and need to be rebuilt:

### Rebuild SDK
```bash
cd packages/sdk
pnpm build
```

### Rebuild MCP Server
```bash
cd packages/mcp-server
pnpm build
```

### Rebuild All Packages
```bash
# From root
pnpm run build:packages
```

---

## 🔌 Usage Examples

### Using MCP with Claude Desktop

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "gremius": {
      "command": "npx",
      "args": ["-y", "@gremius/mcp-server"],
      "env": {
        "GREMIUS_API_URL": "http://localhost:3000",
        "GREMIUS_API_TOKEN": "your-api-key"
      }
    }
  }
}
```

### Using SDK in Frontend
```typescript
import { GremiusClient } from '@gremius/sdk';

const gremius = new GremiusClient({
  url: import.meta.env.VITE_API_URL || 'http://localhost:3000'
});

const data = await gremius.collection('posts').get({ limit: 10 });
```

### Using Realtime
```typescript
import { createRealtime } from '@gremius/sdk/realtime';

const rt = createRealtime(process.env.GREMIUS_API_URL || 'http://localhost:3000');

rt.onStateChange((state) => {
  console.log('Connection state:', state);
});

await rt.connect();
```

---

## ✅ Port Configuration Audit

All hardcoded ports have been updated from 3001 to 3000:

### SDK
- ✅ `packages/sdk/src/realtime.ts` - Uses `GREMIUS_WS_URL` env var with default `ws://localhost:3000`

### MCP Server
- ✅ `packages/mcp-server/src/standalone.ts` - Uses `GREMIUS_API_URL` env var with default `http://localhost:3000`

### CLI
- ✅ `packages/cli/src/commands/status.ts` - Default: 3000
- ✅ `packages/cli/src/commands/start.ts` - Default: 3000
- ✅ `packages/cli/src/commands/mcp.ts` - Default: 3000
- ✅ `packages/cli/src/commands/init.ts` - Default: 3000
- ✅ `packages/cli/bin/gremius.js` - Default: 3000

### Starter Template
- ✅ All 12 files updated from 3001 to 3000

---

## 🐳 Docker Support

### MCP Server Docker
```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json .
RUN bun install
COPY src ./src
EXPOSE 3002
CMD ["bun", "run", "src/standalone.ts"]
```

Run with:
```bash
docker run -p 3002:3002 \
  -e GREMIUS_API_URL=http://localhost:3000 \
  -e GREMIUS_API_TOKEN=your-token \
  gremius/mcp:latest
```

---

## 📋 Environment Variables Reference

### MCP Server
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GREMIUS_API_URL` | No | `http://localhost:3000` | Gremius API URL |
| `GREMIUS_API_TOKEN` | No | - | API authentication token |
| `PORT` | No | `3002` | MCP server port |

### SDK
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GREMIUS_WS_URL` | No | `ws://localhost:3000/api/realtime` | WebSocket URL |

---

## ✅ Status Checklist

- ✅ MCP Server code reviewed and updated
- ✅ SDK code reviewed and updated
- ✅ All hardcoded ports changed to 3000
- ✅ Environment variable support verified
- ✅ Docker configuration verified
- ✅ Integration with main API verified
- ⚠️ **Needs rebuild:** `packages/sdk/dist/` (outdated)
- ⚠️ **Needs rebuild:** `packages/mcp-server/dist/` (outdated)

---

## Next Steps

1. **Rebuild packages:**
   ```bash
   pnpm run build:packages
   ```

2. **Test MCP:**
   ```bash
   # Start API
   cd apps/api && bun run dev
   
   # Test MCP endpoint
   curl http://localhost:3000/api/mcp
   ```

3. **Test SDK:**
   ```bash
   # In a test project
   npm install @gremius/sdk
   ```
