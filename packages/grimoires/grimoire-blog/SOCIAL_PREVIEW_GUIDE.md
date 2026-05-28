# Guía: Preview de Redes Sociales

Guía completa para implementar el botón de preview social en tu editor de blog.

---

## 📸 Vista Previa

El componente `SocialPreview` muestra cómo se verá tu post al compartirlo en:

| Plataforma | Preview Incluye |
|------------|-----------------|
| **WhatsApp** | Chat con burbuja de preview, validación de imagen |
| **Telegram** | Chat con link card, info sobre compatibilidad |
| **Facebook** | Tarjeta de link con imagen, título, descripción |
| **Twitter/X** | Tweet con card de preview |
| **LinkedIn** | Post con imagen destacada |

### Features Especiales

| Feature | Descripción |
|---------|-------------|
| **Comparación A/B** | Compara dos versiones de OG tags lado a lado |
| **Exportar Imagen** | Guarda el preview como PNG |
| **Validación WhatsApp** | Verifica <300KB, dimensiones, formato |
| **Debug Panel** | Métricas detalladas de SEO |

---

## 🚀 Instalación Rápida

### 1. Copiar Componentes

```bash
# Los componentes están en:
packages/admin/src/lib/components/blog/SocialPreview.svelte
packages/admin/src/lib/components/blog/SocialPreviewExample.svelte
```

### 2. Usar en tu Editor

```svelte
<script>
  import SocialPreview from '$lib/components/blog/SocialPreview.svelte';
  
  let post = {
    title: 'Mi Post',
    slug: 'mi-post',
    excerpt: 'Descripción del post...',
    featuredImage: { url: 'https://...' }
  };
  
  let seoData = $state(null);
  let showPreview = $state(false);
  
  async function loadPreview() {
    const res = await fetch(`/api/blog/seo/${post.slug}?preview=true`);
    const data = await res.json();
    seoData = data.seo;
    showPreview = true;
  }
</script>

<button on:click={loadPreview}>
  👁️ Ver Preview Social
</button>

{#if showPreview}
  <SocialPreview 
    {seoData}
    postTitle={post.title}
    postUrl={`https://misitio.com/blog/${post.slug}`}
    postSlug={post.slug}
  />
{/if}
```

---

## 📖 API del Componente

### Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `seoData` | `object` | ✅ | Datos del endpoint `/api/blog/seo/:slug` |
| `postTitle` | `string` | ❌ | Título fallback |
| `postUrl` | `string` | ❌ | URL para mostrar |
| `postSlug` | `string` | ❌ | Slug para refrescar datos |

### Estructura de seoData

```typescript
{
  title: "Título SEO",
  metaDescription: "Descripción...",
  canonicalUrl: "https://...",
  openGraph: {
    title: "Título OG",
    description: "Descripción OG",
    image: {
      url: "https://...",
      width: 1200,
      height: 630,
      isWhatsAppCompatible: true
    }
  },
  twitterCard: {
    card: "summary_large_image",
    title: "Título Twitter",
    image: "https://..."
  },
  whatsAppValidation: {
    isValid: true,
    checks: { format: true, fileSize: true, ... },
    warnings: [],
    recommendations: []
  }
}
```

---

## 🎨 Personalización

### Cambiar Colores

```css
/* En tu archivo CSS global o <style> */
.social-preview-container {
  --preview-primary: #tu-color;
  --preview-success: #tu-verde;
  --preview-warning: #tu-naranja;
  --preview-error: #tu-rojo;
}
```

### Tabs Personalizadas

El componente tiene 4 tabs por defecto. Para ocultar alguna:

```svelte
<!-- Versión simplificada solo WhatsApp y Facebook -->
<script>
  const tabs = [
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'facebook', label: 'Facebook', icon: Facebook },
  ];
