/**
 * @file agents.ts
 * @description Admin routes for managing AI Agent Identities (NHI)
 *
 * REST API endpoints for:
 * - Creating/updating/deleting agent identities
 * - Managing API keys
 * - Viewing audit logs
 * - Statistics and monitoring
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
declare const agentsRouter: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
export default agentsRouter;
//# sourceMappingURL=agents.d.ts.map