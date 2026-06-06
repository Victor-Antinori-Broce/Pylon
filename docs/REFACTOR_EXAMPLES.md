# Ejemplos de Refactorización

## Ejemplo 1: Grimoire Blog Autocontenido

### Antes (Problemático)

```typescript
// packages/grimoires/grimoire-blog/index.ts
export { blogRoutes } from "../../../apps/api/src/routes/blog";
```

```typescript
// apps/api/src/routes/blog.ts (198 líneas, depende de todo el contexto)
import { db } from "../db"; // <-- acoplado a apps/api/src/db
import { blogPosts } from "../db/schema"; // <-- acoplado
import { cachedQuery } from "../lib/cache"; // <-- acoplado
import { broadcastContentUpdate } from "../lib/realtime"; // <-- acoplado
// ...
```

---

### Después (Desacoplado)

```typescript
// packages/shared/src/grimoire-api.ts
import { Hono } from "hono";
import { DrizzleDmlBuilder } from "drizzle-orm";

/**
 * Contexto inyectado a cada grimoire
 */
export interface GrimoireContext {
  db: any; // Drizzle instance
  cache: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any, ttl?: number) => Promise<void>;
    invalidate: (pattern: string) => Promise<void>;
  };
  events: {
    emit: (event: string, data: any) => void;
    on: (event: string, handler: Function) => void;
  };
  realtime: {
    broadcast: (channel: string, message: any) => void;
  };
  auth: {
    requireAuth: MiddlewareHandler;
    requireRole: (roles: string[]) => MiddlewareHandler;
  };
}

/**
 * Factory para crear routers con contexto inyectado
 */
export function createGrimoireRouter(
  name: string,
  setup: (router: Hono, ctx: GrimoireContext) => void
): (ctx: GrimoireContext) => Hono {
  return (ctx: GrimoireContext) => {
    const router = new Hono();
    setup(router, ctx);
    return router;
  };
}
```

```typescript
// packages/grimoires/grimoire-blog/src/routes.ts
import { createGrimoireRouter } from "@gremius/shared/grimoire-api";
import { blogPosts, blogPostsToTags, blogPostsToGames } from "./schema";
import { eq, desc, sql } from "drizzle-orm";

export const createBlogRouter = createGrimoireRouter("blog", (router, ctx) => {
  const { db, cache, events, realtime, auth } = ctx;

  // List posts - with caching
  router.get("/", async (c) => {
    const cacheKey = `blog:list:${c.req.query("page") || 1}`;

    const cached = await cache.get(cacheKey);
    if (cached) return c.json(cached);

    const posts = await db.select().from(blogPosts).limit(10);

    await cache.set(cacheKey, posts, 60); // 60s TTL
    return c.json(posts);
  });

  // Create post
  router.post("/", auth.requireAuth, async (c) => {
    const body = await c.req.json();
    const user = c.get("user");

    const [post] = await db
      .insert(blogPosts)
      .values({
        title: body.title,
        content: body.content,
        authorId: user.id,
        status: body.status || "draft",
      })
      .returning();

    events.emit("blog:post:created", { postId: post.id });

    await cache.invalidate("blog:list:*");

    return c.json(post, 201);
  });

  // Update post
  router.patch("/:id", auth.requireAuth, async (c) => {
    const body = await c.req.json();

    const [updated] = await db
      .update(blogPosts)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(blogPosts.id, c.req.param("id")))
      .returning();

    realtime.broadcast(`blog:post:${updated.id}`, {
      type: "update",
      data: updated,
    });

    return c.json(updated);
  });
});
```

```typescript
// packages/grimoires/grimoire-blog/src/index.ts
import { createBlogRouter } from "./routes";
import { blogSchema } from "./schema";

/**
 * Exportación del grimoire - self contained
 */
export const grimoire = {
  id: "blog",
  name: "Blog Posts",
  version: "1.0.0",

  // Factory que recibe contexto inyectado
  createRouter: createBlogRouter,

  // Esquema de tablas
  schema: blogSchema,

  // Hooks de ciclo de vida
  hooks: {
    onEnable: async (ctx) => {
      // Run migrations
      await ctx.db.execute(/* migration SQL */);
      console.log("✅ Blog grimoire enabled");
    },
    onDisable: async (ctx) => {
      console.log("⛔ Blog grimoire disabled");
    },
  },

  // UI configuration
  admin: {
    icon: "FileText",
    views: [
      { id: "grid", type: "grid", title: "All Posts", table: "blog_posts" },
      { id: "editor", type: "custom", component: "PostEditor" },
    ],
  },
};

export default grimoire;
```

