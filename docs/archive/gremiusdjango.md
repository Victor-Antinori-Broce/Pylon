# 🎯 Análisis: GremiusCMS vs Django - Framework Modular

**Fecha:** 2026-04-12 (Actualizado)  
**Versión analizada:** Gremius 0.8.0-beta  
**Objetivo:** Identificar gaps técnicos para alcanzar paridad con Django como framework modular

---

## 🔴 PARTE 1: LO QUE FALTA (Gaps Técnicos)

### 1. CLI Potente - `manage.py` Equivalente ⭐ PRIORITARIO

#### Estado Actual

```bash
bun run dev              # Inicia dev server
bun run build            # Build producción
bun run migrate          # Corre migrations (básico)
```

#### Lo que necesita (como Django)

```bash
# Migrations
python manage.py makemigrations             # Auto-detecta cambios
python manage.py migrate                    # Aplica migraciones
python manage.py showmigrations             # Estado de migraciones
python manage.py sqlmigrate blog 0001       # Ver SQL

# Development
python manage.py shell                      # Shell interactivo con ORM
python manage.py dbshell                    # SQL shell
python manage.py runserver                  # Dev server

# Apps
python manage.py startapp myapp             # Crea nueva app

# Data
python manage.py dumpdata > backup.json     # Backup
python manage.py loaddata backup.json       # Restore
python manage.py flush                      # Limpia DB

# Users
python manage.py createsuperuser            # Crea admin
python manage.py changepassword username    # Cambia password

# Static
python manage.py collectstatic              # Recolecta archivos

# Testing
python manage.py test                       # Corre tests
python manage.py test blog                  # Tests de app específica

# Info
python manage.py check                      # Chequea errores
python manage.py diffsettings               # Compara settings
python manage.py inspectdb                  # Genera models desde DB

# Custom commands
python manage.py send_newsletter            # Comandos personalizados
```

#### Solución Propuesta

```bash
gremius makemigrations              # Auto-detecta cambios en schemas
gremius migrate                     # Aplica migraciones
gremius migrate status              # Estado por grimoire
gremius migrate rollback            # Rollback
gremius migrate --squash            # Comprimir migraciones

gremius shell                       # REPL interactivo con ORM
gremius dbshell                     # PostgreSQL shell

gremius grimoire:create <nombre>    # Crea estructura de grimoire
gremius startapp <nombre>           # Alias

gremius dumpdata > backup.json      # Backup
gremius loaddata backup.json        # Restore

gremius createsuperuser             # Crea admin
gremius changepassword <user>       # Cambia password

gremius collectstatic               # Recolecta archivos estáticos

gremius test                        # Corre todos los tests
gremius test grimoire-blog          # Tests de grimoire específico
gremius test --coverage             # Con coverage

gremius inspect routes              # Muestra rutas registradas
gremius inspect grimoires           # Muestra grimoires activos
gremius inspect middleware          # Muestra middleware chain
gremius check                       # Valida configuración

gremius run <grimoire>:<command>    # Comandos custom
```

---

### 2. Admin Panel Auto-generado Completo ⭐ PRIORITARIO

#### Django Admin (Estándar de oro)

```python
@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['title', 'author', 'status', 'publish_date']
    list_filter = ['status', 'created_at', 'author']
    search_fields = ['title', 'content']
    prepopulated_fields = {'slug': ('title',)}
    date_hierarchy = 'publish_date'
    ordering = ['status', '-publish_date']
    list_editable = ['status']
    list_per_page = 25

    fieldsets = (
        ('Contenido', {
            'fields': ('title', 'slug', 'content')
        }),
        ('Metadata', {
            'fields': ('author', 'status', 'tags'),
            'classes': ('collapse',)
        }),
        ('SEO', {
            'fields': ('meta_title', 'meta_description'),
            'classes': ('collapse',)
        })
    )

    inlines = [CommentInline, AttachmentInline]

    actions = ['make_published', 'export_csv']

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser
```

#### Gremius Actual (Básico)

```svelte
<!-- Admin SvelteKit actual:
- Lista de entradas ✅
- Formulario genérico ✅
- Falta: filtros avanzados, relaciones visuales, inlines
-->
```

#### Lo que falta

