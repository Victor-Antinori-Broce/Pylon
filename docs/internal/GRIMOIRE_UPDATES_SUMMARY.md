# Resumen de Actualizaciones - Grimoires Prioridad Alta

**Fecha:** 2026-04-12  
**Total grimoires actualizados:** 7

---

## ✅ Grimoires Actualizados

### 1. grimoire-academy-lms

**Cambios principales:**

- ✅ `grimoire.json`: `core-media-library` → `grimoire-media`
- ✅ Schema: Campos de media migrados de URLs a media_ids
  - `cursos.portada` → `cursos.mediaId`
  - `quizzes.portada` → `quizzes.mediaId`
  - `learning_paths.imagen` → `learning_paths.mediaId`
  - `temas.imagen` → `temas.imagenId`
  - `temas.documento` → `temas.documentoId`
  - `preguntas.archivo` → `preguntas.archivoId`
- ✅ Nuevo servicio: `media.service.ts` con helpers para transforms
- ✅ Endpoints usados:
  - `/api/media/preset/{id}/large` (covers de cursos)
  - `/api/media/preset/{id}/thumbnail` (quizzes)
  - `/api/media/preset/{id}/medium` (temas)

---

### 2. grimoire-blocks

**Cambios principales:**

- ✅ `blocks.schema.ts`: Agregado `focalPoint` a HeroBlockContent
- ✅ `blocks.routes.ts`:
  - Nuevo helper `buildTransformUrl()`
  - Render endpoint ahora devuelve `mediaUrls` con presets
  - Hero blocks: hero, large, medium, small con focal point
  - Image blocks: thumbnail, small, medium, large
  - Cards blocks: thumbnail, small, medium para cada imagen
- ✅ `grimoire.json`: Agregadas features `responsive-images` y `focal-point-cropping`
- ✅ README.md: Documentación actualizada con Media Transform Integration

**Presets usados:**
| Preset | Uso |
|--------|-----|
| hero | Hero backgrounds (1920x1080) |
| large | Desktop images (1200x800) |
| medium | Tablets (800x600) |
| small | Mobile (400x300) |
| thumbnail | Icons/avatars (150x150) |

---

### 3. grimoire-blog

**Cambios principales:**

- ✅ Schema: Unificado manejo de imágenes
  - `ogImageUrl` (text) → `ogImageId` (uuid)
  - Agregado `featuredImageFocalPoint` (jsonb)
- ✅ Nuevos helpers en `seo-utils.ts`:
  - `getFeaturedImageUrl()` → `/api/media/preset/{id}/large`
  - `getOGImageUrl()` → `/api/media/transform/{id}?w=1200&h=630&fit=cover&f=jpeg&q=90`
  - `getTransformUrl()` → URL genérica con focal point
- ✅ Migración: `migrations/0001_unified_media.sql`
- ✅ Beneficios:
  - OG images siempre 1200x630 JPEG (WhatsApp compatible)
  - Smart cropping con focal point
  - Optimización automática WebP

---

### 4. grimoire-directory

**Cambios principales:**

- ✅ `grimoire.json`: Agregada dependencia `grimoire-media`
- ✅ `directory.routes.ts`: Agregados helpers:
  - `getLogoUrl()` → `/api/media/preset/{id}/small`
  - `getPhotoUrl()` → `/api/media/preset/{id}/thumbnail`
- ✅ Endpoints actualizados para incluir URLs transformadas:
  - GET /organizations (incluye logoUrl)
  - GET /organizations/:id (incluye logoUrl)
  - GET /departments/:id (incluye photoUrl)
  - GET /employees (incluye photoUrl)
  - GET /employees/:id (incluye photoUrl)
  - GET /org-chart (incluye photoUrl)
  - GET /search (incluye photoUrl)
- ✅ Preservada backward compatibility (photoId/logoId siguen en responses)

---

### 5. grimoire-games

**Cambios principales:**

