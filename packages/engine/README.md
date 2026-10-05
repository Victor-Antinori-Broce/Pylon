# @kitsuden/engine - Core Framework

Nivel 1 del framework Kitsuden - Motor infrahumano que nunca se apaga.

## Módulos

### 1. Actions Layer (`src/actions.ts`)

Sistema unificado de acciones que pueden ejecutarse vía HTTP, Eventos o Agentes MCP.

```typescript
import { defineAction } from "@kitsuden/engine/actions";

defineAction({
  trigger: "http.post:/webhooks/stripe",
  run: async ({ payload, db }) => ({ processed: true }),
});
```

### 2. Kon System (`src/kon.ts`)

Auto-API & MCP Generator - Transforma modelos Drizzle en APIs REST y tools MCP.

```typescript
import { defineKon, InferKonSelect } from "@kitsuden/engine/kon";
import { myTable } from "./schema";

type MyRow = InferKonSelect<typeof myTable>;

const kon = defineKon({
  id: "my-kon",
  models: [myTable],
  actions: [
    {
      trigger: "http.post:/custom",
      run: async ({ payload }) => ({ success: true }),
    },
  ],
});

kon.initialize(ctx, hono, mcpServer);
```

## Convenciones

### Rutas Auto-generadas

Por cada modelo se generan:

```
GET    /api/{kon}/{table}       # Listar
POST   /api/{kon}/{table}       # Crear
GET    /api/{kon}/{table}/:id   # Leer
PATCH  /api/{kon}/{table}/:id   # Actualizar
DELETE /api/{kon}/{table}/:id   # Eliminar
```

### Tools MCP Auto-generadas

Por cada modelo se generan:

```
{kon}_read_{table}     # Query con filtros
{kon}_create_{table}   # Crear registro
```

## Type Checking

```bash
# Verificación de tipos con tabla dummy
npx tsc packages/engine/src/type-check.ts --noEmit --skipLibCheck
```

## Exports

### Actions

- `defineAction()` - Definir acción
- `initActions()` - Inicializar sistema
- `parseTrigger()` - Parsear trigger string

### Kon

- `defineKon()` - Definir kon
- `registerKon()` - Registrar globalmente
- `initializeKons()` - Inicializar todos
- `InferKonSelect<T>` - Inferir tipo Select
- `InferKonInsert<T>` - Inferir tipo Insert
