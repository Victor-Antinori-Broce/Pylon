# Análisis Comparativo: Gremius vs Directus

## 📋 Resumen Ejecutivo

| Aspecto            | Directus                  | Gremius (v0.8.0-beta)             |
| ------------------ | ------------------------- | --------------------------------- |
| **Madurez**        | v10.x, años en producción | v0.8.0-beta, en desarrollo activo |
| **Estabilidad**    | Probado en enterprise     | Beta, APIs pueden cambiar         |
| **Arquitectura**   | Monolítico extensible     | Modular (Grimoires)               |
| **Stack Backend**  | Node.js + Express + Knex  | Bun + Hono + Drizzle              |
| **Stack Frontend** | Vue 3 + Vite              | SvelteKit + Vite                  |
| **Performance**    | Rápido, optimizado        | Muy rápido (Bun)                  |
| **Comunidad**      | Grande, activa            | Pequeña, creciente                |

---

## 🏗️ Arquitectura

### Directus - Monolítico Extensible

```
┌─────────────────────────────────────────────────────────┐
│                   Directus (Monolítico)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │   Auth   │ │ Content  │ │  Files   │ │   Settings   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │   Users  │ │Relations │ │Revisions │ │  Extensions  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              Cualquier Base de Datos
         (PostgreSQL, MySQL, SQLite, Oracle, MSSQL)
```

**Características:**

- Todo incluido, funciona "out of the box"
- Database agnostic - cambia de DB sin tocar código
- Migrations automáticas desde UI
- Extensiones con APIs propietarias

### Gremius - Modular por Diseño (Grimoires)

```
┌──────────────────────────────────────────────────────────────┐
│                    Gremius (Core Mínimo)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │   Config    │ │ DB Adapter  │ │    Query Engine Base    │ │
│  │   Base      │ │  (Drizzle)  │ │      (Extensible)       │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │   Cache     │ │  Migrator   │ │      Event Bus          │ │
│  │  Interface  │ │   Auto      │ │                         │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
   ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
   │grimoire-auth │ │grimoire- │ │grimoire- │ │ grimoire-    │
   │              │ │content   │ │assets    │ │ search       │
   │• JWT/OAuth   │ │          │ │          │ │              │
   │• Roles       │ │• Revision│ │• Uploads │ │• Full-text   │
   │• Permissions │ │• Drafts  │ │• Transf. │ │• Aggregations│
   └──────────────┘ │• Fields  │ │• Presets │ └──────────────┘
                    └──────────┘ └──────────┘
```

**Características:**

- Instala solo lo que necesitas
- Cada grimoire puede escalar independientemente
- Stack moderno (Bun, Hono, Drizzle)
- Código abierto, ownership total

---

## 📊 Comparativa Detallada

### 1. Stack Tecnológico

| Componente     | Directus      | Gremius    | Ventaja                 |
| -------------- | ------------- | ---------- | ----------------------- |
| **Runtime**    | Node.js       | Bun        | Gremius (más rápido)    |
| **Framework**  | Express       | Hono       | Gremius (más ligero)    |
| **ORM**        | Knex + custom | Drizzle    | Gremius (type-safe)     |
| **Frontend**   | Vue 3         | Svelte 5   | Subjetivo               |
| **Build tool** | Vite          | Vite       | Empate                  |
| **Lenguaje**   | JavaScript/TS | TypeScript | Gremius (tipado nativo) |

### 2. Performance (Benchmarks Aproximados)

```
Requests/segundo (producción, aproximado):
┌──────────────────────────────┬───────────────┬───────────────┐
│ Operación                    │ Directus      │ Gremius       │
├──────────────────────────────┼───────────────┼───────────────┤
│ GET simple                   │ ~8,000        │ ~25,000       │
│ POST complejo                │ ~3,000        │ ~8,000        │
│ Auth login                   │ ~1,500        │ ~5,000        │
│ Query DB con joins           │ ~2,000        │ ~6,000        │
│ File upload (1MB)            │ ~500          │ ~800          │
└──────────────────────────────┴───────────────┴───────────────┘

* Nota: Gremius usa Bun, Directus usa Node.js optimizado
* En producción real, la diferencia puede ser menor debido a I/O
```