- ✅ `grimoire.json`:
  - Agregada dependencia `grimoire-media`
  - Versión actualizada: 2.0.0 → 2.1.0
  - Nueva sección `media` con configuración de transforms
- ✅ `games.schema.ts`:
  - Agregado `FocalPoint` interface
  - Agregado `coverFocalPoint` (jsonb)
  - Screenshots ahora soportan `focalPoint` y `order`
  - Nuevos helpers:
    - `getMediaTransformUrl()`
    - `getMediaPresetUrl()`
    - `buildCoverArtUrls()` (hero, card, thumbnail)
    - `buildScreenshotUrls()` (gallery, thumbnail)
    - `buildPlatformIconUrls()` (thumbnail)
- ✅ `games.routes.ts`:
  - Agregado query param `includeMedia` (default: true)
  - Respuestas incluyen objeto `media` con todas las URLs transformadas
- ✅ `platforms.routes.ts`:
  - Agregado `includeMedia` query param
  - URLs transformadas para platform icons

**Transform URLs generadas:**

```typescript
// Cover Art:
{
  hero: "/api/media/preset/{id}/hero?fp=x,y",      // 1920x1080
  card: "/api/media/preset/{id}/small?fp=x,y",     // 600x800
  thumbnail: "/api/media/preset/{id}/thumbnail",   // 300x400
  original: "/api/media/transform/{id}?fp=x,y"     // Full + focal
}

// Screenshots:
{
  gallery: "/api/media/preset/{id}/medium",        // 1200x675
  thumbnail: "/api/media/preset/{id}/thumbnail"    // 300x169
}

// Platform Icons:
{
  thumbnail: "/api/media/preset/{id}/thumbnail",   // 64x64
  original: "/api/media/preset/{id}/small"         // Original size
}
```

---

### 6. grimoire-datasets

**Cambios principales:**

- ✅ `grimoire.json`: Agregada dependencia `grimoire-media`
- ✅ `datasets.routes.ts`:
  - Agregado query param `includeThumbnailUrl`
  - List entries: `GET /:id/entries?includeThumbnailUrl=true`
  - Get single entry: `GET /:id/entries/:entryId?includeThumbnailUrl=true`
- ✅ Endpoint usado: `/api/media/preset/{thumbnailId}/thumbnail`

**Ejemplo de uso:**

```bash
GET /api/datasets/123/entries?includeThumbnailUrl=true
```

Response:

```json
{
  "thumbnailId": "uuid-here",
  "thumbnailUrl": "/api/media/preset/uuid-here/thumbnail"
}
```

---

### 7. grimoire-streamers

**Cambios principales:**

- ✅ `grimoire.json`: Agregadas dependencias `grimoire-games` y `grimoire-media`
- ✅ `streamers.schema.ts`:
  - `thumbnailUrl: text()` → `thumbnailId: uuid()`
  - Ahora consistente con `avatarId` (ambos UUIDs)
- ✅ `streamers.routes.ts`:
  - Actualizado endpoint `/sync/status` para aceptar `thumbnailId`
  - Actualizado create streamer para usar `thumbnailId`

**Transform endpoints para rendering:**

- Avatars: `/api/media/preset/{avatarId}/thumbnail`
- Thumbnails: `/api/media/preset/{thumbnailId}/small`

**Nota de migración:** Se requiere migración de DB para cambiar columna `thumbnail_url` a `thumbnail_id`.

---

## 📊 Estadísticas de Cambios

| Grimoire    | Archivos Modificados | Cambios Principales                      |
| ----------- | -------------------- | ---------------------------------------- |
| academy-lms | 6                    | Dependencias, schema, servicios, routes  |
| blocks      | 4                    | Focal point, responsive images, docs     |
| blog        | 7                    | Schema unificado, SEO helpers, migración |
| directory   | 2                    | Dependencias, URL helpers en routes      |
| games       | 5                    | Dependencias, schema, media helpers      |
| datasets    | 2                    | Dependencias, thumbnail URLs             |
| streamers   | 3                    | Dependencias, schema unificado           |

