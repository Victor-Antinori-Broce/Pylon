# Guía WhatsApp, Facebook, LinkedIn - Open Graph

Guía específica para optimizar el compartido en redes sociales, especialmente **WhatsApp** que tiene requisitos técnicos muy estrictos.

---

## 📱 WhatsApp - Requisitos Técnicos Estrictos

WhatsApp es **MUY exigente** con las imágenes de Open Graph. Si no cumples estos requisitos, **no mostrará la imagen** en la previsualización del chat.

### ⚠️ Requisitos Obligatorios

| Requisito               | Valor                   | Consecuencia si falla                       |
| ----------------------- | ----------------------- | ------------------------------------------- |
| **Tamaño máximo**       | **< 300 KB**            | WhatsApp no carga la imagen                 |
| **Dimensiones ideales** | **1200 x 630 px**       | Mala calidad o recorte incorrecto           |
| **Dimensiones mínimas** | **400 x 400 px**        | No muestra previsualización                 |
| **Formato**             | **JPG o PNG**           | WebP/GIF no funcionan en versiones antiguas |
| **URL**                 | **Absoluta (https://)** | URLs relativas no funcionan                 |

### 🎯 Dimensiones por Plataforma

```
┌─────────────────────────────────────────────────────────┐
│                    OPEN GRAPH IMAGE                      │
│                                                         │
│   WhatsApp: Recorta a cuadrado (1:1) en móviles         │
│   Facebook: Respeta 1.91:1 (1200x630)                   │
│   LinkedIn: Similar a Facebook                          │
│   Twitter: Usa Twitter Cards (2:1)                      │
│                                                         │
│   ✅ Zona segura para texto/logo: Centro de la imagen   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Aspect Ratio:**

- **1.91:1** (1200x630) - Ideal para Facebook/LinkedIn
- **1:1** (cuadrado) - WhatsApp recorta a esto en móviles
- **2:1** (1200x600) - Twitter Card grande

---

## 🔧 Implementación

### 1. Estructura de Meta Tags (HTML)

```html
<!-- Open Graph - WhatsApp, Facebook, LinkedIn -->
<meta property="og:type" content="article" />
<meta property="og:title" content="Título atractivo para Redes" />
<meta
  property="og:description"
  content="Resumen persuasivo de 1-2 líneas diseñado para clic desde celular"
/>
<meta property="og:url" content="https://tudominio.com/blog/mi-post" />
<meta property="og:site_name" content="Nombre de tu Marca" />
<meta property="og:locale" content="es_ES" />

<!-- OG Image - CRÍTICO para WhatsApp -->
<meta property="og:image" content="https://tudominio.com/imagen-og.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Descripción de la imagen" />
<meta property="og:image:type" content="image/jpeg" />

<!-- Article específicos -->
<meta property="article:published_time" content="2024-01-15T10:00:00Z" />
<meta property="article:modified_time" content="2024-01-15T12:00:00Z" />
<meta property="article:author" content="Nombre Autor" />
<meta property="article:section" content="Tecnología" />
<meta property="article:tag" content="SEO" />
<meta property="article:tag" content="Marketing" />

<!-- Twitter Cards -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@tucuenta" />
<meta name="twitter:creator" content="@autor" />
<meta name="twitter:title" content="Título del post" />
<meta name="twitter:description" content="Descripción para Twitter" />
<meta name="twitter:image" content="https://tudominio.com/imagen-twitter.jpg" />
<meta name="twitter:image:alt" content="Descripción imagen" />
```

---

## 📡 Endpoints API

### Validar Imagen para WhatsApp

```bash
POST /api/blog/validate-image
Content-Type: application/json

{
  "imageUrl": "https://ejemplo.com/mi-imagen.jpg",
  "width": 1200,
  "height": 630,
  "fileSize": 250000,
  "mimeType": "image/jpeg"
}
```

**Respuesta:**

```json
{
  "valid": true,
  "whatsAppCompatible": true,
  "checks": {
    "format": true,
    "fileSize": true,
    "dimensions": true,
    "minDimensions": true,
    "isAbsoluteUrl": true
  },
  "warnings": [],
  "recommendations": [],
  "metadata": {
    "format": "image/jpeg",
    "fileSizeKB": 244.1,
    "width": 1200,
    "height": 630,
    "aspectRatio": 1.91
  },
  "requirements": {
    "maxFileSize": "300KB",
    "idealDimensions": "1200x630px (1.91:1 ratio)",
    "minDimensions": "400x400px",
    "formats": ["JPG", "PNG"],
    "avoid": ["WebP", "GIF", "SVG"]
  }
}
```

### Obtener SEO Completo (incluye validación WhatsApp)

```bash
GET /api/blog/seo/mi-post-slug?siteName=Mi%20Blog&baseUrl=https://ejemplo.com
```

**Respuesta (sección social):**

```json
{
  "social": {
    "openGraph": {
      "title": "Guía SEO 2024",
      "description": "Aprende las mejores técnicas...",
      "image": {
        "url": "https://ejemplo.com/imagen.jpg",
        "alt": "Guía SEO",
        "width": 1200,
        "height": 630,
        "type": "image/jpeg",
        "isWhatsAppCompatible": true
      },
      "url": "https://ejemplo.com/blog/guia-seo-2024",
      "type": "article",
      "whatsAppReady": true,
      "whatsAppWarnings": [],
      "whatsAppRecommendations": []
    },
    "twitterCard": {
      "card": "summary_large_image",
      "title": "Guía SEO 2024",
      "description": "Aprende las mejores técnicas...",
      "image": "https://ejemplo.com/imagen.jpg"
    }
  }
}
```

---

## 🖼️ Optimización de Imágenes

### Flujo de Trabajo Recomendado

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Subir imagen   │────▶│  Convertir a     │────▶│  Comprimir a    │
│  original       │     │  JPG/PNG         │     │  < 300KB        │
│  (cualquier     │     │  (evitar WebP)   │     │  (TinyPNG,      │
│   formato)      │     │                  │     │   Squoosh)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Verificar en   │◀────│  Subir a CDN/    │◀────│  Redimensionar  │
│  WhatsApp       │     │  servidor        │     │  a 1200x630px   │
│  Debugger       │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Herramientas Recomendadas

| Herramienta     | Uso                         | URL                 |
| --------------- | --------------------------- | ------------------- |
| **Squoosh**     | Compresión + redimensionado | https://squoosh.app |
| **TinyPNG**     | Compresión inteligente      | https://tinypng.com |
| **ImageMagick** | Batch processing            | CLI tool            |
| **Sharp**       | Node.js processing          | npm install sharp   |

### Ejemplo: Optimización con Sharp (Node.js)

```javascript
const sharp = require("sharp");

async function optimizeForWhatsApp(inputPath, outputPath) {
  await sharp(inputPath)
    // Redimensionar a 1200x630 (crop inteligente)
    .resize(1200, 630, {
      fit: "cover",
      position: "center",
    })
    // Convertir a JPEG con calidad optimizada
    .jpeg({
      quality: 85,
      progressive: true,
      mozjpeg: true, // Mejor compresión
    })
    .toFile(outputPath);

  // Verificar tamaño
  const stats = await fs.stat(outputPath);
  const sizeKB = stats.size / 1024;

  if (sizeKB > 300) {
    console.warn(`⚠️ Imagen ${sizeKB.toFixed(1)}KB excede límite de WhatsApp (300KB)`);
    // Recomprimir con menor calidad
  }

  return {
    path: outputPath,
    sizeKB,
    dimensions: { width: 1200, height: 630 },
    whatsAppCompatible: sizeKB <= 300,
  };
}
```

---

## 🔍 Testing y Debugging

### WhatsApp Link Debugger

WhatsApp **no tiene** una herramienta oficial de debug, pero puedes usar:

1. **Facebook Sharing Debugger**
   - URL: https://developers.facebook.com/tools/debug/
   - Scrapes OG tags igual que WhatsApp
   - Muestra warnings útiles

2. **LinkedIn Post Inspector**
   - URL: https://www.linkedin.com/post-inspector/
   - Verifica OG tags

3. **Twitter Card Validator**
   - URL: https://cards-dev.twitter.com/validator
   - Específico para Twitter

### Proceso de Prueba en WhatsApp

```
1. Publicar post con imagen OG
2. Copiar URL del post
3. Enviar URL a "Mi chat" en WhatsApp
4. Verificar que aparezca:
   ✓ Título
   ✓ Descripción
   ✓ Imagen (crítico)
   ✓ URL del dominio
```

**Si la imagen no aparece:**

1. Verificar tamaño < 300KB
2. Verificar formato JPG/PNG
3. Verificar URL absoluta (https://)
4. Verificar dimensiones mínimas 400x400
5. Limpiar caché de WhatsApp (o esperar 24h)

---

## 📊 Checklist de Implementación

### Backend (API)

- [ ] Endpoint `/api/blog/seo/:slug` retorna OG tags completos
- [ ] Endpoint `/api/blog/validate-image` verifica requisitos WhatsApp
- [ ] Validación de tamaño de archivo (< 300KB)
- [ ] Validación de formato (JPG/PNG)
- [ ] Validación de dimensiones (1200x630 ideal)
- [ ] Conversión de URLs relativas a absolutas
- [ ] Campos `og:image:width` y `og:image:height` incluidos

### Frontend (HTML Head)

- [ ] `<meta property="og:type" content="article">`
- [ ] `<meta property="og:title">` presente
- [ ] `<meta property="og:description">` presente
- [ ] `<meta property="og:url">` absoluto
- [ ] `<meta property="og:image">` absoluto
- [ ] `<meta property="og:image:width">` = 1200
- [ ] `<meta property="og:image:height">` = 630
- [ ] `<meta property="og:image:type">` = image/jpeg
- [ ] `<meta name="twitter:card" content="summary_large_image">`
- [ ] `<meta name="twitter:image">` presente

### CMS/Editor

- [ ] Subida de imágenes con conversión automática a JPG
- [ ] Redimensionado automático a 1200x630
- [ ] Compresión automática a < 300KB
- [ ] Preview de cómo se verá en WhatsApp
- [ ] Warning si la imagen no cumple requisitos

---

## 🚨 Errores Comunes y Soluciones

### Error: "Imagen no aparece en WhatsApp"

**Causas posibles:**

1. ❌ Archivo > 300KB
2. ❌ Formato WebP/GIF/SVG
3. ❌ URL relativa (/images/foto.jpg)
4. ❌ Dimensiones < 400x400
5. ❌ Imagen bloqueada por robots.txt
6. ❌ HTTPS no válido (certificado vencido)

**Solución:**

```javascript
// Verificar antes de guardar
const validation = validateWhatsAppImage(imageUrl, {
  width: image.width,
  height: image.height,
  fileSizeBytes: image.size,
  mimeType: image.mimeType,
});

if (!validation.isValid) {
  console.error("WhatsApp validation failed:", validation.warnings);
  // Mostrar error al usuario
}
```

### Error: "Imagen borrosa en WhatsApp"

**Causa:** WhatsApp recortó una imagen pequeña

**Solución:** Usar dimensiones mínimas de 1200x630

### Error: "Descripción incorrecta en WhatsApp"

**Causa:** WhatsApp cacheó una versión anterior

**Solución:**

1. Agregar parámetro único a la URL: `?v=2`
2. Esperar 24 horas para que expire el caché
3. Usar Facebook Debugger para refrescar

---

## 📝 Ejemplo Completo

### Input: Post con Imagen

```javascript
const post = {
  title: "10 Estrategias SEO para 2024",
  slug: "estrategias-seo-2024",
  excerpt: "Descubre las técnicas más efectivas para posicionar tu web este año.",
  content: {
    /* Lexical JSON */
  },
  featuredImageId: "uuid-imagen",
  status: "published",
  publishedAt: "2024-01-15T10:00:00Z",
  seoOverrides: {
    og: {
      title: "🚀 10 Estrategias SEO que funcionan en 2024",
      description:
        "Análisis de 500+ casos de éxito. Implementa estas tácticas y aumenta tu tráfico orgánico.",
      image: "https://cdn.ejemplo.com/og/seo-2024.jpg",
    },
    twitter: {
      card: "summary_large_image",
      title: "10 Estrategias SEO para 2024 🧵",
    },
  },
};

const featuredImage = {
  url: "https://cdn.ejemplo.com/og/seo-2024.jpg",
  width: 1200,
  height: 630,
  mimeType: "image/jpeg",
  fileSize: 245000, // 245KB
  alt: "Estrategias SEO 2024",
};

const siteConfig = {
  name: "Marketing Digital Pro",
  baseUrl: "https://marketingdigital.pro",
  defaultLanguage: "es_ES",
  twitterHandle: "@marketingpro",
  defaultOgImage: "https://marketingdigital.pro/og-default.jpg",
};
```

### Output: Meta Tags Generados

```html
<!-- Google / Bing -->
<title>10 Estrategias SEO para 2024 | Marketing Digital Pro</title>
<meta
  name="description"
  content="Descubre las técnicas más efectivas para posicionar tu web este año."
/>

<!-- Open Graph - WhatsApp, Facebook, LinkedIn -->
<meta property="og:type" content="article" />
<meta property="og:title" content="🚀 10 Estrategias SEO que funcionan en 2024" />
<meta
  property="og:description"
  content="Análisis de 500+ casos de éxito. Implementa estas tácticas y aumenta tu tráfico orgánico."
/>
<meta property="og:url" content="https://marketingdigital.pro/blog/estrategias-seo-2024" />
<meta property="og:site_name" content="Marketing Digital Pro" />
<meta property="og:locale" content="es_ES" />
<meta property="og:image" content="https://cdn.ejemplo.com/og/seo-2024.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Estrategias SEO 2024" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="article:published_time" content="2024-01-15T10:00:00Z" />
<meta property="article:section" content="SEO" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@marketingpro" />
<meta name="twitter:title" content="10 Estrategias SEO para 2024 🧵" />
<meta
  name="twitter:description"
  content="Análisis de 500+ casos de éxito. Implementa estas tácticas y aumenta tu tráfico orgánico."
/>
<meta name="twitter:image" content="https://cdn.ejemplo.com/og/seo-2024.jpg" />

<!-- JSON-LD Schema.org -->
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "10 Estrategias SEO para 2024",
    "description": "Descubre las técnicas más efectivas...",
    "image": {
      "@type": "ImageObject",
      "url": "https://cdn.ejemplo.com/og/seo-2024.jpg",
      "width": 1200,
      "height": 630
    }
  }
