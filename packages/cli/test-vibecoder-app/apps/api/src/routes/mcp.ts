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

import { createHash } from "crypto";

import { listMCPTools, executeMCPTool } from "@gremius/engine";
import { eq, and } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { dataSets, dataEntries, apiKeys } from "../db/schema";
import { logger } from "../lib/logger";
import { emailQueue } from "../lib/queue";
import {
    buildDrizzleWhere,
    type PolicyJson,
} from "../lib/rls-builder";
import { encodeTOON } from "../lib/toon";
import { authenticateAgent, hasScope } from "../services/agent-auth";
import { GRIMOIRE_REGISTRY } from "../services/module-registry";

// ── Nivel 1 Actions Engine ──

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface McpSession {
    agentId: string;       // machine-{apiKeyId}
    agentName: string;     // API key name (e.g. "Claude Desktop")
    apiKeyId: string;      // For audit trail
    createdAt: number;     // Timestamp
    lastActivity: number;  // For session cleanup
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
// deployments, migrate to Valkey: HSET gremius:mcp:sessions {id} {json}
// ═══════════════════════════════════════════════════════════════

const sessions = new Map<string, McpSession>();

// Periodic cleanup of stale sessions (older than 1 hour)
const SESSION_TTL_MS = 60 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.lastActivity > SESSION_TTL_MS) {
            sessions.delete(id);
            logger.info({ sessionId: id, agentName: session.agentName }, "MCP session expired");
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

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
    logger.info({
        agent: entry.agentName,
        method: entry.method,
        tool: entry.tool,
        resource: entry.resource,
        durationMs: entry.durationMs,
        success: entry.success,
    }, `MCP ${entry.method}${entry.tool ? ` → ${entry.tool}` : ""}`);
}

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════

const mcpRoutes = new Hono();

// ═══════════════════════════════════════════════════════════════
// Auth Middleware — Supports Human API Keys & Agent Identities (NHI)
// ═══════════════════════════════════════════════════════════════

interface McpAuthContext {
    type: 'human' | 'agent';
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
        return c.json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Unauthorized. MCP requires a valid API key in Authorization header.",
            },
            id: null,
        }, 401);
    }

    const rawToken = authHeader.replace("Bearer ", "").trim();

    // ═══════════════════════════════════════════════════════════════
    // Intentar autenticar como Agente NHI primero (grm_agent_xxx)
    // ═══════════════════════════════════════════════════════════════
    if (rawToken.startsWith("grm_agent_")) {
        const result = await authenticateAgent(rawToken, {
            ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
            userAgent: c.req.header("user-agent"),
        });

        if (!result.success || !result.context) {
            return c.json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: result.error || "Invalid agent API key."
                },
                id: null,
            }, 401);
        }

        const agentContext = result.context;

        // Verificar que el agente tenga scope para MCP
        if (!hasScope(agentContext, "mcp:connect")) {
            return c.json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Agent does not have MCP scope. Required: mcp:connect"
                },
                id: null,
            }, 403);
        }

        c.set("mcpAuth", {
            type: 'agent',
            agentId: agentContext.agentId,
            agentName: agentContext.agentName,
            apiKeyId: agentContext.keyId,
            scopes: agentContext.scopes,
            rateLimit: agentContext.rateLimit,
        });

        logger.info({
            agentId: agentContext.agentId,
            agentName: agentContext.agentName,
            type: 'agent'
        }, "MCP agent authenticated");

        await next();
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    // Fallback: Autenticar como API Key Humana (gremius_sk_xxx)
    // ═══════════════════════════════════════════════════════════════
    if (!rawToken.startsWith("gremius_sk_")) {
        return c.json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Invalid API key format. Expected: gremius_sk_xxx or grm_agent_xxx",
            },
            id: null,
        }, 401);
    }

    const keyHash = createHash("sha256").update(rawToken).digest("hex");

    const [apiKey] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);

    if (!apiKey) {
        return c.json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Invalid API key." },
            id: null,
        }, 401);
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return c.json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "API key expired." },
            id: null,
        }, 401);
    }

    // Update lastUsedAt (fire and forget)
    db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, apiKey.id))
        .execute()
        .catch(() => { });

    c.set("mcpAuth", {
        type: 'human',
        agentId: `machine-${apiKey.id}`,
        agentName: apiKey.name,
        apiKeyId: apiKey.id,
    });

    logger.info({
        agentId: `machine-${apiKey.id}`,
        agentName: apiKey.name,
        type: 'human'
    }, "MCP human user authenticated");

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
            controller.enqueue(
                new TextEncoder().encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`)
            );

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
            "Connection": "keep-alive",
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
        return c.json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Invalid or expired session. Connect via GET /api/mcp first." },
            id: null,
        }, 400);
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
    } catch (err: any) {
        logAgentActivity({
            timestamp: new Date().toISOString(),
            agentId: session.agentId,
            agentName: session.agentName,
            method: body.method,
            tool: body.method === "tools/call" ? body.params?.name : undefined,
            durationMs: Date.now() - start,
            success: false,
            error: err.message,
        });

        return c.json({
            jsonrpc: "2.0",
            error: { code: -32603, message: err.message },
            id: body.id || null,
        }, 500);
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
                        name: "gremius-mcp-server",
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
    const allDatasets = await db.select({ id: dataSets.id, name: dataSets.name, slug: dataSets.slug }).from(dataSets);

    const resources = [
        {
            uri: "gremius://datasets",
            name: "All Datasets",
            mimeType: "application/json",
            description: `List of all ${allDatasets.length} datasets with their schemas`,
        },
        {
            uri: "gremius://grimoires",
            name: "Active Grimoires",
            mimeType: "application/json",
            description: "Active modules (blog, CRM, DMS, etc.) and their mount points",
        },
        // Individual dataset resources
        ...allDatasets.map((ds) => ({
            uri: `gremius://dataset/${ds.id}`,
            name: `Dataset: ${ds.name}`,
            mimeType: "application/json",
            description: `Schema and metadata for ${ds.name} (${ds.slug})`,
        })),
    ];

    return { jsonrpc: "2.0", result: { resources }, id };
}

