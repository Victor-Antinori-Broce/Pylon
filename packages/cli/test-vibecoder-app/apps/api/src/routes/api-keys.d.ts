/**
 * API Keys Routes
 * Endpoints for generating, listing, and revoking machine authentication keys.
 */
import { Hono } from "hono";
export declare const apiKeysRoutes: Hono<{
    Variables: {
        user: {
            id: string;
            role: string;
        } | null;
    };
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=api-keys.d.ts.map