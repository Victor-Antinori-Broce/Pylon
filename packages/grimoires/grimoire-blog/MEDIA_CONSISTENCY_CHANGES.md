# grimoire-blog Media Consistency Update

## Summary of Changes

This update unifies image handling in grimoire-blog to be consistent with grimoire-media, replacing the mixed approach of `featuredImageId` (UUID) and `ogImageUrl` (text) with a unified media ID-based approach using transform endpoints.

---

## Schema Changes

### `src/schema.local.ts`

**Changed:**

- ❌ `ogImageUrl: text("og_image_url")` - REMOVED (text URL)
- ❌ `ogImageSize: integer("og_image_size")` - REMOVED (now uses media metadata)
- ✅ `ogImageId: uuid("og_image_id")` - NEW (media reference)
- ✅ `featuredImageFocalPoint: jsonb("featured_image_focal_point")` - NEW (smart cropping)

**Added Types:**

```typescript
export interface FocalPoint {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
}
```

### Migration

**File:** `migrations/0001_unified_media.sql`

```sql
-- Add new columns
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS og_image_id UUID,
  ADD COLUMN IF NOT EXISTS featured_image_focal_point JSONB;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS blog_posts_og_image_id_idx ON blog_posts(og_image_id);
```

---

## API Route Changes

### `src/routes.ts`

**POST /api/blog (Create Post):**

- Now accepts `ogImageId` instead of `ogImageUrl` and `ogImageSize`
- Now accepts `featuredImageFocalPoint` for smart cropping

**PATCH /api/blog/:id (Update Post):**

- Same changes as POST

---

## SEO Utility Changes

### `src/seo-utils.ts`

**New Image Transform URL Helpers:**

```typescript
// Get featured image using preset endpoint
getFeaturedImageUrl(mediaId, baseUrl)
// → /api/media/preset/{id}/large

// Get OG image (1200x630, jpeg, quality 90) with focal point support
getOGImageUrl(mediaId, focalPoint?, baseUrl?)
// → /api/media/transform/{id}?w=1200&h=630&fit=cover&f=jpeg&q=90

// Custom transform with any dimensions
getTransformUrl(mediaId, width, height?, options?, baseUrl?)
// → /api/media/transform/{id}?w={w}&h={h}&fit={fit}&f={format}&q={quality}
```

**SEOOverrides Type Updated:**

```typescript
og?: {
  title?: string;
  description?: string;
  image?: string;        // @deprecated - use imageId
  imageId?: string;      // NEW - preferred
  imageAlt?: string;
  type?: string;
}
```

**generateSEOMetadata() Changes:**

- Now uses `ogImageId` from post or SEO overrides
- Generates OG image URL via transform endpoint
- Supports focal point for smart cropping
- Twitter card images also use transform endpoints

---

## GEO Utility Changes

### `src/geo-utils.ts`

**buildAPIPayload() Changes:**

- Now generates OG image URLs using `getOGImageUrl()`
- Returns `ogImage` as transformed URL (1200x630)
- Returns `featuredImageId` and `featuredImageFocalPoint` for client-side transforms

---

## Transform Endpoints Used

### Featured Image

```
GET /api/media/preset/{id}/large
```

**Preset Configuration:**

- Width: 1200px
- Height: 800px
- Fit: inside
- Format: webp
- Quality: 90

### OG Image (WhatsApp/Facebook/LinkedIn)

```
GET /api/media/transform/{id}?w=1200&h=630&fit=cover&f=jpeg&q=90
```

**Configuration:**

- Width: 1200px
- Height: 630px (1.91:1 ratio for WhatsApp)
- Fit: cover
- Format: jpeg (WhatsApp compatible)
- Quality: 90

### With Focal Point

```
GET /api/media/transform/{id}?w=1200&h=630&fit=cover&f=jpeg&q=90&fpx=50&fpy=30
```

**Parameters:**

- `fpx`: Focal point X (0-100, where 50 = center)
- `fpy`: Focal point Y (0-100, where 50 = center)

---

## Usage Examples

### Creating a Post with Media

```typescript
POST /api/blog
{
  "title": "My Blog Post",
  "slug": "my-blog-post",
  "content": {...},
  "featuredImageId": "uuid-here",
  "featuredImageFocalPoint": { "x": 0.5, "y": 0.3 },
  "ogImageId": "uuid-here", // Optional, defaults to featured image
  "status": "published"
}
```

### Getting SEO Metadata

```typescript
GET /api/blog/seo/my-blog-post

Response:
{
  "seo": {
    "title": "My Blog Post | Site Name",
    "metaDescription": "...",
    "ogImage": "https://site.com/api/media/transform/uuid?w=1200&h=630&...",
    // ...
  }
}
```

### Getting GEO Payload

```typescript
GET /api/blog/geo/my-blog-post

Response:
{
  "data": {
    "seo": {
      "ogImage": "https://site.com/api/media/transform/uuid?w=1200&h=630&...",
      "featuredImageId": "uuid-here",
      "featuredImageFocalPoint": { "x": 0.5, "y": 0.3 }
    }
  }
}
```

---

## Exports

### `src/index.ts`

New exports available:

```typescript
// Image transform helpers
export { getFeaturedImageUrl, getOGImageUrl, getTransformUrl } from "./seo-utils";

// Types
export type { FocalPoint } from "./schema";
export type { FocalPoint as ImageFocalPoint } from "./seo-utils";
```

---

## Dependencies

The grimoire-blog package already depends on grimoire-media (as defined in `grimoire.json`):

```json
"dependencies": {
  "grimoires": ["grimoire-media"],
  "core": ["auth"]
}
```

---

## Migration Notes

### For Existing Data

The migration file (`0001_unified_media.sql`) adds new columns but does not drop old columns immediately (for safety).

**To complete migration manually:**

```sql
-- After verifying everything works, drop old columns:
ALTER TABLE blog_posts
  DROP COLUMN IF EXISTS og_image_url,
  DROP COLUMN IF EXISTS og_image_size;
```

### For Existing Code

If you were using `ogImageUrl` in your code:

**Before:**

```typescript
const ogImage = post.ogImageUrl;
```

**After:**

```typescript
import { getOGImageUrl } from "@gremius/grimoire-blog";

const ogImage = post.ogImageId
  ? getOGImageUrl(post.ogImageId, post.featuredImageFocalPoint, baseUrl)
  : null;
```

---

## Benefits

1. **Consistency**: Both featured and OG images now use media IDs
2. **Optimization**: Images are transformed on-the-fly to optimal sizes
3. **WhatsApp Compatible**: OG images are always 1200x630 JPEG
4. **Smart Cropping**: Focal point support for better image composition
5. **Caching**: Transform endpoints cache results for better performance
6. **Storage**: No duplication of image files for different sizes
