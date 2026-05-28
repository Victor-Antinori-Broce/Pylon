# Grimoires → Core Migration Plan

**Análisis de Grimoires existentes y recomendaciones de migración**

---

## 🎯 Principio de Diseño

> **Core**: Capabilities transversales que cualquier dataset puede usar  
> **Modules/Starters**: Dominios verticales completos con lógica de negocio específica

---

## 📊 Análisis por Grimoire

### 1. AI Memories
```
Tipo: Capability Transversal
Recomendación: MOVER AL CORE
Razón: Vector search debe estar disponible para CUALQUIER dataset
```

**Uso actual**: Almacenamiento vectorial independiente  
**Uso deseado**: Extensión de dataset:
```typescript
// Config de dataset
{
  name: "products",
  fields: [...],
  vectorSearch: {
    enabled: true,
    fields: ["description", "content"],
    model: "text-embedding-3-small"
  }
}
// Auto-genera: /api/datasets/products/search?vector=query
```

---

### 2. Formulas & KPIs ✅
```
Tipo: Capability Transversal  
Recomendación: MOVER AL CORE
Razón: Campos calculados son necesarios en cualquier dataset
```

**Uso actual**: Tablas separadas de fórmulas  
**Uso deseado**: Virtual fields en schema:
```typescript
{
  name: "orders",
  fields: [
    { name: "price", type: "number" },
    { name: "quantity", type: "number" },
    { 
      name: "total", 
      type: "formula",
      expression: "price * quantity * (1 - discount)"
    }
  ]
}
```

---

### 3. Tags ✅
```
Tipo: Capability Transversal
Recomendación: MOVER AL CORE
Razón: Cualquier entidad puede necesitar tags
```

**Uso actual**: Grimoire standalone  
**Uso deseado**: Field type "tags":
```typescript
{
  name: "posts",
  fields: [
    { name: "title", type: "text" },
    { name: "labels", type: "tags", taxonomy: "blog-tags" }
  ]
}
```

---

### 4. Promote ✅
```
Tipo: Capability Transversal (Bridge BaaS ↔ CMS)
Recomendación: MOVER AL CORE
Razón: Cualquier dataset puede querer publicarse como contenido
```

**Uso actual**: Endpoint separado `/api/promote`  
**Uso deseado**: Extensión de dataset:
```typescript
{
  name: "products",
  fields: [...],
  publishing: {
    enabled: true,
    slugField: "name",
    seoFields: ["description"],
    statusField: "isPublished",
    publicRoute: "/products/:slug"
  }
}
```

---

### 5. CRM ❌
```
Tipo: Dominio Vertical Completo
Recomendación: MANTENER COMO MODULE
Razón: Es una aplicación completa de gestión de clientes
```

Tablas: contacts, companies, deals, activities, pipelines  
Features: Kanban, deal tracking, activity log  
✅ Legítimo como Module

---

### 6. Booking ❌
```
Tipo: Dominio Vertical Completo
Recomendación: MANTENER COMO MODULE
Razón: Sistema de reservas con lógica compleja
```

Tablas: rooms, reservations, amenities  
Features: Availability tracking, conflict detection  
✅ Legítimo como Module

---

### 7. Blog ❌
```
Tipo: Dominio Vertical
Recomendación: MANTENER COMO MODULE / O REFACTORIZAR
Razón: Es contenido editorial, pero quizás redundante con "Promote"
```

**Observación**: Blog = Dataset "posts" + Promote publishing + Tags  
**Alternativa**: Eliminar Blog como grimoire, usar en su lugar:
- Dataset "posts" (creado por usuario)
- Core Tags
- Core Promote
- Core Media Library

---

### 8. Academy LMS ❌
```
Tipo: Dominio Vertical Complejo
Recomendación: MANTENER COMO MODULE
Razón: Sistema educativo completo con muchas entidades relacionadas
```

Tablas: courses, lessons, quizzes, enrollments, certificates, progress  
Features: Progreso, certificación, videos, quizzes  
✅ Legítimo como Module (tu mejor grimoire actual)

---

### 9. Games + Platforms ❌
```
Tipo: Específico de Gaming
Recomendación: AGRUPAR EN "GAMING STARTER" O ELIMINAR
Razón: Son datos específicos de catálogo gaming
```

**Opción A**: Mantener como Gaming Module  
**Opción B**: Son solo datasets - el usuario puede crearlos manualmente

Recomendación: Convertir en **Starter Template** no en Grimoire core

---

### 10. Collections ❌
```
Tipo: Feature Específica
Recomendación: MOVER AL CORE como "Collection Groups"
Razón: Cualquier dataset puede querer agrupar/coleccionar items
```

**Uso actual**: Solo para games  
**Uso deseado**: Relación "collection" disponible en cualquier dataset:
```typescript
{
  name: "products",
  fields: [
    { 
      name: "collection", 
      type: "relation",
      relation: { type: "many-to-many", target: "collections" }
    }
  ]
}
```

---

### 11. Esports Suite (Matches, Players, Teams, Tournaments, Streamers) ❌
```
Tipo: Específico de Esports/Gaming
Recomendación: MANTENER COMO MODULE "Esports" o ELIMINAR
Razón: Solo relevante para plataformas de esports
```

Recomendación: Agrupar todo en un **Grimoire "Esports"** unificado

---

### 12. DMS (Document Management) ❌
```
Tipo: Dominio Vertical
Recomendación: MANTENER COMO MODULE
Razón: Gestión documental con versiones, permisos, etc.
```

