import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Create transform routes for on-the-fly image transformation
 *
 * Routes:
 * - GET /transform/:id?w=800&h=600&fit=cover&f=webp
 * - GET /preset/:id/:preset (thumbnail, small, medium, large, hero)
 * - POST /focal-point/:id (set focal point for smart cropping)
 */
export declare function createTransformRouter(ctx: GrimoireContext): Hono;
//# sourceMappingURL=transform.routes.d.ts.map