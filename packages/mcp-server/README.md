# @kitsuden/mcp-server

Enterprise-grade [Model Context Protocol](https://modelcontextprotocol.io) server for Kitsuden CMS. Connects AI agents (Claude, Cursor, Windsurf, VS Code Copilot) to your Kitsuden backend.

## 🚀 Quick Start

The package is **not published on npm** and there is no published Docker
image. Build and run it from the Kitsuden monorepo (it runs on Bun):

```bash
pnpm --filter @kitsuden/mcp-server build
KITSUDEN_API_URL=http://localhost:3000 KITSUDEN_API_TOKEN=kitsuden_agent_… \
  bun run packages/mcp-server/dist/standalone.js        # listens on :3002
```

The API also has its own MCP endpoint at `/api/mcp` (with `ENABLE_MCP=true`,
the default in `docker-compose.yml`). `docker/mcp/Dockerfile` builds an image
of this server locally (`pnpm docker:build:mcp`; not tested).

## 🔧 IDE Setup

```bash
# Auto-generate config for your IDE
kitsuden mcp --ide cursor    # Creates .cursor/mcp.json
kitsuden mcp --ide claude    # Prints Claude Desktop config
kitsuden mcp --ide vscode    # Prints VS Code config
kitsuden mcp --ide windsurf  # Prints Windsurf config
```

Or visit `http://localhost:3002/ide-config/:ide` while the server is running.

### stdio: one server per agent

`--stdio` runs the server over stdin/stdout with no port. The MCP client
starts it, so each agent gets its own process and its own token, and the audit
log tells them apart. The token is read only from `KITSUDEN_API_TOKEN`; keep it
out of config files with `${KITSUDEN_API_TOKEN}`:

```json
{
  "mcpServers": {
    "kitsuden": {
      "type": "stdio",
      "command": "kitsuden",
      "args": ["mcp", "--stdio"],
      "env": {
        "KITSUDEN_API_URL": "${KITSUDEN_API_URL}",
        "KITSUDEN_API_TOKEN": "${KITSUDEN_API_TOKEN}"
      }
    }
  }
}
```

`kitsuden mcp --stdio` finds this package from the current directory upwards
(the monorepo) or next to the CLI; `KITSUDEN_MCP_ENTRY` points it elsewhere.
Without the CLI: `bun run packages/mcp-server/src/standalone.ts --stdio`.
See `docs/agents/orca.md` for running several agents side by side.

### Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "kitsuden": {
      "url": "http://localhost:3002/sse"
    }
  }
}
```

### Claude Desktop

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "kitsuden": {
      "command": "bun",
      "args": ["run", "/path/to/kitsuden/packages/mcp-server/dist/standalone.js"],
      "env": {
        "KITSUDEN_API_URL": "http://localhost:3000",
        "KITSUDEN_API_TOKEN": "<your-api-key>"
      }
    }
  }
}
```

## 🛠️ Tools (11)

| Tool                     | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `kitsuden_list_tables`   | Discover all data tables with row counts                          |
| `kitsuden_query_table`   | Query records with pagination, sort, filter. Result in the shortest lossless format (compact JSON, TOON or TRON; `format: "auto"`) |
| `kitsuden_create_record` | Create a new record in any table                                  |
| `kitsuden_update_record` | Update a record by ID                                             |
| `kitsuden_delete_record` | Delete a record by ID                                             |
| `kitsuden_get_schema`    | Get JSON Schema for a table (fields, types, relations)            |
| `kitsuden_list_modules`  | List all kon modules + status                                     |
| `kitsuden_toggle_module` | Enable/disable a module                                           |
| `kitsuden_encode_toon`   | Encode JSON → TOON; says how many characters TOON and compact JSON take |
| `kitsuden_list_datasets` | List dynamic datasets                                             |
| `kitsuden_api_request`   | Raw API request (escape hatch)                                    |

## 📚 Resources (5)

| Resource | URI                                    |
| -------- | -------------------------------------- |
| Tables   | `kitsuden://tables`                    |
| Modules  | `kitsuden://modules`                   |
| Health   | `kitsuden://health`                    |
| Datasets | `kitsuden://datasets`                  |
| Schema   | `kitsuden://schema/{table}` (template) |

## 🔐 Authentication

Set `KITSUDEN_API_TOKEN` to a valid Agent NHI token (`kitsuden_agent_*`). Legacy API keys (`kitsuden_sk_*`) are deprecated:

```bash
# Recommended: Agent NHI token
KITSUDEN_API_TOKEN=kitsuden_agent_xxx kitsuden mcp

# Deprecated: Legacy API key (will be removed)
KITSUDEN_API_TOKEN=kitsuden_sk_xxx kitsuden mcp
```

## 📡 Endpoints

| Endpoint               | Description                   |
| ---------------------- | ----------------------------- |
| `GET /health`          | Server health + tool count    |
| `GET /sse`             | SSE transport for MCP clients |
| `POST /messages`       | JSON-RPC messages             |
| `GET /ide-config`      | List supported IDEs           |
| `GET /ide-config/:ide` | Get config for specific IDE   |

## ⚙️ Environment Variables

| Variable             | Default                 | Description            |
| -------------------- | ----------------------- | ---------------------- |
| `KITSUDEN_API_URL`   | `http://localhost:3000` | Kitsuden API base URL  |
| `KITSUDEN_API_TOKEN` | (empty)                 | API authentication key |
| `PORT`               | `3002`                  | MCP server port        |
