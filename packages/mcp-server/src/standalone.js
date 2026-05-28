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
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
const app = new Hono();
// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════
const API_URL = process.env.GREMIUS_API_URL || "http://localhost:3000";
const API_TOKEN = process.env.GREMIUS_API_TOKEN || "";
const PORT = parseInt(process.env.PORT || "3002");
const SERVER_NAME = "gremius-mcp-server";
const SERVER_VERSION = "1.0.0";
// ═══════════════════════════════════════════════════════════════
// API Client Helper
// ═══════════════════════════════════════════════════════════════
async function apiRequest(path, method = "GET", body, format = "json") {
    const headers = {
        "Content-Type": "application/json",
    };
    if (API_TOKEN) {
        headers["Authorization"] = `Bearer ${API_TOKEN}`;
    }
    if (format === "toon") {
        headers["Accept"] = "application/vnd.toon";
    }
    const url = `${API_URL}/api${path}`;
    const res = await fetch(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
        const error = await res.text();
        throw new Error(`API ${method} ${path} failed (${res.status}): ${error}`);
    }
    if (res.status === 204)
        return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/vnd.toon")) {
        return await res.text();
    }
    return res.json();
}
// ═══════════════════════════════════════════════════════════════
// TOON Encoder (local, no API needed)
// ═══════════════════════════════════════════════════════════════
function encodeTOON(data, prefix = "", lines = []) {
    if (data === null || data === undefined)
        return lines;
    if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            encodeTOON(data[i], `${prefix}[${i}]`, lines);
        }
        return lines;
    }
    if (typeof data === "object") {
        for (const [key, value] of Object.entries(data)) {
            const path = prefix ? `${prefix}.${key}` : key;
            encodeTOON(value, path, lines);
        }
        return lines;
    }
    lines.push(`${prefix}:${String(data)}`);
    return lines;
}
function toTOON(data) {
    if (Array.isArray(data)) {
        return data.map(item => encodeTOON(item).join("\n")).join("\n---\n") + "\n";
    }
    return encodeTOON(data).join("\n") + "\n";
}
// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════
app.use(logger());
app.use(cors({ origin: "*" }));
// Health check
app.get("/health", (c) => {
    return c.json({
        status: "ok",
        server: SERVER_NAME,
        version: SERVER_VERSION,
        apiUrl: API_URL,
        authenticated: !!API_TOKEN,
        timestamp: new Date().toISOString(),
        transports: ["sse", "streamable-http"],
        tools: TOOL_DEFINITIONS.length,
    });
});
// ═══════════════════════════════════════════════════════════════
// Tool Definitions
// ═══════════════════════════════════════════════════════════════
const TOOL_DEFINITIONS = [
    // ── Explorer CRUD ──
    {
        name: "gremius_list_tables",
        description: "List all available data tables in Gremius with their row counts. Use this first to discover what data exists.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "gremius_query_table",
        description: "Query records from any Gremius table with pagination, sorting, and filtering. Returns data + column metadata.",
        inputSchema: {
            type: "object",
            properties: {
                table: { type: "string", description: "Table name (e.g., 'games', 'blogPosts', 'courses')" },
                limit: { type: "number", description: "Max records to return (default: 25, max: 100)", default: 25 },
                page: { type: "number", description: "Page number for pagination", default: 1 },
                sort: { type: "string", description: "Field name to sort by" },
                dir: { type: "string", enum: ["asc", "desc"], description: "Sort direction", default: "desc" },
                filter_field: { type: "string", description: "Field to filter on" },
                filter_op: { type: "string", enum: ["contains", "equals", "gt", "lt", "gte", "lte"], description: "Filter operator" },
                filter_value: { type: "string", description: "Filter value" },
                format: { type: "string", enum: ["json", "toon"], description: "Response format. Use 'toon' for 60% fewer tokens.", default: "json" },
            },
            required: ["table"],
        },
    },
    {
        name: "gremius_create_record",
        description: "Create a new record in a Gremius table. Returns the created record with generated ID.",
        inputSchema: {
            type: "object",
            properties: {
                table: { type: "string", description: "Table name" },
                data: { type: "object", description: "Record data as key-value pairs. Use gremius_get_schema first to see available fields." },
            },
            required: ["table", "data"],
        },
    },
    {
        name: "gremius_update_record",
        description: "Update an existing record in a Gremius table by ID.",
        inputSchema: {
            type: "object",
            properties: {
                table: { type: "string", description: "Table name" },
                id: { type: "string", description: "Record ID (UUID)" },
                data: { type: "object", description: "Fields to update (partial update)" },
            },
            required: ["table", "id", "data"],
        },
    },
    {
        name: "gremius_delete_record",
        description: "Delete a record from a Gremius table by ID. This action is permanent.",
        inputSchema: {
            type: "object",
            properties: {
                table: { type: "string", description: "Table name" },
                id: { type: "string", description: "Record ID (UUID)" },
            },
            required: ["table", "id"],
        },
    },
    // ── Schema ──
    {
        name: "gremius_get_schema",
        description: "Get the JSON Schema for a table. Shows field names, types, required fields, FK relations, and API endpoints. Essential before creating/updating records.",
        inputSchema: {
            type: "object",
            properties: {
                table: { type: "string", description: "Table name" },
            },
            required: ["table"],
        },
    },
    // ── Modules ──
    {
        name: "gremius_list_modules",
        description: "List all Gremius modules (grimoires) with their enabled/disabled status.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "gremius_toggle_module",
        description: "Enable or disable a Gremius module (grimoire).",
        inputSchema: {
            type: "object",
            properties: {
                key: { type: "string", description: "Module key (e.g., 'academy', 'booking', 'blog')" },
            },
            required: ["key"],
        },
    },
    // ── TOON ──
    {
        name: "gremius_encode_toon",
        description: "Encode any JSON data into TOON (Token-Optimized Object Notation) format. TOON uses ~60% fewer LLM tokens than JSON. Use this when you need to include large datasets in your context.",
        inputSchema: {
            type: "object",
            properties: {
                data: { type: "object", description: "JSON data to encode" },
            },
            required: ["data"],
        },
    },
    // ── Datasets (legacy) ──
    {
        name: "gremius_list_datasets",
        description: "List all dynamic datasets in Gremius (spreadsheet-like collections). For static tables, use gremius_list_tables instead.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    // ── Escape Hatch ──
    {
        name: "gremius_api_request",
        description: "Make a raw HTTP request to any Gremius API endpoint. Use this for APIs not covered by other tools.",
        inputSchema: {
            type: "object",
            properties: {
                method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET", description: "HTTP method" },
                path: { type: "string", description: "API path starting with /api/ (e.g., '/api/health')" },
                body: { type: "object", description: "Request body for POST/PUT/PATCH" },
                format: { type: "string", enum: ["json", "toon"], description: "Response format", default: "json" },
            },
            required: ["path"],
        },
    },
];
// ═══════════════════════════════════════════════════════════════
// Resource Definitions
// ═══════════════════════════════════════════════════════════════
const RESOURCE_DEFINITIONS = [
    {
        uri: "gremius://tables",
        name: "Available Tables",
        mimeType: "application/json",
        description: "List of all data tables in Gremius with row counts",
    },
    {
        uri: "gremius://modules",
        name: "Active Modules",
        mimeType: "application/json",
        description: "List of all grimoire modules and their status",
    },
    {
        uri: "gremius://health",
        name: "API Health",
        mimeType: "application/json",
        description: "Gremius API health status and diagnostics",
    },
    {
        uri: "gremius://datasets",
        name: "Datasets",
        mimeType: "application/json",
        description: "List of all dynamic datasets",
    },
];
const RESOURCE_TEMPLATE_DEFINITIONS = [
    {
        uriTemplate: "gremius://schema/{table}",
        name: "Table Schema",
        mimeType: "application/json",
        description: "JSON Schema for a specific table",
    },
];
// ═══════════════════════════════════════════════════════════════
// Create MCP Server
// ═══════════════════════════════════════════════════════════════
function createStandaloneMcpServer() {
    const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, {
        capabilities: {
            resources: {},
            tools: {},
        },
    });
    // ── Resources ──
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources: RESOURCE_DEFINITIONS };
    });
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        return { resourceTemplates: RESOURCE_TEMPLATE_DEFINITIONS };
    });
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        try {
            if (uri === "gremius://tables") {
                const data = await apiRequest("/explorer/tables");
                return {
                    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
                };
            }
            if (uri === "gremius://modules") {
                const data = await apiRequest("/modules");
                return {
                    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
                };
            }
            if (uri === "gremius://health") {
                const data = await apiRequest("/health");
                return {
                    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
                };
            }
            if (uri === "gremius://datasets") {
                const data = await apiRequest("/datasets");
                return {
                    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
                };
            }
            // Template: gremius://schema/{table}
            const schemaMatch = uri.match(/^gremius:\/\/schema\/(.+)$/);
            if (schemaMatch) {
                const table = schemaMatch[1];
                const data = await apiRequest(`/explorer/schema/json/${table}`);
                return {
                    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
                };
            }
            throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, error.message);
        }
    });
    // ── Tools ──
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: TOOL_DEFINITIONS };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            switch (name) {
                // ── Explorer CRUD ──
                case "gremius_list_tables": {
                    const data = await apiRequest("/explorer/tables");
                    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
                }
                case "gremius_query_table": {
                    const { table, limit = 25, page = 1, sort, dir, filter_field, filter_op, filter_value, format = "json" } = args;
                    const params = new URLSearchParams();
                    params.set("limit", String(Math.min(limit, 100)));
                    params.set("page", String(page));
                    if (sort)
                        params.set("sort", sort);
                    if (dir)
                        params.set("dir", dir);
                    if (filter_field)
                        params.set("filter_field", filter_field);
                    if (filter_op)
                        params.set("filter_op", filter_op);
                    if (filter_value)
                        params.set("filter_value", filter_value);
                    const data = await apiRequest(`/explorer/${table}?${params.toString()}`, "GET", undefined, format);
                    if (format === "toon" && typeof data === "string") {
                        return { content: [{ type: "text", text: data }] };
                    }
                    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
                }
                case "gremius_create_record": {
                    const { table, data: recordData } = args;
                    const result = await apiRequest(`/explorer/${table}`, "POST", recordData);
                    return { content: [{ type: "text", text: `Record created successfully:\n${JSON.stringify(result, null, 2)}` }] };
                }
                case "gremius_update_record": {
                    const { table, id, data: updateData } = args;
                    const result = await apiRequest(`/explorer/${table}/${id}`, "PATCH", updateData);
                    return { content: [{ type: "text", text: `Record updated successfully:\n${JSON.stringify(result, null, 2)}` }] };
                }
                case "gremius_delete_record": {
                    const { table, id } = args;
                    await apiRequest(`/explorer/${table}/${id}`, "DELETE");
                    return { content: [{ type: "text", text: `Record deleted: ${id}` }] };
                }
                // ── Schema ──
                case "gremius_get_schema": {
                    const { table } = args;
                    const data = await apiRequest(`/explorer/schema/json/${table}`);
                    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
                }
                // ── Modules ──
                case "gremius_list_modules": {
                    const data = await apiRequest("/modules");
                    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
                }
                case "gremius_toggle_module": {
                    const { key } = args;
                    const result = await apiRequest(`/modules/${key}/toggle`, "POST", {});
                    return { content: [{ type: "text", text: `Module '${key}' toggled:\n${JSON.stringify(result, null, 2)}` }] };
                }
                // ── TOON ──
                case "gremius_encode_toon": {
                    const { data } = args;
                    const toonOutput = toTOON(data);
                    const jsonLen = JSON.stringify(data).length;
                    const toonLen = toonOutput.length;
                    const savings = Math.round((1 - toonLen / jsonLen) * 100);
                    return {
                        content: [{
                                type: "text",
                                text: `# TOON Encoded (${savings}% smaller than JSON)\n\n${toonOutput}`
                            }],
                    };
                }
                // ── Datasets (legacy) ──
                case "gremius_list_datasets": {
                    const data = await apiRequest("/datasets");
                    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
                }
                // ── Escape Hatch ──
                case "gremius_api_request": {
                    const { method = "GET", path, body, format = "json" } = args;
                    const data = await apiRequest(path.replace(/^\/api/, ""), method, body, format);
                    if (typeof data === "string") {
                        return { content: [{ type: "text", text: data }] };
                    }
                    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
                }
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
            }
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
                isError: true,
            };
        }
    });
    return server;
}
// ═══════════════════════════════════════════════════════════════
// Transport: SSE (legacy, wide IDE support)
// ═══════════════════════════════════════════════════════════════
const transports = new Map();
const mcpServer = createStandaloneMcpServer();
app.get("/sse", async (c) => {
    const transport = new SSEServerTransport("/messages", c.res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);
    c.res.onClose(() => {
        transports.delete(sessionId);
    });
    await mcpServer.connect(transport);
    return new Response(null, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
});
app.post("/messages", async (c) => {
    const sessionId = c.req.query("sessionId");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
        return c.json({ error: "Session not found" }, 404);
    }
    const body = await c.req.json();
    await transport.handlePostMessage(c.res, body);
    return c.body(null);
});
// ═══════════════════════════════════════════════════════════════
// IDE Config Endpoint (GET /ide-config/:ide)
// ═══════════════════════════════════════════════════════════════
app.get("/ide-config/:ide", (c) => {
    const ide = c.req.param("ide");
    const sseUrl = `http://localhost:${PORT}/sse`;
    const configs = {
        cursor: {
            filename: ".cursor/mcp.json",
            config: {
                mcpServers: {
                    gremius: {
                        url: sseUrl,
                        env: { GREMIUS_API_TOKEN: API_TOKEN || "<your-api-key>" },
                    },
                },
            },
        },
        claude: {
            filename: "claude_desktop_config.json",
            config: {
                mcpServers: {
                    gremius: {
                        command: "npx",
                        args: ["-y", "@gremius/mcp-server"],
                        env: {
                            GREMIUS_API_URL: API_URL,
                            GREMIUS_API_TOKEN: API_TOKEN || "<your-api-key>",
                        },
                    },
                },
            },
        },
        vscode: {
            filename: ".vscode/settings.json (merge into existing)",
            config: {
                "mcp.servers": {
                    gremius: {
                        url: sseUrl,
                    },
                },
            },
        },
        windsurf: {
            filename: "~/.codeium/windsurf/mcp_config.json",
            config: {
                mcpServers: {
                    gremius: {
                        serverUrl: sseUrl,
                    },
                },
            },
        },
    };
    const cfg = configs[ide];
    if (!cfg) {
        return c.json({
            error: `Unknown IDE: ${ide}`,
            available: Object.keys(configs),
        }, 404);
    }
    return c.json({
        ide,
        filename: cfg.filename,
        config: cfg.config,
        instructions: `Add this to your ${cfg.filename}`,
    });
});
// List all IDE configs
app.get("/ide-config", (c) => {
    return c.json({
        available: ["cursor", "claude", "vscode", "windsurf"],
        docs: "GET /ide-config/:ide for specific config",
        sseEndpoint: `http://localhost:${PORT}/sse`,
    });
});
// ═══════════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════════
console.log(`
╔══════════════════════════════════════════════╗
║   🧙 Gremius MCP Server v${SERVER_VERSION}            ║
║   Enterprise AI Agent Integration            ║
╚══════════════════════════════════════════════╝

  API URL:      ${API_URL}
  Auth:         ${API_TOKEN ? "✅ API Key configured" : "⚠️  No API key (set GREMIUS_API_TOKEN)"}
  Port:         ${PORT}

  Endpoints:
    Health:     http://localhost:${PORT}/health
    SSE:        http://localhost:${PORT}/sse
    Messages:   http://localhost:${PORT}/messages
    IDE Config: http://localhost:${PORT}/ide-config

  Tools: ${TOOL_DEFINITIONS.length} registered
  Resources: ${RESOURCE_DEFINITIONS.length} + ${RESOURCE_TEMPLATE_DEFINITIONS.length} templates
`);
export default {
    port: PORT,
    fetch: app.fetch,
};
//# sourceMappingURL=standalone.js.map