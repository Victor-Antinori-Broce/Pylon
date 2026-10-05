# MCP Testing Guide - Kitsuden

Guía para probar el sistema MCP y Agent Identities.

---

## Pre-requisitos

```bash
# Asegurar que PostgreSQL está corriendo con pgvector
docker compose -f docker-compose.automatic.yml up -d kitsuden_db

# Verificar que la DB está saludable
docker compose -f docker-compose.automatic.yml ps kitsuden_db
```

---

## 1. Verificar Migraciones

Asegurar que las tablas de agentes existen:

```bash
# Conectar a PostgreSQL
docker exec -it kitsuden_db_auto psql -U kitsuden -d kitsuden_prod

# Verificar tablas
\dt agent_*

# Deberías ver:
# - agent_identities
# - agent_api_keys
# - agent_audit_logs
```

---

## 2. Iniciar API en Modo Desarrollo

```bash
cd apps/api

# Instalar dependencias si es necesario
bun install

# Iniciar en modo dev
bun run dev
```

La API debería estar disponible en `http://localhost:3000`

---

## 3. Probar Endpoints de Agentes

### 3.1 Crear Agente (requiere autenticación admin)

```bash
# Login primero para obtener token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Crear agente
curl -X POST http://localhost:3000/api/admin/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "description": "Agente de prueba para MCP",
    "scopes": ["mcp:connect", "read:*"],
    "rateLimit": 120
  }'
```

**Respuesta esperada:**

```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "uuid",
      "name": "Test Agent",
      "scopes": ["mcp:connect", "read:*"],
      "rateLimit": 120
    },
    "apiKey": "kitsuden_agent_xxxx..."
  }
}
```

**IMPORTANTE:** Guarda la `apiKey` - solo se muestra una vez!

---

### 3.2 Listar Agentes

```bash
curl http://localhost:3000/api/admin/agents \
  -H "Authorization: Bearer $TOKEN"
```

---

### 3.3 Ver Logs de Agente

```bash
curl http://localhost:3000/api/admin/agents/{agentId}/logs \
  -H "Authorization: Bearer $TOKEN"
```

---

### 3.4 Ver Estadísticas

```bash
curl http://localhost:3000/api/admin/agents/{agentId}/stats?days=7 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 4. Probar MCP

### 4.1 Conexión SSE

```bash
# Esto establece una conexión SSE y recibe el endpoint
curl -N http://localhost:3000/api/mcp \
  -H "Authorization: Bearer kitsuden_agent_xxxx..."
```

**Evento inicial esperado:**

```
event: endpoint
data: /api/mcp?sessionId=xxxxx
```

---

### 4.2 Listar Tools

```bash
# Usar el sessionId del paso anterior
curl -X POST "http://localhost:3000/api/mcp?sessionId=xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

**Respuesta esperada:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_datasets",
        "description": "List all available datasets",
        "inputSchema": { "type": "object", "properties": {} }
      },
      {
        "name": "query_dataset",
        "description": "Query records from a dataset",
        "inputSchema": { ... }
      }
    ]
  }
}
```

---

### 4.3 Llamar a un Tool

```bash
curl -X POST "http://localhost:3000/api/mcp?sessionId=xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_datasets",
      "arguments": {}
    },
    "id": 2
  }'
```

---

## 5. Probar Rate Limiting

Hacer múltiples requests rápidamente:

```bash
for i in {1..65}; do
  curl -s http://localhost:3000/api/mcp \
    -H "Authorization: Bearer kitsuden_agent_xxxx..." &
done
wait
```

Después de 60 requests (default), deberías recibir:

```json
{
  "error": "Rate limit exceeded. Max 60 requests per minute"
}
```

---

## 6. Probar Scopes

Crear un agente sin el scope `mcp:connect`:

```bash
curl -X POST http://localhost:3000/api/admin/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Limited Agent",
    "scopes": ["read:*"]
  }'
```

Intentar conectar MCP:

```bash
curl -N http://localhost:3000/api/mcp \
  -H "Authorization: Bearer kitsuden_agent_limited..."
```

**Respuesta esperada:**

```json
{
  "error": "No MCP scope"
}
```

---

## 7. Admin UI

Abrir en navegador:

```
http://localhost:3001/admin/agents
```

Funcionalidades a probar:

- [ ] Crear agente con formulario
- [ ] Ver lista de agentes
- [ ] Ver detalle de agente
- [ ] Crear nueva API key
- [ ] Revocar API key
- [ ] Ver logs de auditoría
- [ ] Ver estadísticas
- [ ] Eliminar agente

---

## 8. Verificar Audit Logs

Después de hacer acciones, verificar que se registraron:

```bash
curl http://localhost:3000/api/admin/agents/{agentId}/logs \
  -H "Authorization: Bearer $TOKEN"
```

Deberías ver acciones como:

- `auth_success`
- `mcp_connect`
- `tool_call`
- `rate_limited` (si aplicó)

---

## Troubleshooting

### Error: "Invalid API key format"

Asegúrate de usar el formato correcto: `kitsuden_agent_xxxxx`

### Error: "Rate limit exceeded"

Espera 1 minuto o aumenta el `rateLimit` del agente

### Error: "No MCP scope"

El agente necesita el scope `mcp:connect` en su lista de scopes

### Error: "Agent is deactivated"

El agente está marcado como `isActive: false`

---

## Resumen de Features Testeados

| #   | Feature                | Status |
| --- | ---------------------- | ------ |
| 1   | Agent Identities (NHI) | ✅     |
| 2   | Rate Limiting          | ✅     |
| 3   | Audit Logging          | ✅     |
| 4   | Scopes (Zero Trust)    | ✅     |
| 5   | MCP SSE Connection     | ✅     |
| 6   | Tool Discovery         | ✅     |
| 7   | Tool Execution         | ✅     |
| 8   | API Key Management     | ✅     |
| 9   | Admin UI               | ✅     |
| 10  | Statistics             | ✅     |

---

_Documento generado el 2026-03-17_
