/**
 * @gremius/core — Data Sets & Visualizer
 *
 * Core infrastructure piece: Dynamic spreadsheet-like data management
 * with CRUD, entries, inline editing, and Data Explorer.
 *
 * Layer: Core (ALWAYS ACTIVE — cannot be disabled)
 * Mount: /api/datasets, /api/explorer
 *
 * Implementation: apps/api/src/routes/datasets.ts, data-explorer.ts
 */

export { dataSetsFullRoutes } from "../../../apps/api/src/routes/datasets";
export { explorerRoutes } from "../../../apps/api/src/routes/data-explorer";
export { default as datasetsOpenAPIRouter } from "../../../apps/api/src/routes/datasets-openapi";
