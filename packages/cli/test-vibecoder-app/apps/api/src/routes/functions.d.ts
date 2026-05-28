/**
 * GremiusCMS — Gremius Workers API Routes
 *
 * CRUD for cloud functions + manual execution + execution logs.
 *
 * Endpoints:
 *   GET    /api/functions           — List all functions
 *   POST   /api/functions           — Create function
 *   GET    /api/functions/:id       — Get function detail
 *   PATCH  /api/functions/:id       — Update function
 *   DELETE /api/functions/:id       — Delete function
 *   POST   /api/functions/:id/execute — Execute manually
 *   GET    /api/functions/:id/executions — Get execution logs
 *   GET    /api/functions/cron/status — Get cron job status
 */
import { Hono } from "hono";
export declare const functionsRoutes: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=functions.d.ts.map