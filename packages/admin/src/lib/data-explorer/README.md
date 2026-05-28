# DataExplorer Extensible

Sistema de exploración de datos genérico para Gremius Admin con field types extensibles y campos calculados.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│  DataExplorer.svelte (Componente Principal)                     │
│  ├── Props: table, config, apiEndpoint, data                    │
│  ├── Features: búsqueda, filtros, orden, paginación             │
│  └── Render: fieldRegistry.get(type) → Componente               │
├─────────────────────────────────────────────────────────────────┤
│  Field Registry (fieldRegistry.ts)                              │
│  ├── Map<type, Component>                                       │
│  ├── Calculated Fields                                          │
│  └── Helpers: count, sum, avg, timeAgo, currency...             │
├─────────────────────────────────────────────────────────────────┤
│  Field Components                                               │
│  ├── TextField.svelte                                           │
│  ├── NumberField.svelte                                         │
│  ├── BooleanField.svelte                                        │
│  ├── DateField.svelte                                           │
│  ├── StatusBadgeField.svelte                                    │
│  └── CalculatedField.svelte                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Uso Básico

```svelte
<script>
  import DataExplorer from "$lib/components/DataExplorer.svelte";
  
  const config = {
    table: "blog_posts",
    label: "Blog Posts",
    columns: [
      { field: "title", label: "Title", fieldConfig: { type: "text" } },
      { field: "status", label: "Status", fieldConfig: { type: "status-badge" } }
    ],
    searchableFields: ["title"],
    filterableFields: ["status"]
  };
</script>

<DataExplorer table="blog_posts" {config} apiEndpoint="/api/blog" />
```

## Campos Calculados

### Opción 1: Frontend (JavaScript)

```typescript
{
  field: "readingTime",
  label: "Read Time",
  fieldConfig: {
    type: "calculated",
    options: {
      calculate: (row) => {
        const words = String(row.content).split(/\s+/).length;
        return Math.ceil(words / 200) + " min";
      }
    }
  }
}
```

### Opción 2: Backend (API)

```typescript
// En la respuesta de la API
{
  docs: posts.map(p => ({
    ...p,
    readingTime: calculateReadingTime(p.content) // Backend
  }))
}
```

### Opción 3: grimoire.json (Configuración)

```json
{
  "fields": {
    "readingTime": {
      "type": "calculated",
      "backend": true,
      "expression": "CEIL(LENGTH(content) / 1200)"
    }
  }
}
```

## Field Types Disponibles

| Type | Descripción | Opciones |
|------|-------------|----------|
| `text` | Texto simple | maxLength, placeholder |
| `number` | Número | min, max, step |
| `boolean` | Checkbox | — |
| `date` | Fecha | format |
| `datetime` | Fecha y hora | format |
| `status-badge` | Badge con color | colors: { value: class } |
| `select` | Select | choices: [...] |
| `calculated` | Valor calculado | calculate, format |

## Registro de Tipos Custom

```typescript
import { fieldRegistry } from "$lib/data-explorer/fieldRegistry";
import MyCustomField from "./MyCustomField.svelte";

fieldRegistry.register("my-type", MyCustomField);
```

## Helpers de Cálculo

```typescript
import { calculatedHelpers } from "$lib/data-explorer/fieldRegistry";

calculatedHelpers.count(array)
calculatedHelpers.sum(array, "field")
calculatedHelpers.avg(array, "field")
calculatedHelpers.timeAgo(date)
calculatedHelpers.dateFormat(date, "YYYY-MM-DD")
calculatedHelpers.currency(value, "USD")
calculatedHelpers.get(obj, "path.nested")
```

## Presets

```typescript
import { fieldPresets } from "$lib/data-explorer/fieldRegistry";

// Status con colores
fieldPresets.status({ active: "green", inactive: "gray" })

// Relación
fieldPresets.relation("users", "name")

// Media
fieldPresets.media({ crop: true, aspectRatio: "16:9" })

// Conteo (calculado)
fieldPresets.count("comments", "Comments")

// Tiempo relativo (calculado)
fieldPresets.timeAgo("createdAt", "Age")
```

## ¿Dónde van los campos calculados?

| Ubicación | Cuándo usar | Ejemplo |
|-----------|-------------|---------|
| **Backend** | Datos pesados, agregaciones SQL | `COUNT(*)`, `SUM(amount)` |
| **Frontend** | Transformaciones simples, UX | `timeAgo`, concat strings |
| **grimoire.json** | Configuración declarativa | `expression: "field1 + field2"` |

### Regla general:
- **Backend**: Cuando necesitas datos de otras tablas o agregaciones
- **Frontend**: Cuando es pura presentación/transformación
- **JSON**: Cuando quieres que sea configurable sin código
