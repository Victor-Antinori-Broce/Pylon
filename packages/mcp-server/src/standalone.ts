#!/usr/bin/env bun
/**
 * Kitsuden MCP Server — Standalone Mode (Enterprise)
 *
 * Full MCP server with tools for:
 *   - Explorer table CRUD (list, create, update, delete)
 *   - Schema introspection (JSON Schema)
 *   - Module management (list, toggle)
 *   - Compact results: compact JSON, TOON or TRON, whichever is shortest without loss
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
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
import { logger } from "hono/logger";

import { META_FORMATO } from "./formato.js";
import { DOMAIN_TOOL_DEFINITIONS, runDomainTool } from "./herramientas-de-dominio.js";
import { encodeToon } from "./toon.js";

const app = new Hono();

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const API_URL = process.env.KITSUDEN_API_URL || "http://localhost:3000";
const API_TOKEN = process.env.KITSUDEN_API_TOKEN || "";
const PORT = parseInt(process.env.PORT || "3002");
/**
 * Solo en local (auditoría 2026-10-25). Este servidor no autentica a quien le
 * habla y llama a la API con el token del operador: escuchando en todas las
 * interfaces y con CORS `*`, cualquier máquina de la red —o una web abierta en
 * el navegador— lo usaba como proxy con ese token. Ahora escucha en
 * 127.0.0.1, sin CORS, y solo acepta un `Host` local (contra DNS rebinding).
 * `MCP_HOST` / `MCP_ALLOWED_HOSTS` lo abren si de verdad hace falta.
 */
const HOSTNAME = process.env.MCP_HOST || "127.0.0.1";
const HOSTS_PERMITIDOS = new Set(
  (process.env.MCP_ALLOWED_HOSTS || "localhost,127.0.0.1,[::1]")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
);
const SERVER_NAME = "kitsuden-mcp-server";
const SERVER_VERSION = "1.0.0";

// ═══════════════════════════════════════════════════════════════
// API Client Helper
// ═══════════════════════════════════════════════════════════════

type FormatoPedido = "json" | "toon" | "tron" | "auto";

const ACCEPT_DE: Record<FormatoPedido, string> = {
  json: "application/json",
  toon: "application/vnd.toon",
  tron: "application/vnd.tron",
  // La API elige, por respuesta, el más corto que vuelva a dar los mismos datos
  auto: "application/vnd.kitsuden.auto",
};

async function apiRequest(
  path: string,
  method: string = "GET",
  body?: any,
  format: FormatoPedido = "json"
): Promise<any> {
  return (await apiRequestConFormato(path, method, body, format)).data;
}

/** Como `apiRequest`, y además en qué formato vino el cuerpo (cabecera X-Kitsuden-Format). */
async function apiRequestConFormato(
  path: string,
  method: string,
  body: any,
  format: FormatoPedido
): Promise<{ data: any; formato: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: ACCEPT_DE[format] ?? ACCEPT_DE.json,
  };

  if (API_TOKEN) {
    headers["Authorization"] = `Bearer ${API_TOKEN}`;
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

  if (res.status === 204) return { data: null, formato: null };

  const contentType = res.headers.get("content-type") || "";
  const formato = res.headers.get("x-kitsuden-format");
  // La guía para agentes (`/llms.txt`) es Markdown: sin esto `res.json()`
  // lanzaba y la herramienta que la sirve fallaba con un error de JSON.
  // TOON y TRON llegan como texto y así se pasan al agente.
  if (!contentType.includes("json")) {
    return { data: await res.text(), formato };
  }

  return { data: await res.json(), formato: "json" };
}

/**
 * Pide a la API en `auto` y devuelve el resultado MCP con el texto tal cual
 * (JSON compacto, TOON o TRON) y su formato en `_meta`.
 */
