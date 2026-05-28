#!/usr/bin/env bun
/**
 * Gremius MCP Server — Standalone Mode (Enterprise)
 *
 * Full MCP server with tools for:
 *   - Explorer table CRUD (list, create, update, delete)
 *   - Schema introspection (JSON Schema)
 *   - Module management (list, toggle)
 *   - TOON encoding (AI token optimization)
 *   - Generic API escape hatch
 *
 * Transports: SSE (legacy) + Streamable HTTP (2025 spec)
 * IDE Support: Cursor, VS Code, Claude Desktop, Windsurf
 *
 * Usage:
 *   GREMIUS_API_URL=http://localhost:3001 bun run src/standalone.ts
 */
declare const _default: {
    port: number;
    fetch: (request: Request, Env?: unknown, executionCtx?: import("hono").ExecutionContext) => Response | Promise<Response>;
};
export default _default;
//# sourceMappingURL=standalone.d.ts.map