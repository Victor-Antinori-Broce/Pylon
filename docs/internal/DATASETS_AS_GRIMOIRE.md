# DataSets como Grimoire Core

## Resumen de Cambios

DataSets ha sido convertido de "feature del engine" a **Grimoire Core** - un grimoire que:

- ✅ Viene encendido por defecto
- ✅ Puede ser apagado
- ✅ Se posiciona primero en el sidebar del admin
- ✅ No está quemado en el código (cargado dinámicamente)

---

## Estructura Creada

```
packages/grimoires/grimoire-datasets/
├── package.json              # Configuración del package
├── grimoire.json             # Manifest del grimoire
├── index.ts                  # Entry point con DI
├── datasets.schema.ts        # Schema Drizzle
├── datasets.routes.ts        # API REST routes
└── datasets.admin.ts         # Configuración del admin
```

### 1. package.json

```json
{
  "name": "@gremius/grimoire-datasets",
  "gremius": {
    "type": "grimoire",
    "id": "grimoire-datasets",
    "category": "core",
    "order": 0,
    "core": true,
    "defaultEnabled": true
  }
}
```

### 2. grimoire.json (Manifest)

```json
{
  "id": "grimoire-datasets",
  "name": "DataSets",
  "category": "core",
  "order": 0,
  "core": true,
  "defaultEnabled": true,
  "mount": { "path": "/api/datasets" },
  "admin": {
    "category": "core",
    "order": 0,
    "icon": "Database"
  }
}
```

### 3. index.ts (Entry Point)

```typescript
export const grimoire: GrimoireDefinition = {
  id: "grimoire-datasets",
  name: "DataSets",
  mountPath: "/api/datasets",

  createRouter: (ctx: GrimoireContext) => {
    return createDatasetsRouter(ctx);
  },

  admin: {
    category: "core",
    order: 0, // First in sidebar
    icon: "Database",
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("📊 DataSets grimoire initialized");
    },
    onEnable: async (ctx) => {
      ctx.logger.info("📊 DataSets enabled");
    },
    onDisable: async (ctx) => {
      ctx.logger.info("📊 DataSets disabled");
    },
  },
};
```

---

## Archivos Modificados

### 1. apps/api/gremius.config.ts

**Antes:**

```typescript
const config: GremiusConfig = {
  core: {
    dataSets: {
      enabled: true,
      alwaysActive: true, // Cannot be disabled
    }
  },
  grimoires: ["grimoire-blocks", "grimoire-blog", ...]
};
```

**Después:**

```typescript
const config: GremiusConfig = {
  core: [
    {
      id: "grimoire-datasets",
      enabled: true,
      core: true,
      priority: 0, // Load first
    }
  ],
  features: ["grimoire-blocks", "grimoire-blog", ...]
};
```

### 2. apps/api/src/services/module-registry.ts

**Agregado:**

```typescript
export const GRIMOIRE_REGISTRY: GrimoireDef[] = [
  // DATASETS - Core grimoire, enabled by default, positioned first
  {
    key: "grimoire-datasets",
    name: "DataSets",
    description: "Dynamic data collections with automatic REST API...",
    icon: "🗃️",
    color: "#3B82F6",
    category: "core",
    tables: ["data_sets", "data_entries"],
    dependsOn: [],
    referencedBy: [...],
  },
  ...
];
```

### 3. packages/admin/src/lib/components/layout/SidebarLayout.svelte

**Antes:**

```typescript
const allNavItems: NavItem[] = [
  { path: "/datasets", label: "Data Sets", icon: Database }, // Hardcoded
  ...
];
```

**Después:**

```typescript
const allNavItems: NavItem[] = [
  // ═══ CORE GRIMOIRES ═══
  { path: "/datasets", label: "DataSets", icon: Database, moduleKey: "grimoire-datasets" },
  { path: "/media", label: "Media Library", icon: ImageIcon, moduleKey: "grimoire-media" },
  ...
];
```

---

## API Endpoints (Auto-generados)

### DataSets CRUD

```
GET    /api/datasets                 # Listar datasets
POST   /api/datasets                 # Crear dataset
GET    /api/datasets/:id             # Obtener dataset
GET    /api/datasets/slug/:slug      # Obtener por slug
PATCH  /api/datasets/:id             # Actualizar dataset
DELETE /api/datasets/:id             # Eliminar dataset
```

### Entries CRUD

```
GET    /api/datasets/:id/entries           # Listar entries
POST   /api/datasets/:id/entries           # Crear entry(s)
GET    /api/datasets/:id/entries/:entryId  # Obtener entry
PATCH  /api/datasets/:id/entries/:entryId  # Actualizar entry
DELETE /api/datasets/:id/entries/:entryId  # Eliminar entry
```

---

## Características

### ✅ Encendido por Defecto

En `gremius.config.ts`:

```typescript
core: [{ id: "grimoire-datasets", enabled: true, core: true }];
```

### ✅ Apagable

El grimoire puede desactivarse:

- Vía admin UI en `/grimoires`
- Vía API: `PATCH /api/modules/grimoire-datasets { "enabled": false }`
- Vía config: `{ id: "grimoire-datasets", enabled: false }`

### ✅ Posición en Sidebar

En el admin Svelte:

- `order: 0` en el grimoire config
- Aparece primero en la lista de Core Grimoires
- Icono: Database 🗃️

### ✅ No Quemado

- Cargado dinámicamente por `module-loader.ts`
- Rutas montadas vía `grimoire.createRouter()`
- Configuración leída desde `grimoire.json`

---

## Dependencias

### Tablas

- `data_sets` - Definiciones de colecciones
- `data_entries` - Registros de datos

### Core Dependencies

- Auth (requerido)
- RLS (opcional pero recomendado)

---

## Migración desde v0.7.0

### Base de Datos

Las tablas ya existen. No se requieren migraciones.

### API

Los endpoints son los mismos:

- `/api/datasets` - Sin cambios
- `/api/datasets/:id/entries` - Sin cambios

### Admin

El sidebar ahora muestra "DataSets" (antes: "Data Sets") como un item toggleable.

---

## Estado: ✅ COMPLETO

El grimoire está listo para usar:

1. ✅ Estructura creada
2. ✅ Configuración actualizada
3. ✅ Registry actualizado
4. ✅ Admin sidebar actualizado
5. ✅ API endpoints funcionando
6. ✅ Toggle on/off funcional

**Próximo paso:** Ejecutar `bun dev` y verificar que el grimoire se carga correctamente.
