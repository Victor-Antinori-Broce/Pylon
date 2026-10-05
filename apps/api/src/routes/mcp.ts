/**
 * MCP (Model Context Protocol) Routes — Agent Gateway
 *
 * Exposes Kitsuden to AI agents (Claude, Cursor, VS Code, etc.)
 * via the standard MCP protocol over Streamable HTTP (SSE + POST).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY: All MCP connections require a valid Agent NHI token (kitsuden_agent_*)
 * or a legacy API key (kitsuden_sk_* — deprecated, sunset 2026-08-01).
 * Agents must have the 'mcp:connect' scope. MCP tools can insert, query,
 * and dispatch jobs.
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

import { createHash } from "crypto";

import { listMCPTools, executeMCPTool, messageOf } from "@kitsuden/engine";
import { camposDelSchema } from "@kitsuden/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { dataSets, apiKeys } from "../db/schema";
import { logger } from "../lib/logger";
import { authenticateAgent, hasScope } from "../services/agent-auth";
import { listHardcodedMCPTools, executeHardcodedTool } from "../services/mcp-tools";
import { KON_REGISTRY } from "../services/module-registry";

import { invalidateGraphQLCache } from "./graphql";

// ── Code Generators ──

// ── Nivel 1 Actions Engine ──

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface McpSession {
  agentId: string; // machine-{apiKeyId}
  agentName: string; // API key name (e.g. "Claude Desktop")
  apiKeyId: string; // For audit trail
  createdAt: number; // Timestamp
  lastActivity: number; // For session cleanup
}

interface AgentLogEntry {
  timestamp: string;
  agentId: string;
  agentName: string;
  method: string;
  tool?: string;
  resource?: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// Session Store
// NOTE: In-memory sessions are lost on restart. For multi-instance
// deployments, migrate to Valkey: HSET kitsuden:mcp:sessions {id} {json}
// ═══════════════════════════════════════════════════════════════

const sessions = new Map<string, McpSession>();

// Periodic cleanup of stale sessions (older than 1 hour)
const SESSION_TTL_MS = 60 * 60 * 1000;
setInterval(
  () => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        sessions.delete(id);
        logger.info({ sessionId: id, agentName: session.agentName }, "MCP session expired");
      }
    }
  },
  5 * 60 * 1000
); // Check every 5 minutes

// ═══════════════════════════════════════════════════════════════
// Agent Activity Log (in-memory ring buffer, last 1000 entries)
// For production: export to OpenTelemetry / Grafana / Loki
// ═══════════════════════════════════════════════════════════════

const MAX_LOG_ENTRIES = 1000;
const agentLog: AgentLogEntry[] = [];

function logAgentActivity(entry: AgentLogEntry): void {
  agentLog.push(entry);
  if (agentLog.length > MAX_LOG_ENTRIES) {
    agentLog.shift();
  }
  logger.info(
    {
      agent: entry.agentName,
      method: entry.method,
      tool: entry.tool,
      resource: entry.resource,
      durationMs: entry.durationMs,
      success: entry.success,
    },
    `MCP ${entry.method}${entry.tool ? ` → ${entry.tool}` : ""}`
  );
}

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════

const mcpRoutes = new Hono();

// ═══════════════════════════════════════════════════════════════
// Auth Middleware — Supports Human API Keys & Agent Identities (NHI)
// ═══════════════════════════════════════════════════════════════

interface McpAuthContext {
  type: "human" | "agent";
  agentId: string;
  agentName: string;
  apiKeyId: string;
  scopes?: string[]; // For agent NHI
  rateLimit?: number; // For agent NHI
}

declare module "hono" {
  interface ContextVariableMap {
    mcpAuth: McpAuthContext;
  }
}

mcpRoutes.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Unauthorized. MCP requires a valid API key in Authorization header.",
        },
        id: null,
      },
      401
    );
  }

  const rawToken = authHeader.replace("Bearer ", "").trim();

  // ═══════════════════════════════════════════════════════════════
  // Intentar autenticar como Agente NHI primero (kitsuden_agent_xxx)
  // ═══════════════════════════════════════════════════════════════
  if (rawToken.startsWith("kitsuden_agent_")) {
    const result = await authenticateAgent(rawToken, {
      ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
      userAgent: c.req.header("user-agent"),
    });

    if (!result.success || !result.context) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: result.error || "Invalid agent API key.",
          },
          id: null,
        },
        401
      );
    }

    const agentContext = result.context;

    // Verificar que el agente tenga scope para MCP
    if (!hasScope(agentContext, "mcp:connect")) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Agent does not have MCP scope. Required: mcp:connect",
          },
          id: null,
        },
        403
      );
    }

    c.set("mcpAuth", {
      type: "agent",
      agentId: agentContext.agentId,
      agentName: agentContext.agentName,
      apiKeyId: agentContext.keyId,
      scopes: agentContext.scopes,
      rateLimit: agentContext.rateLimit,
    });

    logger.info(
      {
        agentId: agentContext.agentId,
        agentName: agentContext.agentName,
        type: "agent",
      },
      "MCP agent authenticated"
    );

    await next();
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Fallback: Legacy Human API Key (kitsuden_sk_xxx) — DEPRECATED
  // Migrate to Agent NHI tokens (kitsuden_agent_xxx) before 2026-08-01.
  // ═══════════════════════════════════════════════════════════════
  if (!rawToken.startsWith("kitsuden_sk_")) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Invalid API key format. Expected: kitsuden_agent_xxx (new) or kitsuden_sk_xxx (deprecated)",
        },
        id: null,
      },
      401
    );
  }

  const keyHash = createHash("sha256").update(rawToken).digest("hex");

  const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

  if (!apiKey) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid API key." },
        id: null,
      },
      401
    );
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "API key expired." },
        id: null,
      },
      401
    );
  }

  // Update lastUsedAt (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    .catch(() => {});

  // Deprecation warnings
  logger.warn(
    { keyId: apiKey.id, type: "mcp" },
    "[DEPRECATION] Legacy API key (kitsuden_sk_*) used in MCP. Migrate to Agent NHI (kitsuden_agent_*)."
  );
  c.header("Deprecation", "kitsuden_sk_*; kitsuden_agent_*");
  c.header("Sunset", "2026-08-01");

  c.set("mcpAuth", {
    type: "human",
    agentId: `machine-${apiKey.id}`,
    agentName: apiKey.name,
    apiKeyId: apiKey.id,
  });

  logger.info(
    {
      agentId: `machine-${apiKey.id}`,
      agentName: apiKey.name,
      type: "human",
    },
    "MCP legacy human user authenticated"
  );

  await next();
});

/**
 * GET /api/mcp — SSE Endpoint
 *
 * Agents connect here to establish an MCP session.
 * The server sends an `endpoint` event with the POST URL for messages.
 */