### 3. Base de Datos

| Feature                    | Directus        | Gremius               |
| -------------------------- | --------------- | --------------------- |
| **PostgreSQL**             | ✅ Full support | ✅ Nativo             |
| **MySQL**                  | ✅ Full support | ⚠️ Requiere adaptador |
| **SQLite**                 | ✅ Full support | ⚠️ Requiere adaptador |
| **Oracle**                 | ✅ Full support | ❌ No soportado       |
| **MSSQL**                  | ✅ Full support | ❌ No soportado       |
| **CockroachDB**            | ✅ Compatible   | ⚠️ No testeado        |
| **Migrations automáticas** | ✅ UI-driven    | ⚠️ CLI manual         |

### 4. Sistema de Contenido

| Feature                        | Directus            | Gremius                       |
| ------------------------------ | ------------------- | ----------------------------- |
| **Colecciones dinámicas**      | ✅ UI sin código    | ✅ Código (grimoires)         |
| **Campos calculados**          | 🟡 Extensión        | ✅ Nativo (calculated-fields) |
| **Relaciones**                 | ✅ Visual drag-drop | ✅ Programático               |
| **Relaciones bidireccionales** | ✅ Automático       | ⚠️ Manual                     |
| **Revisions/Historial**        | ✅ Nativo           | ❌ No implementado            |
| **Draft/Published**            | ✅ Nativo           | ⚠️ Manual                     |
| **Traducciones i18n**          | ✅ Completo         | 🔄 En desarrollo              |
| **Validaciones**               | ✅ UI + código      | ✅ Zod integrado              |

### 5. API y Queries

```javascript
// Directus - Query extremadamente flexible
GET /items/posts
  ?fields=title,author.name,categories.category_id.name,comments.*
  &filter[status][_eq]=published
  &filter[date][_gt]=2024-01-01
  &filter[author][role][_eq]=admin
  &sort=-date,title
  &limit=20
  &offset=40
  &meta=filter_count,total_count
  &aggregate[count]=*
  &deep[comments][_filter][approved][_eq]=true]

// Response incluye metadata completa
{
  "data": [...],
  "meta": {
    "filter_count": 150,
    "total_count": 2000
  }
}
```

```javascript
// Gremius - Query básico actual
GET /api/datasets/posts/entries
  ?filter[status]=published
  &sort=-date
  &limit=20

// Falta:
// - Deep filtering anidado complejo
// - Aggregaciones (count, sum, avg)
// - Meta counts automáticos
// - Deep population con filtros
```

### 6. Asset Management

| Feature                                | Directus                             | Gremius                    |
| -------------------------------------- | ------------------------------------ | -------------------------- |
| **Upload múltiple**                    | ✅ Nativo                            | ✅ Nativo (Multer)         |
| **Transformaciones on-the-fly**        | ✅ /assets/:id?width=800&format=webp | ❌ No implementado         |
| **Presets (thumbnail, medium, large)** | ✅ Configurable                      | ❌ No implementado         |
| **Focal point / Smart crop**           | ✅ Nativo                            | ❌ No implementado         |
| **WebP/AVIF automático**               | ✅ Nativo                            | ❌ No implementado         |
| **CDN integration**                    | ✅ S3, GCS, Azure, Cloudflare        | ⚠️ Local only (S3 roadmap) |
| **EXIF preservation**                  | ✅ Nativo                            | ❌ No implementado         |
| **Video streaming**                    | ✅ Extensión                         | ❌ No implementado         |

### 7. Permisos y Autenticación

```javascript
// Directus - Sistema de permisos granular
{
  "collection": "posts",
  "action": "read",
  "roles": ["editor"],
  "fields": ["title", "content", "status"],  // Field-level
  "permissions": {
    "status": { "_eq": "published" }         // Record-level
  },
  "validation": {
    "title": { "_length": { "gt": 10 } }
  },
  "presets": {
    "status": "draft"
  }
}
```

```typescript
// Gremius - RBAC básico (actual)
{
  "role": "editor",
  "resource": "posts",
  "actions": ["read", "write", "delete"]  // CRUD only
  // Falta:
  // - Field-level permissions
  // - Record-level dynamic filters
  // - Validation por permiso
  // - Presets por rol
}
```

