# Mejoras del Sistema MCP - GremiusCMS

Documentación de las 12 mejoras implementadas para el sistema MCP (Model Context Protocol) en GremiusCMS.

---

## 1. Agent Identities (NHI - Non-Human Identities)

Sistema completo de autenticación para agentes de IA (Claude, Cursor, etc.)

**Características:**
- Keys con formato `grm_agent_xxxxx` (distingibles de humanos `gremius_sk_`)
- Autenticación dual en MCP: soporta tanto agentes AI como usuarios humanos
- Metadata por agente: nombre, descripción, scopes, rate limits
- Soft delete con cascade en relaciones

**Uso:**
```bash
# Crear agente
POST /api/admin/agents
{"name": "Claude Desktop", "scopes": ["mcp:connect", "read:datasets"]}

# Usar en MCP
Authorization: Bearer grm_agent_abc123...
```

---

## 2. Rate Limiting por Agente (FinOps)

Protección contra costos excesivos de API por loops de IA.

**Características:**
- Límite configurable por agente (default: 60 req/min)
- Cache en memoria para performance
- Headers de respuesta: `X-RateLimit-Limit`, `X-Agent-Id`
- Cleanup automático de entradas expiradas

**Configuración:**
```typescript
// Al crear agente
{ "rateLimit": 120 } // 120 requests/minuto
```

---

## 3. Audit Logging Completo

Registro detallado de todas las acciones de agentes.

**Tabla:** `agent_audit_logs`

**Campos:**
- `action`: auth_success, auth_failure, mcp_connect, tool_call, data_read, etc.
- `resource`: datasets, posts, users, etc.
- `duration_ms`: tiempo de ejecución
- `ip_address`, `user_agent`: tracking de origen
- `success`, `error_message`: resultado
- `details`: JSONB flexible para metadata

**API:**
```bash
GET /api/admin/agents/:id/logs?limit=50
```

---

## 4. Scopes con Wildcard Support (Zero Trust)

Sistema de permisos granular para agentes.

**Formatos soportados:**
- Exacto: `read:datasets`
- Wildcard: `read:*` (permite read:posts, read:users, etc.)
- MCP: `mcp:connect` (requerido para conectar)

**Verificación:**
```typescript
hasScope(context, "read:posts")     // ✅ Con scope "read:*"
hasAllScopes(context, ["read:*", "write:posts"])  // ✅ Todos
hasAnyScope(context, ["read:*", "admin"])         // ✅ Alguno
```

---

## 5. Webhook Events para Agentes

Notificaciones en tiempo real de eventos de agentes.

**Eventos soportados:**
- `agent.authenticated` - Login exitoso
- `agent.auth_failed` - Fallo de autenticación
- `agent.scope_violation` - Intento de acceso no autorizado
- `agent.rate_limited` - Límite excedido
- `agent.key_revoked` - Key revocada
- `agent.mcp_connected` - Conexión MCP establecida

**Payload:**
```json
{
  "event": "agent.authenticated",
  "timestamp": "2026-03-17T12:00:00Z",
  "data": {
    "agentId": "uuid",
    "agentName": "Claude Desktop",
    "keyId": "uuid",
    "ipAddress": "192.168.1.1",
    "scopes": ["mcp:connect", "read:*"]
  }
}
```

---

## 6. RLS Policies para Aislamiento de Datos

Row-Level Security para aislamiento de datos por agente.

**Implementación:**
```sql
-- Las policies usan current_setting('app.agent_id')
CREATE POLICY agent_isolation ON datasets
  FOR ALL TO agent_role
  USING (agent_id = current_setting('app.agent_id', true));
```

**Uso en código:**
```typescript
await db.execute(sql`SET app.agent_id = ${agentId}`);
// Queries siguientes filtran automáticamente
```

---

## 7. Admin UI para Gestión de Agentes

Interfaz completa en SvelteKit.

**Vistas:**
- Lista de agentes con indicadores de estado
- Crear/editar agente con selección de scopes
- Ver API keys (enmascaradas) con funcionalidad de copiar
- Logs de actividad con filtros
- Estadísticas de uso (llamadas, success rate)

**Ruta:** `/admin/agents`

---