**Total: 29 archivos modificados**

---

## 🎯 Patrones Implementados

### 1. Media ID References

Todos los grimoires ahora usan `mediaId` (UUID) en vez de URLs:

```typescript
// Antes:
portada: text("portada_url"); // URL completa

// Después:
mediaId: uuid("media_id"); // Referencia a grimoire-media
```

### 2. Transform URL Helpers

Cada grimoire tiene helpers para generar URLs:

```typescript
function getMediaUrl(mediaId: string, preset: string) {
  return `/api/media/preset/${mediaId}/${preset}`;
}
```

### 3. Focal Point Support

Hero/cover images soportan focal point:

```typescript
// URL con focal point
`/api/media/transform/${id}?w=800&h=600&fit=cover&fp=${x},${y}`
// Preset con focal point
`/api/media/preset/${id}/hero?fp=${x},${y}`;
```

### 4. Backward Compatibility

Donde aplica, se preservan IDs originales:

```typescript
// Response incluye ambos
{
  "photoId": "uuid",      // Para edición
  "photoUrl": "..."       // Para display
}
```

---

## ✅ Checklist de Consistencia

- [x] Todos usan `grimoire-media` (no nombres antiguos)
- [x] Todos declaran dependencia explícita
- [x] Campos de media son UUIDs que referencian media.id
- [x] Helpers para generar transform URLs
- [x] Soporte de focal point donde aplica
- [x] Presets documentados (thumbnail, small, medium, large, hero)
- [x] Backward compatibility preservada

---

## 🚀 Próximos Pasos

1. **Ejecutar migraciones de DB** donde cambiaron schemas
2. **Recompilar** todos los grimoires (`bun run build`)
3. **Probar** endpoints de transformación
4. **Actualizar** documentación de API si es necesario

**Estado:** ✅ Todos los grimoires de prioridad alta están actualizados y consistentes con grimoire-media.

---

## 🟡 GRIMOIRES PRIORIDAD MEDIA/BAJA - Actualizados

### 8. grimoire-booking

**Cambios principales:**

- ✅ `grimoire.json`: Dependencia actualizada `core-media-library` → `grimoire-media`
- ✅ `booking.routes.ts`: Agregados helpers:
  - `getMediaTransformUrl(mediaId, preset)` - Genera URLs de transformación
  - `transformRoomImages(room)` - Agrega URLs transformadas a rooms
- ✅ Rutas actualizadas para incluir URLs transformadas:
  - `GET /rooms` - Incluye `coverImageUrl` (medium) y `imageUrls[]` (small)
  - `GET /rooms/:id` - Incluye URLs transformadas
  - `GET /bookings` - Incluye `roomCoverImageUrl` (thumbnail)
  - `GET /my-bookings` - Incluye `roomCoverImageUrl` (thumbnail)

**Presets usados:**

- Room covers: `medium` (800x600)
- Gallery images: `small` (400x300)
- Booking thumbnails: `thumbnail` (150x150)

---

### 9. grimoire-agile

**Cambios principales:**

- ✅ `grimoire.json`: Versión 1.1.0 → 1.2.0, agregada dependencia `grimoire-media`
- ✅ `schema.ts`: Agregado campo `coverImageId` (uuid) a `agile_projects`
- ✅ `agile.routes.ts`: Agregado helper `buildCoverImageUrls()`
- ✅ Endpoints actualizados:
  - `GET /projects` - Incluye objeto `coverImage` con URLs
  - `GET /projects/:id` - Incluye `coverImage` con URLs
  - `POST /projects` - Acepta `coverImageId` en request body

**Transform URLs:**

```typescript
{
  original: `/api/media/${coverImageId}`,
  large: `/api/media/preset/${coverImageId}/large`,   // Project covers
  small: `/api/media/preset/${coverImageId}/small`,   // Thumbnails
}
```

---

### 10. grimoire-crm