| Feature                 | Django                             | Gremius    | Prioridad |
| ----------------------- | ---------------------------------- | ---------- | --------- |
| **Auto-discover admin** | ✅ Sin configuración               | ⚠️ Manual  | 🔴 Alta   |
| **List view completa**  | ✅ Filtros, búsqueda, ordenamiento | ⚠️ Básico  | 🔴 Alta   |
| **Fieldsets**           | ✅ Secciones colapsables           | ❌ No      | 🟡 Media  |
| **Inlines**             | ✅ Edición de relaciones           | ❌ No      | 🔴 Alta   |
| **Bulk actions**        | ✅ Delete/export masivo            | ❌ No      | 🟡 Media  |
| **Advanced filters**    | ✅ Por rango de fechas, etc        | ⚠️ Básico  | 🟡 Media  |
| **Dashboard widgets**   | ✅ Arrastrar al dashboard          | ❌ No      | 🟢 Baja   |
| **Audit log completo**  | ✅ Quién cambió qué, diff          | ❌ No      | 🟡 Media  |
| **Keyboard shortcuts**  | ✅ Atajos de teclado               | ❌ No      | 🟢 Baja   |
| **Mobile responsive**   | ✅ Admin móvil                     | ⚠️ Parcial | 🟡 Media  |

#### Solución Propuesta

```typescript
// Configuración de admin por dataset
export const postAdminConfig = {
  list: {
    display: ["title", "author.name", "status", "publishDate"],
    filters: ["status", "author", "category", { date: "range" }],
    search: ["title", "content"],
    ordering: ["-publishDate", "title"],
    perPage: 25,
    editable: ["status"],
    actions: ["publish", "unpublish", "delete", "export"],
  },

  form: {
    layout: [
      { section: "Contenido", fields: ["title", "slug", "content"] },
      { section: "Metadata", fields: ["author", "status", "category", "tags"], collapsible: true },
      {
        section: "SEO",
        fields: ["metaTitle", "metaDescription"],
        collapsible: true,
        defaultCollapsed: true,
      },
    ],
    widgets: {
      content: "rich-text",
      tags: "multi-select",
      author: "search-select",
      category: "tree-select",
    },
    inlines: [
      { name: "comments", fields: ["author", "content", "approved"], perPage: 5 },
      { name: "attachments", fields: ["file", "description"], perPage: 3 },
    ],
  },

  permissions: {
    view: ["admin", "editor"],
    edit: ["admin", "editor"],
    delete: ["admin"],
  },
};
```

---

### 3. ORM Avanzado - QuerySets ⭐ PRIORITARIO

#### Django ORM (Muy potente)

```python
posts = Post.objects.filter(
    status='published'
).select_related(
    'author', 'category'           # JOINs automáticos
).prefetch_related(
    'tags', 'comments__author'     # Queries separadas optimizadas
).annotate(
    comment_count=Count('comments'),
    avg_rating=Avg('ratings__value'),
    total_views=Sum('view_logs__count')
).order_by(
    '-publish_date'
)[:10]

# Managers personalizados
Post.published.all()      # Solo publicados
Post.objects.all()        # Todos

# F() expressions (evita race conditions)
Post.objects.filter(id=1).update(views=F('views') + 1)
```

#### Gremius Actual (Drizzle básico)

```typescript
// Actual: Drizzle relations básico
const posts = await db.query.posts.findMany({
  where: eq(posts.status, "published"),
  with: {
    author: true,
    category: true,
    tags: true,
  },
});

// Falta:
// - select_related equivalente
// - prefetch_related (evita N+1)
// - annotate/aggregaciones fáciles
// - Managers personalizados
// - F() expressions
```

#### Lo que falta

| Feature              | Django                           | Gremius        | Prioridad |
| -------------------- | -------------------------------- | -------------- | --------- |
| **select_related**   | ✅ JOINs automáticos             | ❌ No          | 🔴 Alta   |
| **prefetch_related** | ✅ Queries optimizadas           | ❌ No          | 🔴 Alta   |
| **annotate**         | ✅ Aggregaciones                 | ⚠️ Manual      | 🔴 Alta   |
| **F() expressions**  | ✅ Updates atómicos              | ❌ No          | 🟡 Media  |
| **Q() objects**      | ✅ Queries OR/AND complejas      | ⚠️ Manual      | 🟡 Media  |
| **Managers**         | ✅ Lógica de negocio encapsulada | ❌ No          | 🔴 Alta   |
| **Raw SQL**          | ✅ Cuando es necesario           | ✅ Drizzle raw | ✅ Sí     |

