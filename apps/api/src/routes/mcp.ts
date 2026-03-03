/**
 * MCP (Model Context Protocol) Routes
 * 
 * Expone Gremius hacia agentes de IA (Claude, Cursor, etc.)
 * vía el protocolo estándar MCP sobre SSE (Server-Sent Events)
 * 
 * Endpoints:
 *   GET  /api/mcp      - Conexión SSE para agentes
 *   POST /api/mcp      - Mensajes del agente hacia el servidor
 * 
 * Reference: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { dataSets, dataEntries } from "../db/schema";
import { emailQueue } from "../lib/queue";

const mcpRoutes = new Hono();

// Store active sessions (in production, use Redis)
interface McpSession {
    messageEndpoint: string;
    lastEventId: number;
}

const sessions = new Map<string, McpSession>();

/**
 * GET /api/mcp - SSE Endpoint
 * Los agentes se conectan aquí para recibir eventos del servidor
 * 
 * Protocol flow:
 * 1. Client connects via SSE
 * 2. Server sends endpoint event with message URL
 * 3. Client POSTs initialize message
 * 4. Server responds with capabilities
 */
mcpRoutes.get("/", async (c) => {
    const sessionId = crypto.randomUUID();
    const messageEndpoint = `/api/mcp?sessionId=${sessionId}`;
    
    // Store session
    sessions.set(sessionId, {
        messageEndpoint,
        lastEventId: 0
    });
    
    // Crear stream SSE
    const stream = new ReadableStream({
        start(controller) {
            // Send endpoint event (required by MCP spec)
            const endpointEvent = `event: endpoint\ndata: ${messageEndpoint}\n\n`;
            controller.enqueue(new TextEncoder().encode(endpointEvent));
            
            // Keep connection alive with periodic comments
            const keepAlive = setInterval(() => {
                try {
                    controller.enqueue(new TextEncoder().encode(':keepalive\n\n'));
                } catch {
                    clearInterval(keepAlive);
                }
            }, 30000);
            
            // Clean up on abort
            c.req.raw.signal.addEventListener('abort', () => {
                clearInterval(keepAlive);
                sessions.delete(sessionId);
            });
        },
        cancel() {
            sessions.delete(sessionId);
        }
    });
    
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-MCP-Session': sessionId
        }
    });
});

/**
 * POST /api/mcp - Message Endpoint
 * Los agentes envían comandos JSON-RPC aquí
 * 
 * Supports:
 * - initialize
 * - resources/list, resources/read
 * - tools/list, tools/call
 * - ping
 */
mcpRoutes.post("/", async (c) => {
    const sessionId = c.req.query('sessionId');
    if (!sessionId || !sessions.has(sessionId)) {
        return c.json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Invalid or expired session'
            },
            id: null
        }, 400);
    }
    
    const body = await c.req.json();
    
    try {
        // Handle MCP JSON-RPC messages
        const result = await handleMcpMessage(body);
        return c.json(result);
    } catch (err: any) {
        return c.json({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: err.message
            },
            id: body.id || null
        }, 500);
    }
});

/**
 * Handle MCP JSON-RPC messages
 * Implements MCP protocol 2024-11-05
 */
async function handleMcpMessage(message: any) {
    const { method, params, id } = message;
    
    switch (method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        resources: {
                            listChanged: true
                        },
                        tools: {
                            listChanged: true
                        }
                    },
                    serverInfo: {
                        name: 'gremius-mcp-server',
                        version: '1.0.0'
                    }
                },
                id
            };
            
        case 'initialized':
            // Notification, no response needed
            return null;
            
        case 'ping':
            return {
                jsonrpc: '2.0',
                result: {},
                id
            };
            
        // Resources
        case 'resources/list':
            return {
                jsonrpc: '2.0',
                result: {
                    resources: [
                        {
                            uri: 'gremius://datasets',
                            name: 'Gremius Datasets',
                            mimeType: 'application/json',
                            description: 'List of all active dynamic datasets in the CMS'
                        },
                        {
                            uri: 'gremius://grimoires',
                            name: 'Active Grimoires',
                            mimeType: 'application/json',
                            description: 'List of active core and realm grimoire modules'
                        }
                    ]
                },
                id
            };
            
        case 'resources/read':
            return await readResource(params?.uri, id);
            
        // Tools
        case 'tools/list':
            return {
                jsonrpc: '2.0',
                result: {
                    tools: [
                        {
                            name: 'gremius_query_dataset',
                            description: 'Query records from a dataset with optional filters',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    datasetId: { 
                                        type: 'string',
                                        description: 'UUID of the dataset'
                                    },
                                    limit: { 
                                        type: 'number',
                                        default: 50,
                                        description: 'Maximum records to return (max 100)'
                                    },
                                    status: { 
                                        type: 'string',
                                        description: 'Filter by status: published, draft, archived'
                                    }
                                },
                                required: ['datasetId']
                            }
                        },
                        {
                            name: 'gremius_insert_record',
                            description: 'Insert a new record into a dataset',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    datasetId: { 
                                        type: 'string',
                                        description: 'UUID of the dataset'
                                    },
                                    title: { 
                                        type: 'string',
                                        description: 'Title of the new record'
                                    },
                                    data: { 
                                        type: 'object',
                                        description: 'JSON payload matching the dataset schema'
                                    },
                                    status: { 
                                        type: 'string',
                                        default: 'draft',
                                        description: 'Initial status: published, draft, archived'
                                    }
                                },
                                required: ['datasetId', 'title', 'data']
                            }
                        },
                        {
                            name: 'gremius_dispatch_worker',
                            description: 'Enqueue an asynchronous background job',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    queueName: { 
                                        type: 'string',
                                        description: 'Queue name: email, webhooks, exports'
                                    },
                                    jobName: { 
                                        type: 'string',
                                        description: 'Specific job handler name'
                                    },
                                    payload: { 
                                        type: 'object',
                                        description: 'Job payload data'
                                    }
                                },
                                required: ['queueName', 'jobName', 'payload']
                            }
                        }
                    ]
                },
                id
            };
            
        case 'tools/call':
            return await executeTool(params?.name, params?.arguments, id);
            
        default:
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32601,
                    message: `Method not found: ${method}`
                },
                id
            };
    }
}