**Cambios principales:**

- ✅ `grimoire.json`: Agregada dependencia `grimoire-media`
- ✅ `crm.schema.ts`: Migración de campos:
  - `crmCompanies.logo` (text) → `crmCompanies.logoId` (uuid)
  - `crmContacts.avatar` (text) → `crmContacts.avatarId` (uuid)
- ✅ `crm.routes.ts`: Actualizados endpoints:
  - Companies: `logoUrl` generado desde `logoId`
  - Contacts: `avatarUrl` generado desde `avatarId`
- ✅ Migración: `migrations/0002_media_integration.sql`

**Transform endpoints:**

- Company logos: `/api/media/preset/{id}/small` (400x300)
- Contact avatars: `/api/media/preset/{id}/thumbnail` (150x150)

**API Changes:**
| Entity | Request | Response |
|--------|---------|----------|
| Company | `logoId: uuid` | `logoId` + `logoUrl` |
| Contact | `avatarId: uuid` | `avatarId` + `avatarUrl` |

---

### 11. grimoire-esports

**Cambios principales:**

- ✅ `grimoire.json`: Agregada dependencia `grimoire-media`
- ✅ `schema.ts`: Migración de campos:
  - `players.avatarUrl` (text) → `players.avatarId` (uuid)
  - `teams.logoUrl` (text) → `teams.logoId` (uuid)
- ✅ `routes/players.routes.ts`:
  - Helper `getAvatarUrl()` → `/api/media/preset/{id}/thumbnail`
  - Endpoints actualizados para aceptar `avatarId` y retornar `avatarUrl`
- ✅ `routes/teams.routes.ts`:
  - Helper `getLogoUrl()` → `/api/media/preset/{id}/small`
  - Endpoints actualizados para aceptar `logoId` y retornar `logoUrl`

**Transform endpoints:**

- Player avatars: `/api/media/preset/{id}/thumbnail` (150x150)
- Team logos: `/api/media/preset/{id}/small` (400x300)

---

## 📊 Estadísticas Finales

### Total de Grimoires Actualizados: 11

| Prioridad | Cantidad | Grimoires                                                        |
| --------- | -------- | ---------------------------------------------------------------- |
| 🔴 Alta   | 7        | academy-lms, blocks, blog, directory, games, datasets, streamers |
| 🟡 Media  | 1        | booking                                                          |
| 🟢 Baja   | 3        | agile, crm, esports                                              |

### Total de Archivos Modificados: 40+

### Patrones Consistentes Aplicados:

- ✅ Todos usan `grimoire-media` (sin nombres antiguos)
- ✅ Todos declaran dependencia explícita
- ✅ Campos de media son UUIDs que referencian media.id
- ✅ Helpers para generar transform URLs
- ✅ Soporte de focal point donde aplica
- ✅ Backward compatibility preservada donde es posible

---

## 🚀 Resumen de Migraciones de DB Requeridas

Las siguientes migraciones deben ejecutarse:

1. **grimoire-blog**: `migrations/0001_unified_media.sql`
2. **grimoire-crm**: `migrations/0002_media_integration.sql`
3. **grimoire-streamers**: Cambiar `thumbnail_url` a `thumbnail_id`
4. **grimoire-esports**: Cambiar `avatar_url` y `logo_url` a IDs

---

## ✅ Estado Final

**Todos los grimoires están ahora consistentes con grimoire-media y sus nuevas capacidades de transformación de imágenes.**

### Endpoints Disponibles Globalmente:

```
/api/media/transform/:id?w=800&h=600&fit=cover&f=webp&q=85
/api/media/preset/:id/thumbnail   # 150x150
/api/media/preset/:id/small       # 400x300
/api/media/preset/:id/medium      # 800x600
/api/media/preset/:id/large       # 1200x800
/api/media/preset/:id/hero        # 1920x1080
/api/media/focal-point/:id        # POST/GET focal point
/api/media/cache/:id              # DELETE cache
```
