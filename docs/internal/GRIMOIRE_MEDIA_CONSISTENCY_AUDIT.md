# Auditoría de Consistencia - Grimoires vs Media

**Fecha:** 2026-04-12  
**Grimoire auditado:** grimoire-media (con transformaciones nuevas)

---

## 📊 Resumen Ejecutivo

| Estado                    | Cantidad | Grimoires                                                        |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| ✅ Sin cambios necesarios | 3        | agents, data-visualizer, dms                                     |
| ⚠️ Actualización opcional | 4        | agile, crm, esports, booking                                     |
| 🔴 Requiere actualización | 7        | academy-lms, blocks, blog, datasets, directory, games, streamers |

---

## 🔴 PRIORIDAD ALTA - Requieren actualización

### 1. grimoire-academy-lms

**Problema:** Usa nombre de dependencia antiguo `core-media-library`

**Cambios necesarios:**

```json
// grimoire.json
{
  "dependencies": {
    "grimoires": ["grimoire-media"] // Antes: "core-media-library"
  }
}
```

**Schema - Migrar URLs a media_ids:**

```typescript
// Antes: cursos.portada (text URL)
// Después:
portadaMediaId: uuid("portada_media_id").references(() => media.id);
```

**Uso de transforms:**

```typescript
// Para portadas de cursos:
`/api/media/preset/${curso.portadaMediaId}/large`
// Para thumbnails de quizzes:
`/api/media/preset/${quiz.portadaMediaId}/thumbnail`;
```

---

### 2. grimoire-blocks

**Problema:** Ya depende de grimoire-media pero no usa transformaciones

**Cambios necesarios:**

```typescript
// blocks/index.ts - Actualizar renderizado de imágenes

// Antes:
<img src={media.publicUrl} />

// Después - Responsive:
<img
  src={`/api/media/preset/${mediaId}/medium`}
  srcset={`
    /api/media/preset/${mediaId}/small 400w,
    /api/media/preset/${mediaId}/medium 800w,
    /api/media/preset/${mediaId}/large 1200w
  `}
/>
```

**Focal point para Hero blocks:**

```typescript
// Agregar editor de focal point en admin
// Usar en renderizado:
`/api/media/transform/${mediaId}?w=1920&h=1080&fit=cover&fp=${focalPoint.x},${focalPoint.y}`;
```

---

### 3. grimoire-blog

**Problema:** Mezcla de UUID y text URL para imágenes

**Cambios necesarios:**

```typescript
// schema.ts - Unificar
// Antes:
ogImageUrl: text("og_image_url");

// Después:
ogImageId: uuid("og_image_id").references(() => media.id);
```

**Uso de transforms:**

```typescript
// Featured image:
`/api/media/preset/${post.featuredImageId}/large`
// OG Image (1200x630):
`/api/media/transform/${post.ogImageId}?w=1200&h=630&fit=cover&f=jpeg&q=90`
// Focal point para recorte:
`/api/media/transform/${post.featuredImageId}?w=800&h=400&fit=cover`;
```

---

### 4. grimoire-directory

**Problema:** Usa media UUIDs pero sin declarar dependencia

**Cambios necesarios:**

```json
// grimoire.json
{
  "dependencies": {
    "grimoires": ["grimoire-media"]
  }
}
```

**Uso de transforms:**

```typescript
// Employee photo:
`/api/media/preset/${employee.photoId}/thumbnail` // 150x150
// Organization logo:
`/api/media/preset/${org.logoId}/small`; // 400x300 max
```

---

### 5. grimoire-games

**Problema:** No declara dependencia de grimoire-media

**Cambios necesarios:**

```json
// grimoire.json
{
  "dependencies": {
    "grimoires": ["grimoire-media"]
  }
}
```

**Uso de transforms:**

```typescript
// Cover art:
`/api/media/preset/${game.coverArtId}/hero`; // 1920x1080

// Screenshots gallery:
screenshots.map((s) => `/api/media/preset/${s.mediaId}/thumbnail`)
// Icon:
`/api/media/preset/${platform.iconId}/thumbnail`;
```

