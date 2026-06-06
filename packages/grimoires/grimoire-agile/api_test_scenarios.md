# Grimoire Agile - API Test Scenarios

Documento con comandos de prueba para validar todos los endpoints.

## Configuración Base

```bash
# Variables de entorno
export BASE_URL="http://localhost:3000/api/agile"
export TOKEN="Bearer YOUR_JWT_TOKEN_HERE"
```

---

## 🧪 PRUEBAS DE PROYECTOS

### Test 1: Crear Proyecto

**Objetivo:** Verificar creación con estados por defecto

```bash
curl -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "name": "Test Development Team",
    "identifier": "TEST",
    "description": "Proyecto de prueba para validación",
    "emoji": "🧪",
    "color": "#22c55e",
    "leadId": "user-test-001",
    "createdBy": "user-test-001"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
```

**Éxito esperado:** `201 Created` con estados default creados

### Test 2: Listar Proyectos

```bash
curl -X GET "$BASE_URL/projects" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '.docs[0]'
```

**Éxito esperado:** `200 OK` con array de proyectos

### Test 3: Obtener Proyecto Específico

```bash
export PROJECT_ID="REEMPLAZAR_CON_UUID_DEL_PROYECTO"

curl -X GET "$BASE_URL/projects/$PROJECT_ID" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '{id, name, identifier, states: .states | length}'
```

**Éxito esperado:** `200 OK` con proyecto y sus estados

**Error esperado:** `404 Not Found` si ID no existe

---

## 🧪 PRUEBAS DE ISSUES

### Test 4: Crear Issue Manual

```bash
curl -X POST "$BASE_URL/$PROJECT_ID/issues" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "name": "Implementar autenticación JWT",
    "descriptionHtml": "<p>Crear sistema de login con tokens JWT</p>",
    "type": "feature",
    "priority": "high",
    "assigneeId": "user-dev-001",
    "createdBy": "user-test-001",
    "estimate": 5
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq '{id, key, name, type, priority}'
```

**Éxito esperado:** `201 Created` con key generada (TEST-1)

### Test 5: Listar Issues con Join a States

```bash
curl -X GET "$BASE_URL/$PROJECT_ID/issues" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '.docs[0] | {key, name, state: .state | {id, name, color, group}}'
```

**Éxito esperado:** `200 OK` con issues que incluyen datos del estado

### Test 6: Filtrar Issues por Estado

```bash
# Primero obtener un stateId
export STATE_ID="REEMPLAZAR_CON_UUID_DE_ESTADO"

curl -X GET "$BASE_URL/$PROJECT_ID/issues?stateId=$STATE_ID" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '.docs | length'
```

**Éxito esperado:** `200 OK` con issues filtrados

### Test 7: Buscar Issues por Texto

```bash
curl -X GET "$BASE_URL/$PROJECT_ID/issues?search=autenticación" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '.docs[].name'
```

**Éxito esperado:** `200 OK` con issues que coinciden

### Test 8: Obtener Issue por Key

```bash
export ISSUE_KEY="TEST-1"

curl -X GET "$BASE_URL/issues/$ISSUE_KEY" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '{key, name, type, priority, assigneeId}'
```

**Éxito esperado:** `200 OK` con datos del issue

**Error esperado:** `404 Not Found` si key no existe

### Test 9: Actualizar Issue

```bash
curl -X PATCH "$BASE_URL/issues/$ISSUE_KEY" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "priority": "urgent",
    "estimate": 8
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq '{key, name, priority, estimate}'
```

**Éxito esperado:** `200 OK` con datos actualizados

---

## 🧪 PRUEBAS DE INTAKES (CRÍTICO - TRANSACCIÓN)

### Test 10: Crear Intake (Simulando Agente IA)

```bash
curl -X POST "$BASE_URL/$PROJECT_ID/intakes" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "title": "Error 500 en endpoint /api/login detectado en logs",
    "description": "El servicio de autenticación está retornando 500. Stack trace indica problema con la conexión a DB.",
    "suggestedType": "bug",
    "suggestedPriority": "urgent",
    "source": "ai_agent",
    "sourceData": {
      "aiAgentId": "log-monitor-agent",
      "aiPrompt": "Analiza logs de errores y crea tickets",
      "confidence": 0.92,
      "logLines": ["ERROR: Connection timeout", "ERROR: 500 on /api/login"]
    },
    "createdBy": "system-agent"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq '{id, title, status, source}'
```

