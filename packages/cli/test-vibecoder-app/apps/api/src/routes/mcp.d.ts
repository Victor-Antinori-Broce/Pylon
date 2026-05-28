/**
 * MCP (Model Context Protocol) Routes — Agent Gateway
 *
 * Exposes Gremius to AI agents (Claude, Cursor, VS Code, etc.)
 * via the standard MCP protocol over Streamable HTTP (SSE + POST).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY: All MCP connections require a valid gremius_sk_ API key.
 * This is mandatory — MCP tools can insert, query, and dispatch jobs.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Endpoints:
 *   GET  /api/mcp      - SSE connection for agents (requires Bearer token)
 *   POST /api/mcp      - JSON-RPC messages from agent (requires sessionId)
 *
 * TOON Support:
 *   Agents can request TOON-encoded responses by passing format=toon in
 *   tool arguments. The TOON middleware on /api/* also works with
 *   Accept: application/vnd.toon header on regular API calls.
 *
 * Reference: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */
import { Hono } from "hono";
declare const mcpRoutes: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
interface McpAuthContext {
    type: 'human' | 'agent';
    agentId: string;
    agentName: string;
    apiKeyId: string;
    scopes?: string[];
    rateLimit?: number;
}
declare module "hono" {
    interface ContextVariableMap {
        mcpAuth: McpAuthContext;
    }
}
export { mcpRoutes };
//# sourceMappingURL=mcp.d.ts.map