mcpRoutes.get("/", async (c) => {
  const sessionId = crypto.randomUUID();
  const auth = c.get("mcpAuth") as McpAuthContext;

  sessions.set(sessionId, {
    agentId: auth.agentId,
    agentName: auth.agentName,
    apiKeyId: auth.apiKeyId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  });

  logger.info({ sessionId, agentName: auth.agentName, type: auth.type }, "MCP session created");

  const messageEndpoint = `/api/mcp?sessionId=${sessionId}`;

  const stream = new ReadableStream({
    start(controller) {
      // MCP spec: send endpoint event
      controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`));

      // Keepalive every 30s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(":keepalive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30000);

      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        sessions.delete(sessionId);
        logger.info({ sessionId, agentName: auth.agentName }, "MCP session closed");
      });
    },
    cancel() {
      sessions.delete(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-MCP-Session": sessionId,
    },
  });
});

/**
 * POST /api/mcp — JSON-RPC Message Endpoint
 *
 * Agents send MCP commands here after establishing a session via SSE.
 */
mcpRoutes.post("/", async (c) => {
  const sessionId = c.req.query("sessionId");
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Invalid or expired session. Connect via GET /api/mcp first.",
        },
        id: null,
      },
      400
    );
  }

  // Update last activity
  session.lastActivity = Date.now();

  const body = await c.req.json();
  const start = Date.now();

  try {
    const result = await handleMcpMessage(body, session);

    logAgentActivity({
      timestamp: new Date().toISOString(),
      agentId: session.agentId,
      agentName: session.agentName,
      method: body.method,
      tool: body.method === "tools/call" ? body.params?.name : undefined,
      resource: body.method === "resources/read" ? body.params?.uri : undefined,
      durationMs: Date.now() - start,
      success: true,
    });

    if (result === null) {
      // Notifications (like "initialized") don't need a response
      return c.body(null, 204);
    }
    return c.json(result);
  } catch (err: unknown) {
    logAgentActivity({
      timestamp: new Date().toISOString(),
      agentId: session.agentId,
      agentName: session.agentName,
      method: body.method,
      tool: body.method === "tools/call" ? body.params?.name : undefined,
      durationMs: Date.now() - start,
      success: false,
      error: messageOf(err),
    });

    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: messageOf(err) },
        id: body.id || null,
      },
      500
    );
  }
});

/**
 * GET /api/mcp/logs — Agent activity log (admin only)
 */
mcpRoutes.get("/logs", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 100, MAX_LOG_ENTRIES);
  const agentFilter = c.req.query("agent");

  let entries = agentLog.slice(-limit);
  if (agentFilter) {
    entries = entries.filter((e) => e.agentName.includes(agentFilter));
  }

  return c.json({
    entries: entries.reverse(),
    total: agentLog.length,
    activeSessions: sessions.size,
    sessionDetails: Array.from(sessions.entries()).map(([id, s]) => ({
      sessionId: id,
      agentName: s.agentName,
      connectedAt: new Date(s.createdAt).toISOString(),
      lastActivity: new Date(s.lastActivity).toISOString(),
    })),
  });
});

// ═══════════════════════════════════════════════════════════════
// MCP Protocol Handler
// ═══════════════════════════════════════════════════════════════

async function handleMcpMessage(message: any, session: McpSession) {
  const { method, params, id } = message;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            resources: { listChanged: true },
            tools: { listChanged: true },
          },
          serverInfo: {
            name: "kitsuden-mcp-server",
            version: "0.7.0-beta",
          },
        },
        id,
      };

    case "initialized":
      return null;

    case "ping":
      return { jsonrpc: "2.0", result: {}, id };

    case "resources/list":
      return await listResources(id);

    case "resources/read":
      return await readResource(params?.uri, id);

    case "tools/list":
      return listTools(id);

    case "tools/call":
      return await executeTool(params?.name, params?.arguments, id, session);

    default:
      return {
        jsonrpc: "2.0",
        error: { code: -32601, message: `Method not found: ${method}` },
        id,
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// Resources
// ═══════════════════════════════════════════════════════════════

async function listResources(id: string | number) {
  // Dynamically build resource list from actual datasets
  const allDatasets = await db
    .select({ id: dataSets.id, name: dataSets.name, slug: dataSets.slug })
    .from(dataSets);

  const resources = [
    {
      uri: "kitsuden://datasets",
      name: "All Datasets",
      mimeType: "application/json",
      description: `List of all ${allDatasets.length} datasets with their schemas`,
    },
    {
      uri: "kitsuden://kons",
      name: "Active Kons",
      mimeType: "application/json",
      description: "Active modules (blog, CRM, DMS, etc.) and their mount points",
    },
    // Individual dataset resources
    ...allDatasets.map((ds) => ({
      uri: `kitsuden://dataset/${ds.id}`,
      name: `Dataset: ${ds.name}`,
      mimeType: "application/json",
      description: `Schema and metadata for ${ds.name} (${ds.slug})`,
    })),
  ];

  return { jsonrpc: "2.0", result: { resources }, id };
}

