/**
 * @file agents-v1.ts
 * @description API v1 routes for Agents (frontend compatibility)
 *
 * Routes:
 * - GET /api/v1/agents -> delegates to agents router
 * - GET /api/v1/traces -> list all traces
 * - GET /api/v1/identities -> alias for agents list
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
declare const agentsV1Router: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
export default agentsV1Router;
//# sourceMappingURL=agents-v1.d.ts.map