**Focal point para cover art:**

```typescript
// Permitir definir focal point en admin:
`/api/media/transform/${coverId}?w=800&h=600&fit=cover&fp=${focalPoint.x},${focalPoint.y}`;
```

---

## 🟡 PRIORIDAD MEDIA - Actualizaciones menores

### 6. grimoire-booking

**Problema:** Usa nombre de dependencia antiguo

```json
// grimoire.json
{
  "dependencies": {
    "optional": ["grimoire-media"] // Antes: "core-media-library"
  }
}
```

**Uso de transforms:**

```typescript
// Room cover:
`/api/media/preset/${room.coverImageId}/medium`;

// Gallery images:
room.images.map((img) => `/api/media/preset/${img.mediaId}/small`);
```

---

### 7. grimoire-datasets

**Problema:** No declara dependencia explícita

```json
// grimoire.json
{
  "dependencies": {
    "grimoires": ["grimoire-media"]
  }
}
```

**Uso de transforms:**

```typescript
// Entry thumbnail:
`/api/media/preset/${entry.thumbnailId}/thumbnail`;
```

---

### 8. grimoire-streamers

**Problema:** Importa de grimoire-media sin declarar dependencia

```json
// grimoire.json
{
  "dependencies": {
    "grimoires": ["grimoire-media", "grimoire-games"]
  }
}
```

**Cambios en schema:**

```typescript
// Antes:
thumbnailUrl: text("thumbnail_url");

// Después:
thumbnailId: uuid("thumbnail_id").references(() => media.id);
```

---

## 🟢 PRIORIDAD BAJA - Opcionales

### 9. grimoire-agile

**Opcional:** Agregar cover image con media

```typescript
// schema.ts
portadaMediaId: uuid("portada_media_id").references(() => media.id);
```

---

### 10. grimoire-crm

**Opcional:** Migrar avatars a media

```typescript
// Antes:
logo: text("logo_url");
avatar: text("avatar_url");

// Después:
logoId: uuid("logo_id").references(() => media.id);
avatarId: uuid("avatar_id").references(() => media.id);
```

---

### 11. grimoire-esports

**Opcional:** Migrar URLs a media

```typescript
// Antes:
avatarUrl: text("avatar_url");
logoUrl: text("logo_url");

// Después:
avatarId: uuid("avatar_id").references(() => media.id);
logoId: uuid("logo_id").references(() => media.id);
```

---

## ✅ Sin cambios necesarios

| Grimoire                     | Razón                               |
| ---------------------------- | ----------------------------------- |
| **grimoire-agents**          | No usa media                        |
| **grimoire-data-visualizer** | No usa media                        |
| **grimoire-dms**             | Tiene su propio sistema de archivos |

---

## 📋 Checklist de actualización

### Para cada grimoire que necesita actualización:

- [ ] 1. Actualizar `grimoire.json` dependencias
- [ ] 2. Actualizar schema (URLs → media_ids)
- [ ] 3. Actualizar queries para usar transforms
- [ ] 4. Agregar soporte de focal point (opcional)
- [ ] 5. Probar endpoints de transformación

---

## 🔧 Guía rápida de migración

### Migrar campo URL a media_id:

```typescript
// 1. Schema - Agregar nuevo campo
mediaId: uuid("media_id").references(() => media.id);

// 2. Migration - Migrar datos existentes
// Crear entradas en tabla media desde URLs existentes
// Actualizar referencias

// 3. Code - Actualizar uso
// Antes:
const imageUrl = record.imageUrl;

// Después:
const imageUrl = `/api/media/preset/${record.mediaId}/medium`;
```

---

## 📊 Estado de consistencia

```
CONSISTENTE: 3 grimoires (18%)
CONSISTENTE CON CAMBIOS OPCIONALES: 4 grimoires (25%)
REQUIERE ACTUALIZACIÓN: 7 grimoires (44%)
NO APLICA: 2 grimoires (13%)
```

**Recomendación:** Priorizar los 5 grimoires de **ALTA** prioridad antes del release v0.9.0
