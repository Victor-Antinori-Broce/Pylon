# Guía de Implementación GEO (Generative Engine Optimization)

Guía completa para implementar el sistema de optimización para motores de IA y rich snippets.

---

## 📋 Índice

1. [Modelado de Base de Datos](#1-modelado-de-base-de-datos)
2. [Lógica del Servidor](#2-lógica-del-servidor)
3. [Payload de la API](#3-payload-de-la-api)
4. [Configuración del CMS UI](#4-configuración-del-cms-ui)
5. [Ejemplos de Uso](#5-ejemplos-de-uso)

---

## 1. Modelado de Base de Datos

### Schema Actualizado

```typescript
// Campos GEO/SEO agregados a blog_posts

interface BlogPost {
  // Campos estándar
  id: string;
  title: string;
  slug: string;
  content: JSON;        // Lexical editor blocks
  excerpt: string;
  
  // ═══════════════════════════════════════════════════════════════
  // GEO (Generative Engine Optimization) Fields
  // ═══════════════════════════════════════════════════════════════
  
  /**
   * Bottom Line Up Front (BLUF)
   * Resumen de máximo 50 palabras optimizado para extracción por IA
   */
  blufText: string;
  
  /**
   * FAQ Data - Array estructurado
   * Format: [{ "q": "Pregunta", "a": "Respuesta HTML", "order": 1 }]
   */
  faqData: FAQItem[];
  
  /**
   * URL al dataset fuente (opcional)
   * Para artículos basados en datos/encuestas
   */
  datasetUrl: string;
  
  // ═══════════════════════════════════════════════════════════════
  // SEO Fields (explícitos para validación)
  // ═══════════════════════════════════════════════════════════════
  
  metaTitle: string;           // Max 60 chars
  metaDescription: string;     // Max 160 chars
  ogImageUrl: string;          // URL imagen OG
  ogImageSize: number;         // Tamaño en bytes (para validación)
  
  // Campos estándar...
  status: 'draft' | 'published' | 'scheduled';
  publishedAt: Date;
  authorId: string;
}
```

### Migración SQL

```sql
-- Agregar campos GEO a blog_posts
ALTER TABLE blog_posts 
  ADD COLUMN bluf_text TEXT,
  ADD COLUMN faq_data JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN dataset_url TEXT,
  ADD COLUMN meta_title VARCHAR(70),
  ADD COLUMN meta_description VARCHAR(170),
  ADD COLUMN og_image_url TEXT,
  ADD COLUMN og_image_size INTEGER;

-- Índice para búsquedas por BLUF (full text search)
CREATE INDEX idx_blog_posts_bluf_search ON blog_posts 
  USING gin(to_tsvector('spanish', COALESCE(bluf_text, '')));
```

---

## 2. Lógica del Servidor

### Generador de JSON-LD

```typescript
import { generateFAQPageSchema, generateArticleSchema } from './geo-utils';

// Generar Schema.org FAQPage
const faqs = [
  { q: "¿Qué es SEO?", a: "Es la optimización..." },
  { q: "¿Por qué es importante?", a: "Porque..." }
];

const faqSchema = generateFAQPageSchema(faqs);
// Resultado:
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "¿Qué es SEO?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Es la optimización..."
      }
    }
  ]
}
```

### Validación de BLUF (Estricta)

```typescript
import { validateBLUF } from './geo-utils';

// En el controlador POST/PATCH
const blufValidation = validateBLUF(body.blufText);

if (!blufValidation.isValid) {
  return res.status(400).json({
    error: "BLUF validation failed",
    errors: blufValidation.errors,      // Errores bloqueantes
    warnings: blufValidation.warnings,  // Advertencias
    metrics: blufValidation.metrics     // { wordCount, charCount, readingTime }
  });
}

// Reglas de validación:
// - Máximo 50 palabras (estricto)
// - Mínimo 10 palabras (warning)
// - Primera letra mayúscula
// - Terminar con puntuación
// - No más de 70% mayúsculas
```

### Sanitización de HTML

```typescript
import { sanitizeHTML, sanitizeFAQText, ALLOWED_HTML_TAGS } from './geo-utils';

// Para FAQs: permitir solo formato básico
const cleanFAQ = sanitizeFAQText("<p>Respuesta</p><script>alert('xss')</script>");
// Result: "<p>Respuesta</p>"

// Para contenido general: permitir tablas y estructura
const cleanContent = sanitizeHTML(htmlContent, {
  allowedTags: ALLOWED_HTML_TAGS  // ['p', 'br', 'table', 'tr', 'td', ...]
});

// Etiquetas permitidas:
// - Texto: p, br, hr, strong, em, u, mark
// - Listas: ul, ol, li
// - Tablas: table, thead, tbody, tr, th, td, caption
// - Enlaces: a (con validación de href)
// - Código: code, pre
```

---

## 3. Payload de la API

### Endpoint: `GET /api/blog/geo/:slug`

Devuelve JSON estructurado óptimo para frontend:

```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "slug": "guia-seo-2024",
    "status": "published",
    "publishedAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T12:00:00Z",
    "author": {
      "name": "Juan Pérez",
      "image": "https://ejemplo.com/avatar.jpg"
    },
    
    "seo": {
      "title": "Guía SEO 2024 | Mi Blog",
      "description": "Aprende las mejores técnicas de SEO para 2024",
      "canonicalUrl": "https://ejemplo.com/blog/guia-seo-2024",
      "ogImage": "https://ejemplo.com/images/og-seo-2024.jpg",
      "ogImageWidth": 1200,
      "ogImageHeight": 630,
      "keywords": "seo, 2024, guía, marketing"
    },
    
    "geo_ai": {
      "bluf": "El SEO en 2024 requiere contenido de calidad, experiencia de usuario excelente y optimización para búsquedas por voz. La IA está cambiando cómo se rankean los sitios.",
      "schema_faq": {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "¿Qué es el SEO en 2024?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "El SEO en 2024 se enfoca en..."
            }
          }
        ]
      },
      "dataset_url": "https://ejemplo.com/datasets/seo-survey-2024.csv",
      "reading_time": 8,
      "word_count": 1850
    },
    
    "content": {
      "body": { /* Lexical JSON o HTML */ },
      "excerpt": "Resumen del artículo...",
      "toc": [
        { "level": 2, "text": "Introducción", "id": "introduccion" },
        { "level": 2, "text": "Tendencias 2024", "id": "tendencias-2024" },
        { "level": 3, "text": "IA y SEO", "id": "ia-y-seo" }
      ]
    }
  },
  "_meta": {
    "validation": {
      "bluf": { "isValid": true, "metrics": { "wordCount": 23 } },
      "faq": { "count": 5, "valid": true }
    },
    "generatedAt": "2024-01-15T14:30:00Z"
  }
}
```

### Uso en Frontend (Astro)

```astro
---
// src/pages/blog/[slug].astro
const { slug } = Astro.params;
const response = await fetch(`https://api.ejemplo.com/blog/geo/${slug}`);
const { data } = await response.json();
---

<html>
  <head>
    <!-- SEO Meta Tags -->
    <title>{data.seo.title}</title>
    <meta name="description" content={data.seo.description} />
    <link rel="canonical" href={data.seo.canonicalUrl} />
    
    <!-- Open Graph -->
    <meta property="og:title" content={data.seo.title} />
    <meta property="og:description" content={data.seo.description} />
    <meta property="og:image" content={data.seo.ogImage} />
    
    <!-- FAQ Schema -->
    {data.geo_ai.schema_faq && (
      <script type="application/ld+json">
        {JSON.stringify(data.geo_ai.schema_faq)}
      </script>
    )}
    
    <!-- Article Schema con BLUF -->
    <script type="application/ld+json">
      {JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: data.seo.title,
        description: data.seo.description,
        abstract: data.geo_ai.bluf,  // BLUF como abstract
        datePublished: data.publishedAt,
        author: { "@type": "Person", name: data.author.name }
      })}
    </script>
  </head>
  
  <body>
    <!-- BLUF - Visible para usuarios y extraíble por IA -->
    <div class="bluf-box">
      <strong>Resumen:</strong> {data.geo_ai.bluf}
    </div>
    
    <!-- Tabla de Contenidos -->
    <nav class="toc">
      <h2>Contenido</h2>
      <ul>
        {data.content.toc.map(item => (
          <li class={`toc-level-${item.level}`}>
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ul>
    </nav>
    
    <!-- Contenido Principal -->
    <article set:html={data.content.body} />
    
    <!-- FAQs -->
    {data.geo_ai.schema_faq && (
      <section class="faqs">
        <h2>Preguntas Frecuentes</h2>
        {data.geo_ai.schema_faq.mainEntity.map((faq, i) => (
          <details class="faq-item">
            <summary>{faq.name}</summary>
            <div set:html={faq.acceptedAnswer.text} />
          </details>
        ))}
      </section>
    )}
  </body>
</html>
```

---

## 4. Configuración del CMS UI

### Estructura del Formulario

```
┌─────────────────────────────────────────────────────────────┐
│  EDITOR DE POST - SEO/GEO OPTIMIZADO                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📌 INFORMACIÓN BÁSICA                                      │
│  Título: [                                               ]  │
│  Slug:   [guia-seo-2024                                 ]  │
│  Estado: [Publicado ▼]                                     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🤖 GEO / OPTIMIZACIÓN PARA IA                              │
│                                                              │
│  BLUF (Máx 50 palabras):                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ El SEO en 2024 requiere contenido de calidad...    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ✅ 23/50 palabras | ⏱️ Lectura: ~6 seg                    │
│                                                              │
│  Dataset URL (opcional):                                    │
│  [https://ejemplo.com/datos.csv                        ]  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ❓ PREGUNTAS FRECUENTES (FAQs)                             │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ¿Qué es el SEO?                                     │ ✗ │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │ Es la optimización de sitios web para...       │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  [+ Añadir Pregunta]                                        │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🎨 CONTENIDO (Editor de Bloques)                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [H2] Introducción                                   │   │
│  │                                                     │   │
│  │ [Párrafo] El SEO ha evolucionado...                │   │
│  │                                                     │   │
│  │ [Tabla] Comparativa de técnicas                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🔍 SEO AVANZADO                                            │
│                                                              │
│  Meta Title (60):    [Guía SEO 2024 | Mi Blog         ] 58 │
│  Meta Desc (160):    [Aprende las mejores técnicas... ] 142│
│  OG Image:           [Seleccionar imagen...           ]    │
│  Focus Keyword:      [SEO 2024                        ]    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [💾 Guardar Borrador]  [📡 Publicar]  [👁️ Preview]        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Componentes Recomendados

#### 1. BLUF Editor con Contador

```svelte
<!-- BLUFEditor.svelte -->
<script>
  let value = $state('');
  let maxWords = 50;
  
  const wordCount = $derived(value.trim().split(/\s+/).filter(w => w).length);
  const isValid = $derived(wordCount <= maxWords && wordCount >= 10);
  
  const validation = $derived(validateBLUF(value));
</script>

<div class="bluf-editor">
  <label>
    BLUF (Bottom Line Up Front)
    <span class="hint">Resumen de {maxWords} palabras para IA</span>
  </label>
  
  <textarea
    bind:value
    rows="3"
    placeholder="Escribe un resumen conciso que responda la pregunta principal del artículo..."
    class:invalid={!validation.isValid}
  />
  
  <div class="bluf-stats" class:warning={wordCount > 40} class:error={wordCount > 50}>
    <span>{wordCount}/{maxWords} palabras</span>
    <span>•</span>
    <span>~{Math.ceil(wordCount / 3)} seg lectura</span>
    
    {#if validation.warnings.length > 0}
      <span>•</span>
      <span class="warning-text">⚠️ {validation.warnings[0]}</span>
    {/if}
  </div>
  
  {#if validation.errors.length > 0}
    <div class="bluf-errors">
      {#each validation.errors as error}
        <div class="error-text">❌ {error}</div>
      {/each}
    </div>
  {/if}
</div>
```

#### 2. FAQ Repeater

```svelte
<!-- FAQRepeater.svelte -->
<script>
  let faqs = $state([{ q: '', a: '', order: 0 }]);
  
  function addFAQ() {
    faqs.push({ q: '', a: '', order: faqs.length });
  }
  
  function removeFAQ(index) {
    faqs.splice(index, 1);
  }
  
  function moveFAQ(index, direction) {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < faqs.length) {
      [faqs[index], faqs[newIndex]] = [faqs[newIndex], faqs[index]];
    }
  }
</script>

<div class="faq-repeater">
  <label>Preguntas Frecuentes</label>
  <p class="hint">Añade FAQs para rich snippets en Google</p>
  
  {#each faqs as faq, i}
    <div class="faq-item">
      <div class="faq-header">
        <span class="faq-number">#{i + 1}</span>
        <div class="faq-actions">
          <button onclick={() => moveFAQ(i, -1)} disabled={i === 0}>↑</button>
          <button onclick={() => moveFAQ(i, 1)} disabled={i === faqs.length - 1}>↓</button>
          <button onclick={() => removeFAQ(i)} class="danger">✕</button>
        </div>
      </div>
      
      <input
        bind:value={faq.q}
        placeholder="Pregunta"
        class="faq-question"
      />
      
      <textarea
        bind:value={faq.a}
        placeholder="Respuesta (HTML limitado permitido)"
        rows="3"
        class="faq-answer"
      />
      
      <div class="faq-toolbar">
        <button type="button" onclick={() => insertTag(i, 'strong')}>
          <strong>B</strong>
        </button>
        <button type="button" onclick={() => insertTag(i, 'a')}>
          🔗 Link
        </button>
        <button type="button" onclick={() => insertTag(i, 'code')}>
          &lt;/&gt; Code
        </button>
      </div>
    </div>
  {/each}
  
  <button onclick={addFAQ} class="add-faq">
    + Añadir Pregunta
  </button>
</div>
```

#### 3. Block-Based Editor (Lexical)

```svelte
<!-- LexicalEditor.svelte -->
<script>
  // Usar Lexical de Meta o Editor.js
  import { createEditor } from 'lexical';
  
  const editor = createEditor({
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      TableNode,
      TableRowNode,
      TableCellNode,
      // ... otros nodos
    ],
    onError: (error) => console.error(error),
  });
  
  // Extraer TOC automáticamente
  function extractTOC() {
    const headings = editor.getEditorState().read(() => {
      return $getRoot()
        .getChildren()
        .filter(node => node.getType() === 'heading')
        .map(node => ({
          level: node.getTag().replace('h', ''),
          text: node.getTextContent(),
        }));
    });
    
    dispatch('tocChange', headings);
  }
</script>

<div class="lexical-editor" bind:this={editorRef}>
  <!-- Toolbar -->
  <div class="editor-toolbar">
    <button onclick={() => formatHeading('h2')}>H2</button>
    <button onclick={() => formatHeading('h3')}>H3</button>
    <button onclick={() => insertTable()}>📊 Tabla</button>
    <button onclick={() => insertList('bullet')}>• Lista</button>
    <button onclick={() => insertList('number')}>1. Lista</button>
  </div>
  
  <!-- Editor Content -->
  <div contenteditable class="editor-content" />
</div>
```

---

## 5. Ejemplos de Uso

### Crear Post con GEO completo

```bash
POST /api/blog
Content-Type: application/json

{
  "title": "Guía SEO 2024: Optimización para IA",
  "slug": "guia-seo-2024-ia",
  "blufText": "El SEO en 2024 requiere contenido de calidad, experiencia de usuario excelente y optimización para búsquedas por voz.",
  "faqData": [
    {
      "q": "¿Qué es el SEO en 2024?",
      "a": "El SEO en 2024 se enfoca en <strong>contenido útil</strong> generado por humanos..."
    },
    {
      "q": "¿Cómo afecta la IA al SEO?",
      "a": "La IA está cambiando cómo Google evalúa el contenido..."
    }
  ],
  "datasetUrl": "https://ejemplo.com/datasets/seo-survey-2024.csv",
  "metaTitle": "Guía SEO 2024 | Mi Blog",
  "metaDescription": "Aprende las mejores técnicas de SEO para 2024",
  "ogImageUrl": "https://ejemplo.com/images/seo-2024.jpg",
  "content": {
    "root": {
      "children": [
        { "type": "heading", "tag": "h2", "children": [...] },
        { "type": "paragraph", "children": [...] },
        { "type": "table", "children": [...] }
      ]
    }
  },
  "status": "published"
}
```

### Respuesta de Validación

```json
{
  "error": "Validation failed",
  "field": "blufText",
  "message": "BLUF validation failed",
  "details": ["BLUF excede el límite de 50 palabras (actual: 67)"],
  "warnings": ["Considera reducir a 30-40 palabras"],
  "metrics": {
    "wordCount": 67,
    "charCount": 412,
    "readingTime": 1
  }
}
```

### Consumo en React

```tsx
// components/BlogPost.tsx
import { useEffect, useState } from 'react';

interface BlogPostData {
  seo: { title: string; description: string; ogImage: string };
  geo_ai: { bluf: string; schema_faq: any; reading_time: number };
  content: { body: any; toc: any[] };
}

export default function BlogPost({ slug }: { slug: string }) {
  const [data, setData] = useState<BlogPostData | null>(null);
  
  useEffect(() => {
    fetch(`/api/blog/geo/${slug}`)
      .then(r => r.json())
      .then(({ data }) => setData(data));
  }, [slug]);
  
  if (!data) return <div>Loading...</div>;
  
  return (
    <article>
      <Head>
        <title>{data.seo.title}</title>
        <meta name="description" content={data.seo.description} />
        <script 
          type="application/ld+json" 
          dangerouslySetInnerHTML={{ 
            __html: JSON.stringify(data.geo_ai.schema_faq) 
          }} 
        />
      </Head>
      
      <div className="bluf-box">
        <strong>TL;DR:</strong> {data.geo_ai.bluf}
        <span className="reading-time">
          ⏱️ {data.geo_ai.reading_time} min de lectura
        </span>
      </div>
      
      <nav className="toc">
        {data.content.toc.map(item => (
          <a key={item.id} href={`#${item.id}`} className={`level-${item.level}`}>
            {item.text}
          </a>
        ))}
      </nav>
      
      <div dangerouslySetInnerHTML={{ __html: data.content.body }} />
    </article>
  );
}
```

---

## 📚 Referencias

- [Schema.org FAQPage](https://schema.org/FAQPage)
- [Google FAQ Rich Snippets](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [BLUF Writing Style](https://www.plainlanguage.gov/guidelines/organize/whenever-possible-use-the-bluf-botton-line-up-front/)
- [Lexical Editor](https://lexical.dev/)
- [OpenAI GPT Best Practices](https://platform.openai.com/docs/guides/gpt-best-practices)

---

**Versión:** 1.0.0  
**Última actualización:** 2024
