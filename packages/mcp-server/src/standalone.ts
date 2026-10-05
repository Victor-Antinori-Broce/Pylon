#!/usr/bin/env bun
/**
 * Kitsuden MCP Server — Standalone Mode (Enterprise)
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
 *   KITSUDEN_API_URL=http://localhost:3001 bun run src/standalone.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { DOMAIN_TOOL_DEFINITIONS, runDomainTool } from "./herramientas-de-dominio.js";

const app = new Hono();

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const API_URL = process.env.KITSUDEN_API_URL || "http://localhost:3000";
const API_TOKEN = process.env.KITSUDEN_API_TOKEN || "";
const PORT = parseInt(process.env.PORT || "3002");
const SERVER_NAME = "kitsuden-mcp-server";
const SERVER_VERSION = "1.0.0";

// ═══════════════════════════════════════════════════════════════
// API Client Helper
// ═══════════════════════════════════════════════════════════════

async function apiRequest(
  path: string,
  method: string = "GET",
  body?: any,
  format: "json" | "toon" = "json"
): Promise<any> {
  const headers: Record<string, string> = {
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

  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  // La guía para agentes (`/llms.txt`) es Markdown: sin esto `res.json()`
  // lanzaba y la herramienta que la sirve fallaba con un error de JSON.
  if (contentType.includes("application/vnd.toon") || !contentType.includes("json")) {
    return await res.text();
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════
// TOON Encoder (local, no API needed)
// ═══════════════════════════════════════════════════════════════

function encodeTOON(data: any, prefix = "", lines: string[] = []): string[] {
  if (data === null || data === undefined) return lines;

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

function toTOON(data: any): string {
  if (Array.isArray(data)) {
    return data.map((item) => encodeTOON(item).join("\n")).join("\n---\n") + "\n";
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
  // ── Dominio: torneos, tier lists, catálogos, emisión ──
  // Primero, a propósito: un agente lee la lista de arriba abajo, y las
  // genéricas de abajo le invitan a escribir filas a mano saltándose las
  // reglas del dominio.
  ...DOMAIN_TOOL_DEFINITIONS,

  // ── Explorer CRUD ──
  {
    name: "kitsuden_list_tables",
    description:
      "List all available data tables in Kitsuden with their row counts. Use this first to discover what data exists.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "kitsuden_query_table",
    description:
      "Query records from any Kitsuden table with pagination, sorting, and filtering. Returns data + column metadata.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Table name (e.g., 'games', 'blogPosts', 'courses')",
        },
        limit: {
          type: "number",
          description: "Max records to return (default: 25, max: 100)",
          default: 25,
        },
        page: { type: "number", description: "Page number for pagination", default: 1 },
        sort: { type: "string", description: "Field name to sort by" },
        dir: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction",
          default: "desc",
        },
        filter_field: { type: "string", description: "Field to filter on" },
        filter_op: {
          type: "string",
          enum: ["contains", "equals", "gt", "lt", "gte", "lte"],
          description: "Filter operator",
        },
        filter_value: { type: "string", description: "Filter value" },
        format: {
          type: "string",
          enum: ["json", "toon"],
          description: "Response format. Use 'toon' for 60% fewer tokens.",
          default: "json",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "kitsuden_create_record",
    description:
      "Create a new record in a Kitsuden table. Returns the created record with generated ID.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name" },
        data: {
          type: "object",
          description:
            "Record data as key-value pairs. Use kitsuden_get_schema first to see available fields.",
        },
      },
      required: ["table", "data"],
    },
  },
  {
    name: "kitsuden_update_record",
    description: "Update an existing record in a Kitsuden table by ID.",
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
    name: "kitsuden_delete_record",
    description: "Delete a record from a Kitsuden table by ID. This action is permanent.",
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
    name: "kitsuden_get_schema",
    description:
      "Get the JSON Schema for a table. Shows field names, types, required fields, FK relations, and API endpoints. Essential before creating/updating records.",
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
    name: "kitsuden_list_modules",
    description: "List all Kitsuden modules (kons) with their enabled/disabled status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "kitsuden_toggle_module",
    description: "Enable or disable a Kitsuden module (kon).",
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
    name: "kitsuden_encode_toon",
    description:
      "Encode any JSON data into TOON (Token-Optimized Object Notation) format. TOON uses ~60% fewer LLM tokens than JSON. Use this when you need to include large datasets in your context.",
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
    name: "kitsuden_list_datasets",
    description:
      "List all dynamic datasets in Kitsuden (spreadsheet-like collections). For static tables, use kitsuden_list_tables instead.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // ── Escape Hatch ──
  {
    name: "kitsuden_api_request",
    description:
      "Make a raw HTTP request to any Kitsuden API endpoint. Use this for APIs not covered by other tools.",
    inputSchema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          default: "GET",
          description: "HTTP method",
        },
        path: { type: "string", description: "API path starting with /api/ (e.g., '/api/health')" },
        body: { type: "object", description: "Request body for POST/PUT/PATCH" },
        format: {
          type: "string",
          enum: ["json", "toon"],
          description: "Response format",
          default: "json",
        },
      },
      required: ["path"],
    },
  },
  // ── Code Intelligence (Graphify + Serena + Sourcegraph style) ──
  {
    name: "kitsuden_find_symbol",
    description:
      "Find a symbol (function, class, interface, type, const) by name in the codebase. Returns file:line locations plus who calls it and who imports its file. IDE-grade navigation: prefer this over text search when you know the symbol name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Symbol name (exact or prefix)" },
      },
      required: ["name"],
    },
  },
  {
    name: "kitsuden_file_outline",
    description:
      "Get the symbol-level skeleton of a source file: imports plus every function/class/interface/type with its line number and export status. Use before reading a whole file to know what's inside.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "File path (relative, e.g. 'apps/api/src/lib/auth.ts')",
        },
      },
      required: ["file"],
    },
  },
  {
    name: "kitsuden_search_code",
    description:
      "Structured regex search across the indexed codebase. Returns file:line hits with the matching text. Sourcegraph-style exact/regex search.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern (or literal text)" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "kitsuden_graph_path",
    description:
      "Trace the shortest connection between two code entities (files or symbols) through imports/declares/calls edges. Answers 'how is A connected to B?'.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start: file path or symbol name" },
        to: { type: "string", description: "End: file path or symbol name" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "kitsuden_commit_history",
    description:
      "Search git history: recent commits, commits touching a path, or commits matching a message. Returns sha, author, date, subject.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Limit to commits touching this path" },
        grep: { type: "string", description: "Search text in commit messages" },
        limit: { type: "number", description: "Max commits (default 20)" },
      },
    },
  },
  {
    name: "kitsuden_semantic_search",
    description:
      "Find code by MEANING, not by exact text. Ask in plain language ('where is auth token validated', 'RLS policy building') and get the most relevant symbols ranked by similarity. Use this when you don't know the exact symbol name; use kitsuden_search_code for exact/regex matches.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language description of what you're looking for",
        },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  // ── Semantic EDITING (IDE-grade refactoring) ──
  {
    name: "kitsuden_rename_symbol",
    description:
      "Rename a symbol and ALL its references across the codebase, using the AST (never touches strings, comments or partial matches). DRY-RUN by default: returns the resulting file contents for review. Pass apply:true to write to disk. Refuses if the name is ambiguous or the new name already exists.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Current symbol name" },
        newName: { type: "string", description: "New symbol name" },
        apply: {
          type: "boolean",
          description: "Write to disk (default false = dry-run)",
          default: false,
        },
      },
      required: ["name", "newName"],
    },
  },
  {
    name: "kitsuden_replace_symbol_body",
    description:
      "Replace a symbol's entire declaration with new code, located by name rather than line numbers. DRY-RUN by default; pass apply:true to write. The edit is rejected if the result would not parse as valid TypeScript.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Symbol to replace" },
        code: {
          type: "string",
          description: "Full replacement declaration (e.g. 'export function foo() { ... }')",
        },
        apply: {
          type: "boolean",
          description: "Write to disk (default false = dry-run)",
          default: false,
        },
      },
      required: ["name", "code"],
    },
  },
  {
    name: "kitsuden_safe_delete_symbol",
    description:
      "Delete a symbol ONLY if nothing references it — the safe way to remove dead code. Refuses with the list of live references if any exist. DRY-RUN by default; pass apply:true to write.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Symbol to delete" },
        apply: {
          type: "boolean",
          description: "Write to disk (default false = dry-run)",
          default: false,
        },
      },
      required: ["name"],
    },
  },
  // ── Mail ──
  {
    name: "kitsuden_list_mailables",
    description:
      "List every email the app can send. Each Mailable is owned by the core ('system.*') or by a kon ('crm.*'), and the name doubles as the queue job name — `emailQueue.add('<name>', data)` sends it. Use this to discover what emails exist before writing code that sends one.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "kitsuden_preview_mail",
    description:
      "Render an email WITHOUT sending it: returns subject, HTML and plain-text for the given data and locale. Use it to check how a template looks, or to iterate on the payload a Mailable expects (a render error tells you what's missing).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Mailable name (e.g. 'system.welcome')" },
        data: { type: "object", description: "Data the Mailable expects (to, name, urls…)" },
        locale: { type: "string", description: "Locale, e.g. 'es'. Defaults to the app locale." },
      },
      required: ["name"],
    },
  },
  // ── Tree retrieval (reasoning over structure, not vector similarity) ──
  {
    name: "kitsuden_document_index",
    description:
      "Turn a long document into a compact table-of-contents index: every section gets an id, a title and a one-line summary. TWO-STEP RETRIEVAL — call this first, read the index, pick the section ids that answer the question, then call kitsuden_read_sections with those ids. This beats chunk-and-embed on structured docs (guides, manuals, specs) because sections keep their meaning and every answer can cite its source path.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Full document text (markdown)" },
        title: { type: "string", description: "Optional document title" },
        depth: { type: "number", description: "Max heading depth to show (default 3)" },
      },
      required: ["content"],
    },
  },
  {
    name: "kitsuden_read_sections",
    description:
      "Step 2 of tree retrieval: read the full content of the section ids you chose from kitsuden_document_index. Returns each section with its citation path ('Guide > Phase 3 > Gear') and source line, so your answer can point at exactly where it came from. Omit `sections` to let a deterministic keyword heuristic pick them instead.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The same document text" },
        query: { type: "string", description: "The question being answered" },
        sections: {
          type: "array",
          items: { type: "string" },
          description: "Section ids from the index (e.g. ['0.1.1', '0.2'])",
        },
        maxSections: { type: "number", description: "Max sections to return (default 3)" },
      },
      required: ["content", "query"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// Resource Definitions
// ═══════════════════════════════════════════════════════════════

const RESOURCE_DEFINITIONS = [
  {
    uri: "kitsuden://tables",
    name: "Available Tables",
    mimeType: "application/json",
    description: "List of all data tables in Kitsuden with row counts",
  },
  {
    uri: "kitsuden://modules",
    name: "Active Modules",
    mimeType: "application/json",
    description: "List of all kon modules and their status",
  },
  {
    uri: "kitsuden://health",
    name: "API Health",
    mimeType: "application/json",
    description: "Kitsuden API health status and diagnostics",
  },
  {
    uri: "kitsuden://datasets",
    name: "Datasets",
    mimeType: "application/json",
    description: "List of all dynamic datasets",
  },
];

const RESOURCE_TEMPLATE_DEFINITIONS = [
  {
    uriTemplate: "kitsuden://schema/{table}",
    name: "Table Schema",
    mimeType: "application/json",
    description: "JSON Schema for a specific table",
  },
];

// ═══════════════════════════════════════════════════════════════
// Create MCP Server
// ═══════════════════════════════════════════════════════════════

function createStandaloneMcpServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

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
      if (uri === "kitsuden://tables") {
        const data = await apiRequest("/explorer/tables");
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
        };
      }

      if (uri === "kitsuden://modules") {
        const data = await apiRequest("/modules");
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
        };
      }

      if (uri === "kitsuden://health") {
        const data = await apiRequest("/health");
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
        };
      }

      if (uri === "kitsuden://datasets") {
        const data = await apiRequest("/datasets");
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
        };
      }

      // Template: kitsuden://schema/{table}
      const schemaMatch = uri.match(/^kitsuden:\/\/schema\/(.+)$/);
      if (schemaMatch) {
        const table = schemaMatch[1];
        const data = await apiRequest(`/explorer/schema/json/${table}`);
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
        };
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    } catch (error: any) {
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
        case "kitsuden_list_tables": {
          const data = await apiRequest("/explorer/tables");
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_query_table": {
          const {
            table,
            limit = 25,
            page = 1,
            sort,
            dir,
            filter_field,
            filter_op,
            filter_value,
            format = "json",
          } = args as any;
          const params = new URLSearchParams();
          params.set("limit", String(Math.min(limit, 100)));
          params.set("page", String(page));
          if (sort) params.set("sort", sort);
          if (dir) params.set("dir", dir);
          if (filter_field) params.set("filter_field", filter_field);
          if (filter_op) params.set("filter_op", filter_op);
          if (filter_value) params.set("filter_value", filter_value);

          const data = await apiRequest(
            `/explorer/${table}?${params.toString()}`,
            "GET",
            undefined,
            format as any
          );

          if (format === "toon" && typeof data === "string") {
            return { content: [{ type: "text", text: data }] };
          }

          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_create_record": {
          const { table, data: recordData } = args as any;
          const result = await apiRequest(`/explorer/${table}`, "POST", recordData);
          return {
            content: [
              {
                type: "text",
                text: `Record created successfully:\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }

        case "kitsuden_update_record": {
          const { table, id, data: updateData } = args as any;
          const result = await apiRequest(`/explorer/${table}/${id}`, "PATCH", updateData);
          return {
            content: [
              {
                type: "text",
                text: `Record updated successfully:\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }

        case "kitsuden_delete_record": {
          const { table, id } = args as any;
          await apiRequest(`/explorer/${table}/${id}`, "DELETE");
          return { content: [{ type: "text", text: `Record deleted: ${id}` }] };
        }

        // ── Schema ──
        case "kitsuden_get_schema": {
          const { table } = args as any;
          const data = await apiRequest(`/explorer/schema/json/${table}`);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        // ── Modules ──
        case "kitsuden_list_modules": {
          const data = await apiRequest("/modules");
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_toggle_module": {
          const { key } = args as any;
          const result = await apiRequest(`/modules/${key}/toggle`, "POST", {});
          return {
            content: [
              {
                type: "text",
                text: `Module '${key}' toggled:\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }

        // ── TOON ──
        case "kitsuden_encode_toon": {
          const { data } = args as any;
          const toonOutput = toTOON(data);
          const jsonLen = JSON.stringify(data).length;
          const toonLen = toonOutput.length;
          const savings = Math.round((1 - toonLen / jsonLen) * 100);

          return {
            content: [
              {
                type: "text",
                text: `# TOON Encoded (${savings}% smaller than JSON)\n\n${toonOutput}`,
              },
            ],
          };
        }

        // ── Datasets (legacy) ──
        case "kitsuden_list_datasets": {
          const data = await apiRequest("/datasets");
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        // ── Escape Hatch ──
        case "kitsuden_api_request": {
          const { method = "GET", path, body, format = "json" } = args as any;
          const data = await apiRequest(path.replace(/^\/api/, ""), method, body, format as any);
          if (typeof data === "string") {
            return { content: [{ type: "text", text: data }] };
          }
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        // ── Code Intelligence ──
        case "kitsuden_find_symbol": {
          const { name: symbolName } = args as any;
          const data = await apiRequest(`/code-graph/symbol/${encodeURIComponent(symbolName)}`);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_file_outline": {
          const { file } = args as any;
          const data = await apiRequest(`/code-graph/outline?file=${encodeURIComponent(file)}`);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_search_code": {
          const { pattern, limit = 50 } = args as any;
          const data = await apiRequest(
            `/code-graph/search?q=${encodeURIComponent(pattern)}&limit=${limit}`
          );
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_graph_path": {
          const { from, to } = args as any;
          const data = await apiRequest(
            `/code-graph/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
          );
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_commit_history": {
          const { path: histPath, grep, limit = 20 } = args as any;
          const qs = new URLSearchParams();
          if (histPath) qs.set("path", histPath);
          if (grep) qs.set("grep", grep);
          qs.set("limit", String(limit));
          const data = await apiRequest(`/code-graph/history?${qs.toString()}`);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_semantic_search": {
          const { query, limit = 10 } = args as any;
          const data = await apiRequest(
            `/code-graph/semantic?q=${encodeURIComponent(query)}&limit=${limit}`
          );
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        // ── Semantic editing: dry-run unless apply:true ──
        case "kitsuden_rename_symbol": {
          const { name: symName, newName, apply = false } = args as any;
          const data = await apiRequest("/code-graph/edit/rename", "POST", {
            name: symName,
            newName,
            apply,
          });
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_replace_symbol_body": {
          const { name: symName, code, apply = false } = args as any;
          const data = await apiRequest("/code-graph/edit/replace", "POST", {
            name: symName,
            code,
            apply,
          });
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_safe_delete_symbol": {
          const { name: symName, apply = false } = args as any;
          const data = await apiRequest("/code-graph/edit/delete", "POST", {
            name: symName,
            apply,
          });
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        // ── Mail ──
        case "kitsuden_list_mailables": {
          const data = await apiRequest("/mail");
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        case "kitsuden_preview_mail": {
          const { name: mailName, data: mailData, locale } = args as any;
          const data = await apiRequest("/mail/preview", "POST", {
            name: mailName,
            data: mailData ?? {},
            locale,
          });
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        // ── Tree retrieval ──
        case "kitsuden_document_index": {
          const { content, title, depth } = args as any;
          const data = await apiRequest("/brain/tree", "POST", { content, title, depth });
          // Solo el índice: devolver el árbol entero derrotaría el propósito
          // (el índice cabe en contexto, el documento no).
          return {
            content: [
              {
                type: "text",
                text: `${data.title} — ${data.nodeCount} secciones\n\n${data.index}`,
              },
            ],
          };
        }

        case "kitsuden_read_sections": {
          const { content, query, sections, maxSections } = args as any;
          const data = await apiRequest("/brain/tree/retrieve", "POST", {
            content,
            query,
            sections,
            maxSections,
          });
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }

        default: {
          const deDominio = await runDomainTool(
            name,
            (args ?? {}) as Record<string, unknown>,
            (path, method, body) => apiRequest(path, method, body)
          );
          if (deDominio) return deDominio;
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      }
    } catch (error: any) {
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

const transports = new Map<string, SSEServerTransport>();
const mcpServer = createStandaloneMcpServer();

app.get("/sse", async (c) => {
  const transport = new SSEServerTransport("/messages", c.res as any);
  const sessionId = transport.sessionId;

  transports.set(sessionId, transport);

  (c.res as any).onClose(() => {
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
  await transport.handlePostMessage(c.res as any, body);

  return c.body(null);
});

// ═══════════════════════════════════════════════════════════════
// IDE Config Endpoint (GET /ide-config/:ide)
// ═══════════════════════════════════════════════════════════════

app.get("/ide-config/:ide", (c) => {
  const ide = c.req.param("ide");
  const sseUrl = `http://localhost:${PORT}/sse`;

  const configs: Record<string, { filename: string; config: any }> = {
    cursor: {
      filename: ".cursor/mcp.json",
      config: {
        mcpServers: {
          kitsuden: {
            url: sseUrl,
            env: { KITSUDEN_API_TOKEN: API_TOKEN || "<your-api-key>" },
          },
        },
      },
    },
    claude: {
      filename: "claude_desktop_config.json",
      config: {
        mcpServers: {
          kitsuden: {
            command: "npx",
            args: ["-y", "@kitsuden/mcp-server"],
            env: {
              KITSUDEN_API_URL: API_URL,
              KITSUDEN_API_TOKEN: API_TOKEN || "<your-api-key>",
            },
          },
        },
      },
    },
    vscode: {
      filename: ".vscode/settings.json (merge into existing)",
      config: {
        "mcp.servers": {
          kitsuden: {
            url: sseUrl,
          },
        },
      },
    },
    windsurf: {
      filename: "~/.codeium/windsurf/mcp_config.json",
      config: {
        mcpServers: {
          kitsuden: {
            serverUrl: sseUrl,
          },
        },
      },
    },
  };

  const cfg = configs[ide];
  if (!cfg) {
    return c.json(
      {
        error: `Unknown IDE: ${ide}`,
        available: Object.keys(configs),
      },
      404
    );
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
║   🧙 Kitsuden MCP Server v${SERVER_VERSION}            ║
║   Enterprise AI Agent Integration            ║
╚══════════════════════════════════════════════╝

  API URL:      ${API_URL}
  Auth:         ${API_TOKEN ? "✅ API Key configured" : "⚠️  No API key (set KITSUDEN_API_TOKEN)"}
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