## 8. API Keys con SHA-256 Hashing

Almacenamiento seguro de credenciales.

**Seguridad:**
- Keys mostradas **solo una vez** en creación
- SHA-256 hash almacenado en DB
- Prefix guardado para identificación en UI: `grm_agent_****1234`
- Expiración configurable por key

**Flujo:**
1. Crear agente → API key visible una vez
2. Almacenar hash, descartar plaintext
3. Verificación por hash en cada request

---

## 9. MCP Session Management

Gestión de sesiones MCP con Server-Sent Events.

**Características:**
- Sesiones en memoria (extensible a Valkey/Redis)
- TTL automático (1 hora de inactividad)
- Tracking de agentId, agentName, apiKeyId por sesión
- Cleanup periódico de sesiones expiradas

**Endpoints:**
```
GET  /api/mcp        # SSE connection (establishes session)
POST /api/mcp?sessionId=xxx  # JSON-RPC messages
```

---

## 10. Tool Discovery Dinámico

Listado automático de herramientas disponibles.

**Tools expuestas:**
- `get_datasets` - Listar datasets disponibles
- `query_dataset` - Consultar datos con filters/pagination
- `create_record` - Crear registros
- `update_record` - Actualizar registros
- `delete_record` - Eliminar registros
- `search_content` - Búsqueda full-text

**Respuesta:**
```json
{
  "tools": [
    {
      "name": "query_dataset",
      "description": "Query records from a dataset",
      "inputSchema": { /* JSON Schema */ }
    }
  ]
}
```

---

## 11. Tool Execution con Tracking

Ejecución de herramientas con logging completo.

**Flujo:**
1. Agente llama tool via POST /api/mcp
2. Validación de scopes para la acción
3. Ejecución con timeout
4. Logging de: agentId, tool, args, duration, success/error
5. Respuesta JSON-RPC

**Auditoría:**
```typescript
logAgentActivity({
  agentId: session.agentId,
  action: 'tool_call',
  resource: toolName,
  durationMs: Date.now() - startTime,
  success: true
});
```

---

## 12. SSE (Server-Sent Events) para MCP Real-time

Conexión persistente para comunicación bidireccional.

**Flujo de conexión:**
1. Cliente conecta vía GET /api/mcp
2. Autenticación (agent o human)
3. Se crea sesión con UUID
4. Se envía evento `endpoint` con URL de mensajes
5. Cliente POST mensajes JSON-RPC a esa URL
6. Respuestas via SSE events

**Eventos SSE:**
- `endpoint` - URL para enviar mensajes
- `message` - Respuestas JSON-RPC
- `error` - Errores de conexión/ejecución

---

## Arquitectura de Seguridad

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│   /api/mcp       │────▶│  Auth Service   │
│  (Claude, etc)  │     │   Middleware     │     │  (Agent/Human)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                           │
                               ▼                           ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │  Rate Limiter    │     │  Scope Check    │
                        │  (60 req/min)    │     │  (Zero Trust)   │
                        └──────────────────┘     └─────────────────┘
                               │                           │
                               ▼                           ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │  MCP Handler     │────▶│  Audit Logger   │
                        │  (Tools/SSE)     │     │  (agent_logs)   │
                        └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  RLS Policies    │
                        │  (Data Isolate)  │
                        └──────────────────┘
```

---

## Testing

### Crear agente de prueba
```bash
curl -X POST http://localhost:3001/api/admin/agents \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "scopes": ["mcp:connect", "read:*"],
    "rateLimit": 100
  }'
```

### Conectar MCP
```bash
# SSE connection
curl -N http://localhost:3001/api/mcp \
  -H "Authorization: Bearer grm_agent_xxxxx"

# En otra terminal, enviar mensajes
curl -X POST "http://localhost:3001/api/mcp?sessionId=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### Ver logs
```bash
curl http://localhost:3001/api/admin/agents/:id/logs \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Integraciones Soportadas

- **Claude Desktop** - Via MCP config
- **Cursor** - Via MCP settings
- **Cline** - Via MCP config
- **Custom AI Agents** - Via API directa

---

*Documento generado el 2026-03-17*
*Versión: GremiusCMS v0.7.0-beta*