async function readResource(uri: string, id: string | number) {
  try {
    if (uri === "kitsuden://datasets") {
      const allDatasets = await db.select().from(dataSets);
      const mapped = allDatasets.map((ds: any) => ({
        id: ds.id,
        name: ds.name,
        slug: ds.slug,
        description: ds.description,
        fields: camposDelSchema(ds.schema),
        entryCount: ds.entryCount || 0,
      }));

      return jsonRpcResult(uri, mapped, id);
    }

    if (uri === "kitsuden://kons") {
      // Return actual kon registry instead of hardcoded stub
      const kons = KON_REGISTRY.map((g) => ({
        key: g.key,
        name: g.name,
        description: g.description,
        icon: g.icon,
        category: g.category,
        tables: g.tables,
        grimoireId: g.grimoireId || null,
      }));

      return jsonRpcResult(uri, kons, id);
    }

    // Individual dataset: kitsuden://dataset/{id}
    const datasetMatch = uri.match(/^kitsuden:\/\/dataset\/(.+)$/);
    if (datasetMatch) {
      const [dataset] = await db
        .select()
        .from(dataSets)
        .where(eq(dataSets.id, datasetMatch[1]))
        .limit(1);

      if (!dataset) {
        return jsonRpcError(-32002, `Dataset not found: ${datasetMatch[1]}`, id);
      }

      return jsonRpcResult(
        uri,
        {
          id: dataset.id,
          name: dataset.name,
          slug: dataset.slug,
          description: dataset.description,
          schema: dataset.schema,
          policyJson: dataset.policyJson,
          workflowJson: dataset.workflowJson,
        },
        id
      );
    }

    return jsonRpcError(-32002, `Unknown resource: ${uri}`, id);
  } catch (err: unknown) {
    return jsonRpcError(-32603, `Resource read failed: ${messageOf(err)}`, id);
  }
}

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

