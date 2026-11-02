# 🔒 Análisis DevSecOps: Defaults Obligatorios y Backend Guardrails

**Fecha:** 29 de marzo de 2026  
**Versión analizada:** Kitsuden v0.8.0-beta  
**Enfoque:** Developer Experience (DX) y Seguridad por Default

---

## 🎯 Resumen Ejecutivo

Kitsuden tiene **implementación sólida de seguridad** con el sistema NHI (Non-Human Identity), RBAC granular, rate limiting por agente, y structured logging. Los defaults son seguros y ahora incluye telemetría para auditoría completa.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PUNTUACIÓN POR ÁREA                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Auth Universal (NHI + Scopes)      ████████████  98% ✅       │
│  2. Rate Limiting (por Agente)         █████████░░░  90% ✅       │
│  3. Validaciones Automáticas           ███████░░░░░  70% 🟡       │
│  4. Permisos/RLS (RBAC completo)       ███████████░  95% ✅       │
│  5. Backend Guardrails (linter)        ████░░░░░░░░  35% 🟡       │
│  6. Observabilidad (Telemetry)         █████████░░░  90% ✅       │
└─────────────────────────────────────────────────────────────────┘

PROMEDIO: 80% - Seguro por default, RBAC implementado, telemetry completo
```

**vs Análisis Anterior:** +14% (de 66% a 80%) - Mejoras en Rate Limiting, Validaciones y Telemetry

---

## 1️⃣ Defaults Obligatorios: El Análisis

### ✅ Lo que Kitsuden hace BIEN

#### Auth: NHI (Non-Human Identity) IMPLEMENTADO

```typescript
// ✅ TOKEN NHI CON HASH SHA-256
// apps/api/src/services/agent-auth.ts

const token = "<YOUR_AGENT_KEY>";
//       ↑↑↑↑↑↑↑  ↑↑↑↑↑↑  ↑↑↑↑↑↑↑↑
//       prefijo   tipo    43 chars de entropy

// Validación segura
const authResult = await authenticateAgent(token, {
  requireScopes: ["mcp:connect"],
  audit: { action: "mcp:connect", resource: "mcp:session" },
});
```

**Implementado:**

- ✅ **NHI Token Format** - `kitsuden_agent_{tipo}_{hash}` con validación SHA-256
- ✅ **Dual Auth** - Soporta legacy API keys (`kitsuden_sk_*`) + NHI tokens
- ✅ **Zero-Trust** - Cada request valida token
- ✅ **Agent Context** - `identityId`, `name`, `type`, `scopes`, `metadata`
- ✅ **Audit Logging** - Todas las autenticaciones logueadas en `agent_audit_logs`
- ✅ **Agent Telemetry** - Tracing completo de ejecuciones 🆕

#### RBAC con Scopes y Wildcards IMPLEMENTADO

```typescript
// ✅ RBAC MIDDLEWARE COMPLETO
// apps/api/src/middleware/agent-rbac.ts

// Verificar scopes requeridos
export const requireScope = (scope: string) => requireScopes({ scopes: [scope] });
export const requireAnyScope = (scopes: string[]) => requireScopes({ scopes, requireAll: false });

// Wildcards soportados: read:* matcha read:database, read:files
export function hasScope(agent: AgentAuthContext, scope: string): boolean {
  if (agent.scopes.includes(scope)) return true;
  // Wildcard matching: "read:*" matches "read:database"
  const wildcards = agent.scopes.filter(s => s.endsWith(":*"));
  return wildcards.some(w => scope.startsWith(w.slice(0, -1)));
}

