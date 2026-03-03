/**
 * @gremius/core — Promote to Content
 *
 * Core infrastructure piece: Transforms BaaS data into publishable
 * CMS content with slugs, SEO metadata, and authorship.
 *
 * Layer: Core (toggleable via gremius.config.ts)
 * Mount: /api/custom/promote (via module-loader)
 *
 * Implementation: apps/api/src/modules/promote/
 */

export { promoteModuleRoutes } from "../../../apps/api/src/modules/promote";
