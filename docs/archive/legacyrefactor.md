# Refactorización de Código Legacy - Kitsuden BaaS/CMS

> **Documento generado:** 2026-03-19  
> **Estado:** En progreso - Requiere atención prioritaria  
> **Errores estimados:** ~90 errores TypeScript

---

## 📋 Resumen Ejecutivo

Este documento cataloga todos los errores de código legacy que utilizan esquemas de base de datos o APIs antiguas que ya no son compatibles con la arquitectura actual del sistema. La mayoría de estos errores surgieron después de migraciones de esquema importantes que no fueron acompañadas de actualizaciones en el código consumidor.

### Categorías Principales de Deuda Técnica

1. **Unificación de Actions/Functions** - Esquema `functions` migrado a `actions`
2. **Migración de Data Explorer** - Cambios en KitsudenManifest y datasets
3. **Sistema MCP Legacy** - Cambios en interfaces de herramientas
4. **Módulos Desactivados** - Booking, Directory, DMS comentados pero con referencias
5. **Tests Obsoletos** - Tests que usan esquemas antiguos

---

## 🔴 Prioridad Alta - Bloqueantes

### 1. Sistema de Functions → Actions (packages/core/functions.ts)

**Archivo:** `packages/core/functions.ts`

| Error                                            | Descripción                                                                            | Solución Propuesta                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Property 'type' does not exist`                 | El esquema antiguo `functions` tenía campo `type`, el nuevo `actions` usa `actionType` | Actualizar todas las referencias de `fn.type` a `fn.actionType` |
| `Property 'schema' does not exist`               | El campo `schema` fue renombrado/migrado                                               | Verificar nuevo esquema de validación en tabla `actions`        |
| `Parameter 'input' implicitly has an 'any' type` | Falta tipado en función `executeFunction`                                              | Agregar tipado estricto basado en `ActionDefinition`            |

**Código problemático:**

```typescript
// ANTES (Legacy - functions table)
interface FunctionDefinition {
  id: string;
  name: string;
  type: "transform" | "validate" | "webhook";
  schema: JSONSchema;
  code: string;
}

// DESPUÉS (Actual - actions table)
interface ActionDefinition {
  id: string;
  name: string;
  actionType: "function" | "webhook" | "email";
  configuration: {
    code?: string;
    schema?: JSONSchema;
    // ...
  };
}
```

**Archivos afectados:**

- `packages/core/functions.ts` (líneas 15-89)
- `apps/api/src/routes/functions.ts` (si existe)

---

### 2. Data Explorer - KitsudenManifest (apps/api/src/routes/data-explorer.ts)

**Archivo:** `apps/api/src/routes/data-explorer.ts`

| Error                                                         | Descripción                                | Solución Propuesta                                            |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `Property 'tables' does not exist on type 'KitsudenManifest'` | El manifest cambió de estructura           | Actualizar a nueva estructura `datasets` en lugar de `tables` |
| `Property 'relations' does not exist`                         | Las relaciones ahora se definen diferente  | Usar nuevo sistema de relaciones en manifest                  |
| `Property 'indexes' does not exist`                           | Los índices migraron a metadatos separados | Acceder vía `manifest.metadata?.indexes`                      |

**Código problemático:**

```typescript
// ANTES (Legacy)
const manifest = await getManifest(konId);
const tables = manifest.tables; // ❌ Ya no existe
const relations = manifest.relations; // ❌ Ya no existe

