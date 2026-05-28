# 🌍 Guía de Implementación: Multi-idioma (i18n)

> **Estado:** Propuesta de implementación  
> **Complejidad:** Media  
> **Tiempo estimado:** 2 semanas

---

## 📋 ¿Qué implica implementar i18n?

### 1. Niveles de i18n

```
Nivel 1: UI del Admin (etiquetas, botones, menús)
Nivel 2: Schema de datasets (campos traducibles)
Nivel 3: Content (entries con múltiples idiomas)
Nivel 4: URLs slug (/en/products vs /es/productos)
```

**Recomendación:** Implementar niveles 2 y 3 (los más importantes para un CMS).

---

## 🔧 Implementación Técnica

### Opción A: Columnas por idioma (Recomendada)

**Cambio en schema de datasets:**
```typescript
// packages/grimoires/grimoire-datasets/datasets.schema.ts

export interface DataSetField {
  key: string;
  type: FieldType;
  label: string;
  // NUEVO: Soporte i18n
  i18n?: boolean; // Si este campo es traducible
}

// Ejemplo de schema con i18n
{
  "fields": [
    { "key": "title", "type": "string", "label": "Título", "i18n": true },
    { "key": "slug", "type": "string", "label": "Slug", "i18n": false }, // URL es única
    { "key": "price", "type": "number", "label": "Precio", "i18n": false }, // Números no se traducen
    { "key": "description", "type": "richtext", "label": "Descripción", "i18n": true }
  ]
}
```

**Generación de columnas SQL:**
```sql
-- Tabla generada para un dataset "products" con i18n
CREATE TABLE dataset_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Campos traducibles (sufijo _{lang})
  title_en TEXT,
  title_es TEXT,
  title_fr TEXT,
  description_en JSONB,
  description_es JSONB,
  description_fr JSONB,
  
  -- Campos NO traducibles (compartidos)
  slug TEXT UNIQUE NOT NULL,
  price DECIMAL(10,2),
  
  -- Metadata
  _lang_versions JSONB DEFAULT '[]', -- ['en', 'es', 'fr']
  _default_lang TEXT DEFAULT 'en',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**API de entries:**
```typescript
// POST /api/datasets/:id/entries
{
  "data": {
    "title": {
      "en": "Gaming Mouse",
      "es": "Ratón Gaming",
      "fr": "Souris Gaming"
    },
    "slug": "gaming-mouse", // No se traduce
    "price": 49.99,
    "description": {
      "en": "High precision gaming mouse...",
      "es": "Ratón de alta precisión...",
      "fr": "Souris de haute précision..."
    }
  },
  "defaultLang": "en"
}

// GET /api/datasets/:id/entries?lang=es
// Response:
{
  "id": "...",
  "title": "Ratón Gaming", // Devuelve solo el idioma pedido
  "slug": "gaming-mouse",
  "price": 49.99,
  "description": "Ratón de alta precisión...",
  "_allLangs": ["en", "es", "fr"] // Disponible por si se necesita
}
```

---

### Opción B: Tabla separada de traducciones

```sql
-- Tabla principal (idioma por defecto)
CREATE TABLE dataset_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description JSONB,
  slug TEXT UNIQUE NOT NULL,
  price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de traducciones
CREATE TABLE dataset_products_i18n (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES dataset_products(id) ON DELETE CASCADE,
  lang TEXT NOT NULL, -- 'es', 'fr', etc.
  field_key TEXT NOT NULL, -- 'title', 'description'
  value TEXT NOT NULL,
  UNIQUE(entry_id, lang, field_key)
);

-- Índices
CREATE INDEX idx_i18n_lookup ON dataset_products_i18n(entry_id, lang);
```

**Comparación:**

| Aspecto | Opción A (Columnas) | Opción B (Tabla separada) |
|---------|---------------------|---------------------------|
| Queries | Más rápidas | Necesitan JOIN |
| Escalabilidad | Limitada a idiomas predefinidos | Ilimitada (añadir idiomas dinámicamente) |
| Complejidad | Menor | Mayor |
| Storage | Menor (sin overhead de filas) | Mayor (metadata por traducción) |
| Flexibilidad | Menor | Mayor |

**Recomendación:** Opción A para la mayoría de casos. Opción B si necesitas soportar 10+ idiomas dinámicos.

---

## 🏗️ Cambios necesarios

### 1. Backend (API)

```typescript
// apps/api/src/routes/datasets.ts

// Middleware de idioma
app.use("/api/datasets/:id/entries", async (c, next) => {
  const lang = c.req.query("lang") || "en";
  c.set("lang", lang);
  await next();
});

// Transformación de respuesta
function localizeEntry(entry: any, lang: string, defaultLang: string) {
  const result = { ...entry };
  
  for (const [key, value] of Object.entries(entry.data || {})) {
    if (typeof value === "object" && value !== null) {
      // Campo traducible
      result[key] = value[lang] || value[defaultLang] || Object.values(value)[0];
    } else {
      // Campo no traducible
      result[key] = value;
    }
  }
  
  return result;
}
```

### 2. Admin UI

```svelte
<!-- Componente de selección de idioma -->
<script>
  import { locale, locales } from '$lib/i18n/store';
  
  const availableLocales = ['en', 'es', 'fr'];
  let currentLang = 'en';
