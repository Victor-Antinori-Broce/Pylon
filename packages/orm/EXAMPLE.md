# Gremius ORM - Ejemplos de Uso

## QuerySet - Como Django

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import { posts, comments, users } from "./schema.js";
import { QuerySet, Manager, F, Q } from "@gremius/orm";

const db = drizzle(client);

// 1. Query básica con filtros
const publishedPosts = await new QuerySet(db, posts)
  .filter({ status: "published" })
  .orderBy("-publishDate")
  .limit(10)
  .execute();

// 2. select_related (JOINs automáticos)
const postsWithAuthors = await new QuerySet(db, posts)
  .filter({ status: "published" })
  .selectRelated("author", "category") // JOIN users y categories
  .execute();

// Resultado:
// {
//   id: '123',
//   title: 'Hola',
//   author: { id: '456', name: 'John', email: 'john@example.com' },
//   category: { id: '789', name: 'Tech' }
// }

// 3. prefetch_related (evita N+1 queries)
const postsWithComments = await new QuerySet(db, posts)
  .filter({ status: "published" })
  .prefetchRelated("comments", "tags") // Queries separadas optimizadas
  .execute();

// 4. annotate (aggregaciones)
const postsWithStats = await new QuerySet(db, posts)
  .filter({ status: "published" })
  .annotate({
    commentCount: { type: "count", field: "comments" },
    avgRating: { type: "avg", field: "rating" },
  })
  .execute();

// Resultado:
// {
//   id: '123',
//   title: 'Hola',
//   commentCount: 15,
//   avgRating: 4.5
// }

// 5. Q() objects - queries complejas
const complexPosts = await new QuerySet(db, posts)
  .filterRaw(
    Q.or(
      Q.and(Q({ status: "published" }), Q({ publishDate__gte: new Date("2024-01-01") })),
      Q({ authorId: "special-user-id" })
    ).toSQL(posts)
  )
  .execute();

// SQL generado:
// WHERE (status = 'published' AND publish_date >= '2024-01-01')
//    OR author_id = 'special-user-id'

// 6. F() expressions - updates atómicos
import { F } from "@gremius/orm";

await new QuerySet(db, posts).filter({ id: "123" }).update({ views: new F("views").add(1) });

// SQL generado:
// UPDATE posts SET views = views + 1 WHERE id = '123'
```

## Manager - Como Django

```typescript
import { Manager, createCustomManager } from "@gremius/orm";

// Manager básico
posts.objects = new Manager(posts);

// Query básica
const allPosts = await posts.objects.all().execute();

// Filtros
const published = await posts.objects
  .filter({ status: "published" })
  .orderBy("-publishDate")
  .execute();

// Obtener uno
const post = await posts.objects.get("123");

// Crear
const newPost = await posts.objects.create({
  title: "Nuevo post",
  content: "Contenido...",
  status: "draft",
});

// Actualizar
await posts.objects.update("123", { status: "published" });

// Eliminar
await posts.objects.delete("123");

// Contar
const count = await posts.objects.filter({ status: "published" }).count();

// Existe
const exists = await posts.objects.exists({ slug: "hello-world" });
```

## Custom Managers

```typescript
// Manager personalizado - Posts publicados
class PublishedManager extends CustomManager<typeof posts> {
  modifyQuerySet(qs) {
    return qs
      .filter({ status: "published" })
      .filter({ publishDate: { lte: new Date() } })
      .orderBy("-publishDate");
  }
}

// Asignar managers
posts.objects = new Manager(posts);
posts.published = new PublishedManager(posts);

// Uso
const allPosts = await posts.objects.all().execute(); // Todos
const publishedPosts = await posts.published.all().execute(); // Solo publicados

// Otro ejemplo - Manager con relaciones
class PostWithRelationsManager extends CustomManager<typeof posts> {
  modifyQuerySet(qs) {
    return qs.selectRelated("author", "category").prefetchRelated("comments", "tags");
  }
}

posts.withRelations = new PostWithRelationsManager(posts);
const postsFull = await posts.withRelations.all().execute();
```

## CLI - Comandos Django-style

```bash
# Crear migración automática
gremius makemigrations
# Detectando cambios...
# grimoire-blog: 2 change(s) detected
#   CREATE blog_categories
#   ALTER blog_posts
#     add: categoryId
# ✓ Created: packages/grimoires/grimoire-blog/migrations/1704067200000_auto_categories.ts

