# 📚 Guía de Desarrollo: Grimoires y Realms

> **Estado:** Documentación técnica completa  
> **Audiencia:** Developers extendiendo GremiusCMS  
> **Prerrequisitos:** Bun, PostgreSQL, conocimiento de Hono + Drizzle ORM

---

## 🎯 Conceptos Fundamentales

### ¿Qué es un Grimoire?

Un **Grimoire** es un módulo funcional independiente que añade capacidades al sistema.

```
┌─────────────────────────────────────────────────────────────┐
│                    GremiusCMS Core                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Datasets    │  │ Auth        │  │ Media               │  │
│  │ (Core)      │  │ (Core)      │  │ (Core)              │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Analytics   │  │ Academy LMS │  │ Payments            │  │
│  │ (Optional)  │  │ (Optional)  │  │ (Optional)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│           ↑ Estos son Grimoires opcionales                  │
└─────────────────────────────────────────────────────────────┘
```

### ¿Qué es un Realm?

Un **Realm** es una **especialización de Gremius** para un nicho de mercado. Incluye grimoires pre-configurados y config específica.

```
┌─────────────────────────────────────────────────────────────┐
│ Realm: gaming-ecosystem                                     │
├─────────────────────────────────────────────────────────────┤
│  Grimoires incluidos:                                       │
│    • grimoire-games-db     (Builds, items, heroes)         │
│    • grimoire-marketplace  (Comprar/vender items)          │
│    • grimoire-tournaments  (Torneos y rankings)            │
│    • grimoire-datasets     (Blog, contenido)               │
│                                                             │
│  Configuración:                                             │
│    • Auth: Discord OAuth2                                   │
│    • Default templates: gaming                              │
│    • Webhooks: Twitch, Steam                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Directorios

```
packages/
├── grimoires/                    # Todos los grimoires
│   ├── grimoire-*/              # Cada uno con prefijo
│   │   ├── package.json
│   │   ├── index.ts             # Entry point (defineGrimoire)
│   │   ├── *.schema.ts          # Drizzle schemas
│   │   ├── *.routes.ts          # Hono routes
│   │   ├── *.service.ts         # Business logic (optional)
│   │   ├── *.types.ts           # TypeScript types (optional)
│   │   └── grimoire.json        # Grimoire manifest
│   │   └── README.md
│   └── grimoire-template/       # Template base
│
└── realms/                       # Especializaciones
    ├── realm.json               # Config de cada realm
    ├── gaming-ecosystem/
    ├── e-commerce/
    └── community/

apps/
├── api/src/
│   ├── grimoires.ts             # Registro de grimoires
│   └── realms.ts                # Registro de realms
```

---

## 🛠️ Crear un Nuevo Grimoire

### Paso 1: Generar estructura

```bash
# Usar el CLI de Gremius (genera estructura moderna automáticamente)
gremius create-grimoire my-feature

# Con configuración de admin incluida
gremius create-grimoire my-feature --with-admin

# O manualmente
cd packages/grimoires
mkdir grimoire-my-feature
cd grimoire-my-feature
```

### Paso 2: Package.json

```json
{
  "name": "@gremius/grimoire-my-feature",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@gremius/shared": "workspace:*",
    "@paralleldrive/cuid2": "^3.3.0",
    "hono": "^4.x",
    "drizzle-orm": "^0.x",
    "zod": "^3.x"
  },
  "peerDependencies": {
    "@gremius/shared": "workspace:*"
  }
}
```

### Paso 3: Schema (Drizzle)

```typescript
// my-feature.schema.ts
import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const myFeatureItems = pgTable("my_feature_items", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  status: text("status").default("draft").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // IMPORTANTE: Usar sintaxis de ARRAY, no objeto
  // ❌ NO: (t) => ({ idx: index("idx").on(t.name) })
  // ✅ SÍ: (t) => [index("idx").on(t.name)]
]);
```

**⚠️ Sobre índices:** Si necesitas `UNIQUE` compuestos, créalos en una migración SQL manual (ver `0023_academy_indexes.sql` como ejemplo).

### Paso 4: Service (Lógica de negocio)

```typescript
// src/my-feature.service.ts
import { db } from "@gremius/api/db";
import { myItemsTable } from "./my-feature.schema";
import { eq, desc } from "drizzle-orm";

export class MyFeatureService {
  async listItems(options: { limit?: number; category?: string } = {}) {
    const query = db.select().from(myItemsTable);
    
    if (options.category) {
      query.where(eq(myItemsTable.category, options.category));
    }
    
    return query
      .orderBy(desc(myItemsTable.createdAt))
      .limit(options.limit || 50);
  }
  
  async createItem(data: CreateItemInput) {
    const [item] = await db
      .insert(myItemsTable)
      .values({
        ...data,
        updatedAt: new Date(),
      })
      .returning();
    return item;
  }
  
  async getItem(id: string) {
    const [item] = await db
      .select()
      .from(myItemsTable)
      .where(eq(myItemsTable.id, id));
    return item;
  }
}