</script>
```

---

## 🔌 Endpoints API Relacionados

### Obtener datos SEO
```bash
GET /api/blog/seo/:slug?preview=true&siteName=Mi%20Blog&baseUrl=https://ejemplo.com
```

### Validar imagen para WhatsApp
```bash
POST /api/blog/validate-image
{
  "imageUrl": "https://ejemplo.com/imagen.jpg",
  "width": 1200,
  "height": 630,
  "fileSize": 250000,
  "mimeType": "image/jpeg"
}
```

### Refrescar caché de Facebook
```bash
POST /api/blog/:slug/refresh-og-cache?baseUrl=https://ejemplo.com
```

---

## 📱 Ejemplos por Plataforma

### Telegram

```svelte
<SocialPreview seoData={seoData} />
<!-- Selecciona tab "Telegram" -->
```

**Preview de Telegram incluye:**
- Chat estilo Telegram con header
- Link preview con imagen
- Panel informativo sobre diferencias con WhatsApp

**Nota:** Telegram es más permisivo que WhatsApp:
- ✅ Acepta WebP sin problemas
- ✅ No tiene límite estricto de 300KB  
- ✅ Soporta imágenes de alta resolución
- ⚠️ Se recomienda seguir estándares WhatsApp para máxima compatibilidad

### WhatsApp

```svelte
<!-- Validación visual de WhatsApp -->
<SocialPreview seoData={seoData} />

<!-- Muestra:
  - Chat de WhatsApp con preview realista
  - Validación: ✓ Formato | ✓ Tamaño | ✓ Dimensiones
  - Warnings si la imagen es > 300KB
  - Recomendaciones para arreglar problemas
-->
```

### Facebook

```svelte
<!-- Preview de tarjeta de Facebook -->
<!-- Muestra imagen 1200x630, título, descripción -->

<!-- Botón para abrir Facebook Debugger -->
```

### Twitter/X

```svelte
<!-- Preview de tweet con card -->
<!-- Muestra: avatar, nombre, texto del tweet, card -->
```

---

## 🔄 Flujo de Uso Completo

```
┌─────────────────────────────────────────────────────────┐
│  EDITOR DE BLOG                                          │
│                                                          │
│  Título: [Mi Post de Blog          ]                    │
│  Descripción: [Breve descripción... ]                   │
│  Imagen: [imagen-seleccionada.jpg  ] [Cambiar]          │
│                                                          │
│  [💾 Guardar] [👁️ Ver Preview Social]                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ click
┌─────────────────────────────────────────────────────────┐
│  PREVIEW SOCIAL                                          │
│                                                          │
│  [WhatsApp] [Facebook] [Twitter] [LinkedIn]             │
│                                                          │
│  ┌─────────────────────────────────────────┐            │
│  │  📱 WhatsApp Preview                   │            │
│  │                                         │            │
│  │  ┌──────────────────────────┐          │            │
│  │  │ [IMAGEN 1200x630]        │          │            │
│  │  │                          │          │            │
│  │  │ Mi Post de Blog          │          │            │
│  │  │ Breve descripción...     │          │            │
│  │  │ ejemplo.com              │          │            │
│  │  └──────────────────────────┘          │            │
│  │                              ✓✓ 14:30  │            │
│  │                                         │            │
│  │  ✅ WhatsApp compatible                 │            │
│  │  ✓ Formato ✓ Tamaño ✓ Dimensiones      │            │
│  │                                         │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  [📋 Copiar URL] [🔄 Refrescar] [⚙️ Debug]              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🐛 Debug Mode

Haz clic en el icono `⚙️` para ver:

- Longitud del título (objetivo: 50-60 chars)
- Longitud de descripción (objetivo: 150-160 chars)
- Dimensiones de imagen OG
- Estado de validación WhatsApp
- URL canónica

---

## 🎯 Casos de Uso

### 1. Preview en Tiempo Real

```svelte
<script>
  // Actualizar preview automáticamente al escribir
  let debounceTimer;
  
  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      refreshPreview();
    }, 1000);
  }
</script>

<input 
  bind:value={post.title} 
  on:input={handleInput}
/>
```

### 2. Validación Antes de Publicar

```svelte
<script>
  async function publishPost() {
    // Primero validar SEO
    const validation = await fetch('/api/blog/validate-seo', {
      method: 'POST',
      body: JSON.stringify({
        title: post.title,
        metaDescription: post.excerpt,
        imageUrl: post.featuredImage?.url
      })
    }).then(r => r.json());
    
    if (!validation.valid) {
      alert('Arregla los problemas de SEO antes de publicar:\n' + 
            validation.warnings.join('\n'));
      return;
    }
    
    // Publicar...
  }
</script>
```

