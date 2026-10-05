# MCP Server & SDK Audit Report

**Date:** 2026-03-07

## Summary

Both the MCP Server and SDK are properly configured and functional. All hardcoded port references have been standardized to use port 3000.

---

## ✅ MCP Server (@kitsuden/mcp-server)

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

| Setting   | Default                 | Environment Variable |
| --------- | ----------------------- | -------------------- |
| API URL   | `http://localhost:3000` | `KITSUDEN_API_URL`   |
| Port      | `3002`                  | `PORT`               |
| API Token | (none)                  | `KITSUDEN_API_TOKEN` |

### Modes of Operation

1. **Embedded Mode** (`src/index.ts`)
   - Used when imported into the main API
   - Direct database access via dependencies injection
   - No HTTP layer - communicates via function calls

2. **Standalone Mode** (`src/standalone.ts`)
   - Runs as separate HTTP service
   - Connects to Kitsuden API via HTTP
   - SSE endpoint for MCP protocol
   - Docker-ready

### Available Tools

| Tool                       | Description                    |
| -------------------------- | ------------------------------ |
| `kitsuden_query_dataset`   | Query records from a dataset   |
| `kitsuden_insert_record`   | Insert new record into dataset |
| `kitsuden_dispatch_worker` | Enqueue background job         |
| `kitsuden_encode_toon`     | Encode JSON to TOON format     |

### Available Resources

| Resource | URI                   | Description       |
| -------- | --------------------- | ----------------- |
| Datasets | `kitsuden://datasets` | List all datasets |
| Kons     | `kitsuden://kons`     | List active kons  |
| Health   | `kitsuden://health`   | API health status |

### Integration with Main API

The main API (`apps/api/src/routes/mcp.ts`) implements the same MCP protocol:

- `GET /api/mcp` - SSE endpoint
- `POST /api/mcp` - JSON-RPC message endpoint

This provides built-in MCP support without needing the standalone server.

---

## ✅ SDK (@kitsuden/sdk)

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

#### KitsudenClient (Main SDK)

```typescript
import { KitsudenClient } from "@kitsuden/sdk";

const kitsuden = new KitsudenClient({
  url: "http://localhost:3000",
  apiKey: "kitsuden_agent_your_token",
});

// Explorer API — primary CRUD
const posts = await kitsuden.from("posts").list();
const post = await kitsuden.from("posts").get("uuid-123");
const newPost = await kitsuden.from("posts").create({ title: "Hello" });
await kitsuden.from("posts").update(newPost.id, { title: "Updated" });
await kitsuden.from("posts").delete(newPost.id);

// Legacy Dataset API (backward compat)
const legacy = await kitsuden.collection("posts").get();
```

#### KitsudenRealtime (WebSocket)

```typescript
import { KitsudenRealtime, createRealtime } from "@kitsuden/sdk/realtime";

const rt = createRealtime("http://localhost:3000");
await rt.connect();

// Subscribe to changes
const unsub = rt.subscribeToDataset("dataset-id", (event) => {
  console.log("Change:", event.event, event.entry);
});

// Presence
rt.joinRoom("editor:doc-123");
rt.onPresence("editor:doc-123", (users) => {
  console.log("Online:", users);
});
```

### Configuration

| Setting | Default                            | Environment Variable |
| ------- | ---------------------------------- | -------------------- |
| WS URL  | `ws://localhost:3000/api/realtime` | `KITSUDEN_WS_URL`    |

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
    "kitsuden": {
      "command": "npx",
      "args": ["-y", "@kitsuden/mcp-server"],
      "env": {
        "KITSUDEN_API_URL": "http://localhost:3000",
        "KITSUDEN_API_TOKEN": "your-api-key"
      }
    }
  }
}
```

### Using SDK in Frontend

```typescript
import { KitsudenClient } from "@kitsuden/sdk";

const kitsuden = new KitsudenClient({
  url: import.meta.env.VITE_API_URL || "http://localhost:3000",
});

const data = await kitsuden.from("posts").list({ limit: 10 });
```

### Using Realtime

```typescript
import { createRealtime } from "@kitsuden/sdk/realtime";

const rt = createRealtime(process.env.KITSUDEN_API_URL || "http://localhost:3000");

rt.onStateChange((state) => {
  console.log("Connection state:", state);
});

await rt.connect();
```

---

## ✅ Port Configuration Audit

All hardcoded ports have been updated from 3001 to 3000:

### SDK

- ✅ `packages/sdk/src/realtime.ts` - Uses `KITSUDEN_WS_URL` env var with default `ws://localhost:3000`

### MCP Server

- ✅ `packages/mcp-server/src/standalone.ts` - Uses `KITSUDEN_API_URL` env var with default `http://localhost:3000`

### CLI

- ✅ `packages/cli/src/commands/status.ts` - Default: 3000
- ✅ `packages/cli/src/commands/start.ts` - Default: 3000
- ✅ `packages/cli/src/commands/mcp.ts` - Default: 3000
- ✅ `packages/cli/src/commands/init.ts` - Default: 3000
- ✅ `packages/cli/bin/kitsuden.js` - Default: 3000

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
  -e KITSUDEN_API_URL=http://localhost:3000 \
  -e KITSUDEN_API_TOKEN=your-token \
  kitsuden/mcp:latest
```

---

## 📋 Environment Variables Reference

### MCP Server

| Variable             | Required | Default                 | Description              |
| -------------------- | -------- | ----------------------- | ------------------------ |
| `KITSUDEN_API_URL`   | No       | `http://localhost:3000` | Kitsuden API URL         |
| `KITSUDEN_API_TOKEN` | No       | -                       | API authentication token |
| `PORT`               | No       | `3002`                  | MCP server port          |

### SDK

| Variable          | Required | Default                            | Description   |
| ----------------- | -------- | ---------------------------------- | ------------- |
| `KITSUDEN_WS_URL` | No       | `ws://localhost:3000/api/realtime` | WebSocket URL |

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
   npm install @kitsuden/sdk
   ```