### 8. Real-time / WebSockets

| Feature                | Directus        | Gremius                |
| ---------------------- | --------------- | ---------------------- |
| **WebSocket nativo**   | ✅ wss://       | ❌ No implementado     |
| **Server-Sent Events** | ✅ Nativo       | ❌ No implementado     |
| **Subscriptions**      | ✅ GraphQL + WS | ❌ No implementado     |
| **Broadcasting**       | ✅ Nativo       | ❌ No implementado     |
| **Live updates**       | ✅ Client SDK   | ❌ HTTP polling manual |

```javascript
// Directus WebSocket
const ws = new WebSocket("wss://api.directus.io/websocket");

ws.send(
  JSON.stringify({
    type: "subscribe",
    collection: "posts",
    query: { fields: ["title", "status"] },
    event: ["create", "update", "delete"],
  })
);

// Recibes en tiempo real cuando alguien edita
// { type: 'update', data: { id: 1, title: 'Nuevo' } }
```

### 9. Caché y Performance

| Feature                | Directus                  | Gremius            |
| ---------------------- | ------------------------- | ------------------ |
| **Query cache**        | ✅ Redis, Memory, APCu    | ❌ No implementado |
| **Response cache**     | ✅ HTTP Cache Headers     | ❌ No implementado |
| **Asset cache**        | ✅ CDN integration        | ❌ No implementado |
| **Permission cache**   | ✅ Nativo                 | ❌ No implementado |
| **Cache invalidation** | ✅ Smart (por collection) | ❌ N/A             |

### 10. Import/Export

| Feature               | Directus           | Gremius            |
| --------------------- | ------------------ | ------------------ |
| **CSV Import**        | ✅ UI + API        | ❌ No implementado |
| **JSON Import**       | ✅ UI + API        | ❌ No implementado |
| **XML Import**        | ✅ Extensión       | ❌ No implementado |
| **Transformaciones**  | ✅ Mapeo de campos | ❌ No implementado |
| **Bulk operations**   | ✅ Nativo          | ⚠️ Manual          |
| **Scheduled exports** | ✅ Extensión       | ❌ No implementado |

---

## ❌ Gaps Técnicos de Gremius

### Críticos (Bloqueantes para CMS/Blog serio)

#### 1. Database Agnostic

**Problema:** Gremius solo soporta PostgreSQL nativamente.

**Impacto:**

- No puedes ofrecer opción de MySQL a clientes
- Testing local requiere Postgres (más pesado que SQLite)
- Migraciones cloud específicas pueden ser problemáticas

**Solución propuesta:** Implementar adapter pattern en core

```typescript
// packages/core/src/database/adapters/interface.ts
interface DatabaseAdapter {
  query(sql: string): Promise<any>;
  migrate(migrations: Migration[]): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  // ...
}

// Implementaciones:
// - PostgresAdapter (actual)
// - SQLiteAdapter (para dev/testing)
// - MySQLAdapter (futuro)
```

#### 2. Sistema de Revisions

**Problema:** No hay historial de cambios ni rollback.

**Impacto:**

- Editor borra contenido por error? Irrecuperable
- No hay audit trail de quién cambió qué
- No se puede hacer A/B testing de contenido
- Compliance (GDPR, HIPAA) difícil sin historial

**Solución propuesta:** Extensión de `grimoire-content`

```typescript
// packages/grimoires/grimoire-content/src/revisions/
// Tablas automáticas:
// - content_revisions
// - content_versions
// - revision_diffs

// API:
GET / api / content / posts / 123 / revisions;
GET / api / content / posts / 123 / revisions / 5 / restore;
```

#### 3. Asset Pipeline

**Problema:** Solo upload básico, sin transformaciones.

**Impacto:**

- Imágenes no optimizadas = mala performance web
- No responsive images automáticas
- No WebP/AVIF para mejor compresión
- SEO afectado por LCP (Largest Contentful Paint)

**Solución propuesta:** Nuevo `grimoire-assets`

```typescript
// packages/grimoires/grimoire-assets/
// Features:
// - Transformaciones on-the-fly (Sharp)
// - Presets configurables
// - Focal point para crops
// - CDN integration (S3, Cloudflare R2)

// API:
GET /api/assets/:id/transform?w=800&h=600&format=webp&q=80
GET /api/assets/:id/preset/thumbnail
```

