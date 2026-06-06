# MCP Integration Example - Grimoire Agile

## Uso de `agile_read_board` en el Servidor MCP de Gremius

### Ejemplo de Integración

```typescript
// packages/mcp-server/src/index.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerAgileTools } from "@gremius/grimoire-agile/mcp";

// Crear servidor MCP
const server = new Server(
  { name: "gremius-mcp-server", version: "1.0.0" },
  { capabilities: { resources: {}, tools: {} } }
);

// Registrar herramientas de Agile
registerAgileTools(server, db);

// O integración manual:
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... otras herramientas ...
      {
        name: "agile_read_board",
        description:
          "[READ-ONLY] Obtiene el estado actual del tablero Kanban. NUNCA modifica datos. Usar para consultar estado del proyecto, issues por estado, asignaciones y métricas.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "UUID del proyecto ágil a consultar",
            },
            limit: {
              type: "number",
              description: "Máximo número de issues a retornar (1-100)",
              default: 50,
            },
            stateGroup: {
              type: "string",
              enum: ["backlog", "unstarted", "started", "completed", "cancelled"],
              description: "Filtrar por grupo de estado",
            },
          },
          required: ["projectId"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "agile_read_board") {
    const { projectId, limit = 50, stateGroup } = args;

    // Query a la base de datos
    const { eq, and, asc } = await import("drizzle-orm");
    const { agileProjects, agileIssues, agileStates } = await import("@gremius/grimoire-agile");

    // Obtener proyecto
    const [project] = await db
      .select({ id: agileProjects.id, name: agileProjects.name })
      .from(agileProjects)
      .where(eq(agileProjects.id, projectId))
      .limit(1);

    if (!project) {
      return {
        content: [{ type: "text", text: `Proyecto no encontrado: ${projectId}` }],
        isError: true,
      };
    }

    // Obtener estados
    const states = await db
      .select()
      .from(agileStates)
      .where(eq(agileStates.projectId, projectId))
      .orderBy(asc(agileStates.sequence));

    // Obtener issues
    let query = db
      .select({
        id: agileIssues.id,
        key: agileIssues.key,
        name: agileIssues.name,
        stateId: agileIssues.stateId,
      })
      .from(agileIssues)
      .where(eq(agileIssues.projectId, projectId));

    if (stateGroup) {
      query = query.where(
        and(eq(agileIssues.projectId, projectId), eq(agileStates.group, stateGroup))
      ) as any;
    }

    const issues = await query.limit(limit);

    // Organizar por estado
    const board = states.map((state) => ({
      state: state.name,
      issues: issues.filter((i) => i.stateId === state.id),
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ project: project.name, board }, null, 2),
        },
      ],
    };
  }
});
```

### Ejemplo de Llamada

```json
{
  "name": "agile_read_board",
  "arguments": {
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "limit": 10,
    "stateGroup": "started"
  }
}
```

### Respuesta Esperada

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"project\": \"Development Team\",\n  \"board\": [\n    {\n      \"state\": \"In Progress\",\n      \"issues\": [\n        {\n          \"id\": \"...\",\n          \"key\": \"DEV-5\",\n          \"name\": \"Implement authentication\"\n        }\n      ]\n    }\n  ]\n}"
    }
  ]
}
```

### Uso desde Claude Desktop

```xml
<use_mcp_tool>
<server_name>gremius-mcp-server</server_name>
<tool_name>agile_read_board</tool_name>
<arguments>
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "limit": 20
}
</arguments>
</use_mcp_tool>
```

## Flujo Completo: AI Agent usando MCP

```typescript
// El agente de IA detecta un problema y quiere reportarlo

// Paso 1: Leer el board para contexto
const boardResult = await useMcpTool("gremius-mcp-server", "agile_read_board", {
  projectId: "dev-project-uuid",
  limit: 50,
});

// Paso 2: Detectar que hay un bug nuevo
const bugDetected = analyzeLogs(logs);

// Paso 3: Crear intake (NUNCA crea issue directamente)
const intakeResult = await useMcpTool("gremius-mcp-server", "agile_submit_intake", {
  projectId: "dev-project-uuid",
  title: "Error 500 en endpoint /api/login",
  description: "Stack trace indica timeout en conexión a DB",
  suggestedType: "bug",
  suggestedPriority: "urgent",
  payload: {
    errorLog: "TypeError: Cannot read property...",
    confidence: 0.95,
    affectedEndpoints: ["/api/login"],
  },
});

// Resultado: Intake creado con status='pending'
// Humano debe aprobar antes de que aparezca en el board
```
