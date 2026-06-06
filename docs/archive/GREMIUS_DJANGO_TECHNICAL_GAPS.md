# Gaps Técnicos: Gremius vs Django (Backend Modular)

**Enfoque:** Análisis puramente técnico y arquitectónico. Sin considerar madurez, comunidad o tiempo en el mercado.

---

## 1. Sistema de Modularidad (Apps/Grimoires)

### Django - Apps Reusables

```python
# Django: Una app es un módulo completo y autosuficiente
myapp/
├── __init__.py          # Registra app en Django
├── apps.py              # Configuración de la app
├── models.py            # Modelos de datos
├── views.py             # Controladores/Vistas
├── urls.py              # Rutas propias
├── admin.py             # Configuración admin
├── forms.py             # Formularios
├── signals.py           # Event handlers
├── tests.py             # Tests
├── templates/           # Templates HTML
├── static/              # CSS/JS/Imágenes
└── migrations/          # Migraciones automáticas

# Instalación de app externa:
# pip install django-cms
# Añadir 'cms' a INSTALLED_APPS
# Listo, funciona con URLs, admin, models incluidos
```

**Capacidades técnicas:**

- **Auto-registro:** Django escanea `INSTALLED_APPS` y registra todo automáticamente
- **URLs namespaced:** Cada app tiene sus propias URLs sin conflictos
- **Templates namespaced:** `myapp/template.html` evita colisiones
- **Static files namespaced:** `myapp/static/myapp/style.css`
- **Models auto-registrados:** Models disponibles inmediatamente
- **Admin auto-registrado:** Admin detecta models y genera CRUD
- **Migrations por app:** Cada app maneja sus propias migraciones
- **Dependencias declarativas:** App A puede declarar que necesita App B

### Gremius - Grimoires

```typescript
// Gremius: Grimoires son detectados pero requieren más configuración manual
packages/grimoires/grimoire-example/
├── grimoire.json        # Configuración del grimoire
├── schema.ts            # Schema de Drizzle
├── hooks.ts             # Hooks básicos
├── config.ts            # Configuración
└── index.ts             # Entry point

// Instalación: Copiar a packages/grimoires/
// Auto-detección funciona
// Pero: No hay system de templates, static files, ni auto-registro completo
```

**Gaps técnicos:**

#### 1.1 Auto-registro incompleto

```typescript
// Django: Todo se registra automáticamente al añadir a INSTALLED_APPS

// Gremius actual: Falta auto-registro de:
// - Rutas (requiere import manual en router)
// - Admin views (requiere definición manual)
// - Static files (no hay sistema)
// - Templates (no aplica a API-first pero útil para admin)

// Solución propuesta:
// grimoire.json con registro declarativo completo
{
  "name": "grimoire-ecommerce",
  "version": "1.0.0",
  "routes": {
    "prefix": "/api/ecommerce",
    "file": "./routes.ts"           // Auto-registra rutas
  },
  "admin": {
    "models": ["products", "orders"], // Auto-registra en admin
    "menuGroup": "E-commerce"
  },
  "static": "./static",              // Sirve archivos estáticos
  "dependencies": ["grimoire-auth", "grimoire-content"]
}
```

#### 1.2 Namespacing de recursos

```python
# Django: URLs con namespace evitan colisiones
# urls.py
app_name = 'blog'
urlpatterns = [
    path('posts/', views.post_list, name='post_list'),
]

# Uso: reverse('blog:post_list') - Único en todo el proyecto
```

```typescript
// Gremius: No hay namespacing formal de rutas
// Riesgo de colisiones si dos grimoires definen GET /api/items

// Solución propuesta:
// Prefix automático basado en nombre de grimoire
// grimoire-blog registra automáticamente en /api/blog/*
// O sistema de namespace en router:
router.namespace('blog', () => {
  router.get('/posts', ...); // Se registra como /api/blog/posts
});
```

#### 1.3 Ciclo de vida de Apps

```python
# Django: Apps tienen ciclo de vida definido
# apps.py
class BlogConfig(AppConfig):
    name = 'blog'
    verbose_name = 'Blog'

    def ready(self):
        # Se ejecuta cuando Django inicia y app está lista
        # Ideal para registrar signals, inicializar caches, etc.
        import blog.signals  # Registra signals
        from .tasks import schedule_jobs
        schedule_jobs()
```