✅ Legítimo como Module (aunque se solapa con Media Library)

---

### 13. Blocks ⚠️
```
Tipo: Componente de UI/UX
Recomendación: MOVER AL CORE
Razón: Page builder blocks son base del CMS
```

Parte del Page Builder - debería ser core

---

## 📋 Plan de Migración

### Fase 1: Core Capabilities (Alta Prioridad)

| Grimoire | Acción | Archivos a Mover |
|----------|--------|------------------|
| AI Memories | → `packages/core/vector-search/` | `schema.ts`, `routes.ts`, extensión dataset |
| Formulas | → `packages/core/formulas/` | Motor de fórmulas, virtual fields |
| Tags | → `packages/core/taxonomy/` | Taxonomía universal, field type "tags" |
| Promote | → `packages/core/publishing/` | Extensión "publish" en datasets |
| Collections | → `packages/core/collections/` | Relación "collection" universal |

### Fase 2: Refactorizar a Extensión de Dataset

```typescript
// Nuevo: packages/core/extensions/
interface DatasetExtensions {
  vectorSearch?: VectorSearchConfig;
  formulas?: FormulaConfig[];
  taxonomy?: TaxonomyConfig;
  publishing?: PublishingConfig;
  collections?: boolean;
}

// En el admin, aparecen como toggles:
// [x] Enable Vector Search
// [x] Enable Formulas  
// [x] Enable Publishing
```

### Fase 3: Consolidar Modules Verticales

| Modules Actuales | Consolidar En |
|------------------|---------------|
| Games + Platforms + Collections | `modules/gaming/` o ELIMINAR |
| Matches + Players + Teams + Tournaments + Streamers | `modules/esports/` |
| Blog | ELIMINAR (reemplazado por Dataset + Promote) |
| CRM | `modules/crm/` (mantener) |
| Booking | `modules/booking/` (mantener) |
| Academy | `modules/academy/` (mantener) |
| DMS | `modules/documents/` (mantener) |

### Fase 4: Renombrar

```
packages/grimoires/ → packages/modules/
```

---

## 🏗️ Nueva Estructura Propuesta

```
packages/
├── core/                          # SIEMPRE activo
│   ├── database/                  # Drizzle, migrations
│   ├── auth/                      # Better Auth integration
│   ├── storage/                   # MinIO/S3
│   ├── realtime/                  # WebSockets
│   ├── vector-search/            # ← ANTES: ai-memories
│   ├── formulas/                 # ← ANTES: grimoire-formulas
│   ├── taxonomy/                 # ← ANTES: grimoire-tags
│   ├── publishing/               # ← ANTES: grimoire-promote
│   └── collections/              # ← ANTES: grimoire-collections
│
├── modules/                       # Opt-in (ANTES: grimoires/)
│   ├── academy/
│   ├── crm/
│   ├── booking/
│   ├── esports/                  # ← CONSOLIDADO
│   └── documents/
│
└── starters/                      # Templates
    ├── blog/                     # Dataset config + setup
    ├── gaming-catalog/
    └── e-commerce/

apps/
└── api/
    └── src/
        └── extensions/           # Hooks para dataset extensions
```

---

## 🔄 Cambios en la API

### Antes
```bash
# Vector search en grimoire separado
POST /api/ai-memories/search
{ "query": "typescript" }

# Promote en endpoint separado
POST /api/promote
{ "datasetId": "posts", "entryId": "123" }

# Tags en tabla separada
GET /api/tags
```

### Después (Core)
```bash
# Vector search en cualquier dataset
POST /api/datasets/posts/search?vector=typescript

# Publishing como extensión
POST /api/datasets/posts/123/publish

# Tags como field type
GET /api/datasets/posts?tags=javascript,typescript
```

---

## ✅ Checklist de Migración

### Paso 1: Preparar Core Extensions
- [ ] Crear `packages/core/extensions/` con sistema de plugins
- [ ] Migrar AI Memories → VectorSearchExtension
- [ ] Migrar Formulas → FormulaExtension  
- [ ] Migrar Tags → TaxonomyExtension
- [ ] Migrar Promote → PublishingExtension

### Paso 2: Actualizar Dataset Schema
- [ ] Agregar campo `extensions` al schema de datasets
- [ ] UI en admin para configurar extensiones

### Paso 3: Refactorizar Grimoires
- [ ] Mover Academy, CRM, Booking a `modules/`
- [ ] Consolidar Gaming/Esports
- [ ] Eliminar Blog (reemplazar con starter)

### Paso 4: Actualizar Documentación
- [ ] Renombrar "Grimoires" → "Modules" en docs
- [ ] Documentar "Extensions" como capabilities core

---

## 🎯 Beneficios de esta Arquitectura

| Antes (Grimoires) | Después (Core + Modules) |
|-------------------|--------------------------|
| "Instalar AI Memories" | Toggle: `[x] Enable vector search` en dataset |
| Múltiples APIs separadas | API unificada `/api/datasets/:id/*` |
| Curva de aprendizaje alta | Conceptos claros: Core (transversal) vs Modules (vertical) |
| Acoplamiento grimoire-dataset | Extensions declarativo por dataset |

---

## Conclusión

**Mover al Core**: AI Memories, Formulas, Tags, Promote, Collections  
**Mantener como Modules**: Academy, CRM, Booking, DMS, Esports  
**Eliminar**: Blog (reemplazado por Dataset + Extensions)  
**Consolidar**: Gaming suite

Esta arquitectura hace que Gremius sea verdaderamente un **BaaS extensible** en lugar de un CMS con plugins.
