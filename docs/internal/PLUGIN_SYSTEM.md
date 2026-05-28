# Gremius Plugin System

Documentación del sistema de plugins y CLI de GremiusCMS.

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
│  NIVEL 3: GRIMOIRES (Plugins dinámicos)                         │
│  ├── Locales: packages/grimoires/                               │
│  ├── NPM: node_modules/@gremius/grimoire-*                      │
│  └── Marketplace: DB registry                                   │
├─────────────────────────────────────────────────────────────────┤
│  NIVEL 4: REALMS (Starters/Templates)                           │
│  ├── realm-default, realm-esports, realm-blog                   │
│  └── Descargables como starters                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Instalación de Plugins

### Desde NPM (Oficiales)

```bash
gremius plugin install blog
gremius plugin install stripe
gremius plugin install shopify
```

Se resuelven automáticamente como `@gremius/grimoire-{name}`.

### Desde NPM (3rd Party)

```bash
# Scoped
gremius plugin install @company/grimoire-custom

# Community
gremius plugin install grimoire-awesome-feature
```

### Desde GitHub

```bash
gremius plugin install owner/repo --source github
```

## 🔧 Resolución de Grimoires

El sistema busca grimoires en este orden:

1. **Local**: `packages/grimoires/grimoire-{name}/`
2. **NPM Oficial**: `node_modules/@gremius/grimoire-{name}/`
3. **NPM Shorthand**: `node_modules/@gremius/{name}/`
4. **Community**: `node_modules/grimoire-{name}/`
5. **Scoped 3rd Party**: `node_modules/@scope/grimoire-{name}/`
6. **Legacy**: `apps/api/src/modules/{name}/`

## 🏰 Realms como Starters

Los realms son plantillas completas que incluyen:
- Configuración predefinida
- Grimoires recomendados
- Estilos/CSS base
- Estructura de datos inicial

### Crear proyecto desde un realm:

```bash
# Listar realms disponibles
gremius realm list

# Crear proyecto
gremius new my-game --realm esports
gremius new my-blog --realm blog
gremius new my-store --realm ecommerce
```

### Estructura de un Realm:

```
packages/realms/realm-esports/
├── realm.json              # Manifest del realm
├── variables.css           # Variables CSS del tema
└── grimoires/              # Grimoires específicos (opcional)
    └── custom-grimoire/
```

### realm.json:

```json
{
  "id": "realm-esports",
  "name": "Esports Realm",
  "description": "Gaming platform with tournaments",
  "version": "2.0.0",
  "type": "realm",
  "grimoires": [
    "grimoire-games",
    "grimoire-streamers",
    "grimoire-tournaments"
  ],
  "optional_grimoires": ["grimoire-crm"],
  "config": {
    "theme": {
      "css_entry": "variables.css",
      "primary_color": "#00e5ff"
    }
  }
}
```

## 🗄️ Base de Datos

### Tabla: installed_grimoires

```sql
CREATE TABLE installed_grimoires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grimoire_id VARCHAR(200) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    source ENUM('local', 'npm', 'github', 'marketplace', 'legacy'),
    source_url TEXT,              -- npm package name
    path TEXT NOT NULL,           -- filesystem path
    manifest JSONB,               -- grimoire.json content
    config JSONB DEFAULT '{}',    -- plugin config
    enabled BOOLEAN DEFAULT true,
    installed_by_id TEXT REFERENCES auth_users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
```

## 📝 Crear un Grimoire

### 1. Estructura mínima

```
grimoire-myfeature/
├── package.json
├── grimoire.json
└── index.ts
```

### 2. package.json

```json
{
  "name": "@gremius/grimoire-myfeature",
  "version": "1.0.0",
  "description": "My awesome grimoire",
  "gremius": {
    "type": "grimoire",
    "id": "grimoire-myfeature",
    "minVersion": "2.0.0"
  },
  "peerDependencies": {
    "@gremius/engine": "^2.0.0"
  },
  "keywords": ["gremius", "grimoire", "feature"]
}
```

### 3. grimoire.json

```json
{
  "id": "grimoire-myfeature",
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
import { defineGrimoire } from "@gremius/shared";
import { myTable } from "./schema";

export const grimoire = defineGrimoire({
  id: "grimoire-myfeature",
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
    }
  },
  
  dependencies: {
    grimoires: ["grimoire-media"],  // Requires media grimoire
    core: ["webhooks"]              // Requires webhooks feature
  }
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

## 🚀 Publicar un Grimoire

```bash
# 1. Build
npm run build

# 2. Test locally
npm link
cd /path/to/gremius-project
npm link @yourscope/grimoire-myfeature

# 3. Publish to npm
npm publish --access public

# 4. Install via CLI
gremius plugin install @yourscope/grimoire-myfeature
```

## 🎯 Ciclo de Vida de un Grimoire

```
Install
  ↓
npm install @gremius/grimoire-xxx
  ↓
Register in DB (installed_grimoires)
  ↓
Load on Startup
  ↓
Resolve path (node_modules → grimoire.json)
  ↓
Import index.ts
  ↓
Call createRouter(ctx) with injected dependencies
  ↓
Mount routes at /api/{grimoire-id}
  ↓
Execute onStartup() hook
  ↓
Ready!
```

## 🔐 Seguridad

- Los grimoires se ejecutan en el mismo proceso que la API
- Usan el contexto inyectado (no pueden importar directamente de apps/api/)
- Las migraciones SQL deben ser revisadas antes de ejecutarse
- Los grimoires de 3rd party muestran warning antes de instalarse

## 📊 API Endpoints (Admin)

```
GET  /api/admin/grimoires           # List all available
GET  /api/admin/grimoires/installed # List installed
POST /api/admin/grimoires/install   # Install from npm
POST /api/admin/grimoires/:id/enable
POST /api/admin/grimoires/:id/disable
DELETE /api/admin/grimoires/:id     # Uninstall
```

## 🛣️ Roadmap

- [x] Soporte node_modules en module-loader
- [x] Tabla installed_grimoires
- [x] CLI básico (install, uninstall, list)
- [x] Realms como starters
- [ ] API del Marketplace
- [ ] Sistema de reviews/ratings
- [ ] Validación de seguridad automática
- [ ] Firma digital de grimoires
- [ ] Sandboxing de grimoires (VM2/QuickJS)
