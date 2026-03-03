/**
 * @gremius/core — Media Library
 *
 * Core infrastructure piece: File upload, storage (S3/MinIO),
 * image optimization (WebP), and signed URLs.
 *
 * Layer: Core (toggleable via gremius.config.ts)
 * Mount: /api/media, /api/upload
 *
 * Implementation: apps/api/src/routes/media.ts, upload.ts
 */

export { mediaRoutes } from "../../../apps/api/src/routes/media";
export { uploadRoutes } from "../../../apps/api/src/routes/upload";