### 3. Modo Comparación A/B

Compara dos versiones diferentes de OG tags:

```svelte
<script>
  const variantA = {
    title: "Título con Emoji 🚀",
    openGraph: { title: "...", image: { url: "img-a.jpg" } },
    whatsAppValidation: { isValid: true, warnings: [] }
  };
  
  const variantB = {
    title: "Título Descriptivo",
    openGraph: { title: "...", image: { url: "img-b.jpg" } },
    whatsAppValidation: { isValid: false, warnings: ["Imagen > 300KB"] }
  };
</script>

<SocialPreview 
  comparisonMode={true}
  variantA={variantA}
  variantB={variantB}
  labelA="Versión Emojis"
  labelB="Versión Formal"
/>
```

**Muestra:**
- Toggle para cambiar entre A y B
- Badge con número de issues por variante
- Ganador destacado en el panel debug

### 4. Exportar como Imagen

Guarda el preview actual como PNG:

```svelte
<!-- El botón 📷 está integrado en el header -->
<SocialPreview {seoData} />

<!-- Al hacer clic, descarga: social-preview-whatsapp-2024-01-15.png -->
```

### 5. Refrescar Caché Tras Publicar

```svelte
<script>
  async function publishAndRefresh() {
    // 1. Publicar post
    await publishPost();
    
    // 2. Refrescar caché de Facebook
    await fetch(`/api/blog/${post.slug}/refresh-og-cache`, {
      method: 'POST'
    });
    
    // 3. Mostrar mensaje
    alert('Post publicado. El caché de Facebook se actualizará en unos minutos.');
  }
</script>
```

---

## 🎨 Estilos CSS

El componente usa clases CSS que puedes sobreescribir:

```css
/* Contenedor principal */
.social-preview-container { }

/* Header con gradiente */
.preview-header { }

/* Tabs de navegación */
.preview-tabs { }
.tab { }
.tab.active { }

/* Preview específicos */
.whatsapp-preview { }
.facebook-preview { }
.twitter-preview { }
.linkedin-preview { }

/* Panel de validación */
.validation-panel { }
.validation-panel.valid { }

/* Panel de debug */
.debug-panel { }
```

---

## 🔗 Integración con Facebook Debugger

Cada preview tiene un botón para abrir la herramienta oficial:

```
[Abrir Facebook Debugger] → https://developers.facebook.com/tools/debug/
[Abrir Twitter Validator] → https://cards-dev.twitter.com/validator
[Abrir LinkedIn Inspector] → https://www.linkedin.com/post-inspector/
```

---

## ⚠️ Solución de Problemas

### "Imagen no aparece en WhatsApp"

```
1. Revisar validación en el panel de WhatsApp
2. Verificar que imagen sea < 300KB
3. Verificar formato JPG/PNG (NO WebP)
4. Verificar URL absoluta (https://)
5. Usar Facebook Debugger para forzar rescrapeo
```

### "Preview no se actualiza"

```
1. Click en botón 🔄 Refrescar
2. Verificar que post tenga slug
3. Revisar consola del navegador (F12)
4. Verificar que endpoint /api/blog/seo/:slug responda
```

### "Datos SEO desactualizados"

```svelte
<!-- Forzar recarga con timestamp -->
<script>
  async function refresh() {
    const res = await fetch(`/api/blog/seo/${slug}?t=${Date.now()}`);
    seoData = await res.json();
  }
</script>
```

---

## 📦 Dependencias

El componente requiere:

```bash
# Iconos
npm install lucide-svelte

# Exportar a imagen
npm install html2canvas

# Transiciones (opcional)
npm install svelte-transition
```

---

## 🤝 Contribuir

Para agregar nuevas plataformas:

1. Crear nueva tab en `.preview-tabs`
2. Crear componente de preview (ej: `.telegram-preview`)
3. Agregar validaciones específicas
4. Actualizar esta documentación

---

**Versión:** 1.0.0  
**Última actualización:** 2024
