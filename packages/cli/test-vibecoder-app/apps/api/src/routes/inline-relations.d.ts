/**
 * Inline Relations API
 *
 * Provides endpoints for Django-style inline relations:
 * - GET /relations/:tableName - Get all relations for a table
 * - GET /inlines/:tableName/:parentId - Get inline data
 * - POST /inlines/:tableName/:parentId - Save inline records
 */
import { Hono } from "hono";
export declare const inlineRelationsRoutes: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=inline-relations.d.ts.map