// DESPUÉS (Actual)
const manifest = await getManifest(konId);
const datasets = manifest.datasets || []; // ✅ Nuevo campo
const tables = manifest.metadata?.tablesSnapshot; // ✅ Si se necesita snapshot
```

---

### 3. Tests de Autenticación Obsoletos (tests/auth.test.ts)

**Archivo:** `tests/auth.test.ts`

| Error                                      | Descripción                                   | Solución Propuesta                             |
| ------------------------------------------ | --------------------------------------------- | ---------------------------------------------- |
| `Cannot find name 'grantPermission'`       | Función movida o renombrada                   | Actualizar import a nuevo módulo RBAC          |
| `Property 'apiKeys' does not exist`        | El sistema de API keys legacy fue reemplazado | Migrar tests a nuevo sistema `AgentIdentities` |
| `Type 'HonoRequest' is missing properties` | Tests usan mocks antiguos                     | Actualizar mocks para coincidir con Hono v4    |

**Contexto:** Los tests fueron escritos para el sistema RBAC legacy antes de la migración a AgentIdentities con campos de Persona.

---

## 🟡 Prioridad Media - Funcionalidad Degradada

### 4. Sistema MCP - Interfaces de Herramientas

**Archivos afectados:**

- `apps/api/src/lib/mcp.ts`
- `apps/api/src/services/agent-mcp.ts` (si existe)

| Error                                   | Descripción                            | Solución Propuesta                             |
| --------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `Type 'MCPTool' is not assignable`      | Cambio en interfaz de herramientas MCP | Actualizar a `MCPToolDefinition` del SDK nuevo |
| `Property 'execute' does not exist`     | Las herramientas ahora usan `handler`  | Renombrar `execute` → `handler`                |
| `Parameter 'args' implicitly has 'any'` | Falta tipado en handlers               | Agregar `z.infer<typeof toolSchema>`           |

**Código problemático:**

```typescript
// ANTES (Legacy MCP)
interface MCPTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (args: any) => Promise<any>;
}

// DESPUÉS (Actual - MCP SDK)
interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  handler: (args: z.infer<typeof parameters>) => Promise<CallToolResult>;
}
```

---

### 5. Módulos Desactivados con Referencias Activas

**Estado:** Los siguientes módulos están comentados en `schema-all.ts` pero tienen código que los referencia:

#### 5.1 Booking/Sistema de Reservas

**Referencias encontradas en:**

- Comentado en: `apps/api/src/db/schema-all.ts` (líneas ~50-80)
- Rutas potencialmente activas: `apps/api/src/routes/booking*.ts`

**Solución:**

- Opción A: Eliminar completamente si no se usará
- Opción B: Migrar a arquitectura de Kon standalone

#### 5.2 Directory (Directorio de Negocios)

**Referencias encontradas en:**

- Comentado en: `apps/api/src/db/schema-all.ts`
- Posiblemente en: `apps/api/src/routes/directory.ts`

#### 5.3 DMS (Document Management System)

**Referencias encontradas en:**

- Comentado en: `apps/api/src/db/schema-all.ts`

#### 5.4 Media Library (ahora es Kon separado)

**Código afectado:**

```typescript
// EN: apps/api/src/index.ts (comentado)
// import { mediaLibraryRoutes } from './routes/media-library';