```typescript
// apps/api/src/lib/module-loader.ts (actualizado)
import type { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared/grimoire-api";

export async function loadGrimoires(app: Hono) {
  const enabledGrimoires = await getEnabledGrimoires();

  // Crear contexto base
  const context: GrimoireContext = {
    db,
    cache: {
      get: (key) => cachedQuery(key, 0, () => null),
      set: (key, value, ttl) => cacheSet(key, value, ttl),
      invalidate: (pattern) => invalidateCache(pattern),
    },
    events,
    realtime: realtimeManager,
    auth: { requireAuth, requireRole },
  };

  for (const grimoireName of enabledGrimoires) {
    try {
      // Importar el grimoire
      const mod = await import(`@gremius/grimoire-${grimoireName}`);
      const grimoire = mod.grimoire || mod.default;

      if (!grimoire?.createRouter) {
        console.warn(`⚠️ Grimoire ${grimoireName} no exporta createRouter`);
        continue;
      }

      // Inyectar contexto y crear router
      const router = grimoire.createRouter(context);

      // Montar en la API
      const mountPath = grimoire.mountPath || `/api/${grimoire.id}`;
      app.route(mountPath, router);

      // Ejecutar hooks
      if (grimoire.hooks?.onEnable) {
        await grimoire.hooks.onEnable(context);
      }

      console.log(`✅ ${grimoire.id} mounted at ${mountPath}`);
    } catch (err) {
      console.error(`❌ Failed to load ${grimoireName}:`, err);
    }
  }
}
```

---

## Ejemplo 2: Sistema de Vistas con Slots

### Antes (import.meta.glob)

```typescript
// packages/admin/src/lib/grimoire-loader.ts
const viewModules = import.meta.glob("/src/views/**/*.svelte");

async function loadCustomView(grimoireId: string) {
  const pascal = pascalCase(grimoireId);
  const paths = [
    `/src/views/${grimoireId}/${pascal}View.svelte`,
    `/src/views/${grimoireId}/index.svelte`,
  ];

  for (const path of paths) {
    if (viewModules[path]) {
      const mod = await viewModules[path]();
      return mod.default;
    }
  }
  return null;
}
```

---

### Después (Sistema de Slots + Registro)

```typescript
// packages/admin/src/lib/grimoire-ui.ts
import type { Component } from "svelte";

export interface SlotDefinition {
  id: string;
  target: string; // e.g., "dashboard:sidebar", "blog:header-actions"
  component: Component;
  props?: Record<string, any>;
  order?: number;
}

export interface ViewDefinition {
  id: string;
  type: "grid" | "kanban" | "calendar" | "custom";
  component?: Component;
  table?: string;
  title: string;
}

class GrimoireUIRegistry {
  private slots = new Map<string, SlotDefinition[]>();
  private views = new Map<string, ViewDefinition[]>();
  private components = new Map<string, () => Promise<Component>>();

  /**
   * Registrar un slot para extensión
   */
  registerSlot(slot: SlotDefinition) {
    const existing = this.slots.get(slot.target) || [];
    existing.push(slot);
    existing.sort((a, b) => (a.order || 0) - (b.order || 0));
    this.slots.set(slot.target, existing);
  }

  /**
   * Registrar vistas para un grimoire
   */
  registerViews(grimoireId: string, views: ViewDefinition[]) {
    this.views.set(grimoireId, views);
  }

  /**
   * Registrar componente lazy-loadable
   */
  registerComponent(id: string, loader: () => Promise<Component>) {
    this.components.set(id, loader);
  }

  /**
   * Cargar componente por ID
   */
  async loadComponent(id: string): Promise<Component | null> {
    const loader = this.components.get(id);
    if (!loader) return null;

    try {
      const mod = await loader();
      return (mod as any).default || mod;
    } catch (err) {
      console.error(`Failed to load component ${id}:`, err);
      return null;
    }
  }

  getSlots(target: string): SlotDefinition[] {
    return this.slots.get(target) || [];
  }

  getViews(grimoireId: string): ViewDefinition[] {
    return this.views.get(grimoireId) || [];
  }
}

export const uiRegistry = new GrimoireUIRegistry();
```

```typescript
// packages/admin/src/lib/grimoire-loader.ts (refactorizado)
import { uiRegistry } from "./grimoire-ui";

// 1. Registrar vistas locales (build-time)
function registerLocalViews() {
  // Vistas hardcoded del core
  uiRegistry.registerViews("webhooks", [
    { id: "list", type: "custom", title: "Webhooks", component: WebhooksView },
  ]);

  uiRegistry.registerViews("games", [
    { id: "grid", type: "grid", title: "Games", table: "games" },
    { id: "kanban", type: "kanban", title: "By Status", table: "games" },
  ]);

  // Componentes lazy-loadables
  uiRegistry.registerComponent(
    "webhooks/WebhooksView",
    () => import("$views/webhooks/WebhooksView.svelte")
  );

  uiRegistry.registerComponent("games/GamesView", () => import("$views/games/GamesView.svelte"));
}

// 2. Cargar vistas desde registro de grimoires
export async function loadGrimoireViews(grimoireId: string) {
  // Intentar cargar desde registry
  const views = uiRegistry.getViews(grimoireId);
  if (views.length > 0) {
    return views;
  }

  // Fallback: generar automáticamente desde API
  const config = await fetchAdminConfig(grimoireId);
  return config.views.map((v) => ({
    id: v.id,
    type: v.type,
    title: v.title,
    table: v.table,
    // Componente se carga dinámicamente
    loadComponent: () => uiRegistry.loadComponent(`${grimoireId}/${v.id}`),
  }));
}
```

