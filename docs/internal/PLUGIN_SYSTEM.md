# Kitsuden Plugin System

Documentación del sistema de plugins y CLI de Kitsuden.

## 🏗️ Arquitectura

### Niveles del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEL 1: ENGINE (Siempre activo)                               │
│  ├── Auth (Better-Auth)                                         │
│  ├── Database (Drizzle + PostgreSQL)                            │
│  ├── Cache (Valkey)                                             │
│  └── Workers (BullMQ)                                           │
├─────────────────────────────────────────────────────────────────┤
│  NIVEL 2: CORE (Switchable via feature flags)                   │
│  ├── DataSets (siempre activo)                                  │
│  ├── Media Library                                              │
│  ├── Webhooks                                                   │
│  └── Connectors                                                 │
├─────────────────────────────────────────────────────────────────┤
│  NIVEL 3: KONS (Plugins dinámicos)                         │
│  ├── Locales: packages/kons/                               │
│  ├── NPM: node_modules/@kitsuden/kon-*                      │
│  └── Marketplace: DB registry                                   │
├─────────────────────────────────────────────────────────────────┤
│  NIVEL 4: GRIMOIRES (Starters/Templates)                           │
│  ├── grimoire-default, grimoire-esports, grimoire-blog                   │
│  └── Descargables como starters                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Instalación de Plugins

### Desde NPM (Oficiales)

```bash
kitsuden plugin install blog
kitsuden plugin install stripe
kitsuden plugin install shopify
```

Se resuelven automáticamente como `@kitsuden/kon-{name}`.

### Desde NPM (3rd Party)

```bash
# Scoped
kitsuden plugin install @company/kon-custom

# Community
kitsuden plugin install kon-awesome-feature
```

### Desde GitHub

```bash
kitsuden plugin install owner/repo --source github
```

## 🔧 Resolución de Kons

El sistema busca kons en este orden:

1. **Local**: `packages/kons/kon-{name}/`
2. **NPM Oficial**: `node_modules/@kitsuden/kon-{name}/`
3. **NPM Shorthand**: `node_modules/@kitsuden/{name}/`
4. **Community**: `node_modules/kon-{name}/`
5. **Scoped 3rd Party**: `node_modules/@scope/kon-{name}/`
6. **Legacy**: `apps/api/src/modules/{name}/`

## 🏰 Grimoires como Starters

Los grimoires son plantillas completas que incluyen:

- Configuración predefinida
- Kons recomendados
- Estilos/CSS base
- Estructura de datos inicial

### Crear proyecto desde un grimoire:

```bash
# Listar grimoires disponibles
kitsuden grimoire list

# Crear proyecto
kitsuden new my-game --grimoire esports
kitsuden new my-blog --grimoire blog
kitsuden new my-store --grimoire ecommerce
```

### Estructura de un Grimoire:

```
packages/grimoires/grimoire-esports/
├── grimoire.json              # Manifest del grimoire
├── variables.css           # Variables CSS del tema
└── kons/              # Kons específicos (opcional)
    └── custom-kon/
```

### grimoire.json:

```json
{
  "id": "grimoire-esports",
  "name": "Esports Grimoire",
  "description": "Gaming platform with tournaments",
  "version": "2.0.0",
  "type": "grimoire",
  "kons": ["kon-games", "kon-streamers", "kon-tournaments"],
  "optional_kons": ["kon-crm"],
  "config": {
    "theme": {
      "css_entry": "variables.css",
      "primary_color": "#00e5ff"
    }
  }
}
```

## 🗄️ Base de Datos

### Tabla: installed_kons

```sql
CREATE TABLE installed_kons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kon_id VARCHAR(200) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    source ENUM('local', 'npm', 'github', 'marketplace', 'legacy'),
    source_url TEXT,              -- npm package name
    path TEXT NOT NULL,           -- filesystem path
    manifest JSONB,               -- kon.json content
    config JSONB DEFAULT '{}',    -- plugin config
    enabled BOOLEAN DEFAULT true,
    installed_by_id TEXT REFERENCES auth_users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
```

## 📝 Crear un Kon

### 1. Estructura mínima

```
kon-myfeature/
├── package.json
├── kon.json
└── index.ts
```