async function volcar(path: string, method: string = "GET", body?: any, format: FormatoPedido = "auto") {
  const { data, formato: deLaApi } = await apiRequestConFormato(path, method, body, format);
  const formato = typeof data === "string" ? (deLaApi ?? "text") : "json";
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text }], _meta: { [META_FORMATO]: formato } };
}

// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════

app.use(logger());
app.use(async (c, next) => {
  const host = (c.req.header("host") || "").toLowerCase().replace(/:\d+$/, "");
  if (!HOSTS_PERMITIDOS.has(host)) return c.json({ error: "Host not allowed" }, 403);
  await next();
});

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
          enum: ["auto", "json", "toon", "tron"],
          description:
            "Result format. 'auto' (default): the API returns compact JSON, TOON or TRON, whichever is shortest for this result and decodes back to the same data. 'json' forces compact JSON.",
          default: "auto",
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
      "Encode JSON data as TOON (https://toonformat.dev). TOON is shorter than compact JSON for flat, uniform lists of objects and usually longer for nested records; the result says how many characters each takes.",
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
          enum: ["auto", "json", "toon", "tron"],
          description: "Response format ('auto' = shortest lossless of compact JSON / TOON / TRON)",
          default: "auto",
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
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }],
        };
      }

      if (uri === "kitsuden://modules") {
        const data = await apiRequest("/modules");
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }],
        };
      }

      if (uri === "kitsuden://health") {
        const data = await apiRequest("/health");
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }],
        };
      }

      if (uri === "kitsuden://datasets") {
        const data = await apiRequest("/datasets");
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }],
        };
      }

      // Template: kitsuden://schema/{table}
      const schemaMatch = uri.match(/^kitsuden:\/\/schema\/(.+)$/);
      if (schemaMatch) {
        const table = schemaMatch[1];
        const data = await apiRequest(`/explorer/schema/json/${table}`);
        return {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }],
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
          return volcar("/explorer/tables");
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
            format = "auto",
          } = args as any;
          const params = new URLSearchParams();
          params.set("limit", String(Math.min(limit, 100)));
          params.set("page", String(page));
          if (sort) params.set("sort", sort);
          if (dir) params.set("dir", dir);
          if (filter_field) params.set("filter_field", filter_field);
          if (filter_op) params.set("filter_op", filter_op);
          if (filter_value) params.set("filter_value", filter_value);

          return volcar(`/explorer/${table}?${params.toString()}`, "GET", undefined, format);
        }

        case "kitsuden_create_record": {
          const { table, data: recordData } = args as any;
          const result = await apiRequest(`/explorer/${table}`, "POST", recordData);
          return {
            content: [
              {
                type: "text",
                text: `Record created successfully:\n${JSON.stringify(result)}`,
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
                text: `Record updated successfully:\n${JSON.stringify(result)}`,
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
          return volcar(`/explorer/schema/json/${table}`);
        }

        // ── Modules ──
        case "kitsuden_list_modules": {
          return volcar("/modules");
        }

        case "kitsuden_toggle_module": {
          const { key } = args as any;
          const result = await apiRequest(`/modules/${key}/toggle`, "POST", {});
          return {
            content: [
              {
                type: "text",
                text: `Module '${key}' toggled:\n${JSON.stringify(result)}`,
              },
            ],
          };
        }

        // ── TOON ──
        case "kitsuden_encode_toon": {
          const { data } = args as any;
          const toonOutput = encodeToon(data);
          const jsonLen = (JSON.stringify(data) ?? "null").length;

          return {
            content: [
              {
                type: "text",
                text: `# TOON (${toonOutput.length} characters; compact JSON: ${jsonLen})\n\n${toonOutput}`,
              },
            ],
          };
        }

        // ── Datasets (legacy) ──
        case "kitsuden_list_datasets": {
          return volcar("/datasets");
        }

        // ── Escape Hatch ──
        case "kitsuden_api_request": {
          const { method = "GET", path, body, format = "auto" } = args as any;
          return volcar(path.replace(/^\/api/, ""), method, body, format);
        }

        // ── Code Intelligence ──
        case "kitsuden_find_symbol": {
          const { name: symbolName } = args as any;
          return volcar(`/code-graph/symbol/${encodeURIComponent(symbolName)}`);
        }

        case "kitsuden_file_outline": {
          const { file } = args as any;
          return volcar(`/code-graph/outline?file=${encodeURIComponent(file)}`);
        }

        case "kitsuden_search_code": {
          const { pattern, limit = 50 } = args as any;
          return volcar(
            `/code-graph/search?q=${encodeURIComponent(pattern)}&limit=${limit}`
          );
        }

        case "kitsuden_graph_path": {
          const { from, to } = args as any;
          return volcar(
            `/code-graph/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
          );
        }

        case "kitsuden_commit_history": {
          const { path: histPath, grep, limit = 20 } = args as any;
          const qs = new URLSearchParams();
          if (histPath) qs.set("path", histPath);
          if (grep) qs.set("grep", grep);
          qs.set("limit", String(limit));
          return volcar(`/code-graph/history?${qs.toString()}`);
        }

        case "kitsuden_semantic_search": {
          const { query, limit = 10 } = args as any;
          return volcar(
            `/code-graph/semantic?q=${encodeURIComponent(query)}&limit=${limit}`
          );
        }

        // ── Semantic editing: dry-run unless apply:true ──
        case "kitsuden_rename_symbol": {
          const { name: symName, newName, apply = false } = args as any;
          return volcar("/code-graph/edit/rename", "POST", {
            name: symName,
            newName,
            apply,
          });
        }

        case "kitsuden_replace_symbol_body": {
          const { name: symName, code, apply = false } = args as any;
          return volcar("/code-graph/edit/replace", "POST", {
            name: symName,
            code,
            apply,
          });
        }

        case "kitsuden_safe_delete_symbol": {
          const { name: symName, apply = false } = args as any;
          return volcar("/code-graph/edit/delete", "POST", {
            name: symName,
            apply,
          });
        }

        // ── Mail ──
        case "kitsuden_list_mailables": {
          return volcar("/mail");
        }

        case "kitsuden_preview_mail": {
          const { name: mailName, data: mailData, locale } = args as any;
          return volcar("/mail/preview", "POST", {
            name: mailName,
            data: mailData ?? {},
            locale,
          });
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
          return volcar("/brain/tree/retrieve", "POST", {
            content,
            query,
            sections,
            maxSections,
          });
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
            // Nunca el token real: esta respuesta la puede pedir cualquiera
            env: { KITSUDEN_API_TOKEN: "<your-api-key>" },
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
              KITSUDEN_API_TOKEN: "<your-api-key>",
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

/**
 * `--stdio` (o `MCP_TRANSPORT=stdio`): el cliente lanza este proceso y le habla
 * por stdin/stdout, sin puerto. Es lo que usan `.mcp.json` y los agentes que
 * corren en paralelo (docs/agents/orca.md): cada uno arranca el suyo con su
 * propio token, y el registro de auditoría los separa. En este modo stdout es
 * el canal JSON-RPC: el cartel va a stderr y no se abre el servidor HTTP.
 */
const POR_STDIO = process.argv.includes("--stdio") || process.env.MCP_TRANSPORT === "stdio";

if (POR_STDIO) {
  await mcpServer.connect(new StdioServerTransport());
  console.error(
    `Kitsuden MCP v${SERVER_VERSION} por stdio · API ${API_URL} · ` +
      (API_TOKEN ? "token configurado" : "sin token (KITSUDEN_API_TOKEN)")
  );
} else console.log(`
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

// Bun solo abre el puerto si el export por defecto trae `fetch`
export default POR_STDIO
  ? {}
  : {
      port: PORT,
      hostname: HOSTNAME,
      fetch: app.fetch,
    };