// Uso en rutas
app.get("/api/agent/memory",
  agentAuthWithRBAC({ scopes: ["memory:read"] }),  // ✅ Requiere scope
  async (c) => { ... }
);
```

**Implementado:**

- ✅ **Scope Validation** - `memory:read`, `memory:write`, `memory:delete`, `memory:admin`
- ✅ **Wildcard Scopes** - `read:*` matcha cualquier `read:resource`
- ✅ **AND/OR Logic** - `requireAll: true` (default) vs `requireAll: false`
- ✅ **Ownership Enforcement** - Agents solo acceden a sus propias memorias
- ✅ **Error Details** - Respuestas 403 incluyen `requiredScopes` y `grantedScopes`

#### Rate Limiting: Por Agente IMPLEMENTADO 🆕 MEJORADO

```typescript
// ✅ RATE LIMITING POR AGENTE + GLOBAL
// apps/api/src/index.ts

// Global rate limit
app.use(
  "*",
  rateLimiter({
    windowMs: 60000,
    limit: 100,
    keyGenerator: (c) => {
      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        return authHeader.substring(7); // Token-based limiting
      }
      return c.req.header("x-forwarded-for") || "unknown";
    },
    skip: (c) => rateLimitConfig.skipPaths.includes(c.req.path),
  })
);

// Stricter rate limit for auth endpoints
app.use(
  "/api/auth/sign-in/*",
  rateLimiter({
    windowMs: 60000,
    limit: 5, // Solo 5 intentos por minuto
    keyGenerator: (c) => c.req.header("x-forwarded-for") || "unknown",
  })
);
```

**Implementado:**

- ✅ **Rate Limit por Agente** - Configurable en `agent_identities.rateLimit`
- ✅ **120 req/min default** - Para agentes tipo `claude-desktop`
- ✅ **Global Rate Limit** - Middleware aplicado en todas las rutas
- ✅ **Auth Rate Limit** - 5 intentos/min para sign-in/sign-up 🆕
- ✅ **Skip Paths** - `/api/health`, `/api/system/init-check` excluidos

#### RLS (Row Level Security): Default seguro

```typescript
// apps/api/src/lib/rls-builder.ts
export function checkReadAccess(policy: PolicyJson | null, user: RLSUser): boolean {
  // CRÍTICO: Sin política = SOLO ADMIN ✅
  if (!policy) {
    return user?.role === "admin";
  }
  // ...
}
```

**Puntuación: 95%** - Excelente: sin config explícita, todo es admin-only.

#### Structured Logging IMPLEMENTADO 🆕 NUEVO

```typescript
// ✅ STRUCTURED LOGGING CON PINO
// apps/api/src/lib/logger.ts

import { pino } from "pino";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

// Request tracing
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({ requestId, userId });
}
```

**Implementado:**

- ✅ **Pino Logger** - Structured logging en todo el API
- ✅ **Request Tracing** - Cada request tiene UUID único
- ✅ **Security Event Logging** - Eventos de auth logueados
- ✅ **Performance Monitoring** - Duración de requests

---

### ⚠️ Lo que sigue igual (con mejoras)

#### Validaciones: Parcialmente mejorado

```typescript
// ✅ BIEN: DataSets usan Zod automáticamente
dataSetsFullRoutes.post("/", zValidator("json", CreateDatasetPayloadSchema), ...);

// 🟡 MEJORANDO: CRUD routes ahora tienen validación básica
platformsRoutes.post("/", async (c) => {
  const body = await c.req.json();
  // Validación manual básica
  if (!body.name) return c.json({ error: "Name required" }, 400);
  // ...
});
```

**Estado:** Mejorado pero no universal. Depende del desarrollador en algunos casos.

#### CORS: Permisivo por default

```typescript
ALLOWED_ORIGINS: z.string().default(
  "http://localhost:3000,http://localhost:3001,http://localhost:3002,..."
);
```

**Estado:** Sin cambios - aceptable para desarrollo.

#### Backend Guardrails: Parcial

```typescript
// 🟡 ESLint básico implementado
// .eslintrc.cjs con reglas de TypeScript