#### Solución Propuesta

```typescript
class QuerySet<T extends Table> {
  filter(conditions: FilterConditions<T>): this;
  selectRelated(...relations: string[]): this;
  prefetchRelated(...relations: string[]): this;
  annotate(aggregations: Record<string, AggregateFn>): this;
  orderBy(...fields: string[]): this;
  limit(n: number): this;
  offset(n: number): this;

  async execute(): Promise<Populated<T>[]>;
  async count(): Promise<number>;
  async exists(): Promise<boolean>;
  async first(): Promise<Populated<T> | null>;
}

// Uso
const posts = await Post.objects
  .filter({ status: "published" })
  .selectRelated("author", "category")
  .prefetchRelated("tags", "comments.author")
  .annotate({
    commentCount: count("comments"),
    avgRating: avg("ratings.value"),
  })
  .orderBy("-publishDate")
  .limit(20)
  .execute();

// Managers
class PublishedManager extends Manager<Post> {
  getQuerySet() {
    return super.getQuerySet().filter({ status: "published", publishDate: { lte: new Date() } });
  }
}

posts.objects = new Manager(posts);
posts.published = new PublishedManager(posts);

// Uso
await posts.published.all();
await posts.objects.filter({ authorId: "123" }).execute();
```

---

### 4. Sistema de Migrations Automáticas ⭐ PRIORITARIO

#### Django Migrations (Joyas de la corona)

```bash
python manage.py makemigrations     # Auto-detecta cambios
python manage.py migrate            # Aplica migraciones
python manage.py showmigrations     # Estado
python manage.py sqlmigrate blog 0001  # Ver SQL
python manage.py migrate blog 0001 --reverse  # Rollback
```

**Features:**

- ✅ Auto-detección de cambios en models
- ✅ Migra datos (RunPython)
- ✅ Squash de migraciones
- ✅ Rollback automático si falla
- ✅ Dependencias entre apps
- ✅ Validación antes de aplicar

#### Gremius Actual

```bash
cd apps/api
bunx drizzle-kit generate   # Genera SQL desde schema.ts
bunx drizzle-kit migrate    # Aplica migraciones
bunx drizzle-kit push       # Fuerza cambios (¡peligroso!)
```

**Problemas actuales:**

- ❌ No hay auto-detección por grimoire
- ❌ Si olvidas migrar, crashea en runtime
- ❌ No hay dashboard de migraciones en admin
- ❌ Rollback manual
- ❌ No hay squashing

#### Solución Propuesta

```bash
gremius makemigrations              # Auto-detecta cambios en schemas
gremius migrate                     # Aplica migraciones
gremius migrate status              # Estado por grimoire
gremius migrate check               # CI/CD: fail si hay cambios sin migrar
gremius migrate auto                # Generar y aplicar (dev)
gremius migrate rollback            # Deshacer última
gremius migrate --squash            # Comprimir antiguas
gremius migrate --dry-run           # Ver qué haría sin ejecutar
```

```typescript
// Migraciones por grimoire
export const grimoire = defineGrimoire({
  id: "grimoire-blog",
  migrations: [
    {
      version: "1.0.0",
      name: "001_initial",
      up: async (db) => {
        await db.createTable("blog_posts", {...});
      },
      down: async (db) => {
        await db.dropTable("blog_posts");
      }
    },
    {
      version: "1.1.0",
      name: "002_add_featured",
      up: async (db) => {
        await db.addColumn("blog_posts", "featured", "boolean");
      },
      down: async (db) => {
        await db.dropColumn("blog_posts", "featured");
      },
      dataMigration: async (db) => {
        await db.update("blog_posts", { featured: false });
      }
    }
  ]
});
```

---

### 5. Sistema de Signals/Events Robusto

#### Django Signals