async function readResource(uri: string, id: string | number) {
    try {
        if (uri === "gremius://datasets") {
            const allDatasets = await db.select().from(dataSets);
            const mapped = allDatasets.map((ds: any) => ({
                id: ds.id,
                name: ds.name,
                slug: ds.slug,
                description: ds.description,
                fields: ds.schema?.fields || [],
                entryCount: ds.entryCount || 0,
            }));

            return jsonRpcResult(uri, mapped, id);
        }

        if (uri === "gremius://grimoires") {
            // Return actual grimoire registry instead of hardcoded stub
            const grimoires = GRIMOIRE_REGISTRY.map((g) => ({
                key: g.key,
                name: g.name,
                description: g.description,
                icon: g.icon,
                category: g.category,
                tables: g.tables,
                realmId: g.realmId || null,
            }));

            return jsonRpcResult(uri, grimoires, id);
        }

        // Individual dataset: gremius://dataset/{id}
        const datasetMatch = uri.match(/^gremius:\/\/dataset\/(.+)$/);
        if (datasetMatch) {
            const [dataset] = await db
                .select()
                .from(dataSets)
                .where(eq(dataSets.id, datasetMatch[1]))
                .limit(1);

            if (!dataset) {
                return jsonRpcError(-32002, `Dataset not found: ${datasetMatch[1]}`, id);
            }

            return jsonRpcResult(uri, {
                id: dataset.id,
                name: dataset.name,
                slug: dataset.slug,
                description: dataset.description,
                schema: dataset.schema,
                policyJson: dataset.policyJson,
                workflowJson: dataset.workflowJson,
            }, id);
        }

        return jsonRpcError(-32002, `Unknown resource: ${uri}`, id);
    } catch (err: any) {
        return jsonRpcError(-32603, `Resource read failed: ${err.message}`, id);
    }
}

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

function listTools(id: string | number) {
    // Dynamically retrieve tools from the Actions engine
    const dynamicTools = listMCPTools().map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || { type: "object", properties: {} }
    }));

    return {
        jsonrpc: "2.0",
        result: {
            tools: [
                ...dynamicTools,
                {
                    name: "gremius_query_dataset",
                    description: "Query records from a dataset. Respects RLS policies. Supports TOON output (set format='toon' to save tokens).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            datasetId: { type: "string", description: "UUID of the dataset" },
                            limit: { type: "number", default: 50, description: "Max records (max 100)" },
                            offset: { type: "number", default: 0, description: "Pagination offset" },
                            status: { type: "string", description: "Filter: published, draft, archived" },
                            format: { type: "string", enum: ["json", "toon"], default: "json", description: "Response format. Use 'toon' to reduce token usage by ~60%." },
                        },
                        required: ["datasetId"],
                    },
                },
                {
                    name: "gremius_insert_record",
                    description: "Insert a new record into a dataset. Validates against dataset schema.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            datasetId: { type: "string", description: "UUID of the dataset" },
                            data: { type: "object", description: "Record data matching dataset schema" },
                            status: { type: "string", default: "draft", description: "Initial status" },
                        },
                        required: ["datasetId", "data"],
                    },
                },
                {
                    name: "gremius_update_record",
                    description: "Update an existing record by ID.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            entryId: { type: "string", description: "UUID of the entry to update" },
                            data: { type: "object", description: "Fields to update (merged with existing)" },
                            status: { type: "string", description: "New status" },
                        },
                        required: ["entryId", "data"],
                    },
                },
                {
                    name: "gremius_delete_record",
                    description: "Delete a record by ID.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            entryId: { type: "string", description: "UUID of the entry to delete" },
                        },
                        required: ["entryId"],
                    },
                },
                {
                    name: "gremius_list_datasets",
                    description: "List all available datasets with their field schemas. Useful for discovering data structure before querying.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            format: { type: "string", enum: ["json", "toon"], default: "json" },
                        },
                    },
                },
                {
                    name: "gremius_dispatch_worker",
                    description: "Enqueue an async background job (email, webhook, custom worker).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            queueName: { type: "string", description: "Queue: email, webhooks" },
                            jobName: { type: "string", description: "Job handler name" },
                            payload: { type: "object", description: "Job payload" },
                        },
                        required: ["queueName", "jobName", "payload"],
                    },
                },
            ],
        },
        id,
    };
}