export const myFeatureService = new MyFeatureService();
```

### Paso 5: Routes (API)

```typescript
// my-feature.routes.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { GrimoireContext } from "@gremius/shared";
import { myFeatureItems } from "./my-feature.schema.js";

export function createMyFeatureRouter(ctx: GrimoireContext): Hono {
  const app = new Hono();
  const db = ctx.db.instance;
  const { requireAuth } = ctx.auth;

  app.use("/*", requireAuth);

  app.get("/items", async (c) => {
    const category = c.req.query("category");
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
    let query = db.select().from(myFeatureItems).limit(limit);
    if (category) query = query.where(eq(myFeatureItems.category, category));
    const items = await query;
    return c.json({ data: items });
  });

  app.get("/items/:id", async (c) => {
    const [item] = await db
      .select()
      .from(myFeatureItems)
      .where(eq(myFeatureItems.id, c.req.param("id")))
      .limit(1);
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json({ data: item });
  });

  const createSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string(),
  });

  app.post("/items", zValidator("json", createSchema), async (c) => {
    const data = c.req.valid("json");
    const [item] = await db
      .insert(myFeatureItems)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    return c.json({ data: item }, 201);
  });

  return app;
}
```

### Paso 6: Registro

```typescript
// index.ts
import type { GrimoireContext } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";
import { createMyFeatureRouter } from "./my-feature.routes.js";

export * from "./my-feature.schema.js";

export function createGrimoireMyFeature(ctx: GrimoireContext): Hono {
  const app = new Hono();
  app.route("/", createMyFeatureRouter(ctx));
  return app;
}

export const grimoire = defineGrimoire({
  id: "grimoire-my-feature",
  name: "My Feature",
  version: "0.1.0",
  description: "Descripción de lo que hace este grimoire",
  icon: "Box",
  mountPath: "/api/my-feature",
  createRouter: createGrimoireMyFeature,
  tables: ["myFeatureItems"],
  admin: {
    category: "content",
    views: [
      { id: "grid", type: "grid", title: "All Items", table: "myFeatureItems" },
    ],
  },
  dependencies: {
    grimoires: ["grimoire-media"],
    core: ["auth"],
  },
});

export default grimoire;
```

### Paso 7: Integrar en la API

Grimoires con `defineGrimoire` son **auto-descubiertos** por `apps/api/gremius.config.ts`. Si aparecen en `packages/grimoires/` y están habilitados en la config, el `module-loader` los monta automáticamente bajo su `mountPath`.

Solo si necesitas importar rutas manualmente (casos avanzados), añádelas en `apps/api/src/index.ts`:

```typescript
// apps/api/src/index.ts
import { myFeatureRoutes } from "@gremius/grimoire-my-feature";

// ...
app.route("/my-feature", myFeatureRoutes);
```

### Paso 8: Migración

```bash
# Generar migración
cd apps/api
bun drizzle-kit generate --name add_my_feature

# O crear manualmente si necesitas índices complejos
# Crear apps/api/src/db/migrations/00XX_my_feature.sql
```

---

## 🌍 Crear un Nuevo Realm

### Paso 1: Estructura

```bash
mkdir -p packages/realms/my-niche
cd packages/realms/my-niche
```

### Paso 2: Configuración (realm.json)

```json
{
  "name": "my-niche",
  "version": "0.1.0",
  "description": "Gremius especializado para mi nicho",
  "author": "Tu nombre",
  
  "grimoires": {
    "required": [
      "grimoire-datasets",
      "grimoire-media",
      "grimoire-my-feature"
    ],
    "optional": [
      "grimoire-analytics"
    ]
  },
  
  "templates": {
    "default": "minimal",
    "available": ["minimal", "full", "enterprise"]
  },
  
  "config": {
    "auth": {
      "defaultProvider": "discord",
      "providers": ["discord", "twitch", "email"]
    },
    "datasets": {
      "defaultSchemas": ["blog", "products", "events"]
    },
    "webhooks": {
      "default": ["discord", "slack"]
    }
  },
  
  "ui": {
    "theme": "dark",
    "primaryColor": "#6366f1",
    "logo": "/assets/my-logo.svg"
  }
}
```

### Paso 3: Templates

```
packages/realms/my-niche/templates/
├── minimal/                    # Setup básico
│   ├── docker-compose.yml
│   ├── realm.config.ts
│   └── README.md
├── full/                       # Con todos los grimoires
│   ├── docker-compose.yml
│   ├── realm.config.ts
│   └── README.md
└── enterprise/                 # Con alta disponibilidad
    ├── docker-compose.yml
    ├── realm.config.ts
    └── README.md
```

### Paso 4: Registro

```typescript
// apps/api/src/realms.ts
import myNicheConfig from "@gremius/realm-my-niche/realm.json";

export const realms = {
  "gaming-ecosystem": gamingConfig,
  "e-commerce": ecommerceConfig,
  "my-niche": myNicheConfig,  // ← Tu nuevo realm
};