```python
@receiver(post_save, sender=Post)
def notify_subscribers(sender, instance, created, **kwargs):
    if created and instance.status == 'published':
        send_newsletter.delay(instance.id)

@receiver(pre_delete, sender=Post)
def cleanup_files(sender, instance, **kwargs):
    if instance.featured_image:
        instance.featured_image.delete()

# Signals personalizados
order_completed = Signal()
order_completed.send(sender=Order, order=order, user=user)
```

**Features:**

- Signals pre/post para modelos
- Signals de request/response
- Signals de autenticación
- Signals personalizados
- Handlers con prioridad

#### Gremius Actual

```typescript
// EventBus simple
export const hooks = {
  beforeCreate: async (data) => {
    /* ... */
  },
  afterCreate: async (data) => {
    /* ... */
  },
};
```

#### Lo que falta

| Feature                            | Django               | Gremius          | Prioridad |
| ---------------------------------- | -------------------- | ---------------- | --------- |
| **preSave/postSave**               | ✅ Model signals     | ⚠️ Hooks básicos | 🟡 Media  |
| **preDelete/postDelete**           | ✅ Model signals     | ⚠️ Hooks básicos | 🟡 Media  |
| **requestStarted/requestFinished** | ✅ Request signals   | ❌ No            | 🟡 Media  |
| **userLoggedIn/userLoggedOut**     | ✅ Auth signals      | ❌ No            | 🟡 Media  |
| **Custom signals**                 | ✅ Signal()          | ❌ No            | 🟡 Media  |
| **Disconnect para testing**        | ✅ signal.disconnect | ❌ No            | 🟢 Baja   |

#### Solución Propuesta

```typescript
export const signals = {
  // Model signals
  preSave: new Signal<(instance: any, options: any) => void>(),
  postSave: new Signal<(instance: any, created: boolean) => void>(),
  preDelete: new Signal<(instance: any) => void>(),
  postDelete: new Signal<(instance: any) => void>(),

  // Request signals
  requestStarted: new Signal<(request: Request) => void>(),
  requestFinished: new Signal<(request: Request, response: Response) => void>(),

  // Auth signals
  userLoggedIn: new Signal<(user: User, request: Request) => void>(),
  userLoggedOut: new Signal<(user: User, request: Request) => void>(),
};

// Uso
signals.postSave.connect("posts", async (post, created) => {
  if (created && post.status === "published") {
    await notifySubscribers(post);
  }
});

// Custom signals
export const orderCompleted = new Signal<{ order: Order; user: User }>();
orderCompleted.emit({ order, user });
```

---

### 6. Middleware Chain Flexible (5 Fases)

#### Django Middleware

```python
class RequestTimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # process_request
        start_time = time.time()

        response = self.get_response(request)

        # process_response
        duration = time.time() - start_time
        response['X-Request-Duration'] = str(duration)
        return response

    def process_view(self, request, view_func, view_args, view_kwargs):
        # Antes de la vista
        pass

    def process_exception(self, request, exception):
        # Si hay excepción
        logger.error(f"Exception: {exception}")
```

**5 Fases:**

1. `process_request` - Antes de URL routing
2. `process_view` - Antes de la vista
3. `process_template_response` - Después de vista (template)
4. `process_response` - Después de vista (todas)
5. `process_exception` - Si hay excepción

#### Gremius Actual

```typescript
// Hono middleware básico
app.use(authMiddleware);
app.use(loggingMiddleware);

// Falta:
// - Fases específicas
// - Prioridad de ejecución
// - process_exception equivalente
```

#### Solución Propuesta

```typescript
interface Middleware {
  processRequest?(request: Request): Promise<Request | Response>;
  processView?(request: Request, route: Route, params: any): Promise<void | Response>;
  processResponse?(request: Request, response: Response): Promise<Response>;
  processException?(request: Request, error: Error): Promise<Response | void>;
}

// Configuración
export default {
  middleware: [
    { name: "security", priority: 100 },
    { name: "session", priority: 90 },
    { name: "cors", priority: 80 },
    { name: "auth", priority: 70 },
    { name: "logging", priority: 10 },
  ],
};
```

---

### 7. Forms y Validación Declarativa

#### Django Forms