```typescript
// Gremius: No hay hook de "ready" o ciclo de vida formal
// hooks.ts solo tiene hooks de CRUD, no de inicialización

// Solución propuesta:
// grimoire.ts - Clase con ciclo de vida
export default class BlogGrimoire extends Grimoire {
  name = "grimoire-blog";

  async ready(): Promise<void> {
    // Se ejecuta al iniciar servidor
    // Registrar signals, inicializar datos, etc.
    await this.registerSignals();
    await this.seedInitialData();
  }

  async shutdown(): Promise<void> {
    // Cleanup al detener servidor
    await this.closeConnections();
  }
}
```

---

## 2. ORM y Abstracción de Datos

### Django ORM - QuerySets

```python
# Django ORM: Capa de abstracción muy alta sobre SQL

# SELECT con JOINs automáticos
posts = Post.objects.filter(
    status='published'
).select_related(
    'author',           # JOIN users table
    'category'          # JOIN categories table
).prefetch_related(
    'tags',             # Query separada para ManyToMany
    'comments__author'  # Nested prefetch
).annotate(
    comment_count=Count('comments'),
    avg_rating=Avg('ratings__value'),
    total_views=Sum('view_logs__count')
).order_by(
    '-publish_date'
).distinct()[:20]

# UPDATE con F() expressions (evita race conditions)
Post.objects.filter(id=post_id).update(
    views=F('views') + 1
)

# Subqueries
recent_posts = Post.objects.filter(
    author__in=Subquery(
        User.objects.filter(
            is_active=True
        ).values('id')[:10]
    )
)

# Transactions
with transaction.atomic():
    post = Post.objects.create(...)
    Comment.objects.create(post=post, ...)
    # Rollback automático si falla

# Managers personalizados
class PostManager(models.Manager):
    def published(self):
        return self.filter(status='published', publish_date__lte=timezone.now())

    def by_author(self, author):
        return self.filter(author=author).select_related('category')

class Post(models.Model):
    objects = PostManager()  # Default manager
    published = PublishedManager()  # Custom manager

# Uso
Post.published.all()  # Solo publicados con lógica de negocio
Post.objects.by_author(user)  # Posts por autor con optimizaciones
```

**Capacidades:**

- `select_related` - JOINs automáticos para ForeignKeys
- `prefetch_related` - Queries separadas optimizadas para ManyToMany
- `annotate` - Aggregaciones en la query (COUNT, AVG, SUM)
- `F()` expressions - Operaciones basadas en valores actuales
- `Q()` objects - Queries complejas con OR/AND
- `Subquery`/`Exists` - Subqueries SQL
- Managers personalizados - Lógica de negocio encapsulada
- Transactions automáticas

### Gremius - Drizzle ORM

```typescript
// Drizzle es más "cerca del metal"

// Query básica
const posts = await db.query.posts.findMany({
  where: eq(posts.status, "published"),
  with: {
    author: true, // JOIN
    category: true, // JOIN
    tags: true, // JOIN
    comments: true, // JOIN (puede ser N+1)
  },
});

// Aggregaciones requieren SQL manual o helpers
// No hay select_related/prefetch_related automáticos
// No hay F() expressions
// No hay Q() objects
// No hay Managers personalizados
```

**Gaps técnicos:**

#### 2.1 Query Builder de alto nivel

```typescript
// Solución propuesta: Abstracción QuerySet sobre Drizzle

class QuerySet<T extends Table> {
  private table: T;
  private filters: SQL[] = [];
  private joins: Map<string, RelationConfig> = new Map();
  private prefetches: string[] = [];
  private annotations: Map<string, AggregateFn> = new Map();
  private orderFields: { field: string; desc: boolean }[] = [];
  private limitValue?: number;
  private offsetValue?: number;

  filter(conditions: FilterConditions<T>): this {
    // Convierte filtros a SQL
    return this;
  }

  selectRelated(...relations: string[]): this {
    // Analiza relaciones y crea JOINs optimizados
    // Detecta automáticamente ForeignKeys
    return this;
  }

  prefetchRelated(...relations: string[]): this {
    // Marca relaciones para query separada
    // Evita N+1 queries
    return this;
  }

  annotate(aggregations: Record<string, AggregateConfig>): this {
    // COUNT, AVG, SUM, MIN, MAX
    return this;
  }

  orderBy(...fields: string[]): this {
    // -field para descendente
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  offset(n: number): this {
    this.offsetValue = n;
    return this;
  }

  async execute(): Promise<Populated<T>[]> {
    // 1. Ejecuta query principal con JOINs
    // 2. Ejecuta queries de prefetch
    // 3. Combina resultados
    // 4. Aplica aggregations
  }

  async count(): Promise<number> {
    // COUNT optimizado
  }

  async exists(): Promise<boolean> {
    // EXISTS query
  }

  async first(): Promise<Populated<T> | null> {
    return (await this.limit(1).execute())[0] ?? null;
  }
}

// Uso
const posts = await Post.objects
  .filter({ status: "published", publishDate: { lte: new Date() } })
  .selectRelated("author", "category")
  .prefetchRelated("tags", "comments.author")
  .annotate({
    commentCount: count("comments"),
    avgRating: avg("ratings.value"),
    totalViews: sum("viewLogs.count"),
  })
  .orderBy("-publishDate")
  .limit(20)
  .execute();
```