// ❌ No existe aún:
// - ESLint plugin específico para validaciones
// - Runtime warnings para N+1 queries
// - SQL injection linter específico
```

**Estado:** ESLint básico + Prettier implementados. Faltan guardrails específicos.

---

## 2️⃣ Backend Guardrails: Progreso

### 📊 Tabla de Guardrails (Actualizada)

| Guardrail                  | Estado              | Prioridad | Notas                          |
| -------------------------- | ------------------- | --------- | ------------------------------ |
| **Validación obligatoria** | 🟡 Opt-in           | Alta      | Mejorado, no universal         |
| **Rate limiting por ruta** | 🟢 Implementado     | Media     | ✅ Global + Auth específico    |
| **N+1 Query detection**    | 🔴 No existe        | Alta      | Pendiente                      |
| **SQL Injection scan**     | 🟡 Básico (Drizzle) | Alta      | ORM protege, falta linter      |
| **Permisos por default**   | 🟢 Admin-only       | Baja      | ✅ RLS funciona                |
| **RBAC Scopes**            | 🟢 Implementado     | Alta      | ✅ Wildcards funcionan         |
| **Agent NHI**              | 🟢 Implementado     | Alta      | ✅ Tokens con hash SHA-256     |
| **Secret scanning**        | 🔴 No existe        | Baja      | Pendiente                      |
| **CSP/Security headers**   | 🟡 Básicos          | Media     | ✅ secureHeaders() en Hono     |
| **Structured Logging**     | 🟢 Implementado     | Alta      | ✅ Pino con request tracing 🆕 |
| **Agent Telemetry**        | 🟢 Implementado     | Alta      | ✅ Tracing completo 🆕         |

---

## 3️⃣ Seguridad de Agentes: Implementado

### Sistema NHI Completo

```typescript
// ✅ AGENT IDENTITY - Estructura completa
interface AgentIdentity {
  id: string; // "agent_xxx"
  name: string; // "DevBot"
  type: "claude-desktop" | "service" | "internal" | "webhook";
  description?: string;
  avatarUrl?: string;
  capabilities: string[]; // ["read", "write"]
  systemPrompt?: string; // Prompt del agente
  allowedTools: string[]; // Tools MCP permitidas
  isActive: boolean;
  createdBy: string; // userId
  createdAt: Date;
  updatedAt: Date;
}

// ✅ AGENT API KEY - Con hash seguro
interface AgentApiKey {
  id: string;
  identityId: string;
  tokenHash: string; // SHA-256 del token
  tokenPrefix: string; // "grm_age..." (8 chars)
  scopes: string[]; // ["read:issues", "write:intake"]
  rateLimit: number; // 120 req/min
  expiresAt?: Date;
  lastUsedAt?: Date;
  lastUsedIp?: string;
  usageCount: number;
  isActive: boolean;
}
```

### Middleware de Seguridad

```typescript
// apps/api/src/middleware/agent-rbac.ts

export function agentAuthWithRBAC(options: RBACOptions & { optional?: boolean }): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // 1. Extraer token
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    // 2. Validar NHI
    const result = await authenticateAgent(token);
    if (!result.success) return error 401;

    // 3. Verificar scopes
    if (!hasScope(result.context, requiredScope)) {
      return c.json({
        error: "Insufficient permissions",
        code: "INSUFFICIENT_PERMISSIONS",
        requiredScopes: scopes,
        grantedScopes: result.context.scopes
      }, 403);
    }

    c.set("agent", result.context);
    await next();
  };
}
```

### Agent Telemetry 🆕 NUEVO

```typescript
// ✅ TELEMETRY PARA AUDITORÍA COMPLETA
// apps/api/src/services/agent-telemetry.ts

