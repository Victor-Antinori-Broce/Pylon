# Guía SEO para Grimoire Blog

Guía completa de implementación SEO para el módulo de blog de Gremius CMS.

## 📋 Índice

- [Características Implementadas](#características-implementadas)
- [Endpoints API](#endpoints-api)
- [Uso Básico](#uso-básico)
- [Metadatos SEO](#metadatos-seo)
- [Validaciones](#validaciones)
- [Integración Frontend](#integración-frontend)
- [Ejemplos](#ejemplos)

---

## ✅ Características Implementadas

### 1. Meta Tags Básicos (Google/Bing)

- ✅ `<title>` optimizado (50-60 caracteres)
- ✅ `<meta name="description">` optimizado (150-160 caracteres)
- ✅ `<meta name="robots">` (index/follow configurables)
- ✅ `<meta name="keywords">` (opcional)
- ✅ `<link rel="canonical">`

### 2. Open Graph (Facebook, LinkedIn, WhatsApp)

- ✅ `og:title` - Título para compartir
- ✅ `og:description` - Descripción para compartir
- ✅ `og:url` - URL canónica
- ✅ `og:type` - Tipo de contenido (article)
- ✅ `og:image` - Imagen destacada
- ✅ `og:image:width` / `og:image:height` - Dimensiones
- ✅ `og:site_name` - Nombre del sitio
- ✅ `og:locale` - Idioma (es_ES)
- ✅ `og:article:published_time` - Fecha publicación
- ✅ `og:article:modified_time` - Fecha modificación
- ✅ `og:article:author` - Autor
- ✅ `og:article:section` - Categoría
- ✅ `og:article:tag` - Tags

### 3. Twitter Cards (Twitter/X)

- ✅ `twitter:card` - Tipo de card (summary_large_image)
- ✅ `twitter:site` - Handle del sitio
- ✅ `twitter:creator` - Handle del autor
- ✅ `twitter:title` - Título
- ✅ `twitter:description` - Descripción
- ✅ `twitter:image` - Imagen
- ✅ `twitter:image:alt` - Texto alternativo

### 4. JSON-LD Schema.org (Rich Snippets)

- ✅ **BlogPosting** - Tipo principal para posts
- ✅ **Article** - Alternativa para artículos
- ✅ **NewsArticle** - Para noticias time-sensitive
- ✅ **BreadcrumbList** - Migas de pan
- ✅ **Blog** - Para el sitio/blog
- ✅ **Person** - Para el autor
- ✅ **Organization** - Para el publisher

### 5. Validaciones SEO

- ✅ Longitud del título (50-60 caracteres)
- ✅ Longitud de descripción (150-160 caracteres)
- ✅ Palabra clave en título
- ✅ Palabra clave en descripción
- ✅ Puntuación SEO (0-100)
- ✅ Warnings específicos

---

## 🔌 Endpoints API

### GET `/api/blog/seo/:slug`

Obtiene todos los metadatos SEO para un post publicado.

```bash
# Básico
GET /api/blog/seo/mi-post-ejemplo

# Con parámetros de sitio
GET /api/blog/seo/mi-post-ejemplo?siteName=Mi%20Blog&baseUrl=https://ejemplo.com

# Preview de posts no publicados (requiere auth)
GET /api/blog/seo/mi-post-ejemplo?preview=true
```

**Respuesta:**

```json
{
  "success": true,
  "post": {
    "id": "uuid",
    "title": "Título del Post",
    "slug": "mi-post-ejemplo",
    "status": "published",
    "publishedAt": "2024-01-15T10:00:00Z"
  },
  "seo": {
    "title": "Título del Post | Mi Blog",
    "metaDescription": "Descripción optimizada del post de 150-160 caracteres...",
    "canonicalUrl": "https://ejemplo.com/blog/mi-post-ejemplo",
    "robots": "index,follow",
    "keywords": "tag1, tag2, tag3",
    "openGraph": {
      "title": "Título del Post",
      "description": "Descripción optimizada...",
      "url": "https://ejemplo.com/blog/mi-post-ejemplo",
      "type": "article",
      "siteName": "Mi Blog",
      "locale": "es_ES",
      "image": {
        "url": "https://ejemplo.com/imagen.jpg",
        "alt": "Descripción de la imagen",
        "width": 1200,
        "height": 630
      },
      "article": {
        "publishedTime": "2024-01-15T10:00:00Z",
        "modifiedTime": "2024-01-15T12:00:00Z",
        "author": "Autor Nombre",
        "section": "Tecnología",
        "tags": ["tag1", "tag2"]
      }
    },
    "twitterCard": {
      "card": "summary_large_image",
      "title": "Título del Post",
      "description": "Descripción optimizada...",
      "image": "https://ejemplo.com/imagen.jpg"
    },
    "jsonLd": [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "Título del Post",
        "description": "Descripción...",
        "url": "https://ejemplo.com/blog/mi-post-ejemplo",
        "datePublished": "2024-01-15T10:00:00Z",
        "author": {
          "@type": "Person",
          "name": "Autor Nombre"
        },
        "image": {
          "@type": "ImageObject",
          "url": "https://ejemplo.com/imagen.jpg"
        }
      },
      { "@type": "BreadcrumbList", ... },
      { "@type": "Blog", ... }
    ],
    "readingTime": 5,
    "wordCount": 850,
    "score": 92,
    "warnings": []
  },
  "html": {
    "title": "<title>Título del Post | Mi Blog</title>",
    "metaTags": [...],
    "canonical": "<link rel=\"canonical\" href=\"...\">",
    "jsonLd": ["<script type=\"application/ld+json\">...</script>"]
  }
}
```

### POST `/api/blog/validate-seo`

Valida metadatos SEO sin guardar (útil para previews en el editor).

```bash
POST /api/blog/validate-seo
Content-Type: application/json

{
  "title": "Título de mi post",
  "metaDescription": "Descripción de mi post...",
  "focusKeyword": "mi keyword",
  "content": "Contenido del post..."
}
```

**Respuesta:**

```json
{
  "valid": false,
  "validation": {
    "title": {
      "current": 15,
      "min": 30,
      "optimal": 55,
      "max": 60,
      "isValid": false,
      "isOptimal": false
    },
    "description": {
      "current": 145,
      "min": 50,
      "optimal": 155,
      "max": 160,
      "isValid": true,
      "isOptimal": false
    }
  },
  "warnings": ["Title is too short (15 chars). Minimum recommended: 30"],
  "suggestions": [
    "Ajusta el título a 55-60 caracteres",
    "Ajusta la descripción a 155-160 caracteres"
  ]
}
```

---

## 🛠️ Uso Básico

### En el Frontend (SvelteKit)

```svelte
<!-- +page.svelte -->
<script>
  export let data;

  const { seo } = data;
</script>

<svelte:head>
  <!-- Title -->
  <title>{seo.title}</title>

  <!-- Meta Description -->
  <meta name="description" content={seo.metaDescription} />

  <!-- Robots -->
  <meta name="robots" content={seo.robots} />

  <!-- Canonical -->
  <link rel="canonical" href={seo.canonicalUrl} />

  <!-- Open Graph -->
  <meta property="og:title" content={seo.openGraph.title} />
  <meta property="og:description" content={seo.openGraph.description} />
  <meta property="og:url" content={seo.openGraph.url} />
  <meta property="og:type" content={seo.openGraph.type} />
  <meta property="og:site_name" content={seo.openGraph.siteName} />
  <meta property="og:locale" content={seo.openGraph.locale} />
  {#if seo.openGraph.image}
    <meta property="og:image" content={seo.openGraph.image.url} />
    <meta property="og:image:width" content={seo.openGraph.image.width} />
    <meta property="og:image:height" content={seo.openGraph.image.height} />
    <meta property="og:image:alt" content={seo.openGraph.image.alt} />
  {/if}

  <!-- Twitter Card -->
  <meta name="twitter:card" content={seo.twitterCard.card} />
  <meta name="twitter:title" content={seo.twitterCard.title} />
  <meta name="twitter:description" content={seo.twitterCard.description} />
  {#if seo.twitterCard.image}
    <meta name="twitter:image" content={seo.twitterCard.image} />
  {/if}

  <!-- JSON-LD -->
  {#each seo.jsonLd as schema}
    <script type="application/ld+json">
      {@html JSON.stringify(schema)}
    </script>
  {/each}
</svelte:head>
```

### En el Frontend ( usando el HTML generado )

```svelte
<script>
  export let data;
</script>

<svelte:head>
  {@html data.html.title}
  {#each data.html.metaTags as tag}
    {#if tag.property}
      <meta property={tag.property} content={tag.content} />
    {:else if tag.name}
      <meta name={tag.name} content={tag.content} />
    {/if}
  {/each}
  {@html data.html.canonical}
  {#each data.html.jsonLd as script}
    {@html script}
  {/each}
</svelte:head>
```

---

## 📝 Metadatos SEO

### Campo `seo_overrides` en la Base de Datos

El campo `seo_overrides` es un JSONB que permite personalizar completamente el SEO:

```json
{
  "metaTitle": "Título SEO personalizado (max 60 chars)",
  "metaDescription": "Descripción personalizada (max 160 chars)",
  "canonicalUrl": "https://otro-sitio.com/url-canonical",
  "robots": "index,follow",
  "focusKeyword": "palabra clave principal",
  "noindex": false,
  "nofollow": false,
  "keywords": "tag1, tag2, tag3, keyword",

  "og": {
    "title": "Título para Facebook",
    "description": "Descripción para redes sociales",
    "image": "https://ejemplo.com/imagen-especial.jpg",
    "imageAlt": "Descripción de la imagen",
    "type": "article"
  },

  "twitter": {
    "title": "Título para Twitter",
    "description": "Descripción para Twitter",
    "image": "https://ejemplo.com/imagen-twitter.jpg",
    "card": "summary_large_image"
  },

  "schema": {
    "type": "NewsArticle",
    "articleSection": "Tecnología"
  },

  "hreflang": [
    { "lang": "en", "url": "https://example.com/en/my-post" },
    { "lang": "es", "url": "https://ejemplo.com/es/mi-post" }
  ]
}
```

### Generación Automática

Si no se especifican overrides, el sistema genera automáticamente:

| Campo          | Fuente                    | Longitud      |
| -------------- | ------------------------- | ------------- | ----------- |
| Título SEO     | `Post Title               | Site Name`    | 50-60 chars |
| Descripción    | `excerpt` o contenido     | 150-160 chars |
| OG Title       | Título del post           | ≤88 chars     |
| OG Description | Descripción SEO           | ≤200 chars    |
| Twitter Title  | Título del post           | ≤70 chars     |
| Imagen         | `featuredImage` o default | -             |

---

## ⚠️ Validaciones

### Límites de Longitud

| Elemento       | Mínimo | Óptimo  | Máximo |
| -------------- | ------ | ------- | ------ |
| Título SEO     | 30     | 55-60   | 60     |
| Descripción    | 50     | 155-160 | 160    |
| OG Title       | -      | -       | 88     |
| OG Description | -      | -       | 200    |
| Twitter Title  | -      | -       | 70     |

### Warnings Comunes

- "Title is too short (X chars). Minimum recommended: 30"
- "Title is too long (X chars). Maximum: 60"
- "Meta description is too short..."
- "Focus keyword not found in title"
- "Focus keyword not found in meta description"
- "Focus keyword appears only X times in content"

### Puntuación SEO (0-100)

| Factor             | Peso |
| ------------------ | ---- |
| Sin warnings       | Base |
| Título óptimo      | +5   |
| Descripción óptima | +5   |
| Imagen destacada   | +10  |
| Autor definido     | +5   |
| Keywords/tags      | +5   |
| Cada warning       | -5   |

---

## 🔗 Integración Frontend

### Ejemplo: Page Load (SvelteKit)

```typescript
// +page.ts
export async function load({ params, fetch }) {
  const slug = params.slug;

  // Obtener SEO
  const seoRes = await fetch(`/api/blog/seo/${slug}?siteName=Mi%20Blog`);
  const seoData = await seoRes.json();

  // Obtener post completo
  const postRes = await fetch(`/api/blog/slug/${slug}`);
  const post = await postRes.json();

  return {
    seo: seoData.seo,
    html: seoData.html,
    post,
  };
}
```

### Ejemplo: Editor de SEO en Admin

```svelte
<script>
  let title = "";
  let description = "";
  let focusKeyword = "";
  let validation = null;

  async function validateSEO() {
    const res = await fetch("/api/blog/validate-seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        metaDescription: description,
        focusKeyword,
        content: editorContent,
      }),
    });
    validation = await res.json();
  }
</script>

<div class="seo-editor">
  <input bind:value={title} maxlength="60" placeholder="Título SEO (50-60 caracteres)" />

  <span class="char-count" class:warning={title.length > 60}>
    {title.length}/60
  </span>

  <textarea
    bind:value={description}
    maxlength="160"
    placeholder="Descripción (150-160 caracteres)"
  />

  <span class="char-count" class:warning={description.length > 160}>
    {description.length}/160
  </span>

  {#if validation}
    <div class="seo-score">
      Puntuación: {validation.valid ? "✅" : "⚠️"}
    </div>

    {#if validation.warnings.length > 0}
      <ul class="warnings">
        {#each validation.warnings as warning}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}
  {/if}

  <button on:click={validateSEO}>Validar SEO</button>
</div>
```

---

## 📊 Ejemplos

### Ejemplo 1: Post Básico

```javascript
// Request
GET /api/blog/seo/guia-completa-seo-2024?siteName=Marketing%20Digital&baseUrl=https://marketingdigital.com

// Response (simplificado)
{
  "seo": {
    "title": "Guía Completa SEO 2024 | Marketing Digital",
    "metaDescription": "Aprende las mejores técnicas de SEO para 2024. Estrategias probadas, herramientas recomendadas y casos de éxito.",
    "canonicalUrl": "https://marketingdigital.com/blog/guia-completa-seo-2024",
    "openGraph": {
      "title": "Guía Completa SEO 2024",
      "description": "Aprende las mejores técnicas de SEO para 2024...",
      "image": { "url": "...", "width": 1200, "height": 630 }
    },
    "twitterCard": {
      "card": "summary_large_image",
      "title": "Guía Completa SEO 2024",
      "description": "Aprende las mejores técnicas de SEO..."
    },
    "score": 95,
    "warnings": []
  }
}
```

### Ejemplo 2: Con Overrides Personalizados

```json
// seo_overrides en DB
{
  "metaTitle": "SEO 2024: La Guía Definitiva (55 caracteres)",
  "metaDescription": "Descubre las estrategias SEO que funcionan en 2024. Análisis de 100+ casos de éxito. (155 chars)",
  "focusKeyword": "SEO 2024",
  "og": {
    "title": "🚀 SEO 2024: Todo lo que necesitas saber",
    "image": "https://cdn.ejemplo.com/seo-2024-social.jpg"
  },
  "twitter": {
    "card": "summary_large_image",
    "title": "SEO 2024: Guía Definitiva 🧵"
  },
  "schema": {
    "type": "TechArticle",
    "articleSection": "SEO y Marketing"
  }
}
```

### Ejemplo 3: Preview de Validación

```javascript
// POST /api/blog/validate-seo
{
  "title": "SEO",
  "metaDescription": "Guía corta.",
  "focusKeyword": "marketing"
}

// Response
{
  "valid": false,
  "validation": {
    "title": { "current": 3, "min": 30, "max": 60, "isValid": false },
    "description": { "current": 13, "min": 50, "max": 160, "isValid": false }
  },
  "warnings": [
    "Title is too short (3 chars). Minimum recommended: 30",
    "Meta description is too short (13 chars). Minimum recommended: 50",
    "Focus keyword \"marketing\" not found in title"
  ],
  "suggestions": [
    "Ajusta el título a 55-60 caracteres",
    "Ajusta la descripción a 155-160 caracteres"
  ]
}
```

---

## 🔧 Configuración Recomendada

### Variables de Entorno

```bash
# .env
SITE_NAME="Mi Blog"
SITE_BASE_URL="https://ejemplo.com"
SITE_DEFAULT_LANGUAGE="es_ES"
SITE_TWITTER_HANDLE="@miblog"
SITE_DEFAULT_OG_IMAGE="https://ejemplo.com/og-default.jpg"
```

### Configuración del Sitio

```typescript
// En el frontend o API
const siteConfig: SiteSEOConfig = {
  name: "Mi Blog",
  baseUrl: "https://ejemplo.com",
  defaultLanguage: "es_ES",
  twitterHandle: "@miblog",
  defaultOgImage: "https://ejemplo.com/og-default.jpg",
  publisher: {
    name: "Mi Empresa",
    logo: "https://ejemplo.com/logo.png",
    url: "https://ejemplo.com",
  },
  socialProfiles: {
    twitter: "https://twitter.com/miblog",
    facebook: "https://facebook.com/miblog",
    linkedin: "https://linkedin.com/company/miblog",
  },
};
```

---

## 📚 Referencias

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Schema.org](https://schema.org/)
- [Google Rich Snippets](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)

---

## 🆘 Soporte

Para reportar problemas o solicitar features:

- Crear un issue en el repositorio
- Contactar al equipo de desarrollo

---

**Versión:** 1.0.0  
**Última actualización:** 2024