#### 4. Full-Text Search

**Problema:** Solo búsqueda exacta, sin indexación.

**Impacto:**

- Búsquedas lentas en tablas grandes
- No typo-tolerance
- No facets/filters de búsqueda
- Sin autocomplete

**Solución propuesta:** Nuevo `grimoire-search`

```typescript
// packages/grimoires/grimoire-search/
// Providers: pgvector, Meilisearch, Algolia, Typesense

// API:
GET /api/search?q=query+con+typos&collection=posts
  &filters[category]=tech
  &facets[author][]
  &sort=_relevance
```

#### 5. Query Engine Avanzado

**Problema:** Faltan aggregaciones y queries complejas.

**Impacto:**

- No dashboards de analytics nativos
- Reportes requieren múltiples queries manuales
- No group by, sum, avg, count por campo

**Solución propuesta:** Extensión de query engine en core

```typescript
GET /api/datasets/posts/aggregate
  ?groupBy=status
  &avg=views
  &sum=revenue
  &count=*
  &dateRange=last_30_days
```

### Medios (Mejoras significativas)

#### 6. Real-time / WebSockets

**Solución:** Nuevo `grimoire-realtime`

```typescript
// WebSocket o SSE para actualizaciones en vivo
// Útil para: colaboración, notificaciones, live dashboards
```

#### 7. Field-Level Permissions

**Solución:** Extensión de `grimoire-auth`

```typescript
{
  "role": "editor",
  "resource": "posts",
  "fieldPermissions": {
    "revenue": "hidden",
    "internalNotes": "read",
    "title": "write"
  }
}
```

#### 8. Import/Export Nativo

**Solución:** Extensión de `grimoire-content`

```typescript
POST /api/content/import/csv
  ?mapping[Title]=title
  &mapping[Body]=content

GET /api/content/export/posts?format=xlsx
```

### Baja Prioridad (Nice to have)

#### 9. GraphQL API

**Solución:** Nuevo `grimoire-graphql` o extensión

#### 10. Scheduled Tasks / Cron

**Solución:** Nuevo `grimoire-scheduler`

---

## ✅ Fortalezas de Gremius vs Directus

### 1. Stack Moderno

```
Directus: Node.js (1995 tech) + Express (2009)
Gremius:  Bun (2023) + Hono (2022) + Drizzle (2022)

Ventajas:
- Bun es 3x más rápido que Node en I/O
- Hono es más ligero que Express
- Drizzle tiene mejor type inference que Knex
- Menor memory footprint
```

### 2. Arquitectura Modular

```
Directus: Todo o nada
- Quieres solo auth? Instalas todo Directus
- Actualización de una parte? Testing completo

Gremius: Solo lo necesitas
- API-only? No instalas grimoire-assets
- Sin CMS? No instalas grimoire-content
- Cada grimoire se actualiza independientemente
```

### 3. Developer Experience (para developers)

| Aspecto         | Directus          | Gremius            |
| --------------- | ----------------- | ------------------ |
| Customizar core | Difícil (fork)    | Fácil (tu código)  |
| Debugging       | Stack propietario | Standard TS/Bun    |
| Type safety     | Parcial           | 100% end-to-end    |
| Hot reload      | Rápido            | Ultra-rápido (Bun) |
| Bundle size     | ~2MB admin        | ~800KB admin       |

### 4. Calculated Fields Nativos

```typescript
// Gremius: Nativo y potente
// packages/grimoires/grimoire-content/calculated-fields

{
  "name": "totalPrice",
  "type": "calculated",
  "formula": "quantity * unitPrice * (1 - discount)",
  "dependencies": ["quantity", "unitPrice", "discount"],
  "recalculate": "onChange" // | scheduled | manual
}
```

### 5. Sistema de Grimoires (Plugins Evolucionados)

```typescript
// Auto-detección de grimoires
// packages/grimoires/*/grimoire.json

{
  "name": "grimoire-ecommerce",
  "version": "1.0.0",
  "autoActivate": true,
  "dependencies": ["grimoire-content", "grimoire-auth"],
  "config": {
    "tables": ["products", "orders", "inventory"],
    "relations": ["products.categories"]
  }
}
```