/**
 * Read MCP resource content
 */
async function readResource(uri: string, id: string | number) {
    try {
        switch (uri) {
            case 'gremius://datasets': {
                const allDatasets = await db.select().from(dataSets);

                return {
                    jsonrpc: '2.0',
                    result: {
                        contents: [{
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(allDatasets, null, 2)
                        }]
                    },
                    id
                };
            }
                
            case 'gremius://grimoires': {
                // TODO: Populate from actual grimoire registry
                const grimoires = [
                    { name: 'core', status: 'active' },
                    { name: 'realms', status: 'active' }
                ];
                
                return {
                    jsonrpc: '2.0',
                    result: {
                        contents: [{
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(grimoires, null, 2)
                        }]
                    },
                    id
                };
            }
                
            default:
                return {
                    jsonrpc: '2.0',
                    error: {
                        code: -32002,
                        message: `Unknown resource: ${uri}`
                    },
                    id
                };
        }
    } catch (err: any) {
        return {
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: `Resource read failed: ${err.message}`
            },
            id
        };
    }
}

/**
 * Execute MCP tool
 */
async function executeTool(name: string, args: any, id: string | number) {
    try {
        switch (name) {
            case 'gremius_query_dataset': {
                const { datasetId, limit = 50, status } = args || {};
                
                if (!datasetId) {
                    return {
                        jsonrpc: '2.0',
                        error: {
                            code: -32602,
                            message: 'Missing required parameter: datasetId'
                        },
                        id
                    };
                }
                
                let results;
                if (status) {
                    results = await db.select().from(dataEntries)
                        .where(and(
                            eq(dataEntries.dataSetId, datasetId),
                            eq(dataEntries.status, status)
                        ))
                        .limit(Math.min(Number(limit) || 50, 100));
                } else {
                    results = await db.select().from(dataEntries)
                        .where(eq(dataEntries.dataSetId, datasetId))
                        .limit(Math.min(Number(limit) || 50, 100));
                }
                
                return {
                    jsonrpc: '2.0',
                    result: {
                        content: [
                            { 
                                type: 'text', 
                                text: JSON.stringify(results, null, 2) 
                            }
                        ]
                    },
                    id
                };
            }
                
            case 'gremius_insert_record': {
                const { datasetId, title, data, status = 'draft' } = args || {};
                
                if (!datasetId || !title || !data) {
                    return {
                        jsonrpc: '2.0',
                        error: {
                            code: -32602,
                            message: 'Missing required parameters: datasetId, title, data'
                        },
                        id
                    };
                }
                
                const [newRecord] = await db.insert(dataEntries).values({
                    dataSetId: datasetId,
                    title,
                    data,
                    status
                }).returning();
                
                return {
                    jsonrpc: '2.0',
                    result: {
                        content: [
                            { 
                                type: 'text', 
                                text: `Successfully created record: ${newRecord.id}` 
                            }
                        ]
                    },
                    id
                };
            }
                
            case 'gremius_dispatch_worker': {
                const { queueName, jobName, payload } = args || {};
                
                if (!queueName || !jobName || !payload) {
                    return {
                        jsonrpc: '2.0',
                        error: {
                            code: -32602,
                            message: 'Missing required parameters: queueName, jobName, payload'
                        },
                        id
                    };
                }
                
                let jobId: string | null = null;
                
                if (queueName === 'email') {
                    const job = await emailQueue.add(jobName, payload);
                    jobId = job?.id || null;
                } else {
                    // Other queues would be handled here
                    return {
                        jsonrpc: '2.0',
                        error: {
                            code: -32602,
                            message: `Unknown queue: ${queueName}. Available: email`
                        },
                        id
                    };
                }
                
                return {
                    jsonrpc: '2.0',
                    result: {
                        content: [
                            { 
                                type: 'text', 
                                text: jobId 
                                    ? `Job dispatched: ${jobId}` 
                                    : 'Failed to dispatch job' 
                            }
                        ]
                    },
                    id
                };
            }
                
            default:
                return {
                    jsonrpc: '2.0',
                    error: {
                        code: -32601,
                        message: `Unknown tool: ${name}`
                    },
                    id
                };
        }
    } catch (err: any) {
        return {
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: `Tool execution failed: ${err.message}`
            },
            id
        };
    }
}

export { mcpRoutes };