# Ver estado
gremius migrate --status
# grimoire-blog:
#   ✓ 001_initial [APPLIED]
#   ✓ 002_add_author [APPLIED]
#   ○ 1704067200000_auto_categories [PENDING]

# Aplicar migraciones
gremius migrate
# Applying grimoire-blog/1704067200000_auto_categories...
# ✓ Applied

# Rollback
gremius migrate --rollback
# Rolling back grimoire-blog/1704067200000_auto_categories...
# ✓ Rolled back

# Shell interactivo
gremius shell
gremius> await posts.objects.filter({ status: 'published' }).count()
15
gremius> const post = await posts.objects.get('123')
gremius> post.title
"Hello World"

# Inspect
gremius inspect routes
# Method   Path                                    Handler
# GET      /api/posts                              posts
# POST     /api/posts                              posts
# GET      /api/posts/:id                          posts

gremius inspect grimoires
# Name                      Version    Status     Tables
# grimoire-auth             1.0.0      active     4
# grimoire-blog             0.1.0      active     3

gremius inspect db
# blog_posts
#   * id                    integer
#   * title                 text
#   * content               text
#   ? publishedAt           timestamp

# Backup/Restore
gremius dumpdata grimoire-blog > backup.json
gremius loaddata backup.json

# Crear nuevo grimoire
gremius grimoire:create grimoire-ecommerce --with-admin --with-tests
# ✅ Grimoire created successfully!
#   packages/grimoires/grimoire-ecommerce/
#     📄 grimoire.json
#     📄 schema.ts
#     📄 hooks.ts
#     📄 config.ts
#     📄 index.ts
#     📁 migrations/
#     📁 tests/
```

## Integración Completa

```typescript
// schema.ts
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  status: text("status").default("draft").notNull(),
  authorId: integer("author_id").references(() => users.id),
  views: integer("views").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relaciones
export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  comments: many(comments),
}));

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  postId: integer("post_id").references(() => posts.id),
});

// ORM - Setup
import { Manager, CustomManager, defineRelations } from "@gremius/orm";

const db = drizzle(client);

// Definir relaciones
const postRelations = defineRelations(posts, {
  author: { type: "belongsTo", targetTable: users, foreignKey: "authorId" },
  comments: { type: "hasMany", targetTable: comments, foreignKey: "postId" },
});

// Manager personalizado
class PublishedManager extends CustomManager<typeof posts> {
  modifyQuerySet(qs) {
    return qs
      .filter({ status: "published" })
      .selectRelated("author")
      .prefetchRelated("comments")
      .orderBy("-createdAt");
  }
}

// Asignar managers
posts.objects = new Manager(posts);
posts.objects.setDatabase(db);
posts.objects.setRelations(postRelations);

posts.published = new PublishedManager(posts);
posts.published.setDatabase(db);
posts.published.setRelations(postRelations);

// Uso en API
app.get("/api/posts", async (c) => {
  const posts = await posts.published
    .filter({ authorId: c.req.query("author") })
    .limit(20)
    .execute();

  return c.json(posts);
});

// Incrementar views (F() expression)
app.post("/api/posts/:id/view", async (c) => {
  const { id } = c.req.param();

  await posts.objects.filter({ id }).update({ views: F("views").add(1) });

  return c.json({ success: true });
});
```

## Resumen: Gremius vs Django

| Django                                    | Gremius ORM                                                  |
| ----------------------------------------- | ------------------------------------------------------------ |
| `Post.objects.filter(status='published')` | `posts.objects.filter({ status: 'published' })`              |
| `.select_related('author')`               | `.selectRelated('author')`                                   |
| `.prefetch_related('comments')`           | `.prefetchRelated('comments')`                               |
| `.annotate(count=Count('comments'))`      | `.annotate({ count: { type: 'count', field: 'comments' } })` |
| `.order_by('-created_at')`                | `.orderBy('-createdAt')`                                     |
| `F('views') + 1`                          | `F('views').add(1)`                                          |
| `Q(status='published') \| Q(author=me)`   | `Q.or(Q({ status: 'published' }), Q({ author: me }))`        |
| `Post.published.all()`                    | `posts.published.all().execute()`                            |
| `python manage.py makemigrations`         | `gremius makemigrations`                                     |
| `python manage.py migrate`                | `gremius migrate`                                            |
| `python manage.py shell`                  | `gremius shell`                                              |