```python
class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ['title', 'content', 'category', 'tags']
        widgets = {
            'content': forms.Textarea(attrs={'rows': 10}),
            'tags': forms.CheckboxSelectMultiple()
        }

    def clean_title(self):
        title = self.cleaned_data['title']
        if 'spam' in title.lower():
            raise forms.ValidationError('No spam')
        return title

    def clean(self):
        cleaned_data = super().clean()
        title = cleaned_data.get('title')
        content = cleaned_data.get('content')
        if title and content and title in content:
            raise forms.ValidationError('Title cannot be in content')

# Uso
form = PostForm(request.POST)
if form.is_valid():
    form.save()
```

#### Gremius Actual

```typescript
// Zod manual
const postSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  categoryId: z.number(),
});
```

#### Lo que falta

| Feature                        | Django         | Gremius       | Prioridad |
| ------------------------------ | -------------- | ------------- | --------- |
| **Auto-generado desde models** | ✅             | ❌ No         | 🟡 Media  |
| **Validaciones field-level**   | ✅ clean_field | ⚠️ Zod        | 🟡 Media  |
| **Validaciones form-level**    | ✅ clean()     | ⚠️ Manual     | 🟡 Media  |
| **Widgets personalizables**    | ✅             | ⚠️ Admin only | 🟡 Media  |
| **CSRF protection**            | ✅             | ⚠️ Manual     | 🟡 Media  |
| **File uploads**               | ✅             | ⚠️ Multer     | 🟡 Media  |

---

### 8. Testing Framework Completamente Integrado

#### Django Testing

```python
class PostModelTest(TestCase):
    def setUp(self):
        self.post = Post.objects.create(...)

    def test_creation(self):
        self.assertEqual(self.post.title, 'Test')

class PostViewTest(TestCase):
    def setUp(self):
        self.client = Client()

    def test_list(self):
        response = self.client.get('/api/posts/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Test')

class FixtureTest(TestCase):
    fixtures = ['posts.json', 'users.json']
```

**Features:**

- Test client con cookies/sessions
- Fixtures automáticas
- Test DB aislada automática
- Assertions específicos

#### Gremius Actual (Básico)

```bash
bun test  # Vitest básico
```

#### Lo que falta

| Feature                    | Django            | Gremius            | Prioridad |
| -------------------------- | ----------------- | ------------------ | --------- |
| **Test client HTTP**       | ✅                | ⚠️ Sandbox parcial | 🟡 Media  |
| **Fixtures loader**        | ✅                | ⚠️ Básico          | 🟡 Media  |
| **Test DB automática**     | ✅                | ✅ pg-mem          | ✅ Sí     |
| **Assertions específicos** | ✅ assertContains | ❌ No              | 🟢 Baja   |
| **Factory system**         | ✅ Factory Boy    | ❌ No              | 🟡 Media  |
| **Mocking**                | ✅ mock           | ⚠️ Manual          | 🟢 Baja   |

#### Solución Propuesta

```typescript
import { GremiusTestCase, TestClient, factory } from "@gremius/testing";

class PostAPITest extends GremiusTestCase {
  async setUp() {
    await super.setUp();
    this.client = new TestClient();
    this.post = await factory.create("Post", { status: "published" });
  }

  async testList() {
    const response = await this.client.get("/api/posts");
    this.assertEqual(response.status, 200);
    this.assertContains(response.data, this.post.title);
  }
}
```

---

### 9. Configuración Flexible y Environments

#### Django Settings

```python
# settings/base.py, local.py, production.py, test.py
from .base import *

DEBUG = True
DATABASES['default']['NAME'] = 'myapp_local'
```

**Features:**

- Python puro = lógica condicional
- Herencia de settings
- Estructura por environments
- Lazy evaluation

#### Gremius Actual

```typescript
// gremius.config.ts básico
export default {
  database: { host: process.env.DB_HOST },
  grimoires: ["grimoire-auth", "grimoire-content"],
};
```

#### Solución Propuesta

```typescript
// gremius/config/base.ts, local.ts, production.ts, test.ts

// base.ts
export const baseConfig = {
  database: {
    adapter: "postgres",
    host: env("DB_HOST", "localhost"),
    port: env.int("DB_PORT", 5432),
  },
  grimoires: { autoDiscover: true },
};

// local.ts
export default {
  ...baseConfig,
  debug: true,
  database: { adapter: "sqlite", path: "./dev.db" },
};

// production.ts
export default {
  ...baseConfig,
  debug: false,
  database: { ...baseConfig.database, ssl: true, pool: { min: 5, max: 20 } },
};
```

