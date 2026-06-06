# @gremius/mcp-server

Enterprise-grade [Model Context Protocol](https://modelcontextprotocol.io) server for Gremius CMS. Connects AI agents (Claude, Cursor, Windsurf, VS Code Copilot) to your Gremius backend.

## 🚀 Quick Start

```bash
# Via CLI (auto-starts Docker container)
gremius mcp

# Via Docker
docker run -p 3002:3002 -e GREMIUS_API_URL=http://localhost:3001 gremius/mcp:latest

# Via npx
npx @gremius/mcp-server
```

## 🔧 IDE Setup

```bash
# Auto-generate config for your IDE
gremius mcp --ide cursor    # Creates .cursor/mcp.json
gremius mcp --ide claude    # Prints Claude Desktop config
gremius mcp --ide vscode    # Prints VS Code config
gremius mcp --ide windsurf  # Prints Windsurf config
```

Or visit `http://localhost:3002/ide-config/:ide` while the server is running.

### Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "gremius": {
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
    "gremius": {
      "command": "npx",
      "args": ["-y", "@gremius/mcp-server"],
      "env": {
        "GREMIUS_API_URL": "http://localhost:3001",
        "GREMIUS_API_TOKEN": "<your-api-key>"
      }
    }
  }
}
```

## 🛠️ Tools (11)

| Tool                    | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `gremius_list_tables`   | Discover all data tables with row counts                          |
| `gremius_query_table`   | Query records with pagination, sort, filter. Supports TOON format |
| `gremius_create_record` | Create a new record in any table                                  |
| `gremius_update_record` | Update a record by ID                                             |
| `gremius_delete_record` | Delete a record by ID                                             |
| `gremius_get_schema`    | Get JSON Schema for a table (fields, types, relations)            |
| `gremius_list_modules`  | List all grimoire modules + status                                |
| `gremius_toggle_module` | Enable/disable a module                                           |
| `gremius_encode_toon`   | Encode JSON → TOON (60% fewer tokens)                             |
| `gremius_list_datasets` | List dynamic datasets                                             |
| `gremius_api_request`   | Raw API request (escape hatch)                                    |

## 📚 Resources (5)

| Resource | URI                                   |
| -------- | ------------------------------------- |
| Tables   | `gremius://tables`                    |
| Modules  | `gremius://modules`                   |
| Health   | `gremius://health`                    |
| Datasets | `gremius://datasets`                  |
| Schema   | `gremius://schema/{table}` (template) |

## 🔐 Authentication

Set `GREMIUS_API_TOKEN` to a valid Agent NHI token (`grm_agent_*`) or legacy API key (`gremius_sk_*` — deprecated, sunset 2026-08-01):

```bash
# Recommended: Agent NHI token
GREMIUS_API_TOKEN=grm_agent_xxx gremius mcp

# Deprecated: Legacy API key (will be removed)
GREMIUS_API_TOKEN=gremius_sk_xxx gremius mcp
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

| Variable            | Default                 | Description            |
| ------------------- | ----------------------- | ---------------------- |
| `GREMIUS_API_URL`   | `http://localhost:3001` | Gremius API base URL   |
| `GREMIUS_API_TOKEN` | (empty)                 | API authentication key |
| `PORT`              | `3002`                  | MCP server port        |
