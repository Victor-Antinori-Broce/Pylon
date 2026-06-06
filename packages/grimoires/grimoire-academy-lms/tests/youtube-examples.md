# 🎬 Ejemplos de Integración con YouTube

Este documento muestra cómo integrar videos de YouTube en el Academy LMS.

## Formatos de URL Soportados

### 1. URL Estándar de YouTube

```
https://www.youtube.com/watch?v=VIDEO_ID
```

**Ejemplo:**

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### 2. URL Corta (youtu.be)

```
https://youtu.be/VIDEO_ID
```

**Ejemplo:**

```
https://youtu.be/dQw4w9WgXcQ
```

### 3. URL de Embed

```
https://www.youtube.com/embed/VIDEO_ID
```

**Ejemplo:**

```
https://www.youtube.com/embed/dQw4w9WgXcQ
```

### 4. URL con Parámetros

```
https://www.youtube.com/watch?v=VIDEO_ID&t=30s
https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
```

## API Endpoints

### Extraer Información de YouTube

```http
POST /api/academy/media/youtube-info
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Respuesta:**

```json
{
  "valido": true,
  "videoId": "dQw4w9WgXcQ",
  "embedUrl": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
}
```

### Normalizar URL de Video

```http
POST /api/academy/media/normalizar-video
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Respuesta:**

```json
{
  "tipo": "youtube",
  "url": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
}
```

## Crear un Tema con Video de YouTube

### Ejemplo Completo

```http
POST /api/academy/temas
Content-Type: application/json
Authorization: Bearer TOKEN

{
  "moduloId": "modulo_123",
  "titulo": "Introducción al Curso",
  "contenido": "En este tema veremos los fundamentos...",
  "orden": 1,
  "videoYoutube": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "videoExterno": null,
  "videoLocal": null
}
```

### Flujo Recomendado

1. **Validar la URL de YouTube:**

```http
POST /api/academy/media/youtube-info
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

2. **Usar la URL normalizada en el tema:**

```javascript
const response = await fetch("/api/academy/media/youtube-info", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: userInputUrl }),
});

const { embedUrl, thumbnailUrl } = await response.json();

// Crear tema con URL normalizada
await fetch("/api/academy/temas", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    moduloId: "mod_123",
    titulo: "Nuevo Tema",
    contenido: "...",
    videoYoutube: embedUrl,
    imagen: thumbnailUrl, // Opcional: usar thumbnail
  }),
});
```

## Ejemplos de Implementación Frontend

### React Component

```tsx
import { useState } from "react";

function VideoYoutubeInput({ onVideoSelected }) {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const validateYoutubeUrl = async (inputUrl) => {
    setLoading(true);
    try {
      const response = await fetch("/api/academy/media/youtube-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });

      const data = await response.json();

      if (data.valido) {
        setInfo(data);
        onVideoSelected(data);
      } else {
        alert("URL de YouTube inválida");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Pega la URL de YouTube"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button onClick={() => validateYoutubeUrl(url)} disabled={loading}>
        {loading ? "Validando..." : "Validar"}
      </button>

      {info && (
        <div className="video-preview">
          <img src={info.thumbnailUrl} alt="Thumbnail" />
          <p>Video ID: {info.videoId}</p>
          <p>Tipo: YouTube</p>
        </div>
      )}
    </div>
  );
}
```

### Vue Component

```vue
<template>
  <div>
    <input v-model="url" placeholder="URL de YouTube" @blur="validateUrl" />
    <div v-if="info" class="preview">
      <img :src="info.thumbnailUrl" />
      <p>{{ info.videoId }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const url = ref("");
const info = ref(null);

const validateUrl = async () => {
  const response = await fetch("/api/academy/media/youtube-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.value }),
  });

  info.value = await response.json();
};
</script>
```

## URLs de Prueba

### Videos Válidos

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ
https://www.youtube.com/embed/dQw4w9WgXcQ
https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s
```

### Videos Inválidos (para testing)

```
https://www.google.com
https://www.youtube.com
https://youtu.be/
not-a-url
```

## Thumbnails de YouTube

El sistema extrae automáticamente la URL del thumbnail:

```
https://img.youtube.com/vi/{VIDEO_ID}/maxresdefault.jpg
```

Resoluciones disponibles:

- `maxresdefault.jpg` - Máxima resolución (1280x720)
- `sddefault.jpg` - Resolución estándar (640x480)
- `hqdefault.jpg` - Alta calidad (480x360)
- `mqdefault.jpg` - Media calidad (320x180)
- `default.jpg` - Default (120x90)

## Embed Options

### Parámetros de Embed Recomendados

```html
<iframe
  width="560"
  height="315"
  src="https://www.youtube.com/embed/VIDEO_ID?rel=0&modestbranding=1"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen
></iframe>
```

### Parámetros Opcionales

- `rel=0` - No mostrar videos relacionados
- `modestbranding=1` - Logo de YouTube pequeño
- `start=30` - Iniciar en segundo 30
- `end=120` - Terminar en segundo 120

## Integración con Schema de Tema

```typescript
// academy-lms.schema.ts
export const temaTable = pgTable("temas", {
  // ... otros campos
  videoYoutube: text("video_youtube"), // URL embed de YouTube
  videoLocal: text("video_local"), // URL archivo local
  videoExterno: text("video_externo"), // iframe o link externo
  imagen: text("imagen"), // Thumbnail
});
```

## Validación en Frontend

```javascript
// Regex para validar URLs de YouTube
const youtubeRegex =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;

function isValidYoutubeUrl(url) {
  return youtubeRegex.test(url);
}
```

## Manejo de Errores

```json
// Error: URL inválida
{
  "error": "URL de YouTube inválida"
}

// Error: Video no encontrado
{
  "valido": false,
  "error": "Video no encontrado"
}

// Éxito
{
  "valido": true,
  "videoId": "dQw4w9WgXcQ",
  "embedUrl": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
}
```

## Test con cURL

```bash
# Validar URL de YouTube
curl -X POST http://localhost:3000/api/academy/media/youtube-info \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Normalizar video
curl -X POST http://localhost:3000/api/academy/media/normalizar-video \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Crear tema con video
curl -X POST http://localhost:3000/api/academy/temas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "moduloId": "mod_123",
    "titulo": "Tema con YouTube",
    "contenido": "Contenido del tema",
    "videoYoutube": "https://www.youtube.com/embed/dQw4w9WgXcQ"
  }'
```