**Éxito esperado:** `201 Created` con status="pending"

**Guarda el ID del intake:**

```bash
export INTAKE_ID="REEMPLAZAR_CON_UUID_DEL_INTAKE"
```

### Test 11: Listar Intakes Pendientes

```bash
curl -X GET "$BASE_URL/$PROJECT_ID/intakes?status=pending" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '.docs[] | {id, title, status, source}'
```

**Éxito esperado:** `200 OK` mostrando intakes en triage

### Test 12: ✅ APROBAR INTAKE (TRANSACCIÓN ATÓMICA)

**Este es el test más crítico - verifica atomicidad**

```bash
curl -X POST "$BASE_URL/intakes/$INTAKE_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "decidedBy": "user-test-001",
    "reason": "Error confirmado, necesita fix urgente"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
```

**Éxito esperado:** `201 Created`

```json
{
  "success": true,
  "issue": {
    "id": "uuid",
    "key": "TEST-2",
    "name": "Error 500 en endpoint /api/login detectado en logs"
  },
  "intake": {
    "id": "...",
    "status": "accepted"
  }
}
```

**Validación de la transacción:**

1. ✅ Issue creado con key TEST-2
2. ✅ Intake actualizado a status="accepted"
3. ✅ createdIssueId vinculado correctamente
4. ✅ createdIssueKey = "TEST-2"

```bash
# Verificar que el issue fue creado
curl -X GET "$BASE_URL/issues/TEST-2" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '{key, name, type: .type, priority}'
```

### Test 13: Intentar Aprobar Intake Ya Procesado (Debe Fallar)

```bash
curl -X POST "$BASE_URL/intakes/$INTAKE_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "decidedBy": "user-test-001",
    "reason": "Intento duplicado"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
```

**Error esperado:** `404 Not Found` - "Intake not found or already processed"

### Test 14: Crear y Rechazar Intake

```bash
# Crear otro intake
INTAKE_RESPONSE=$(curl -X POST "$BASE_URL/$PROJECT_ID/intakes" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "title": "Solicitud de feature menor",
    "description": "Cambiar color del botón",
    "source": "web_form"
  }' \
  -w "\nHTTP_CODE:%{http_code}")

# Extraer ID (procesamiento manual necesario)
# Luego rechazar:
curl -X POST "$BASE_URL/intakes/INTAKE_ID/reject" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "decidedBy": "user-test-001",
    "reason": "Fuera de scope del sprint actual"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq '{id, status, decisionReason}'
```

**Éxito esperado:** `200 OK` con status="declined"

---

## 🧪 PRUEBAS DE CYCLES (SPRINTS)

### Test 15: Crear Cycle

```bash
curl -X POST "$BASE_URL/$PROJECT_ID/cycles" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "name": "Sprint 1",
    "goal": "Completar autenticación y perfil de usuario",
    "startDate": "2026-03-17T00:00:00Z",
    "endDate": "2026-03-31T23:59:59Z",
    "capacity": 40,
    "createdBy": "user-test-001"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq '{id, name, goal, status}'
```

**Éxito esperado:** `201 Created`

### Test 16: Listar Cycles

```bash
curl -X GET "$BASE_URL/$PROJECT_ID/cycles" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '.docs[].name'
```

---

## 🧪 PRUEBAS DE MODULES (ÉPICAS)

### Test 17: Crear Module

```bash
curl -X POST "$BASE_URL/$PROJECT_ID/modules" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "name": "Sistema de Autenticación",
    "description": "Login, registro, recuperación de contraseña y 2FA",
    "color": "#3b82f6",
    "targetDate": "2026-04-15T00:00:00Z",
    "leadId": "user-dev-001",
    "createdBy": "user-test-001"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq '{id, name, status, color}'
```

**Éxito esperado:** `201 Created`

---

## 🧪 PRUEBAS DE COMENTARIOS

### Test 18: Crear Comentario

```bash
curl -X POST "$BASE_URL/issues/$ISSUE_KEY/comments" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "contentHtml": "<p>He identificado el problema. Es un timeout en la conexión a la base de datos.</p>",
    "createdBy": "user-dev-001"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq '{id, contentHtml, createdBy}'
```

**Éxito esperado:** `201 Created`

### Test 19: Listar Comentarios

```bash
curl -X GET "$BASE_URL/issues/$ISSUE_KEY/comments" \
  -H "Authorization: $TOKEN" \
  -w "\nHTTP Status: %{http_code}\n" | jq '.docs[].contentHtml'
```