#### 2.2 F() Expressions

```typescript
// Django: Post.objects.filter(id=1).update(views=F('views') + 1)
// Atómico, evita race conditions

// Solución propuesta:
await Post.objects.filter({ id: 1 }).update({
  views: F("views").add(1),
  lastViewedAt: new Date(),
});

// Implementación genera:
// UPDATE posts SET views = views + 1, last_viewed_at = NOW() WHERE id = 1
```

#### 2.3 Managers personalizados

```typescript
// Solución propuesta:
class PostManager extends Manager<Post> {
  published(): QuerySet<Post> {
    return this.filter({
      status: 'published',
      publishDate: { lte: new Date() }
    });
  }

  byAuthor(authorId: string): QuerySet<Post> {
    return this
      .filter({ authorId })
      .selectRelated('category', 'author')
      .orderBy('-publishDate');
  }

  async mostViewed(limit = 10): Promise<Post[]> {
    return this
      .filter({ status: 'published' })
      .orderBy('-views')
      .limit(limit)
      .execute();
  }
}

// En schema:
export const posts = pgTable('posts', {...});
posts.objects = new PostManager(posts);
posts.published = new PublishedManager(posts); // Manager adicional

// Uso
await posts.published.all();
await posts.objects.byAuthor('user-123').execute();
await posts.objects.mostViewed(5);
```

---

## 3. Sistema de Configuración

### Django - Settings

```python
# myproject/settings.py

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# DEBUG como booleano
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# Databases con opciones completas
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME'),
        'USER': os.environ.get('DB_USER'),
        'PASSWORD': os.environ.get('DB_PASSWORD'),
        'HOST': os.environ.get('DB_HOST'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'OPTIONS': {
            'sslmode': 'require',
            'connect_timeout': 10,
        },
        'CONN_MAX_AGE': 600,  # Persistent connections
    }
}

# Apps instaladas
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'myapp',
    'thirdparty_app',
]

# Middleware en orden específico
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
]

# Settings por environment
# settings/
# ├── __init__.py
# ├── base.py
# ├── local.py
# ├── production.py
# └── test.py

# local.py
from .base import *

DEBUG = True
DATABASES['default']['NAME'] = 'myapp_local'

# production.py
from .base import *

DEBUG = False
DATABASES['default']['CONN_MAX_AGE'] = 600
ALLOWED_HOSTS = ['myapp.com']
```

**Capacidades:**

- Python puro = lógica condicional compleja
- Herencia de settings
- Estructura por environments
- Lazy evaluation
- Validación de settings al iniciar

### Gremius - Configuración

```typescript
// gremius.config.ts - Actual
export default {
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
  },
  grimoires: ["grimoire-auth", "grimoire-content"],
  // Falta:
  // - Estructura por environments
  // - Validación de config
  // - Lógica condicional compleja
  // - Herencia de configs
};
```

**Gaps técnicos:**

#### 3.1 Sistema de Environments

