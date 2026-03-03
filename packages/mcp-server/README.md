# @gremius/mcp-server

Model Context Protocol (MCP) Server para Gremius CMS. Permite que agentes de IA (Claude, Cursor, etc.) interactúen con el backend de Gremius.

## 🎯 Qué es MCP

El [Model Context Protocol](https://modelcontextprotocol.io) es un protocolo estándar para conectar agentes de IA con fuentes de datos y herramientas externas. Gremius expone:

- **Resources**: Datasets, grimoires, configuración
- **Tools**: Query, insert, dispatch de workers

## 📦 Instalación

```bash
pnpm install @gremius/mcp-server
```

## 🔧 Uso

### Como librería (desde la API)

```typescript
import { createGremiusMcpServer } from "@gremius/mcp-server";

const server = createGremiusMcpServer({
    db,
    schema: { dataSets, dataEntries },
    queue: { addJob: async (queue, job, payload) => {...} },
    grimoireRegistry: []
});
```

### Como proceso stdio (CLI)

```bash
# En desarrollo
bun run src/index.ts

# Construido
bun run dist/index.js
```

## 🌐 Endpoints SSE (API)

La API expone MCP sobre SSE en `/api/mcp`:

```
GET  /api/mcp       # Conexión SSE
POST /api/mcp       # Mensajes JSON-RPC
```

## 🛠️ Tools Disponibles

| Tool | Descripción |
|------|-------------|
| `gremius_query_dataset` | Query registros de un dataset |
| `gremius_insert_record` | Insertar nuevo registro |
| `gremius_dispatch_worker` | Encolar job en BullMQ |

## 📚 Resources Disponibles

| Resource | URI | Descripción |
|----------|-----|-------------|
| Datasets | `gremius://datasets` | Lista de datasets activos |
| Grimoires | `gremius://grimoires` | Módulos grimoire activos |

## 🔐 Seguridad

- Las llamadas a tools respetan RLS de PostgreSQL
- Requiere autenticación via API key o session
- Rate limiting aplicado en la API

## 📄 Especificación MCP

- **Protocol Version**: 2024-11-05
- **Transport**: SSE (Server-Sent Events)
- **Format**: JSON-RPC 2.0