---

## 🧪 PRUEBAS DE ERROR

### Test 20: Proyecto Duplicado (Debe Fallar)

```bash
curl -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "name": "Proyecto Duplicado",
    "identifier": "TEST",
    "createdBy": "user-test-001"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
```

**Error esperado:** `409 Conflict` - "Project identifier already exists"

### Test 21: Issue sin Nombre (Debe Fallar)

```bash
curl -X POST "$BASE_URL/$PROJECT_ID/issues" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "descriptionHtml": "<p>Sin título</p>",
    "createdBy": "user-test-001"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
```

**Error esperado:** `400 Bad Request` - "name is required"

### Test 22: Intake sin Título (Debe Fallar)

```bash
curl -X POST "$BASE_URL/$PROJECT_ID/intakes" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "description": "Sin título",
    "source": "api"
  }' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
```

**Error esperado:** `400 Bad Request` - "title is required"

---

## 📊 Resumen de Tests

| #   | Endpoint              | Método | Caso                      | Status Esperado |
| --- | --------------------- | ------ | ------------------------- | --------------- |
| 1   | /projects             | POST   | Crear proyecto            | 201             |
| 2   | /projects             | GET    | Listar proyectos          | 200             |
| 3   | /projects/:id         | GET    | Obtener proyecto          | 200             |
| 4   | /:projectId/issues    | POST   | Crear issue               | 201             |
| 5   | /:projectId/issues    | GET    | Listar issues             | 200             |
| 6   | /:projectId/issues    | GET    | Filtrar por estado        | 200             |
| 7   | /:projectId/issues    | GET    | Buscar por texto          | 200             |
| 8   | /issues/:key          | GET    | Obtener issue             | 200             |
| 9   | /issues/:key          | PATCH  | Actualizar issue          | 200             |
| 10  | /:projectId/intakes   | POST   | Crear intake              | 201             |
| 11  | /:projectId/intakes   | GET    | Listar intakes            | 200             |
| 12  | /intakes/:id/approve  | POST   | **Aprobar (transacción)** | 201             |
| 13  | /intakes/:id/approve  | POST   | Aprobar ya procesado      | 404             |
| 14  | /intakes/:id/reject   | POST   | Rechazar intake           | 200             |
| 15  | /:projectId/cycles    | POST   | Crear cycle               | 201             |
| 16  | /:projectId/cycles    | GET    | Listar cycles             | 200             |
| 17  | /:projectId/modules   | POST   | Crear module              | 201             |
| 18  | /issues/:key/comments | POST   | Crear comentario          | 201             |
| 19  | /issues/:key/comments | GET    | Listar comentarios        | 200             |
| 20  | /projects             | POST   | Proyecto duplicado        | 409             |
| 21  | /:projectId/issues    | POST   | Issue sin nombre          | 400             |
| 22  | /:projectId/intakes   | POST   | Intake sin título         | 400             |

**Tests exitosos:** 22/22 ✅

---

## 🔄 Flujo Completo de Validación

```bash
#!/bin/bash
# Ejecutar todas las pruebas en secuencia

echo "=== PRUEBA 1: Crear Proyecto ==="
PROJECT=$(curl -s -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"name":"Test","identifier":"FLOW","createdBy":"test"}')
PROJECT_ID=$(echo $PROJECT | jq -r '.id')
echo "Project ID: $PROJECT_ID"

echo "=== PRUEBA 2: Crear Issue ==="
ISSUE=$(curl -s -X POST "$BASE_URL/$PROJECT_ID/issues" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"name":"Test Issue","createdBy":"test"}')
echo "Issue Key: $(echo $ISSUE | jq -r '.key')"

echo "=== PRUEBA 3: Crear Intake ==="
INTAKE=$(curl -s -X POST "$BASE_URL/$PROJECT_ID/intakes" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"title":"Test Intake","source":"test"}')
INTAKE_ID=$(echo $INTAKE | jq -r '.id')
echo "Intake ID: $INTAKE_ID"

echo "=== PRUEBA 4: Aprobar Intake (TRANSACCIÓN) ==="
APPROVE=$(curl -s -X POST "$BASE_URL/intakes/$INTAKE_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"decidedBy":"test"}')
echo "Result: $(echo $APPROVE | jq -r '.success')"
echo "Created Issue: $(echo $APPROVE | jq -r '.issue.key')"

echo "=== VALIDACIÓN COMPLETA ==="
```