export const drizzleTelemetryProvider = {
  async insertStep(step: TelemetryStepData): Promise<void> {
    await db.insert(agentTraceSteps).values({
      id: step.id,
      traceId: step.traceId,
      stepOrder: step.stepOrder,
      stepType: step.stepType,
      toolName: step.toolName,
      toolInput: step.toolInput,
      createdAt: step.createdAt,
    });
  },

  async updateStep(stepId: string, data: Partial<TelemetryStepData>): Promise<void> {
    await db
      .update(agentTraceSteps)
      .set({
        toolOutput: data.toolOutput,
        durationMs: data.durationMs,
        errorMessage: data.errorMessage,
      })
      .where(eq(agentTraceSteps.id, stepId));
  },
};
```

---

## 4️⃣ Recomendaciones Actualizadas

### Corto plazo (1-2 meses)

| Prioridad    | Tarea                       | Estado          |
| ------------ | --------------------------- | --------------- |
| ✅ Listo     | Sistema NHI con tokens hash | IMPLEMENTADO    |
| ✅ Listo     | RBAC con scopes y wildcards | IMPLEMENTADO    |
| ✅ Listo     | Rate limiting por agente    | IMPLEMENTADO    |
| ✅ Listo     | Structured logging          | IMPLEMENTADO 🆕 |
| ✅ Listo     | Agent Telemetry             | IMPLEMENTADO 🆕 |
| 🔄 Pendiente | Validación universal Zod    | Parcial         |
| 🔄 Pendiente | ESLint Plugin específico    | Pendiente       |

### Mediano plazo (3-6 meses)

| Prioridad    | Tarea                          | Estado    |
| ------------ | ------------------------------ | --------- |
| 🔄 Pendiente | Runtime warnings en desarrollo | Pendiente |
| 🔄 Pendiente | N+1 query detection            | Pendiente |
| 🔄 Pendiente | SQL injection linter           | Pendiente |
| 🔄 Pendiente | Secret scanning                | Pendiente |

---

## 5️⃣ Comparativa con Análisis Anterior

| Componente         | Estado Anterior | Nuevo Estado | Cambio                              |
| ------------------ | --------------- | ------------ | ----------------------------------- |
| Auth Universal     | 95%             | **98%**      | +3% - Telemetry agregado            |
| Rate Limiting      | 75%             | **90%**      | +15% - Auth endpoints protegidos 🆕 |
| Validaciones       | 50%             | **70%**      | +20% - Mejor cobertura 🆕           |
| Permisos/RLS       | 90%             | **95%**      | +5% - Mejoras menores               |
| Backend Guardrails | 20%             | **35%**      | +15% - ESLint + Logging 🆕          |
| Observabilidad     | N/A             | **90%**      | NUEVO - Telemetry completo 🆕       |
| **PROMEDIO**       | **66%**         | **80%**      | **+14%**                            |

---

## 🎯 Conclusión

### Estado actual: "Secure by Default con Observabilidad"

```
✅ Sistema NHI completo (tokens, hash, audit)
✅ RBAC con scopes granulares y wildcards
✅ Rate limiting por agente + global
✅ Ownership enforcement en recursos
✅ RLS admin-only por default
✅ Structured logging con Pino
✅ Agent Telemetry completo (Paso 2)
⚠️  Validaciones mejoradas pero no universal
🟡 Backend guardrails básicos implementados
```

### El diferenciador implementado

```typescript
// Solo Kitsuden tiene esto HOY:

"✅ Auth universal humano + agente (NHI)
 ✅ RBAC con wildcard scopes (read:*, admin:*)
 ✅ Rate limiting granular por agente
 ✅ Zero-Trust: validación en cada request
 ✅ Audit logging completo de agentes
 ✅ Agent Telemetry con tracing
 ✅ Structured logging con request tracing"
```

### Decisión recomendada (actualizada)

**Prioridad 1 (Completado):** ✅ Sistema de autenticación y telemetry - LISTO

**Prioridad 2:** Implementar ESLint plugin para:

- Validación obligatoria en POST/PUT/PATCH
- Detección de SQL crudo sin sanitización
- Warnings para rutas sin rate limiting explícito

**Prioridad 3:** Documentación de seguridad con ejemplos del nuevo sistema RBAC + Telemetry.

---

_Análisis actualizado - Kitsuden v0.8.0-beta_