</script>
```

---

## 🎓 Mejores Prácticas

### 1. Diseño de Imágenes OG

```
┌────────────────────────────────────────┐
│      ZONA SEGURA (Centro)              │
│    ┌────────────────────────┐          │
│    │                        │          │
│    │   TÍTULO / LOGO        │          │
│    │   (Mantener aquí)      │          │
│    │                        │          │
│    └────────────────────────┘          │
│                                        │
│  Los bordes pueden recortarse          │
│  en ciertas plataformas                │
└────────────────────────────────────────┘
```

### 2. Texto en Imágenes

- ✅ Mantener texto en el **centro 80%** de la imagen
- ✅ Usar **fuentes grandes** (mínimo 60px para títulos)
- ✅ Alto contraste (fondo oscuro + texto claro)
- ❌ No depender de texto pequeño en bordes
- ❌ No usar texto que llegue hasta los bordes

### 3. Contenido del OG Description

```
❌ Malo (genérico):
"Lee este artículo sobre SEO en nuestro blog"

✅ Bueno (específico + CTA implícito):
"Descubre 10 tácticas SEO probadas que aumentaron el tráfico orgánico de 500+ empresas en 2024."
```

---

## 📚 Referencias

- [Open Graph Protocol](https://ogp.me/)
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [WhatsApp FAQ - Link Previews](https://faq.whatsapp.com/general/chats/about-links-in-chats/)
- [Twitter Cards Documentation](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

---

**Versión:** 1.0.0  
**Última actualización:** 2024