```typescript
// Solución propuesta:
// gremius/
// ├── config/
// │   ├── base.ts
// │   ├── local.ts
// │   ├── production.ts
// │   └── test.ts

// base.ts
export const baseConfig = {
  database: {
    adapter: "postgres" as const,
    host: env("DB_HOST", "localhost"),
    port: env.int("DB_PORT", 5432),
    pool: {
      min: env.int("DB_POOL_MIN", 2),
      max: env.int("DB_POOL_MAX", 10),
    },
  },

  grimoires: {
    autoDiscover: true,
    enabled: ["grimoire-auth", "grimoire-content"],
  },

  middleware: ["security", "cors", "auth", "logging"],
};

// local.ts
import { baseConfig } from "./base";

export default defineConfig({
  ...baseConfig,
  debug: true,
  database: {
    ...baseConfig.database,
    adapter: "sqlite",
    path: "./dev.db",
  },
  logging: {
    level: "debug",
  },
});

// production.ts
import { baseConfig } from "./base";

export default defineConfig({
  ...baseConfig,
  debug: false,
  database: {
    ...baseConfig.database,
    ssl: true,
    pool: {
      min: 5,
      max: 20,
    },
  },
  cache: {
    provider: "redis",
    url: env("REDIS_URL"),
  },
  logging: {
    level: "error",
  },
});

// Uso: GREMIUS_ENV=production bun run start
```

#### 3.2 Validación de Configuración

```typescript
// Solución propuesta:
import { z } from "zod";

const configSchema = z.object({
  database: z.object({
    host: z.string(),
    port: z.number().min(1).max(65535),
    // Valida según adapter
  }),
  grimoires: z.array(z.string()),
  // Valida que grimoires existan
  // Valida que middleware estén registrados
});

// Al cargar config, valida y da errores descriptivos:
// "Config error: database.port must be between 1 and 65535"
// "Config error: grimoire 'grimoire-x' not found in packages/"
```

---

## 4. CLI (Command Line Interface)

### Django - manage.py

```bash
# Django tiene ~30 comandos built-in + custom

# Database
python manage.py migrate                    # Aplica migrations
python manage.py makemigrations             # Genera migrations automáticas
python manage.py sqlmigrate blog 0001       # Muestra SQL
python manage.py dbshell                    # SQL shell

# Development
python manage.py runserver                  # Dev server
python manage.py shell                      # Python shell con todo cargado
python manage.py shell --interface ipython  # Con IPython

# Apps
python manage.py startapp myapp             # Crea estructura de app
python manage.py startproject myproject     # Crea proyecto

# Data
python manage.py dumpdata blog > backup.json  # Backup
python manage.py loaddata backup.json         # Restore
python manage.py flush                        # Limpia DB

# Users
python manage.py createsuperuser            # Crea admin
python manage.py changepassword username    # Cambia password
python manage.py dumpauth > users.json      # Exporta users

# Static/Media
python manage.py collectstatic              # Recolecta static files
python manage.py findstatic css/style.css   # Busca archivo

# Testing
python manage.py test                       # Corre tests
python manage.py test blog                  # Solo app blog
python manage.py test blog.tests.PostTest  # Solo test específico

# Info
python manage.py showmigrations             # Estado migrations
python manage.py diffsettings               # Diferencias settings
python manage.py check                      # Chequea errores
python manage.py inspectdb                  # Genera models desde DB

# Custom commands
python manage.py send_newsletter            # Tu comando
python manage.py cleanup_old_sessions       # Tu comando
```

### Gremius - CLI Actual

```bash
# Comandos actuales:
bun run dev              # Inicia dev server
bun run build            # Build producción
bun run migrate          # Corre migrations (básico)

# Faltan:
# - Generador de migrations automático
# - Shell interactivo
# - Generador de grimoires
# - Backup/restore
# - Testing runner
# - Info/inspector
```

**Gaps técnicos:**

#### 4.1 Generador de Grimoires

```bash
# Solución propuesta:
gremius grimoire:create ecommerce

# Crea estructura:
# packages/grimoires/grimoire-ecommerce/
# ├── grimoire.json
# ├── schema.ts
# ├── hooks.ts
# ├── routes.ts
# ├── config.ts
# ├── tests/
# │   └── example.test.ts
# └── README.md
```

#### 4.2 Shell Interactivo

```bash
# Solución propuesta:
gremius shell

# REPL con:
# - Acceso a db (await db.query...)
# - Acceso a models (await Post.objects...)
# - Acceso a services
# - Autocomplete
# - Hot reload de cambios en código

> const posts = await Post.objects.published().limit(5).execute();
> posts.forEach(p => console.log(p.title));
```

#### 4.3 Generador de Migrations

```bash
# Solución propuesta:
gremius makemigrations
# Detecta cambios en schema.ts
# Genera archivo de migration

# gremius migrate
# Aplica migrations pendientes
# Guarda estado en tabla _migrations

# gremius migrate:rollback
# Revierte última migration

# gremius showmigrations
# Muestra estado de todas las migrations
```

#### 4.4 Inspector

