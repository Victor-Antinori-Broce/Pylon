# @gremius/engine - Core Framework

Nivel 1 del framework Gremius - Motor infrahumano que nunca se apaga.

## Módulos

### 1. Actions Layer (`src/actions.ts`)

Sistema unificado de acciones que pueden ejecutarse vía HTTP, Eventos o Agentes MCP.

```typescript
import { defineAction } from "@gremius/engine/actions";

defineAction({
  trigger: "http.post:/webhooks/stripe",
  run: async ({ payload, db }) => ({ processed: true }),
});
```

### 2. Grimoire System (`src/grimoire.ts`)

Auto-API & MCP Generator - Transforma modelos Drizzle en APIs REST y tools MCP.

```typescript
import { defineGrimoire, InferGrimoireSelect } from "@gremius/engine/grimoire";
import { myTable } from "./schema";

type MyRow = InferGrimoireSelect<typeof myTable>;

const grimoire = defineGrimoire({
  id: "my-grimoire",
  models: [myTable],
  actions: [
    {
      trigger: "http.post:/custom",
      run: async ({ payload }) => ({ success: true }),
    },
  ],
});

grimoire.initialize(ctx, hono, mcpServer);
```

## Convenciones

### Rutas Auto-generadas

Por cada modelo se generan:

```
GET    /api/{grimoire}/{table}       # Listar
POST   /api/{grimoire}/{table}       # Crear
GET    /api/{grimoire}/{table}/:id   # Leer
PATCH  /api/{grimoire}/{table}/:id   # Actualizar
DELETE /api/{grimoire}/{table}/:id   # Eliminar
```

### Tools MCP Auto-generadas

Por cada modelo se generan:

```
{grimoire}_read_{table}     # Query con filtros
{grimoire}_create_{table}   # Crear registro
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

### Grimoire

- `defineGrimoire()` - Definir grimoire
- `registerGrimoire()` - Registrar globalmente
- `initializeGrimoires()` - Inicializar todos
- `InferGrimoireSelect<T>` - Inferir tipo Select
- `InferGrimoireInsert<T>` - Inferir tipo Insert