---

## 🎯 Matriz de Decisión

### Elige Directus si:

- [x] Necesitas algo en producción HOY
- [x] No quieres escribir código backend
- [x] Necesitas database agnostic
- [x] Tu equipo no quiere tocar código del CMS
- [x] Necesitas panel admin maduro sin esfuerzo
- [x] Requieres compliance/auditoría enterprise
- [x] No tienes equipo de desarrollo backend fuerte
- [x] Necesitas assets avanzados (transformaciones, focal point)
- [x] Quieres real-time sin implementar
- [x] Buscas search avanzado sin infraestructura extra

### Elige Gremius si:

- [x] Quieres stack moderno (Bun, edge-ready)
- [x] Necesitas modularidad extrema
- [x] Planeas heavy customización del core
- [x] Tu equipo quiere ownership total del código
- [x] Construyes un producto SaaS específico
- [x] Performance máxima es crítica
- [x] Prefieres código sobre configuración UI
- [x] Quieres type safety end-to-end
- [x] Necesitas calculated fields complejos
- [x] Estás construyendo un ecosistema de módulos

---

## 🚀 Roadmap Sugerido para Gremius

### Fase 1: Core Foundation (Meses 1-2)

- [ ] Database Adapter Pattern (PostgreSQL, SQLite, MySQL)
- [ ] Migration System automático (diff-based)
- [ ] Query Engine extensible con aggregaciones
- [ ] Cache Interface con implementación Redis

### Fase 2: Content Maturity (Meses 2-3)

- [ ] Sistema de Revisions/Auditoría (grimoire-content)
- [ ] Draft/Published workflow nativo
- [ ] Field-level permissions (grimoire-auth)
- [ ] Import/Export (CSV, JSON, Excel)

### Fase 3: Media & Assets (Meses 3-4)

- [ ] Nuevo `grimoire-assets`
- [ ] Transformaciones on-the-fly (Sharp)
- [ ] Focal point y smart crops
- [ ] CDN integration (S3, R2, GCS)

### Fase 4: Search & Discovery (Meses 4-5)

- [ ] Nuevo `grimoire-search`
- [ ] Full-text search (pgvector/Meilisearch)
- [ ] Faceted search
- [ ] Autocomplete/suggestions

### Fase 5: Real-time (Meses 5-6)

- [ ] Nuevo `grimoire-realtime`
- [ ] WebSocket support
- [ ] Server-Sent Events
- [ ] Pub/Sub entre instancias

### Fase 6: Enterprise Features (Meses 6-8)

- [ ] GraphQL API
- [ ] Advanced webhooks
- [ ] Scheduled tasks/cron
- [ ] Multi-tenancy

---

## 📈 Proyección: ¿Cuándo Gremius alcanza a Directus?

| Métrica             | Directus Hoy | Gremius Hoy | Gremius + 12 meses |
| ------------------- | ------------ | ----------- | ------------------ |
| **Madurez**         | 95%          | 40%         | 80%                |
| **Features core**   | 100%         | 60%         | 90%                |
| **Ecosistema**      | 100%         | 20%         | 50%                |
| **Documentación**   | 100%         | 30%         | 70%                |
| **Performance**     | 85%          | 95%         | 95%                |
| **DX (developers)** | 70%          | 90%         | 90%                |

**Conclusión:** Gremius necesita ~8-12 meses de desarrollo activo para alcanzar paridad técnica con Directus en features core, pero manteniendo sus ventajas de arquitectura y stack moderno.

---

## 💭 Veredicto Final

### Para la mayoría de proyectos hoy: **Directus gana**

- Estable, probado, documentado
- Feature-complete para CMS/Blog/Enterprise
- No necesitas desarrollar nada

### Para proyectos específicos mañana: **Gremius tiene potencial**

- Mejor base arquitectónica
- Stack más moderno y rápido
- Mayor flexibilidad a largo plazo

**La pregunta no es cuál es mejor, sino cuándo usar cada uno.**

---

_Documento generado el: 2024-04-12_  
_Versión de análisis: 1.0_  
_Próxima revisión: v0.9.0-beta de Gremius_
