/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DYNAMIC DOCS ROUTER - Auto-generated API Documentation
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides endpoints for:
 * - /api/docs/openapi.json - Full OpenAPI spec from all grimoires
 * - /api/docs/:grimoire/openapi.json - Spec for specific grimoire
 * - /api/docs/ - Swagger UI
 * - /api/docs/modern - Scalar UI
 * - /api/docs/operations - List all available operations
 * - /api/docs/sdk - SDK download links
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
export declare const dynamicDocsRouter: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
export default dynamicDocsRouter;
//# sourceMappingURL=docs-dynamic.d.ts.map