# Propuestas de Mejora Arquitectónica

## 1. Desacoplar Kons de apps/api/src/

### Estado Actual (Problemático)

```
apps/api/src/routes/blog.ts         ← Implementación real
packages/kons/kon-blog/   ← Solo re-exporta
  └── index.ts → export from "../../../apps/api/src/routes/blog"
```

### Arquitectura Propuesta

```
packages/
├── shared/                         ← Contratos y utilidades compartidas
│   ├── src/
│   │   ├── db-access.ts           ← Abstracción de DB para kons
│   │   ├── cache-access.ts        ← Abstracción de cache
│   │   └── events-access.ts       ← Abstracción de eventos
│   └── package.json
├── kons/
│   └── kon-blog/
│       ├── src/
│       │   ├── index.ts           ← Router Hono (self-contained)
│       │   ├── blog.controller.ts
│       │   ├── blog.service.ts
│       │   └── blog.schema.ts
│       ├── package.json           ← Depende de @kitsuden/shared
│       └── kon.json
```

### Cambios Necesarios

#### A. Crear abstracciones en @kitsuden/shared

```typescript
// packages/shared/src/db-access.ts
export interface KonDbContext {
  query: (table: string) => any;
  insert: (table: string, data: any) => Promise<any>;
  update: (table: string, id: string, data: any) => Promise<any>;
  delete: (table: string, id: string) => Promise<any>;
}

// Inyectado por el engine al cargar el kon
export const getDb = (): KonDbContext => {
  // Implementación real inyectada por el loader
  return globalThis.__kitsuden_db__;
};
```

#### B. Refactor de kon-blog

```typescript
// packages/kons/kon-blog/src/index.ts
import { Hono } from "hono";
import { getDb } from "@kitsuden/shared/db-access";
import { getCache } from "@kitsuden/shared/cache-access";
import { blogController } from "./blog.controller";

// Kon es self-contained
const app = new Hono();
app.route("/", blogController);

export const blogModule = {
  router: app,
  // Metadata para el loader
  tables: ["blog_posts", "blog_posts_to_tags"],
  hooks: {
    onEnable: async () => {
      /* migraciones */
    },
    onDisable: async () => {
      /* cleanup */
    },
  },
};
```

#### C. Loader actualizado

```typescript
// apps/api/src/lib/module-loader.ts
export async function loadKons(app: Hono) {
  for (const konName of enabledKons) {
    const mod = await import(`@kitsuden/kon-${konName}`);

    // Inyectar dependencias
    if (mod.blogModule) {
      globalThis.__kitsuden_db__ = createDbContext();
      globalThis.__kitsuden_cache__ = createCacheContext();

      app.route(`/api/${konName}`, mod.blogModule.router);

      // Registrar hooks
      if (mod.blogModule.hooks?.onEnable) {
        await mod.blogModule.hooks.onEnable();
      }
    }
  }
}
```

---

## 2. Sistema de Vistas Dinámicas Mejorado

### Estado Actual (Limitado)

```typescript
// Build-time detection - no extensible
const viewModules = import.meta.glob("/src/views/**/*.svelte");
```

### Arquitectura Propuesta: Remote Component Loading

```typescript
// packages/admin/src/lib/kon-loader.ts (mejorado)

interface RemoteView {
  id: string;
  load: () => Promise<{ default: Component }>;
}

// Registry que soporta múltiples fuentes
const viewRegistry = new Map<string, RemoteView>();

// 1. Registrar vistas locales (build-time)
const localViews = import.meta.glob("/src/views/**/*.svelte", { eager: false });
for (const [path, loader] of Object.entries(localViews)) {
  const id = extractViewId(path);
  viewRegistry.set(id, { id, load: loader as any });
}

// 2. Registrar vistas remotas (runtime)
export function registerRemoteView(id: string, url: string) {
  viewRegistry.set(id, {
    id,
    load: async () => {
      // Cargar desde CDN o servidor de kons
      const response = await fetch(url);
      const code = await response.text();

      // Usar Svelte compile en runtime o cargar como ESM
      return import(
        /* @vite-ignore */ URL.createObjectURL(new Blob([code], { type: "application/javascript" }))
      );
    },
  });
}

// 3. Carga lazy verdadera
export async function loadView(konId: string): Promise<Component | null> {
  const view = viewRegistry.get(konId);
  if (!view) return null;

  const module = await view.load();
  return module.default;
}
```

### Sistema de Slots para Extensibilidad

```svelte
<!-- packages/admin/src/lib/components/admin/KonPage.svelte (mejorado) -->
<script>
  import { onMount } from "svelte";
  import { SlotRegistry } from "$lib/slots";

  export let konId: string;

  // Slots permiten a kons inyectar UI sin vistas completas
  const slots = SlotRegistry.getSlotsFor(konId);
</script>

<DataExplorer {konId}>
  <!-- Slots para extensión -->
  <svelte:fragment slot="header-actions">
    {#each slots.headerActions as action}
      <svelte:component this={action.component} {...action.props} />
    {/each}
  </svelte:fragment>

  <svelte:fragment slot="custom-cell" let:column let:row>
    {#if slots.cellRenderers[column]}
      <svelte:component this={slots.cellRenderers[column]} {row} {column} />
    {/if}
  </svelte:fragment>
</DataExplorer>
```

---

## 3. Sistema de Plugins Formalizado

### Manifest de Kon Extendido

```json
{
  "id": "kon-blog",
  "version": "1.0.0",
  "ui": {
    "views": [
      {
        "id": "posts-grid",
        "type": "grid",
        "title": "All Posts",
        "table": "blog_posts"
      },
      {
        "id": "editor",
        "type": "custom",
        "component": "@kitsuden/kon-blog/PostEditor.svelte",
        "lazy": true
      }
    ],
    "slots": [
      {
        "target": "dashboard:sidebar",
        "component": "RecentPostsWidget.svelte"
      }
    ],
    "icons": {
      "post": "FileText",
      "draft": "Edit3"
    }
  },
  "api": {
    "routes": "/api/blog",
    "webhooks": ["post:published", "post:updated"]
  },
  "dependencies": {
    "kons": ["media-library"],
    "core": ["promote"]
  }
}
```

---

## Prioridad de Implementación

### Fase 1: Desacoplamiento (Alta Prioridad)

- [ ] Crear abstracciones en `@kitsuden/shared`
- [ ] Mover `blog` a su kon
- [ ] Mover `formulas` a su kon
- [ ] Actualizar `module-loader` para inyección de dependencias

### Fase 2: UI Dinámica Mejorada (Media Prioridad)

- [ ] Implementar `SlotRegistry`
- [ ] Añadir soporte para vistas lazy-loaded
- [ ] Crear sistema de remote views básico

### Fase 3: Module Federation (Baja Prioridad)

- [ ] Evaluar si es necesario
- [ ] Implementar solo si hay kons de terceros

---

## Beneficios Esperados

1. **Desacoplamiento**: Kons verdaderamente independientes
2. **Testabilidad**: Se pueden probar sin la API completa
3. **Distribución**: Kons pueden publicarse como paquetes npm independientes
4. **Extensibilidad**: Comunidad puede crear kons sin modificar el core
5. **Performance**: Lazy loading real de vistas no usadas
