/**
 * DataSets Calculated Fields - API Routes
 *
 * CRUD API para gestionar campos calculados de DataSets.
 * Endpoints:
 *   GET    /api/datasets/:datasetId/calculated-fields
 *   POST   /api/datasets/:datasetId/calculated-fields
 *   GET    /api/datasets/:datasetId/calculated-fields/:fieldId
 *   PATCH  /api/datasets/:datasetId/calculated-fields/:fieldId
 *   DELETE /api/datasets/:datasetId/calculated-fields/:fieldId
 *   POST   /api/datasets/:datasetId/calculated-fields/:fieldId/test
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
export declare function createCalculatedFieldsRouter(ctx: GrimoireContext): Hono;
//# sourceMappingURL=datasets.calculated.routes.d.ts.map