/**
 * @file data-sources.ts
 * @description Admin routes for managing external data sources
 *
 * REST API endpoints for:
 * - Creating/updating/deleting data source connections
 * - Testing connections
 * - Syncing data
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
declare const dataSourcesRouter: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
export default dataSourcesRouter;
//# sourceMappingURL=data-sources.d.ts.map