### 2. package.json

```json
{
  "name": "@kitsuden/kon-myfeature",
  "version": "1.0.0",
  "description": "My awesome kon",
  "kitsuden": {
    "type": "kon",
    "id": "kon-myfeature",
    "minVersion": "2.0.0"
  },
  "peerDependencies": {
    "@kitsuden/engine": "^2.0.0"
  },
  "keywords": ["kitsuden", "kon", "feature"]
}
```

### 3. kon.json

```json
{
  "id": "kon-myfeature",
  "name": "My Feature",
  "description": "Adds awesome functionality",
  "version": "1.0.0",
  "icon": "Star",
  "tables": ["my_data"],
  "mount": {
    "path": "/api/my-feature"
  },
  "admin": {
    "category": "content",
    "defaultView": "grid"
  }
}
```

### 4. index.ts (Moderno con DI)

```typescript
import { Hono } from "hono";
import { defineKon } from "@kitsuden/shared";
import { myTable } from "./schema";

export const kon = defineKon({
  id: "kon-myfeature",
  name: "My Feature",
  version: "1.0.0",
  icon: "Star",

  createRouter: (ctx) => {
    const router = new Hono();

    // Use injected dependencies
    router.get("/", async (c) => {
      const data = await ctx.db.instance.select().from(myTable);
      return c.json(data);
    });

    router.post("/", ctx.auth.requireAuth, async (c) => {
      const body = await c.req.json();

      // Emit event
      ctx.events.emit("myfeature:created", body);

      // Cache result
      await ctx.cache.set(`myfeature:${body.id}`, body, 300);

      return c.json({ success: true });
    });

    return router;
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("MyFeature started!");

      // Check if table exists
      const exists = await ctx.db.tableExists("my_data");
      if (!exists) {
        ctx.logger.warn("Table my_data does not exist, run migrations!");
      }
    },
    onEnable: async (ctx) => {
      ctx.logger.info("MyFeature enabled!");
    },
    onDisable: async (ctx) => {
      ctx.logger.info("MyFeature disabled!");
    },
  },

  dependencies: {
    kons: ["kon-media"], // Requires media kon
    core: ["webhooks"], // Requires webhooks feature
  },
});
```

### 5. schema.ts (Opcional)

```typescript
import { pgTable, uuid, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";

export const myTable = pgTable("my_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

## 🚀 Publicar un Kon

```bash
# 1. Build
npm run build

# 2. Test locally
npm link
cd /path/to/kitsuden-project
npm link @yourscope/kon-myfeature

# 3. Publish to npm
npm publish --access public

# 4. Install via CLI
kitsuden plugin install @yourscope/kon-myfeature
```

## 🎯 Ciclo de Vida de un Kon

```
Install
  ↓
npm install @kitsuden/kon-xxx
  ↓
Register in DB (installed_kons)
  ↓
Load on Startup
  ↓
Resolve path (node_modules → kon.json)
  ↓
Import index.ts
  ↓
Call createRouter(ctx) with injected dependencies
  ↓
Mount routes at /api/{kon-id}
  ↓
Execute onStartup() hook
  ↓
Ready!
```

## 🔐 Seguridad

- Los kons se ejecutan en el mismo proceso que la API
- Usan el contexto inyectado (no pueden importar directamente de apps/api/)
- Las migraciones SQL deben ser revisadas antes de ejecutarse
- Los kons de 3rd party muestran warning antes de instalarse

## 📊 API Endpoints (Admin)

```
GET  /api/admin/kons           # List all available
GET  /api/admin/kons/installed # List installed
POST /api/admin/kons/install   # Install from npm
POST /api/admin/kons/:id/enable
POST /api/admin/kons/:id/disable
DELETE /api/admin/kons/:id     # Uninstall
```

## 🛣️ Roadmap

- [x] Soporte node_modules en module-loader
- [x] Tabla installed_kons
- [x] CLI básico (install, uninstall, list)
- [x] Grimoires como starters
- [ ] API del Marketplace
- [ ] Sistema de reviews/ratings
- [ ] Validación de seguridad automática
- [ ] Firma digital de kons
- [ ] Sandboxing de kons (VM2/QuickJS)
