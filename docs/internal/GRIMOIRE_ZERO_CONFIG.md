# Grimoire Zero Config System

Sistema de auto-registro para grimoires. **Sin código boilerplate**, solo convención.

---

## 🚀 Filosofía

> Convención sobre configuración

- **90% de los grimoires**: Solo necesitan `grimoire.json` con tablas definidas
- **10% de los grimoires**: Vistas custom por convención de archivos
- **0% de los grimoires**: Registro manual en código

---

## 📁 Estructura Mínima

```
packages/grimoires/grimoire-myfeature/
├── grimoire.json          ← Define tablas y config básica
├── index.ts               ← Rutas API (opcional)
└── schema.ts              ← Schema DB (opcional)
```

**Listo.** El sistema auto-detecta todo lo demás.

---

## 📝 Ejemplo: Grimoire Simple

### 1. Crear directorio

```bash
mkdir packages/grimoires/grimoire-books
```

### 2. Crear grimoire.json

```json
{
  "id": "grimoire-books",
  "name": "Books",
  "description": "Library management system",
  "version": "1.0.0",
  "type": "grimoire",
  "icon": "Book",
  "tables": [
    {
      "name": "books",
      "label": "Books",
      "searchableFields": ["title", "author", "isbn"],
      "filterableFields": ["genre", "published_year"]
    },
    {
      "name": "authors",
      "label": "Authors"
    }
  ]
}
```

### 3. Listo

El admin ahora muestra:
- Sidebar: "Books" con icono Book
- DataExplorer automático para tablas `books` y `authors`
- Búsqueda por título/autor/ISBN
- Filtros por género/año

**Sin escribir una línea de código de UI.**

---

## 🎨 Vista Custom (Opcional)

Si necesitas UI especializada:

### Opción A: Por Convención (Recomendado)

```
packages/admin/src/views/books/BooksView.svelte
```

El sistema auto-detecta el archivo y lo usa automáticamente.

### Opción B: Registro Manual (Legacy)

Para vistas complejas con dependencias especiales:

```typescript
// packages/admin/src/lib/grimoire-views.ts
export const GRIMOIRE_VIEW_REGISTRY = {
  books: () => import("$views/books/BooksView.svelte"),
};
```

---

## 📋 Referencia: grimoire.json

### Campos Básicos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID único (ej: `grimoire-books`) |
| `name` | string | Nombre visible |
| `description` | string | Descripción corta |
| `version` | string | Semver |
| `type` | string | `"grimoire"` \| `"core"` |
| `icon` | string | Icono Lucide (ej: `Book`, `Database`) |

### Tablas

```json
{
  "tables": [
    {
      "name": "books",
      "label": "Books",
      "icon": "Book",
      "description": "Main book catalog",
      "primaryKey": "id",
      "searchableFields": ["title", "author"],
      "filterableFields": ["genre", "status"],
      "readonly": false
    }
  ]
}
```

| Campo | Descripción |
|-------|-------------|
| `name` | Nombre de la tabla en DB |
| `label` | Label visible en UI |
| `icon` | Icono Lucide |
| `searchableFields` | Columnas para búsqueda |
| `filterableFields` | Columnas para filtros |
| `readonly` | Solo lectura |

### Config de Admin (Opcional)

```json
{
  "admin": {
    "category": "content",
    "defaultView": "grid",
    "views": [
      {
        "id": "grid",
        "type": "grid",
        "title": "All Books",
        "table": "books"
      },
      {
        "id": "kanban",
        "type": "kanban",
        "title": "By Status",
        "table": "books",
        "groupBy": "status"
      }
    ]
  }
}
```

---

## 🔧 DataExplorer Automático

Cuando no hay vista custom, el DataExplorer genera:

### Detección de Tipos
- `boolean` → Badges Sí/No coloreados
- `date` → Fechas formateadas
- `email` → Links mailto:
- `url` → Links clickeables
- `color` → Swatches visuales
- `_id` → Badges de relación con lookup
- `json` → Preview con contador

### Features Incluidas
- ✅ Búsqueda server-side
- ✅ Filtros multicolumna
- ✅ Ordenamiento
- ✅ Paginación
- ✅ Edición inline
- ✅ Bulk actions
- ✅ Export CSV
- ✅ Relaciones FK (auto-lookup)

---

## 🔄 Flujo de Detección

```
Usuario abre /books
        ↓
GrimoirePage.svelte
        ↓
GET /api/admin/registry/grimoire-books
        ↓
API escanea grimoire.json
        ↓
├─ ¿Tiene vista custom? 
│  ├─ Sí → Carga .svelte
│  └─ No → Usa DataExplorer
└─ ¿Tiene tablas definidas?
   ├─ Sí → Usa config
   └─ No → Infiere de DB
```

---

## 🆚 Comparación: Antes vs Después

### Antes (Configuración Manual)

```typescript
// 1. Registrar tabla en data-explorer.ts
const tableRegistry = {
  books: { table: books, label: "Books", ... },
  // ... 20+ tablas más
};

// 2. Registrar en scanner.ts
const grimoireTables = {
  books: ["books", "authors"],
};

// 3. Crear vista custom (opcional)
// 4. Registrar en grimoire-views.ts
const GRIMOIRE_VIEW_REGISTRY = {
  books: () => import("$views/BooksView.svelte"),
};

// 5. Agregar icono en 3 lugares diferentes
```

**~50 líneas de código por grimoire**

### Después (Zero Config)

```json
{
  "id": "grimoire-books",
  "name": "Books",
  "tables": ["books", "authors"],
  "icon": "Book"
}
```

**5 líneas de JSON. Listo.**

---

## 🎯 Casos de Uso

### Caso 1: CRUD Simple

```json
{
  "tables": [{ "name": "categories", "label": "Categories" }]
}
```

DataExplorer automático con todas las features.

### Caso 2: Múltiples Tablas

```json
{
  "tables": [
    { "name": "orders", "label": "Orders", "searchableFields": ["order_number"] },
    { "name": "order_items", "label": "Items", "readonly": true }
  ]
}
```

Tabs automáticos para cada tabla.

### Caso 3: Vista Custom

```json
{ "tables": ["analytics"] }
```

+ Crear archivo:
```svelte
<!-- packages/admin/src/views/analytics/AnalyticsView.svelte -->
<script>
  // Tu UI custom compleja
</script>
```

Auto-detectado, sin registro manual.

---

## 🐛 Troubleshooting

### No aparece en el sidebar

```bash
# Refrescar registry
curl -X POST http://localhost:3000/api/admin/registry/refresh
```

### Tabla no encontrada

Asegúrate que:
1. La tabla existe en DB
2. Está en `tables` de grimoire.json
3. El grimoire está habilitado (`enabled: true`)

### Vista custom no carga

Verifica que el archivo existe en:
```
packages/admin/src/views/{grimoire}/{PascalCase}View.svelte
```

Ejemplos:
- `grimoire-books` → `views/books/BooksView.svelte`
- `grimoire-games` → `views/games/GamesView.svelte`

---

## 📚 Ejemplos Completos

Ver directorios de ejemplo:
- `packages/grimoires/grimoire-games/` - Múltiples tablas
- `packages/grimoires/grimoire-blog/` - Relaciones
- `packages/core/webhooks/` - Con vista custom

---

## 🚧 Roadmap

- [ ] Auto-generar schema.ts desde DB
- [ ] Inline relations (como Django inlines)
- [ ] Drag-drop form builder
- [ ] Conditional fields
- [ ] Validaciones declarativas en grimoire.json