export function getRealmConfig(name: string) {
  return realms[name] || realms["gaming-ecosystem"]; // default
}
```

---

## 🧪 Testing

### Unit Tests

```typescript
// src/my-feature.service.test.ts
import { describe, it, expect, beforeAll } from "bun:test";
import { MyFeatureService } from "./my-feature.service";

describe("MyFeatureService", () => {
  const service = new MyFeatureService();
  
  it("should create an item", async () => {
    const item = await service.createItem({
      name: "Test Item",
      category: "test",
    });
    expect(item.name).toBe("Test Item");
  });
});
```

### Integration Tests

```typescript
// tests/my-feature.api.test.ts
import { describe, it, expect } from "bun:test";

describe("My Feature API", () => {
  it("should list items", async () => {
    const res = await fetch("http://localhost:3001/api/my-feature/items");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
  });
});
```

---

## 📋 Checklist de Calidad

Antes de publicar tu grimoire:

- [ ] **Schema**: Índices correctos (array syntax), tipos apropiados
- [ ] **Service**: Métodos CRUD completos, manejo de errores
- [ ] **Routes**: Validación Zod, middleware de auth donde aplica
- [ ] **Tests**: Unit + Integration (mínimo 70% coverage)
- [ ] **Docs**: README con ejemplos de uso
- [ ] **Types**: Exporta todos los tipos TypeScript
- [ ] **Metadata**: Completa el objeto `metadata`
- [ ] **Migraciones**: Si hay cambios en DB, incluye migración
- [ ] **No breaking changes**: Si actualizas, mantén compatibilidad

---

## 💡 Buenas Prácticas

### 1. Usa el grimoire-datasets como base

```typescript
// Extiende datasets en lugar de crear tablas duplicadas
import { datasetEntry } from "@gremius/grimoire-datasets";

// Añade campos específicos a entries existentes
export const extendedEntry = {
  ...datasetEntry,
  customField: text("custom_field"),
};
```

### 2. Usa los hooks del sistema

```typescript
// src/hooks.ts
import { onEntryCreated, onEntryUpdated } from "@gremius/api/hooks";

onEntryCreated("products", async (entry) => {
  // Ejecuta lógica cuando se crea un producto
  await notifyAdmins(`Nuevo producto: ${entry.data.name}`);
});
```

### 3. Sigue las convenciones de nombres

```
Tablas: plural_snake_case (my_items, not myItems)
Campos: snake_case (created_at, not createdAt)
Routes: kebab-case (/my-feature/items, not /myFeature/items)
Files: kebab-case (my-feature.service.ts)
```

### 4. Manejo de errores consistente

```typescript
// Usa el error handler del sistema
import { GremiusError } from "@gremius/api/errors";

throw new GremiusError("NOT_FOUND", "Item not found", { itemId });
throw new GremiusError("VALIDATION", "Invalid input", { field: "email" });
throw new GremiusError("PERMISSION", "Admin required");
```

---

## 🚀 Publicar tu Grimoire

```bash
# 1. Build
bun run build

# 2. Test
bun test

# 3. Version bump
npm version minor

# 4. Publicar (si es open source)
npm publish --access public

# O si es privado del monorepo
# Solo commit a packages/grimoires/
```

---

## 📚 Ejemplos

### Ejemplo 1: Grimoire simple (sin DB)

```typescript
// index.ts - Solo routes (grimoire simple)
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";

const router = new Hono()
  .get("/health", (c) => c.json({ status: "ok" }));

export const grimoire = defineGrimoire({
  id: "grimoire-health-check",
  name: "Health Check",
  version: "0.1.0",
  description: "Simple health check endpoint",
  mountPath: "/api/health-check",
  createRouter: () => router,
});

export default grimoire;
```

### Ejemplo 2: Grimoire con WebSocket

```typescript
// src/realtime.routes.ts
import { createBunWebSocket } from "hono/bun";

const { upgradeWebSocket, websocket } = createBunWebSocket();

export const realtimeRoutes = new Hono()
  .get("/ws", upgradeWebSocket((c) => ({
    onMessage(event, ws) {
      ws.send(`Echo: ${event.data}`);
    },
  })));

export { websocket };
```

---

## ❓ FAQ

**Q: ¿Puedo usar un grimoire en múltiples realms?**  
A: ¡Sí! Los grimoires son reusables.

**Q: ¿Puedo sobrescribir un grimoire existente?**  
A: Sí, crea un fork en `packages/grimoires/grimoire-X-custom`

**Q: ¿Cómo dependo de otro grimoire?**  
A: En `package.json` como `peerDependency`, y en `metadata.requires`

**Q: ¿Necesito migraciones para cada cambio?**  
A: Solo si cambias la estructura de tablas. Para datos, usa el API.

---

## 🔗 Referencias

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Hono Framework](https://hono.dev)
- [Zod Validation](https://zod.dev)
- [Gremius Core](packages/grimoires/grimoire-core/README.md)

---

*¿Tienes dudas? Abre un issue en GitHub o pregunta en Discord.*