function listTools(id: string | number) {
  // Dynamically retrieve tools from the Actions engine
  const dynamicTools = listMCPTools().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema || { type: "object", properties: {} },
  }));

  const hardcodedTools = listHardcodedMCPTools().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters,
  }));

  return {
    jsonrpc: "2.0",
    result: {
      tools: [...dynamicTools, ...hardcodedTools],
    },
    id,
  };
}

async function executeTool(name: string, args: any, id: string | number, session: McpSession) {
  try {
    // First check if this is a dynamic tool registered in the Actions engine
    const dynamicTools = listMCPTools();
    if (dynamicTools.find((t) => t.name === name)) {
      const result = await executeMCPTool(name, args, session);
      return {
        jsonrpc: "2.0",
        result,
        id,
      };
    }

    // Delegate hardcoded tools to shared implementation
    const text = await executeHardcodedTool(name, args || {}, session, {
      onMutate: invalidateGraphQLCache,
    });

    // Propagate validation errors that return string messages as MCP errors
    if (
      text.startsWith("Missing:") ||
      text.startsWith("Invalid") ||
      text.startsWith("Collection not found") ||
      text.startsWith("Dataset not found") ||
      text.startsWith("Record not found") ||
      text.startsWith("Unsupported") ||
      text.startsWith("Unknown queue")
    ) {
      return jsonRpcError(-32602, text, id);
    }

    return toolResult(text, id);
  } catch (err: unknown) {
    return {
      jsonrpc: "2.0",
      result: {
        content: [{ type: "text", text: `Error: ${messageOf(err)}` }],
        isError: true,
      },
      id,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// JSON-RPC Helpers
// ═══════════════════════════════════════════════════════════════

function jsonRpcResult(uri: string, data: unknown, id: string | number) {
  return {
    jsonrpc: "2.0",
    result: {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    },
    id,
  };
}

function jsonRpcError(code: number, message: string, id: string | number) {
  return {
    jsonrpc: "2.0",
    error: { code, message },
    id,
  };
}

function toolResult(text: string, id: string | number) {
  return {
    jsonrpc: "2.0",
    result: {
      content: [{ type: "text", text }],
    },
    id,
  };
}

export { mcpRoutes };