```bash
# Solución propuesta:
gremius inspect routes
# GET /api/posts              -> grimoire-content
# POST /api/posts             -> grimoire-content
# GET /api/auth/login         -> grimoire-auth

# gremius inspect grimoires
# grimoire-auth:    v1.0.0, active, 5 tables
# grimoire-content: v1.0.0, active, 8 tables
# grimoire-ecommerce: v0.5.0, inactive (missing dependency: grimoire-payments)

# gremius inspect middleware
# 1. security
# 2. cors
# 3. auth
# 4. grimoire-content:cache
```

---

## 5. Testing Framework

### Django - Testing

```python
# Django tiene framework de testing completo

# Tests básicos
from django.test import TestCase, Client
from .models import Post

class PostModelTest(TestCase):
    def setUp(self):
        self.post = Post.objects.create(
            title='Test',
            content='Content',
            status='published'
        )

    def test_creation(self):
        self.assertEqual(self.post.title, 'Test')
        self.assertTrue(self.post.slug)

    def test_absolute_url(self):
        self.assertEqual(
            self.post.get_absolute_url(),
            '/blog/test/'
        )

# API tests
class PostAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.post = Post.objects.create(...)

    def test_list(self):
        response = self.client.get('/api/posts/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.post.title)

    def test_create(self):
        response = self.client.post('/api/posts/', {
            'title': 'New',
            'content': 'New content'
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Post.objects.count(), 2)

# Fixtures
class FixtureTest(TestCase):
    fixtures = ['posts.json', 'users.json']

    def test_with_data(self):
        # Datos cargados automáticamente
        self.assertEqual(Post.objects.count(), 10)

# Test DB
# Django automáticamente:
# 1. Crea DB de test
# 2. Corre migrations
# 3. Ejecuta tests
# 4. Destruye DB
```

**Capacidades:**

- Test client HTTP completo
- Fixtures (JSON, YAML, XML)
- Test DB aislada automática
- Assertions específicos (`assertContains`, `assertQuerysetEqual`)
- Transaction rollback por test
- Coverage integrado

### Gremius - Testing

```typescript
// Actual: Solo Vitest básico
// Falta:
// - Test client HTTP
// - Fixtures
// - Test DB aislada
// - Assertions específicos
```

**Gaps técnicos:**

#### 5.1 Test Client HTTP

```typescript
// Solución propuesta:
import { GremiusTestClient } from "@gremius/testing";

const client = new GremiusTestClient();

// Simula requests HTTP
const response = await client.get("/api/posts");
expect(response.status).toBe(200);
expect(response.data).toHaveLength(5);

// POST con auth
const response = await client
  .post("/api/posts")
  .authAs(user) // Login automático
  .send({ title: "Test", content: "Content" });

expect(response.status).toBe(201);
```

#### 5.2 Fixtures

```typescript
// Solución propuesta:
// tests/fixtures/posts.ts
export const postFixtures = [
  { id: "1", title: "Post 1", status: "published" },
  { id: "2", title: "Post 2", status: "draft" },
];

// En test:
import { GremiusTestCase } from "@gremius/testing";

class PostTest extends GremiusTestCase {
  fixtures = ["posts", "users"];

  async testList() {
    // Fixtures cargados automáticamente
    const posts = await Post.objects.all();
    expect(posts).toHaveLength(2);
  }
}
```

#### 5.3 Test DB Aislada

```typescript
// Solución propuesta:
// Al correr tests:
// 1. Crea DB SQLite en memoria O postgres de test
// 2. Corre migrations
// 3. Carga fixtures
// 4. Ejecuta cada test en transaction
// 5. Hace rollback después de cada test
// 6. Limpia al final

// Configuración:
// gremius/config/test.ts
export default {
  database: {
    adapter: 'sqlite',
    path: ':memory:'  # Base de datos en memoria
  },
  testing: {
    fixturesPath: './tests/fixtures',
    transactionPerTest: true
  }
};
```

---

## 6. Admin Auto-generado

### Django Admin

