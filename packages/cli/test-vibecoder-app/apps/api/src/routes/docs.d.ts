/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * API DOCUMENTATION - Swagger UI & Scalar
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides interactive API documentation at /api/docs
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
export declare const docsRoutes: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=docs.d.ts.map