</script>

<div class="lang-switcher">
  {#each availableLocales as lang}
    <button 
      class:active={currentLang === lang}
      on:click={() => currentLang = lang}
    >
      {lang.toUpperCase()}
    </button>
  {/each}
</div>

<!-- Formulario con tabs por idioma -->
<div class="i18n-tabs">
  {#each availableLocales as lang}
    <div class="tab" class:active={currentLang === lang}>
      <input 
        bind:value={data.title[lang]} 
        placeholder="Título ({lang})"
      />
      <textarea 
        bind:value={data.description[lang]}
        placeholder="Descripción ({lang})"
      />
    </div>
  {/each}
</div>
```

### 3. Schema Builder

```typescript
// En el builder de schemas, añadir toggle i18n por campo
interface FieldConfig {
  key: string;
  type: FieldType;
  label: string;
  i18n?: boolean; // NUEVO
}

// Visualización:
// [Text Field: Title] [Toggle: i18n 🌍]
// [Text Field: Slug]  [Toggle: i18n ⛔ (desactivado para slugs)]
```

---

## 🌐 Gestión de Idiomas

### Configuración del Sistema

```typescript
// gremius.config.ts
export default {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de', 'pt'],
    fallback: {
      'es-MX': 'es',
      'es-AR': 'es',
      'en-US': 'en',
      'en-GB': 'en'
    }
  }
};
```

### API de Idiomas

```typescript
// GET /api/i18n/locales
// Lista idiomas disponibles
{
  "default": "en",
  "locales": [
    { "code": "en", "name": "English", "flag": "🇺🇸" },
    { "code": "es", "name": "Español", "flag": "🇪🇸" },
    { "code": "fr", "name": "Français", "flag": "🇫🇷" }
  ]
}

// GET /api/i18n/missing?lang=es
// Campos sin traducir (para reportes)
{
  "datasetId": "products",
  "entryId": "...",
  "field": "description",
  "hasEnglish": true,
  "missingIn": ["es", "fr"]
}
```

---

## 📝 Checklist de Implementación

### Fase 1: Backend (3 días)
- [ ] Añadir campo `i18n` a schema de datasets
- [ ] Modificar generador de tablas SQL
- [ ] Actualizar endpoints CRUD para manejar objetos traducibles
- [ ] Middleware de detección de idioma (`?lang=` o `Accept-Language`)

### Fase 2: Admin UI (4 días)
- [ ] Toggle i18n en Schema Builder
- [ ] Componente de tabs de idioma en Entry Editor
- [ ] Selector de idioma en header
- [ ] Indicadores de campos sin traducir

### Fase 3: Frontend SDK (2 días)
- [ ] Helper `$t()` para componentes
- [ ] Auto-detección de idioma del navegador
- [ ] Switch de idioma persistente

### Fase 4: Utilities (3 días)
- [ ] Import/Export con soporte i18n (XLIFF, JSON)
- [ ] Reporte de traducciones incompletas
- [ ] API de traducción automática (Google Translate/DeepL)

---

## 💡 Ejemplo Completo

### Dataset: "Blog Posts"

```typescript
// Schema
{
  "name": "Blog Posts",
  "fields": [
    { "key": "title", "type": "string", "i18n": true },
    { "key": "slug", "type": "string", "i18n": false },
    { "key": "content", "type": "richtext", "i18n": true },
    { "key": "excerpt", "type": "text", "i18n": true },
    { "key": "featured_image", "type": "media", "i18n": false },
    { "key": "published_at", "type": "datetime", "i18n": false }
  ]
}

// Entry creada
{
  "title": {
    "en": "How to Build a CMS",
    "es": "Cómo Construir un CMS",
    "fr": "Comment Construire un CMS"
  },
  "slug": "how-to-build-cms",
  "content": {
    "en": "# Introduction...",
    "es": "# Introducción...",
    "fr": "# Introduction..."
  },
  "featured_image": "image-id-123",
  "published_at": "2026-04-01T10:00:00Z"
}

// Query del frontend
GET /api/datasets/blog-posts/entries/how-to-build-cms?lang=es

// Response
{
  "id": "...",
  "title": "Cómo Construir un CMS",
  "slug": "how-to-build-cms",
  "content": "# Introducción...",
  "featured_image": { /* media object */ },
  "published_at": "2026-04-01T10:00:00Z",
  "_meta": {
    "locale": "es",
    "fallback_used": false,
    "available_locales": ["en", "es", "fr"]
  }
}
```

---

## 🎯 Conclusión

**Multi-idioma implica:**
1. Cambios en schema (marcar campos traducibles)
2. Cambios en base de datos (columnas o tabla separada)
3. Cambios en API (parámetro `?lang=`)
4. Cambios en UI (tabs de idioma)
5. Cambios en SDK (helpers de localización)

**Es complejo pero muy valioso** para escalar globalmente.

¿Quieres que implemente la Opción A (columnas por idioma)?
