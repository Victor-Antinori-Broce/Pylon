/**
 * @gremius/core — Engine Infrastructure Extensions
 *
 * Extensions and utilities for the Gremius Engine.
 * 
 * NOTE: Previous core modules have been migrated to Grimoires:
 *   - data-sets     → grimoire-datasets (packages/grimoires/grimoire-datasets)
 *   - media-library → grimoire-media (packages/grimoires/grimoire-media)
 *   - webhooks      → Part of Actions Engine (apps/api/src/lib/actions)
 *   - connectors    → Part of Settings (packages/admin/src/views/admin/connectors)
 *   - content-publishing → Functions moved to grimoire-blog/src/content-utils.ts
 *
 * Current contents:
 *   - vector-search: Embeddings and semantic search infrastructure
 *   - ContentPublishingRegistry: Now in @gremius/shared
 */

// Vector search (Engine infrastructure)
export * from "./vector-search";

// Content Publishing (Core API)
export * from "./content-publishing";