```svelte
<!-- packages/admin/src/lib/components/admin/GrimoirePage.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { uiRegistry } from "$lib/grimoire-ui";
  import DataExplorer from "./DataExplorer.svelte";

  let { grimoireId }: { grimoireId: string } = $props();

  let views = $state<ViewDefinition[]>([]);
  let activeView = $state<string>("");
  let CustomComponent = $state<Component | null>(null);
  let slots = $state({
    headerActions: [] as SlotDefinition[],
    sidebar: [] as SlotDefinition[],
    bulkActions: [] as SlotDefinition[],
  });

  onMount(async () => {
    // Cargar vistas del grimoire
    views = await loadGrimoireViews(grimoireId);
    activeView = views[0]?.id || "default";

    // Cargar slots
    slots = {
      headerActions: uiRegistry.getSlots(`${grimoireId}:header-actions`),
      sidebar: uiRegistry.getSlots(`${grimoireId}:sidebar`),
      bulkActions: uiRegistry.getSlots(`${grimoireId}:bulk-actions`),
    };

    // Cargar componente custom si existe
    const activeViewDef = views.find((v) => v.id === activeView);
    if (activeViewDef?.type === "custom" && activeViewDef.component) {
      CustomComponent = activeViewDef.component;
    }
  });

  async function switchView(viewId: string) {
    activeView = viewId;
    const view = views.find((v) => v.id === viewId);

    if (view?.type === "custom" && view.loadComponent) {
      CustomComponent = await view.loadComponent();
    } else {
      CustomComponent = null;
    }
  }
</script>

<div class="grimoire-page">
  <!-- Header con slots -->
  <header class="flex justify-between items-center mb-4">
    <h1>{grimoireId}</h1>

    <div class="flex gap-2">
      <!-- Slots de acciones -->
      {#each slots.headerActions as slot}
        <svelte:component this={slot.component} {...slot.props} />
      {/each}

      <!-- Selector de vistas -->
      <div class="view-selector">
        {#each views as view}
          <button class:active={activeView === view.id} onclick={() => switchView(view.id)}>
            {view.title}
          </button>
        {/each}
      </div>
    </div>
  </header>

  <!-- Content -->
  {#if CustomComponent}
    <svelte:component this={CustomComponent} {grimoireId} />
  {:else}
    <DataExplorer {grimoireId} view={activeView} />
  {/if}

  <!-- Sidebar con slots -->
  {#if slots.sidebar.length > 0}
    <aside class="sidebar">
      {#each slots.sidebar as slot}
        <svelte:component this={slot.component} {...slot.props} />
      {/each}
    </aside>
  {/if}
</div>
```

```typescript
// Ejemplo: Un grimoire registrando slots
// packages/grimoires/grimoire-blog/src/admin/slots.ts
import { uiRegistry } from "@gremius/admin-ui";
import RecentPostsWidget from "./RecentPostsWidget.svelte";
import PostActions from "./PostActions.svelte";

export function registerBlogSlots() {
  // Widget en el dashboard
  uiRegistry.registerSlot({
    id: "blog:recent-posts",
    target: "dashboard:sidebar",
    component: RecentPostsWidget,
    order: 10,
  });

  // Acciones en el header del blog
  uiRegistry.registerSlot({
    id: "blog:header-actions",
    target: "blog:header-actions",
    component: PostActions,
    order: 1,
  });
}
```

---

## Beneficios de estas mejoras

### 1. Desacoplamiento

```
Antes:  grimoire-blog → ../../../apps/api/src/routes/blog
Después: grimoire-blog → @gremius/shared (contratos estables)
```

### 2. Testabilidad

```typescript
// Antes: Imposible testear sin la DB real
// Después: Podemos mockear el contexto
const mockContext: GrimoireContext = {
  db: createMockDb(),
  cache: createMockCache(),
  events: createMockEvents(),
  // ...
};

const router = createBlogRouter(mockContext);
// Testear router aisladamente
```

### 3. Extensibilidad

```typescript
// Plugin de comunidad puede extender sin modificar core
uiRegistry.registerSlot({
  target: "blog:header-actions",
  component: MyCustomButton,
});
```

### 4. Lazy Loading Real

```typescript
// Componente solo se carga cuando se navega a la vista
const view = await uiRegistry.loadComponent("games/GamesView");
```