// EN: apps/api/src/index.ts (comentado)
// import { dataSetsRoutes } from './routes/data-sets';
```

**Solución:** Estos ahora son Kons independientes que deben registrarse vía sistema de plugins, no rutas directas.

---

### 6. Sistema de Webhooks Legacy

**Archivo:** `apps/api/src/services/webhooks.ts` (si existe referencia legacy)

| Error                                      | Descripción                        | Solución Propuesta                                     |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| `Cannot find module '../db/schema'`        | Referencia a esquema antiguo       | Actualizar a `schema-all.ts` con exports condicionales |
| `Property 'webhook_events' does not exist` | Tabla renombrada a `webhookEvents` | Actualizar referencias a nuevo camelCase               |

---

### 7. Conectores con Esquema Antiguo

**Archivos potencialmente afectados:**

- `apps/api/src/services/connectors/*.ts`
- `apps/api/src/routes/connectors.ts`

| Error                               | Descripción                        | Solución Propuesta               |
| ----------------------------------- | ---------------------------------- | -------------------------------- |
| `Property 'config' does not exist`  | Campo renombrado a `configuration` | Actualizar todas las referencias |
| `Property 'type' is not assignable` | Tipo restrictivo cambiado          | Usar nuevo enum `ConnectorType`  |

---

## 🟢 Prioridad Baja - Mejoras de Calidad

### 8. Tipado Implícito en Parámetros

**Múltiples archivos afectados**

| Patrón                                          | Ubicaciones                        | Solución                                               |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `Parameter 't' implicitly has an 'any' type`    | `content-publishing.ts`, `kons.ts` | Agregar tipado explícito `t: any` o mejor `t: Context` |
| `Parameter 'c' implicitly has an 'any' type`    | Varios handlers de Hono            | Agregar `c: Context<AppBindings>`                      |
| `Parameter 'data' implicitly has an 'any' type` | Callbacks y handlers               | Definir interfaces apropiadas                          |

**Ejemplo de corrección:**

```typescript
// ANTES
app.post("/route", async (c) => {
  const t = c.get("something"); // ❌ any
});

// DESPUÉS
app.post("/route", async (c: Context<AppBindings>) => {
  const t: KonContext = c.get("konContext"); // ✅ tipado
});
```

---

### 9. Imports No Utilizados

**Archivos con imports muertos:**

- `apps/api/src/index.ts` - `migrate` importado pero no siempre usado
- `apps/api/src/services/agent-auth.ts` - imports legacy de bcrypt (si aún existen)

---

## 📊 Matriz de Dependencias

```
┌─────────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Módulo              │ Depende de      │ Impacto         │ Esfuerzo        │
├─────────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ functions.ts        │ actions schema  │ Alto            │ Medio (2-3d)    │
│ data-explorer.ts    │ manifest v2     │ Alto            │ Bajo (1d)       │
│ tests/auth.test.ts  │ RBAC legacy     │ Medio           │ Alto (3-5d)     │
│ mcp.ts              │ MCP SDK 1.6+    │ Medio           │ Medio (2d)      │
│ booking/*           │ schema-all      │ Bajo            │ Alto (migrar)   │
│ directory/*         │ schema-all      │ Bajo            │ Alto (migrar)   │
│ connectors/*        │ connectors tbl  │ Medio           │ Bajo (1d)       │
└─────────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

---

## 🛠️ Plan de Refactorización Recomendado

### Fase 1: Correcciones Rápidas (1-2 días)

1. ✅ ~~Corregir tipos implícitos en parámetros~~ (ya hecho)
2. ✅ ~~Eliminar imports no utilizados~~ (ya hecho)
3. Actualizar `data-explorer.ts` a nueva estructura de manifest
4. Comentar/eliminar código de módulos desactivados

### Fase 2: Migración Functions → Actions (2-3 días)

1. Analizar todas las funciones registradas en producción
2. Migrar definiciones de `functions` a `actions`
3. Actualizar `packages/core/functions.ts` a nuevo esquema
4. Testing de funciones críticas

### Fase 3: Tests y MCP (3-5 días)

1. Reescribir `tests/auth.test.ts` para nuevo sistema
2. Actualizar integraciones MCP a SDK 1.6+
3. Agregar tests para AgentIdentities

### Fase 4: Limpieza de Módulos (Opcional)

1. Decidir destino de Booking/Directory/DMS
2. Migrar a Kons independientes o eliminar
3. Actualizar documentación

---

## 📝 Checklist de Verificación

- [ ] `packages/core/functions.ts` compila sin errores
- [ ] `apps/api/src/routes/data-explorer.ts` compila sin errores
- [ ] `tests/auth.test.ts` pasa completamente
- [ ] `apps/api/src/lib/mcp.ts` usa SDK actualizado
- [ ] No hay referencias a tablas comentadas en `schema-all.ts`
- [ ] Todos los parámetros tienen tipado explícito
- [ ] El build de producción (`bun run build`) es exitoso
- [ ] Tests de integración pasan

---

## 🔗 Referencias Relacionadas

- [KON_CORE_MIGRATION_PLAN.md](./KON_CORE_MIGRATION_PLAN.md)
- [AGENTS.md](./AGENTS.md) - Arquitectura de Agentes
- [DEUDA_TECNICA.md](./DEUDA_TECNICA.md) - Deuda técnica general
- [MCP_SDK_AUDIT.md](./MCP_SDK_AUDIT.md) - Auditoría MCP

---

## 💡 Notas para Desarrolladores

> **Importante:** Antes de comenzar cualquier refactorización:
>
> 1. Crear rama feature específica
> 2. Verificar que los cambios no afecten datos en producción
> 3. Coordinar con equipo sobre migraciones de base de datos necesarias
> 4. Actualizar este documento con progreso

**Contacto para dudas:** Ver historial de cambios en `agent-auth.ts` y `module-loader.ts` para ejemplos de migraciones exitosas recientes.
