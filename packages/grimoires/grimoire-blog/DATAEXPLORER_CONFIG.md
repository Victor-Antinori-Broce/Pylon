# DataExplorer Configuration - Grimoire Blog

## Uso del DataExplorer Genérico

Este grimoire está configurado para usar el DataExplorer genérico con field types extensibles.

## Ejemplo de uso en un componente Svelte

```svelte
<script>
  import DataExplorer from "$lib/components/DataExplorer.svelte";
  import { fieldPresets } from "$lib/data-explorer/fieldRegistry";

  const config = {
    table: "blog_posts",
    label: "Blog Posts",
    columns: [
      {
        field: "title",
        label: "Title",
        fieldConfig: { type: "text", options: { maxLength: 200 } },
      },
      {
        field: "status",
        label: "Status",
        fieldConfig: {
          type: "status-badge",
          options: {
            colors: {
              draft: "bg-yellow-500/10 text-yellow-500",
              published: "bg-green-500/10 text-green-500",
              scheduled: "bg-blue-500/10 text-blue-500",
              archived: "bg-gray-500/10 text-gray-400",
            },
          },
        },
      },
      {
        field: "readingTime",
        label: "Reading Time",
        fieldConfig: { type: "calculated" },
      },
      {
        field: "publishedAt",
        label: "Published",
        fieldConfig: {
          type: "calculated",
          options: {
            calculate: (row) => (row.publishedAt ? timeAgo(row.publishedAt) : "—"),
            format: "text",
          },
        },
      },
      {
        field: "author",
        label: "Author",
        fieldConfig: {
          type: "calculated",
          options: {
            calculate: (row) => row.author?.name || "—",
          },
        },
      },
    ],
    searchableFields: ["title", "excerpt", "content"],
    filterableFields: ["status", "authorId"],
    rowActions: [
      { id: "edit", label: "Edit", icon: Edit2 },
      { id: "view", label: "View", icon: Eye },
    ],
  };
</script>

<DataExplorer table="blog_posts" {config} apiEndpoint="/api/blog" />
```

## Campos Calculados Disponibles

### 1. Backend (en la API)

Los campos calculados en el backend se incluyen en la respuesta de la API:

```typescript
// En routes.ts
router.get("/", async (c) => {
  const posts = await db.query.blogPosts.findMany({
    with: {
      author: true,
      _count: {
        select: { comments: true },
      },
    },
  });

  // Campos calculados agregados por el backend
  return c.json({
    docs: posts.map((p) => ({
      ...p,
      commentCount: p._count.comments, // Calculado por backend
      readingTime: calculateReadingTime(p.content), // Calculado por backend
    })),
  });
});
```

### 2. Frontend (en el DataExplorer)

Los campos calculados en el frontend se evalúan dinámicamente:

```typescript
{
  field: "isOverdue",
  label: "Status",
  fieldConfig: {
    type: "calculated",
    options: {
      calculate: (row) => {
        if (row.status !== "scheduled") return null;
        return new Date(row.scheduledAt) < new Date() ? "Overdue" : "On Track";
      },
      format: "badge"
    }
  }
}
```

## Helpers de Cálculo

```typescript
import { calculatedHelpers } from "$lib/data-explorer/fieldRegistry";

// Conteo
calculatedHelpers.count(array);

// Suma
calculatedHelpers.sum(array, "fieldName");

// Promedio
calculatedHelpers.avg(array, "fieldName");

// Formatear fecha
calculatedHelpers.dateFormat(date, "YYYY-MM-DD");

// Tiempo relativo
calculatedHelpers.timeAgo(date);

// Moneda
calculatedHelpers.currency(value, "USD");

// Obtener valor anidado
calculatedHelpers.get(obj, "path.nested.field", "default");

// Condicional
calculatedHelpers.if(condition, trueValue, falseValue);
```

## Field Types Registrados

| Type           | Component        | Uso                |
| -------------- | ---------------- | ------------------ |
| `text`         | TextField        | Texto simple       |
| `textarea`     | TextField        | Texto largo        |
| `number`       | NumberField      | Números            |
| `boolean`      | BooleanField     | Sí/No              |
| `date`         | DateField        | Fechas             |
| `datetime`     | DateField        | Fecha y hora       |
| `status-badge` | StatusBadgeField | Estados con color  |
| `select`       | StatusBadgeField | Select simple      |
| `calculated`   | CalculatedField  | Valores calculados |
| `relation`     | (pendiente)      | FK a otras tablas  |
| `media`        | (pendiente)      | Imágenes/archivos  |
| `richtext`     | (pendiente)      | Editor rico        |

## Extender con Tipos Custom

Los grimoires pueden registrar sus propios tipos de campo:

```typescript
// En el grimoire
import { fieldRegistry } from "$lib/data-explorer/fieldRegistry";
import MyCustomField from "./MyCustomField.svelte";

fieldRegistry.register("my-custom-type", MyCustomField);
```
