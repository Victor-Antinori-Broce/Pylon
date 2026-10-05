# 🚀 Kitsuden DX & OpenAPI Implementation Guide

> **Fecha:** 2026-04-08  
> **Versión:** 2.0.0  
> **Estado:** ✅ Completado

---

## 📋 Resumen

Esta implementación añade capacidades avanzadas de Developer Experience (DX) para programadores y agentes de IA, junto con generación automática de documentación OpenAPI desde los kons.

## 🎯 Nuevas Características

### 1. OpenAPI Dinámico desde Kons

Los kons ahora pueden definir su propia documentación OpenAPI declarativa:

```typescript
export const kon = defineKon({
  id: "kon-blog",
  name: "Blog",

  // ✅ OpenAPI Specification
  openApi: {
    tags: [{ name: "Blog", description: "Blog posts management" }],
    schemas: {
      Post: PostSchema,
      CreatePost: CreatePostSchema,
    },
    paths: [
      {
        method: "get",
        path: "/posts",
        summary: "List all posts",
        tags: ["Blog"],
        query: z.object({ limit: z.number().optional() }),
        responses: {
          200: { description: "List of posts", schema: z.array(PostSchema) },
        },
      },
    ],
  },

  createRouter: (ctx) => {
    /* ... */
  },
});
```

**Endpoints generados automáticamente:**

- `GET /api/docs/openapi.json` - Spec completo de todos los kons
- `GET /api/docs/:kon/openapi.json` - Spec de un kon específico
- `GET /api/docs/` - Swagger UI
- `GET /api/docs/modern` - Scalar UI (moderno)
- `GET /api/docs/operations` - Lista todas las operaciones disponibles
- `GET /api/docs/kons` - Lista kons con estado OpenAPI

### 2. MCP Server Mejorado

Nuevas herramientas para agentes de IA:

#### Herramientas

| Tool                         | Descripción                     |
| ---------------------------- | ------------------------------- |
| `kitsuden_intelligent_query` | Queries en lenguaje natural     |
| `kitsuden_generate_kon`      | Genera boilerplate de kons      |
| `kitsuden_introspect_schema` | Inspecciona schemas de datasets |
| `kitsuden_batch_operations`  | Operaciones CRUD en batch       |
| `kitsuden_validate_code`     | Valida código TypeScript        |

#### Resources

| Resource          | URI                                | Descripción                  |
| ----------------- | ---------------------------------- | ---------------------------- |
| Project Context   | `kitsuden://project-context`       | Estado completo del proyecto |
| Dataset Schema    | `kitsuden://dataset/{id}/schema`   | Schema de un dataset         |
| Kon Capabilities  | `kitsuden://kon/{id}/capabilities` | Endpoints de un kon          |
| API Operations    | `kitsuden://api-operations`        | Todas las operaciones        |
| Development Guide | `kitsuden://dev-guide`             | Guía de desarrollo           |

### 3. CLI para Agentes

Nuevos comandos:

```bash
# Generar kon desde descripción
kitsuden agent create-kon inventory \
  --description "Inventory management system" \
  --features crud,relations,webhooks \
  --data-model "Products with categories and stock"

# Validar código
kitsuden agent validate \
  --kon inventory \
  --security \
  --fix

# Debug MCP
kitsuden agent debug-mcp \
  --token kitsuden_agent_xxx \
  --url http://localhost:3001

# Inicializar config para agentes
kitsuden agent init \
  --editor cursor \
  --force

# Generar SDK
kitsuden generate-sdk \
  --kon inventory \
  --lang typescript \
  --output ./sdk
```

---

## 📁 Archivos Creados/Modificados

### Shared Types

```
packages/shared/src/kon-api.ts       # + OpenAPI types
packages/shared/src/index.ts              # + Exports
```

### OpenAPI Aggregator

```
apps/api/src/lib/openapi-aggregator.ts    # Nuevo
apps/api/src/routes/docs-dynamic.ts       # Nuevo
apps/api/src/index.ts                     # + Import & route
```

### MCP Server

```
packages/mcp-server/src/tools-enhanced.ts    # Nuevo
packages/mcp-server/src/project-context.ts   # Nuevo
packages/mcp-server/src/index-enhanced.ts    # Nuevo
```

### CLI

```
packages/cli/src/commands/agent.ts        # Nuevo
packages/cli/src/index.ts                 # + Commands
```

---

## 🚀 Uso Rápido

### Para Agentes de IA

```bash
# 1. Inicializar proyecto
kitsuden agent init --editor claude

# 2. Ver contexto del proyecto (via MCP)
# Resource: kitsuden://project-context

# 3. Generar un kon
kitsuden agent create-kon events \
  --description "Event management with calendar" \
  --features crud,webhooks

# 4. Validar
kitsuden agent validate

# 5. Ver OpenAPI
open http://localhost:3001/api/docs/
```

