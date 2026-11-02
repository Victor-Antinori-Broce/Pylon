# Kon Media - Transformaciones de Imágenes

## Ejemplos de Uso

### 1. Transformación On-the-fly

```
GET /api/media/transform/:id?w=800&h=600&fit=cover&f=webp&q=85
```

**Parámetros:**

| Parámetro         | Descripción                                            | Ejemplo      |
| ----------------- | ------------------------------------------------------ | ------------ |
| `w`, `width`      | Ancho objetivo                                         | `w=800`      |
| `h`, `height`     | Alto objetivo                                          | `h=600`      |
| `fit`             | Modo de ajuste (cover, contain, fill, inside, outside) | `fit=cover`  |
| `pos`, `position` | Posición del crop (center, top, right, bottom, left)   | `pos=center` |
| `f`, `format`     | Formato de salida (jpeg, png, webp, avif)              | `f=webp`     |
| `q`, `quality`    | Calidad 1-100                                          | `q=85`       |
| `fp`              | Punto focal (formato: "x,y" 0-1)                       | `fp=0.5,0.3` |

### 2. Presets

```
GET /api/media/preset/:id/thumbnail
GET /api/media/preset/:id/small
GET /api/media/preset/:id/medium
GET /api/media/preset/:id/large
GET /api/media/preset/:id/hero
```

**Presets disponibles:**

| Preset      | Dimensiones | Uso típico          |
| ----------- | ----------- | ------------------- |
| `thumbnail` | 150x150     | Avatares, iconos    |
| `small`     | 400x300     | Previews, galerías  |
| `medium`    | 800x600     | Contenido principal |
| `large`     | 1200x800    | Imágenes destacadas |
| `hero`      | 1920x1080   | Banners, headers    |

### 3. Focal Point (Smart Cropping)

**Establecer punto focal:**

```bash
POST /api/media/focal-point/:id
Content-Type: application/json

{
  "x": 0.5,  // 0 = izquierda, 1 = derecha
  "y": 0.3   // 0 = arriba, 1 = abajo
}
```

**Obtener punto focal:**

```bash
GET /api/media/focal-point/:id
```

**Uso con transformación:**

```
GET /api/media/transform/:id?w=400&h=400&fit=cover
```

Si el asset tiene un focal point establecido, se usará automáticamente para el crop.

### 4. Ejemplos HTML

```html
<!-- Thumbnail con preset -->
<img src="/api/media/preset/123/thumbnail" alt="Thumbnail" />

<!-- Imagen responsive con srcset -->
<img
  src="/api/media/preset/123/medium"
  srcset="
    /api/media/preset/123/small   400w,
    /api/media/preset/123/medium  800w,
    /api/media/preset/123/large  1200w
  "
  sizes="(max-width: 600px) 400px, (max-width: 1000px) 800px, 1200px"
  alt="Responsive image"
/>

<!-- WebP con fallback -->
<picture>
  <source srcset="/api/media/transform/123?w=800&f=webp" type="image/webp" />
  <img src="/api/media/transform/123?w=800&f=jpeg" alt="WebP with fallback" />
</picture>
```

### 5. Cache y Performance

- Las transformaciones se cachean en storage después de la primera generación
- Headers de cache: `Cache-Control: public, max-age=31536000` (1 año)
- Las URLs son determinísticas (mismos parámetros = misma URL)

### 6. Limpiar Cache

```bash
DELETE /api/media/cache/:id
```

Elimina todas las transformaciones generadas para un asset.

## Instalación

```bash
# Instalar sharp
bun install sharp

# Ejecutar migraciones
kitsuden migrate
```

## Configuración

El kon-media ahora incluye transformación de imágenes automáticamente. No requiere configuración adicional.