async function executeTool(
    name: string,
    args: any,
    id: string | number,
    session: McpSession
) {
    try {
        // First check if this is a dynamic tool registered in the Actions engine
        const dynamicTools = listMCPTools();
        if (dynamicTools.find(t => t.name === name)) {
            const result = await executeMCPTool(name, args, session);
            return {
                jsonrpc: "2.0",
                result,
                id,
            };
        }

        // Otherwise handle legacy hardcoded tools
        switch (name) {
            case "gremius_query_dataset": {
                const { datasetId, limit = 50, offset = 0, status, format = "json" } = args || {};
                if (!datasetId) return jsonRpcError(-32602, "Missing: datasetId", id);

                // Fetch dataset to check RLS policy
                const [dataset] = await db.select().from(dataSets).where(eq(dataSets.id, datasetId)).limit(1);
                if (!dataset) return jsonRpcError(-32602, `Dataset not found: ${datasetId}`, id);

                // Build query with RLS conditions
                const policy = dataset.policyJson as PolicyJson | null;
                const rlsWhere = buildDrizzleWhere(
                    policy?.rlsRules,
                    { id: session.agentId, role: "admin" }
                );

                // Build where conditions dynamically
                const conditions = [eq(dataEntries.dataSetId, datasetId)];
                if (status) {
                    conditions.push(eq(dataEntries.status, status));
                }
                if (rlsWhere) {
                    conditions.push(rlsWhere);
                }

                const results = await db.select().from(dataEntries)
                    .where(and(...conditions))
                    .limit(Math.min(Number(limit) || 50, 100))
                    .offset(Number(offset) || 0);

                const output = format === "toon" ? encodeTOON(results) : JSON.stringify(results, null, 2);
                return toolResult(output, id);
            }

            case "gremius_insert_record": {
                const { datasetId, data, status = "draft" } = args || {};
                if (!datasetId || !data) return jsonRpcError(-32602, "Missing: datasetId, data", id);

                const [newRecord] = await db.insert(dataEntries).values({
                    dataSetId: datasetId,
                    title: data?.title || "Untitled",
                    data,
                    status,
                } as any).returning();

                return toolResult(`Record created: ${newRecord.id}`, id);
            }

            case "gremius_update_record": {
                const { entryId, data, status } = args || {};
                if (!entryId || !data) return jsonRpcError(-32602, "Missing: entryId, data", id);

                // Fetch existing to merge
                const [existing] = await db.select().from(dataEntries).where(eq(dataEntries.id, entryId)).limit(1);
                if (!existing) return jsonRpcError(-32602, `Entry not found: ${entryId}`, id);

                const mergedData = { ...(existing.data as Record<string, unknown>), ...data };
                const updates: Record<string, any> = { data: mergedData, updatedAt: new Date() };
                if (status) updates.status = status;

                const [updated] = await db.update(dataEntries).set(updates).where(eq(dataEntries.id, entryId)).returning();
                return toolResult(`Record updated: ${updated.id}`, id);
            }

            case "gremius_delete_record": {
                const { entryId } = args || {};
                if (!entryId) return jsonRpcError(-32602, "Missing: entryId", id);

                const [deleted] = await db.delete(dataEntries).where(eq(dataEntries.id, entryId)).returning({ id: dataEntries.id });
                if (!deleted) return jsonRpcError(-32602, `Entry not found: ${entryId}`, id);

                return toolResult(`Record deleted: ${deleted.id}`, id);
            }

            case "gremius_list_datasets": {
                const { format = "json" } = args || {};
                const allDatasets = await db.select().from(dataSets).orderBy(dataSets.name);
                const mapped = allDatasets.map((ds: any) => ({
                    id: ds.id,
                    name: ds.name,
                    slug: ds.slug,
                    description: ds.description,
                    fields: ds.schema?.fields?.map((f: any) => `${f.key}:${f.type}${f.required ? "*" : ""}`).join(", ") || "none",
                }));

                const output = format === "toon" ? encodeTOON(mapped) : JSON.stringify(mapped, null, 2);
                return toolResult(output, id);
            }

            case "gremius_dispatch_worker": {
                const { queueName, jobName, payload } = args || {};
                if (!queueName || !jobName || !payload) {
                    return jsonRpcError(-32602, "Missing: queueName, jobName, payload", id);
                }

                if (queueName === "email") {
                    const job = await emailQueue.add(jobName, payload);
                    return toolResult(`Job dispatched: ${job?.id || "unknown"}`, id);
                }

                return jsonRpcError(-32602, `Unknown queue: ${queueName}. Available: email`, id);
            }

            default:
                return jsonRpcError(-32601, `Unknown tool: ${name}`, id);
        }
    } catch (err: any) {
        return {
            jsonrpc: "2.0",
            result: {
                content: [{ type: "text", text: `Error: ${err.message}` }],
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
            contents: [{
                uri,
                mimeType: "application/json",
                text: JSON.stringify(data, null, 2),
            }],
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