### Para Desarrolladores

```typescript
// 1. Definir kon con OpenAPI
export const kon = defineKon({
  id: "kon-myfeature",
  openApi: {
    tags: [{ name: "MyFeature", description: "..." }],
    schemas: { MySchema },
    paths: [
      { method: "get", path: "/", summary: "List", responses: { 200: { schema: z.array(MySchema) } } }
    ]
  },
  createRouter: (ctx) => { /* ... */ }
});

// 2. Documentación automática en:
// http://localhost:3001/api/docs/openapi.json
// http://localhost:3001/api/docs/

// 3. Generar SDK cliente
kitsuden generate-sdk --lang typescript --output ./sdk
```

---

## 📊 Especificación OpenAPI

### Ejemplo de Kon con OpenAPI

```typescript
import { Hono } from "hono";
import { defineKon } from "@kitsuden/shared";
import { z } from "zod";

const GameSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "550e8400..." }),
    title: z.string().openapi({ example: "The Witcher 3" }),
    rating: z.number().min(0).max(10).openapi({ example: 9.5 }),
    releasedAt: z.string().datetime().openapi({ example: "2015-05-19T00:00:00Z" }),
  })
  .openapi("Game");

export const kon = defineKon({
  id: "kon-games",
  name: "Games",
  version: "2.0.0",
  description: "Video game catalog with ratings",

  openApi: {
    tags: [
      {
        name: "Games",
        description: "Video game catalog management",
        externalDocs: { url: "https://docs.kitsuden.dev/games" },
      },
    ],
    schemas: {
      Game: GameSchema,
      CreateGame: GameSchema.omit({ id: true }),
    },
    paths: [
      {
        method: "get",
        path: "/games",
        summary: "List games",
        description: "Get all games with optional filtering",
        tags: ["Games"],
        query: z.object({
          rating: z.number().optional().describe("Minimum rating filter"),
          year: z.number().optional().describe("Release year"),
          limit: z.number().default(50).describe("Max results"),
        }),
        responses: {
          200: {
            description: "List of games",
            schema: z.object({
              data: z.array(GameSchema),
              total: z.number(),
            }),
          },
          500: {
            description: "Server error",
            schema: z.object({ error: z.string() }),
          },
        },
      },
      {
        method: "post",
        path: "/games",
        summary: "Create game",
        tags: ["Games"],
        body: GameSchema.omit({ id: true }),
        requireAuth: true,
        rateLimit: { requests: 10, window: "1m" },
        responses: {
          201: { description: "Created", schema: GameSchema },
          400: { description: "Invalid input", schema: z.object({ error: z.string() }) },
          401: { description: "Unauthorized", schema: z.object({ error: z.string() }) },
        },
      },
    ],
    webhooks: {
      gameCreated: {
        post: {
          summary: "Game created webhook",
          requestBody: {
            content: {
              "application/json": {
                schema: z.object({
                  event: z.literal("game.created"),
                  data: GameSchema,
                }),
              },
            },
          },
        },
      },
    },
  },

  createRouter: (ctx) => {
    const router = new Hono();

    router.get("/games", async (c) => {
      // Implementation
    });

    router.post("/games", ctx.auth.requireAuth, async (c) => {
      // Implementation
      ctx.events.emit("game.created", newGame);
    });

    return router;
  },
});
```

---

## 🧪 Testing

### Verificar OpenAPI

```bash
# Listar operaciones
curl http://localhost:3001/api/docs/operations | jq

# Obtener spec completo
curl http://localhost:3001/api/docs/openapi.json | jq '.paths | keys'

# Spec de un kon
curl http://localhost:3001/api/docs/games/openapi.json | jq
```

### Verificar MCP

```bash
# Debug MCP
kitsuden agent debug-mcp

# Ver recursos disponibles (desde Claude/Cursor)
# "List your available resources"

# Usar herramientas
# "Query games with rating above 8 using kitsuden_intelligent_query"
```

---

## 📈 Roadmap Futuro

- [ ] Validación automática de specs OpenAPI
- [ ] Generación de tests desde specs
- [ ] Playground interactivo para MCP tools
- [ ] Marketplace de kons con verificación
- [ ] SDK generados automáticamente en CI/CD

---

## 📚 Referencias

- [OpenAPI 3.0 Spec](https://swagger.io/specification/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Zod Documentation](https://zod.dev/)

---

**¡Listo!** Tu framework Kitsuden ahora tiene DX de clase mundial para desarrolladores y agentes de IA. 🎉