```python
# Django admin es el estándar de oro
# blog/admin.py

from django.contrib import admin
from .models import Post, Category

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    # Qué mostrar en lista
    list_display = ['title', 'author', 'status', 'publish_date']

    # Filtros laterales
    list_filter = ['status', 'created_at', 'author', 'category']

    # Búsqueda
    search_fields = ['title', 'content', 'author__username']

    # Ordenamiento por defecto
    ordering = ['-publish_date']

    # Paginación
    list_per_page = 25

    # Campos pre-completados
    prepopulated_fields = {'slug': ('title',)}

    # Fecha para jerarquía
    date_hierarchy = 'publish_date'

    # Edición inline de campos en lista
    list_editable = ['status']

    # Acciones en bulk
    actions = ['make_published', 'export_csv']

    # Organización de campos
    fieldsets = (
        ('Contenido', {
            'fields': ('title', 'slug', 'content')
        }),
        ('Metadata', {
            'fields': ('author', 'status', 'category', 'tags'),
            'classes': ('collapse',)  # Colapsable
        }),
        ('SEO', {
            'fields': ('meta_title', 'meta_description'),
            'classes': ('collapse',)
        })
    )

    # Inlines (edición de relaciones)
    inlines = [CommentInline, AttachmentInline]

    # Permisos
    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    # Acciones personalizadas
    @admin.action(description='Mark as published')
    def make_published(self, request, queryset):
        queryset.update(status='published')

class CommentInline(admin.TabularInline):
    model = Comment
    extra = 1  # Cuántos forms vacíos mostrar
    fields = ['author', 'content', 'approved']
```

**Capacidades:**

- 100% auto-generado desde models
- CRUD completo
- Filtros, búsqueda, ordenamiento
- Relaciones (ForeignKey, ManyToMany)
- Inlines (edición de relaciones)
- Bulk actions
- Fieldsets organizados
- Permisos granulares
- Personalización completa

### Gremius Admin

```svelte
<!-- Gremius admin actual es básico -->
<!-- Falta: -->
<!-- - Configuración declarativa -->
<!-- - Filtros avanzados -->
<!-- - Inlines -->
<!-- - Bulk actions -->
<!-- - Fieldsets -->
```

**Gaps técnicos:**

#### 6.1 Configuración Declarativa

```typescript
// Solución propuesta:
// packages/grimoires/grimoire-content/src/admin.ts

export const postAdminConfig = {
  // Lista
  list: {
    display: ["title", "author.name", "status", "publishDate"],
    filters: ["status", "author", "category", "tags"],
    search: ["title", "content"],
    ordering: ["-publishDate", "title"],
    perPage: 25,
    editable: ["status"], // Editable inline
    actions: ["publish", "unpublish", "delete", "export"],
  },

  // Formulario
  form: {
    layout: [
      {
        section: "Contenido",
        fields: ["title", "slug", "content"],
        collapsible: false,
      },
      {
        section: "Metadata",
        fields: ["author", "status", "category", "tags"],
        collapsible: true,
        defaultCollapsed: false,
      },
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
      {
        name: "comments",
        fields: ["author", "content", "approved"],
        perPage: 5,
      },
      {
        name: "attachments",
        fields: ["file", "description"],
        perPage: 3,
      },
    ],
  },

  // Permisos
  permissions: {
    view: ["admin", "editor"],
    edit: ["admin", "editor"],
    delete: ["admin"], // Solo admins pueden borrar
  },

  // Acciones personalizadas
  actions: {
    publish: async (selectedIds) => {
      await Post.objects.filter({ id: { in: selectedIds } }).update({ status: "published" });
    },
    export: async (selectedIds) => {
      // Exporta a CSV
    },
  },
};

// Auto-registro en admin
// Admin panel lee config y genera UI dinámicamente
```

---

## 7. Middleware y Request Processing

### Django Middleware

```python
# Django tiene 5 fases de middleware

class ExampleMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 1. process_request - Antes de URL routing
        request.start_time = time.time()

        response = self.get_response(request)

        # 4. process_response - Después de vista
        duration = time.time() - request.start_time
        response['X-Request-Duration'] = str(duration)

        return response

    def process_view(self, request, view_func, view_args, view_kwargs):
        # 2. process_view - Antes de la vista
        # Puede retornar Response para short-circuit
        logger.info(f"View: {view_func.__name__}")

    def process_exception(self, request, exception):
        # 5. process_exception - Si vista lanza excepción
        logger.error(f"Exception: {exception}")
        # Puede retornar Response para manejar error

    def process_template_response(self, request, response):
        # 3. process_template_response - Si vista retorna TemplateResponse
        response.context_data['debug'] = settings.DEBUG
        return response
```

**5 Fases:**

1. `process_request` - Antes de URL routing
2. `process_view` - Antes de ejecutar vista
3. `process_template_response` - Después de vista (template)
4. `process_response` - Después de vista (todas)
5. `process_exception` - Si hay excepción

