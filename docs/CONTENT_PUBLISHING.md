# Content Publishing API

Sistema de publicación de contenido abstracto para Kitsuden. Permite promover datos de cualquier fuente (datasets o kons) a **Content Targets** (Blog, Documentation, Shop, etc.) que son provistos por kons primarios.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEL 2: CORE                                                  │
│  ├── ContentPublishingRegistry (siempre disponible)             │
│  └── API: GET /api/content/targets                              │
│           POST /api/content/promote                             │
├─────────────────────────────────────────────────────────────────┤
│  KON PRIMARIO (Opcional)                                   │
│  └── Blog (kon-blog)                                       │
│       └── blogContentTarget                                     │
│            ├── register() en onEnable()                         │
│            └── unregister() en onDisable()                      │
├─────────────────────────────────────────────────────────────────┤
│  KONS REGULARES                                            │
│  └── Cualquier kon puede usar:                             │
│       ctx.contentPublishing.promote('blog', {...})              │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✨ Características

- **Desacoplado**: Los kons no dependen de Blog, usan una API abstracta
- **Extensible**: Puedes tener múltiples Content Targets (Blog, Docs, Shop)
- **Opcional**: Blog puede desactivarse sin romper otros kons
- **Type-safe**: Interfaces completamente tipadas

---

## 🚀 Uso

### Para desarrolladores de kons (consumidores)

```typescript
// En cualquier kon, promover contenido al Blog
router.post("/promote", async (c) => {
  const game = await getGameById(c.req.param("id"));

  // Verificar si hay targets disponibles
  if (!ctx.contentPublishing.hasTarget("blog")) {
    return c.json({ error: "Blog not installed" }, 400);
  }

  // Promover
  const result = await ctx.contentPublishing.promote("blog", {
    source: {
      type: "kon",
      konId: "games",
      table: "games",
      recordId: game.id,
      data: game,
    },
    options: {
      title: `${game.title} - Review`,
      autoPublish: false,
      targetConfig: {
        tagIds: ["gaming", "reviews"],
      },
    },
  });

  return c.json({
    success: true,
    url: result.url,
    status: result.status,
  });
});
```

### Para desarrolladores de kons primarios (proveedores)

```typescript
// Crear un Content Target
export const docsContentTarget: ContentTarget = {
  id: "docs",
  name: "Documentation",
  konId: "documentation",
  capabilities: {
    supportsSeo: true,
    supportsScheduling: true,
    supportsEditorial: true,
    supportsTaxonomy: true,
    supportsMedia: true,
  },

  async publish(data, ctx) {
    // Crear documentación
    const doc = await createDoc(data);

    return {
      contentId: doc.id,
      targetId: "docs",
      slug: doc.slug,
      url: `/docs/${doc.slug}`,
      status: doc.status,
      createdAt: new Date(),
    };
  },

  getPublishedUrl(result) {
    return `/docs/${result.slug}`;
  },
};

// Registrar en el kon
export const kon = defineKon({
  id: "documentation",
  primary: true,
  optional: true,

  hooks: {
    onEnable: async (ctx) => {
      ctx.contentPublishing.register(docsContentTarget);
    },
    onDisable: async (ctx) => {
      ctx.contentPublishing.unregister("docs");
    },
  },
});
```

---

## 📡 API Endpoints

### `GET /api/content/targets`

Listar todos los Content Targets disponibles.

**Response:**

```json
{
  "targets": [
    {
      "id": "blog",
      "name": "Blog Posts",
      "konId": "blog",
      "capabilities": {
        "supportsSeo": true,
        "supportsScheduling": true,
        "supportsEditorial": true,
        "supportsTaxonomy": true,
        "supportsMedia": true
      }
    }
  ],
  "count": 1
}
```

### `POST /api/content/promote`

Promover una entrada a contenido publicable.

**Body:**

```json
{
  "targetId": "blog",
  "source": {
    "type": "kon",
    "konId": "games",
    "table": "games",
    "recordId": "abc-123"
  },
  "options": {
    "title": "Custom Title",
    "slug": "custom-slug",
    "autoPublish": false,
    "scheduledAt": "2026-01-01T00:00:00Z",
    "targetConfig": {
      "tagIds": ["tag-1", "tag-2"],
      "gameIds": ["game-1"]
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "contentId": "post-uuid",
    "targetId": "blog",
    "slug": "custom-slug",
    "url": "/blog/custom-slug",
    "status": "draft",
    "createdAt": "2026-03-19T12:00:00Z"
  }
}
```

---

## 🎯 Content Targets Integrados

| Target | Kon      | Capacidades                                 |
| ------ | -------- | ------------------------------------------- |
| `blog` | kon-blog | SEO, Scheduling, Editorial, Taxonomy, Media |

---

## 🔌 Crear un Content Target

Ver `packages/kons/kon-blog/src/content-target.ts` como referencia.

Pasos:

1. Implementar la interfaz `ContentTarget`
2. Registrar en `onEnable()` del kon
3. Desregistrar en `onDisable()`
4. Marcar kon como `primary: true, optional: true`

---

## 📝 Eventos

El sistema emite los siguientes eventos:

- `content:promoted` — Cuando se promueve contenido exitosamente
- `content:unpublished` — Cuando se despublica contenido

```typescript
ctx.events.on("content:promoted", ({ targetId, contentId, slug, source }) => {
  console.log(`Content promoted to ${targetId}: ${slug}`);
});
```
