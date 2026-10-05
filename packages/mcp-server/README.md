# @kitsuden/mcp-server

Enterprise-grade [Model Context Protocol](https://modelcontextprotocol.io) server for Kitsuden CMS. Connects AI agents (Claude, Cursor, Windsurf, VS Code Copilot) to your Kitsuden backend.

## 🚀 Quick Start

```bash
# Via CLI (auto-starts Docker container)
kitsuden mcp

# Via Docker
docker run -p 3002:3002 -e KITSUDEN_API_URL=http://localhost:3001 kitsuden/mcp:latest

# Via npx
npx @kitsuden/mcp-server
```

## 🔧 IDE Setup

```bash
# Auto-generate config for your IDE
kitsuden mcp --ide cursor    # Creates .cursor/mcp.json
kitsuden mcp --ide claude    # Prints Claude Desktop config
kitsuden mcp --ide vscode    # Prints VS Code config
kitsuden mcp --ide windsurf  # Prints Windsurf config
```

Or visit `http://localhost:3002/ide-config/:ide` while the server is running.

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
      "command": "npx",
      "args": ["-y", "@kitsuden/mcp-server"],
      "env": {
        "KITSUDEN_API_URL": "http://localhost:3001",
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
| `kitsuden_query_table`   | Query records with pagination, sort, filter. Supports TOON format |
| `kitsuden_create_record` | Create a new record in any table                                  |
| `kitsuden_update_record` | Update a record by ID                                             |
| `kitsuden_delete_record` | Delete a record by ID                                             |
| `kitsuden_get_schema`    | Get JSON Schema for a table (fields, types, relations)            |
| `kitsuden_list_modules`  | List all kon modules + status                                     |
| `kitsuden_toggle_module` | Enable/disable a module                                           |
| `kitsuden_encode_toon`   | Encode JSON → TOON (60% fewer tokens)                             |
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

Set `KITSUDEN_API_TOKEN` to a valid Agent NHI token (`kitsuden_agent_*`) or legacy API key (`kitsuden_sk_*` — deprecated, sunset 2026-08-01):

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
| `KITSUDEN_API_URL`   | `http://localhost:3001` | Kitsuden API base URL  |
| `KITSUDEN_API_TOKEN` | (empty)                 | API authentication key |
| `PORT`               | `3002`                  | MCP server port        |