---

### 10. Fixtures System Completo

#### Django Fixtures

```bash
python manage.py dumpdata blog > fixtures/posts.json
python manage.py loaddata fixtures/posts.json
```

```json
[
  {
    "model": "blog.post",
    "pk": 1,
    "fields": {
      "title": "First Post",
      "content": "Content...",
      "status": "published"
    }
  }
]
```

#### Gremius Actual

```typescript
// Básico, no hay sistema formal de fixtures
```

#### Solución Propuesta

```bash
gremius dumpdata grimoire-blog > fixtures/posts.json
gremius loaddata fixtures/posts.json
```

```typescript
// tests/fixtures/posts.ts
export default [
  { id: "1", title: "Post 1", status: "published" },
  { id: "2", title: "Post 2", status: "draft" },
];
```

---

## 🟢 PARTE 2: LO QUE YA ESTÁ IMPLEMENTADO

### Core Architecture ✅

| Feature                              | Estado  | Detalles                                        |
| ------------------------------------ | ------- | ----------------------------------------------- |
| **Arquitectura modular (Grimoires)** | ✅ 100% | Sistema de plugins más flexible que Django Apps |
| **ORM/DB (Drizzle + PostgreSQL)**    | ✅ 100% | RLS nativo, JSONB, type-safe                    |
| **Auth (Better-Auth)**               | ✅ 100% | Roles, scopes, Agent Auth (NHI)                 |
| **Hot reload dev**                   | ✅ 100% | Bun + Hono, 10x más rápido que Django           |
| **MCP Server**                       | ✅ 100% | Integración nativa con LLMs (Claude, Cursor)    |
| **Basic CLI**                        | ✅ 100% | `gremius new`, plugins, dev, build              |
| **SDK Universal**                    | ✅ 100% | Edge-ready, TypeScript                          |
| **TOON Format**                      | ✅ 100% | 60% menos tokens para LLMs                      |
| **Actions Engine**                   | ✅ 100% | Webhooks + Workers + Agents unificados          |
| **Real-time**                        | ✅ 100% | WebSockets + Valkey Pub/Sub                     |

### Admin Panel ✅

| Feature                | Estado  | Detalles                                 |
| ---------------------- | ------- | ---------------------------------------- |
| **SvelteKit Admin**    | ✅ 100% | Panel admin moderno con Svelte 5         |
| **Dynamic Forms**      | ✅ 100% | Formularios auto-generados desde schemas |
| **Dataset Management** | ✅ 100% | CRUD completo de datasets                |
| **Media Library**      | ✅ 100% | Gestión de archivos con S3/MinIO         |
| **User Management**    | ✅ 100% | Gestión de usuarios y roles              |

### Testing Framework ✅

| Feature                | Estado  | Detalles                          |
| ---------------------- | ------- | --------------------------------- |
| **Test Sandbox**       | ✅ 100% | `createDrizzleSandbox` funcional  |
| **pg-mem integration** | ✅ 100% | PostgreSQL en memoria para tests  |
| **HTTP Client**        | ✅ 100% | Test de routers Hono sin servidor |
| **Event Tracking**     | ✅ 100% | Verificación de eventos emitidos  |
| **Bun test runner**    | ✅ 100% | Tests pasando: 38/38 en blog      |
| **Fixtures system**    | ✅ 100% | Datos de prueba configurables     |
| **Assertions**         | ✅ 100% | Database y event assertions       |

### OpenAPI & Documentation ✅

| Feature              | Estado  | Detalles                                              |
| -------------------- | ------- | ----------------------------------------------------- |
| **OpenAPI Dinámico** | ✅ 100% | `/api/docs/openapi.json` auto-generado                |
| **Swagger UI**       | ✅ 100% | Documentación interactiva                             |
| **Scalar UI**        | ✅ 100% | UI moderna alternativa                                |
| **MCP Tools**        | ✅ 100% | `gremius_intelligent_query`, `generate_grimoire`      |
| **MCP Resources**    | ✅ 100% | `project-context`, `dataset-schema`, `api-operations` |