### Gremius Middleware

```typescript
// Gremius usa Hono middleware (básico)
app.use(async (c, next) => {
  // Antes de handler
  await next();
  // Después de handler
});

// Falta:
// - Fases específicas
// - process_view equivalente
// - process_exception equivalente
// - Prioridad de ejecución
```

**Gaps técnicos:**

#### 7.1 Middleware con Fases

```typescript
// Solución propuesta:
interface Middleware {
  processRequest?(request: Request): Promise<Request | Response>;
  processView?(request: Request, route: Route, params: any): Promise<void | Response>;
  processResponse?(request: Request, response: Response): Promise<Response>;
  processException?(request: Request, error: Error): Promise<Response | void>;
}

// Configuración con prioridad
export const middleware = [
  { name: "security", priority: 100, class: SecurityMiddleware },
  { name: "session", priority: 90, class: SessionMiddleware },
  { name: "cors", priority: 80, class: CorsMiddleware },
  { name: "auth", priority: 70, class: AuthMiddleware },
  { name: "timing", priority: 10, class: TimingMiddleware },
];

// Implementación
class TimingMiddleware implements Middleware {
  async processRequest(request: Request) {
    request.startTime = Date.now();
    return request;
  }

  async processResponse(request: Request, response: Response) {
    const duration = Date.now() - request.startTime;
    response.headers.set("X-Request-Duration", String(duration));
    return response;
  }
}
```

---

## 8. Forms y Validación

### Django Forms

```python
# Django forms son muy potentes

from django import forms
from .models import Post

class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ['title', 'content', 'category', 'tags']
        widgets = {
            'content': forms.Textarea(attrs={'rows': 10}),
            'tags': forms.CheckboxSelectMultiple(),
            'publish_date': forms.DateTimeInput(attrs={'type': 'datetime-local'})
        }

    # Validación field-level
    def clean_title(self):
        title = self.cleaned_data['title']
        if 'spam' in title.lower():
            raise forms.ValidationError('No spam allowed')
        if Post.objects.filter(title=title).exists():
            raise forms.ValidationError('Title already exists')
        return title

    # Validación form-level
    def clean(self):
        cleaned_data = super().clean()
        title = cleaned_data.get('title')
        content = cleaned_data.get('content')

        if title and content and title in content:
            raise forms.ValidationError('Content cannot contain title')

        return cleaned_data

# Uso
form = PostForm(request.POST)
if form.is_valid():
    post = form.save()  # Crea/actualiza modelo
    return redirect('post_detail', post.id)
else:
    # Errores disponibles en form.errors
    return render(request, 'post_form.html', {'form': form})
```

**Capacidades:**

- Auto-generado desde modelos
- Validaciones field-level y form-level
- Widgets personalizables
- CSRF protection
- File uploads
- Initial data
- Disabled fields

### Gremius

```typescript
// Gremius usa Zod (bueno pero manual)
const postSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  categoryId: z.number(),
});

// Falta:
// - Forms auto-generados desde schema
// - Validaciones async (DB checks)
// - Cross-field validations fáciles
// - Widgets/HTML rendering
```

**Gaps técnicos:**

#### 8.1 Forms Auto-generados

```typescript
// Solución propuesta:
class Form<T> {
  fields: Record<string, Field>;
  data: Partial<T>;
  errors: Record<string, string[]> = {};

  async isValid(): Promise<boolean> {
    // Limpia errores previos
    this.errors = {};

    // Valida cada field
    for (const [name, field] of Object.entries(this.fields)) {
      const value = this.data[name];
      try {
        await field.validate(value);
      } catch (error) {
        this.errors[name] = [error.message];
      }
    }

    // Valida form completo
    try {
      await this.clean();
    } catch (error) {
      this.errors["__all__"] = [error.message];
    }

    return Object.keys(this.errors).length === 0;
  }

  async clean(): Promise<void> {
    // Override en subclases
  }

  // Guarda en DB
  async save(): Promise<T> {
    if (!(await this.isValid())) {
      throw new ValidationError(this.errors);
    }
    return await this.createOrUpdate();
  }
}

// Auto-generado desde schema
const PostForm = createForm(posts, {
  fields: ["title", "content", "categoryId", "tagIds"],
  widgets: {
    content: "rich-text",
    tagIds: "multi-select",
  },

  async cleanTitle(value: string) {
    if (value.toLowerCase().includes("spam")) {
      throw new ValidationError("No spam");
    }
    const exists = await Post.objects.filter({ title: value }).exists();
    if (exists) {
      throw new ValidationError("Title already exists");
    }
    return value;
  },

  async clean() {
    const { title, content } = this.data;
    if (content?.includes(title)) {
      throw new ValidationError("Content cannot contain title");
    }
  },
});
```

