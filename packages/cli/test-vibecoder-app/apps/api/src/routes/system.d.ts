/**
 * System Routes
 * - Theme management (Module-Aware Themes / Prism)
 * - CSS serving
 * - Module dependency resolution on theme activation
 *
 * NOTE: /init-check and /setup are handled inline in index.ts (before auth middleware).
 * These routes are for authenticated system management.
 */
import { Hono } from "hono";
export declare const systemRoutes: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=system.d.ts.map