### CLI for Agents ✅

| Feature                         | Estado  | Detalles                             |
| ------------------------------- | ------- | ------------------------------------ |
| `gremius agent create-grimoire` | ✅ 100% | Genera boilerplate desde descripción |
| `gremius agent validate`        | ✅ 100% | Valida TypeScript, lint, seguridad   |
| `gremius agent debug-mcp`       | ✅ 100% | Debug conexión MCP                   |
| `gremius agent init`            | ✅ 100% | Configura .cursorrules / CLAUDE.md   |
| `gremius generate-sdk`          | ✅ 100% | Genera client SDK desde OpenAPI      |

### Grimoire System ✅

| Feature               | Estado  | Detalles                        |
| --------------------- | ------- | ------------------------------- |
| **Auto-detección**    | ✅ 100% | Scanea `packages/grimoires/`    |
| **grimoire.json**     | ✅ 100% | Configuración declarativa       |
| **Hooks system**      | ✅ 100% | beforeCreate, afterCreate, etc. |
| **Dependencies**      | ✅ 100% | Grimoires dependen de otros     |
| **Calculated Fields** | ✅ 100% | Campos calculados nativos       |
| **Schema validation** | ✅ 100% | Zod integration                 |

---

## 📊 Resumen Comparativo

| Feature                    | Django     | Gremius Actual | ¿Falta?                 |
| -------------------------- | ---------- | -------------- | ----------------------- |
| **CLI completo**           | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         | 🔴 CLI potente          |
| **Admin auto-generado**    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐       | 🟡 Mejoras admin        |
| **ORM QuerySets**          | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         | 🔴 QuerySet abstraction |
| **Migrations automáticas** | ⭐⭐⭐⭐⭐ | ⭐⭐           | 🔴 Auto-detection       |
| **Testing**                | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐       | 🟡 Factory system       |
| **Signals**                | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         | 🟡 Sistema robusto      |
| **Middleware**             | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         | 🟡 5 fases              |
| **Forms**                  | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         | 🟡 Auto-generados       |
| **Config environments**    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         | 🟡 Herencia             |
| **Fixtures**               | ⭐⭐⭐⭐⭐ | ⭐⭐⭐         | 🟡 Sistema completo     |
| **Modularidad**            | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐     | ✅ Grimoires            |
| **Performance**            | ⭐⭐⭐     | ⭐⭐⭐⭐⭐     | ✅ Bun                  |
| **Type Safety**            | ⭐⭐       | ⭐⭐⭐⭐⭐     | ✅ TypeScript           |
| **AI Integration**         | ⭐         | ⭐⭐⭐⭐⭐     | ✅ MCP                  |

---

## 🎯 Roadmap Priorizado

### Fase 1: Core Batteries (Meses 1-3)

1. ⏳ **CLI completo** - `makemigrations`, `shell`, `inspect`, `dumpdata`
2. ⏳ **QuerySet abstraction** - `selectRelated`, `prefetchRelated`, `annotate`
3. ⏳ **Auto-admin discovery** - Sin configuración manual

### Fase 2: Django Magic (Meses 4-6)

4. ⏳ **Migration system v2** - Auto-detect, rollback, squash
5. ⏳ **Signals robusto** - Model signals, request signals
6. ⏳ **Factory system** - `factory.create('User')`

### Fase 3: Polish (Meses 7-8)

7. ⏳ **Forms system** - Auto-generados desde schema
8. ⏳ **Middleware 5 fases** - processView, processException
9. ⏳ **Config environments** - base.ts, local.ts, prod.ts

**Total estimado:** 8 meses para paridad técnica con Django.

---

## 🏆 Ventajas Competitivas Únicas de Gremius

1. **MCP-Native**: Único CMS diseñado para agentes de IA
2. **TOON Format**: 60% menos tokens vs JSON tradicional
3. **Bun Performance**: 10x más rápido stack moderno
4. **Type Safety**: End-to-end TypeScript
5. **Grimoires**: Más flexibles que Django Apps

---

_Documento actualizado:_ 2026-04-12  
_Tests pasando:_ 38/38 (100%)  
_Estado:_ Core funcional, faltan features Django-nivel en CLI, ORM y Migrations