---

## 9. Migrations Automáticas

### Django Migrations

```bash
# Django migrations son automáticas y robustas

# 1. Detecta cambios en models
python manage.py makemigrations
# Migrations for 'blog':
#   blog/migrations/0002_auto_20240115_1200.py
#     - Add field slug to post
#     - Alter field title on post

# 2. Muestra SQL que ejecutará
python manage.py sqlmigrate blog 0002

# 3. Aplica migrations
python manage.py migrate

# 4. Estado
python manage.py showmigrations
# blog
#  [X] 0001_initial
#  [X] 0002_auto_20240115_1200
#  [ ] 0003_add_index

# 5. Rollback
python manage.py migrate blog 0001
```

**Capacidades:**

- Auto-detecta cambios en models
- Genera migrations automáticamente
- SQL preview
- Dependencias entre apps
- Rollback completo
- Migrations de datos (RunPython)
- Squash migrations

### Gremius Migrations

```bash
# Actual: Manual
# Tienes que escribir SQL o usar Drizzle Kit
bun drizzle-kit generate
bun drizzle-kit migrate

# Problemas:
# - No integrado con grimoires
# - No detecta cambios automáticamente
# - No hay rollback fácil
# - No hay SQL preview
```

**Gaps técnicos:**

#### 9.1 Sistema de Migrations Integrado

```typescript
// Solución propuesta:

// gremius makemigrations
// 1. Lee schema de todos los grimoires
// 2. Compara con estado actual en DB
// 3. Genera archivo de migration

// packages/grimoires/grimoire-content/migrations/0002_add_slug.ts
export default {
  name: "0002_add_slug",
  grimoire: "grimoire-content",
  dependencies: ["0001_initial"],

  async up(db: Database) {
    await db.schema.alterTable("posts", (table) => {
      table.string("slug").notNullable().default("");
      table.index("slug");
    });
  },

  async down(db: Database) {
    await db.schema.alterTable("posts", (table) => {
      table.dropColumn("slug");
    });
  },
};

// gremius migrate
// - Lee tabla _migrations
// - Aplica pendientes en orden
// - Guarda registro

// gremius migrate:rollback
// - Revierte última migration
// - Ejecuta método down()

// gremius showmigrations
// - Muestra estado de todas
```

---

## 📊 Resumen de Gaps Técnicos

| #   | Gap Técnico                                                 | Impacto | Esfuerzo Estimado |
| --- | ----------------------------------------------------------- | ------- | ----------------- |
| 1   | Auto-registro completo de grimoires                         | Alto    | 2 semanas         |
| 2   | QuerySet de alto nivel (select_related, prefetch, annotate) | Alto    | 1 mes             |
| 3   | Sistema de environments                                     | Medio   | 1 semana          |
| 4   | CLI completo (shell, makemigrations, etc)                   | Alto    | 1 mes             |
| 5   | Testing framework integrado                                 | Medio   | 2 semanas         |
| 6   | Admin auto-generado avanzado                                | Alto    | 1.5 meses         |
| 7   | Middleware con 5 fases                                      | Medio   | 2 semanas         |
| 8   | Forms auto-generados desde schema                           | Medio   | 2 semanas         |
| 9   | Migrations automáticas integradas                           | Alto    | 1 mes             |

**Total estimado:** 6-7 meses de desarrollo para alcanzar paridad técnica con Django.

---

## 💭 Conclusión Técnica

Gremius no necesita "tiempo" para alcanzar a Django, necesita **implementar capacidades específicas:**

1. **Capa de abstracción ORM** (QuerySets) - El gap más grande
2. **CLI completo** - Productividad del desarrollador
3. **Admin auto-generado** - Para CMS/blogs
4. **Sistema de migrations automáticas** - Schema management

Estas son **features técnicas implementables**, no dependen de madurez o comunidad.

Con 6-7 meses de desarrollo enfocado en estos gaps, Gremius tendría **paridad técnica** con Django como framework modular, manteniendo sus ventajas de stack moderno.

---

_Documento técnico - Sin considerar madurez/comunidad_
