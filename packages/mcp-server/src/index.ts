/**
 * Gremius MCP Server
 * 
 * Model Context Protocol server for AI agents (Claude, Cursor, etc.)
 * to interact with Gremius CMS backend.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    ErrorCode,
    McpError
} from "@modelcontextprotocol/sdk/types.js";

export interface McpServerDependencies {
    db: any;
    schema: {
        dataSets: any;
        dataEntries: any;
    };
    queue: {
        addJob: (queueName: string, jobName: string, payload: any) => Promise<string | null>;
    };
    grimoireRegistry: any[];
}

export function createGremiusMcpServer(deps: McpServerDependencies): Server {
    const server = new Server(
        {
            name: "gremius-mcp-server",
            version: "1.0.0"
        },
        {
            capabilities: {
                resources: {},
                tools: {}
            }
        }
    );

    // Register resource handlers
    registerResourceHandlers(server, deps);
    
    // Register tool handlers
    registerToolHandlers(server, deps);

    return server;
}

function registerResourceHandlers(server: Server, deps: McpServerDependencies) {
    const { db, schema, grimoireRegistry } = deps;

    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: [
                {
                    uri: "gremius://datasets",
                    name: "Gremius Datasets",
                    mimeType: "application/json",
                    description: "List of all active dynamic datasets in the CMS"
                },
                {
                    uri: "gremius://grimoires",
                    name: "Active Grimoires",
                    mimeType: "application/json",
                    description: "List of active core and realm grimoire modules"
                }
            ]
        };
    });

    // Read resource content
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;

        if (uri === "gremius://datasets") {
            const allDatasets = await db.select().from(schema.dataSets);
            const mapped = allDatasets.map((ds: any) => ({
                id: ds.id,
                name: ds.name,
                slug: ds.slug,
                description: ds.description,
                schema: ds.schema
            }));

            return {
                contents: [
                    {
                        uri,
                        mimeType: "application/json",
                        text: JSON.stringify(mapped, null, 2)
                    }
                ]
            };
        }

        if (uri === "gremius://grimoires") {
            return {
                contents: [
                    {
                        uri,
                        mimeType: "application/json",
                        text: JSON.stringify(grimoireRegistry, null, 2)
                    }
                ]
            };
        }

        throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${uri}`
        );
    });
}

function registerToolHandlers(server: Server, deps: McpServerDependencies) {
    const { db, schema, queue } = deps;

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "gremius_query_dataset",
                    description: "Select and filter records from a specific dataset",
                    inputSchema: {
                        type: "object",
                        properties: {
                            datasetId: {
                                type: "string",
                                description: "UUID of the dataset"
                            },
                            limit: {
                                type: "number",
                                description: "Max number of records to return"
                            },
                            status: {
                                type: "string",
                                description: "Filter by status (e.g. 'published', 'draft')"
                            }
                        },
                        required: ["datasetId"]
                    }
                },
                {
                    name: "gremius_insert_record",
                    description: "Insert a new record into a dataset",
                    inputSchema: {
                        type: "object",
                        properties: {
                            datasetId: {
                                type: "string",
                                description: "UUID of the dataset"
                            },
                            title: {
                                type: "string",
                                description: "Title of the new record"
                            },
                            data: {
                                type: "object",
                                description: "JSON payload matching the dataset schema"
                            },
                            status: {
                                type: "string",
                                default: "draft",
                                description: "Initial status of the record"
                            }
                        },
                        required: ["datasetId", "title", "data"]
                    }
                },
                {
                    name: "gremius_dispatch_worker",
                    description: "Enqueue an asynchronous task to Valkey via BullMQ",
                    inputSchema: {
                        type: "object",
                        properties: {
                            queueName: {
                                type: "string",
                                description: "Name of the queue (e.g., 'gremius-email', 'gremius-webhooks')"
                            },
                            jobName: {
                                type: "string",
                                description: "Name of the job inside the queue"
                            },
                            payload: {
                                type: "object",
                                description: "Payload data to send to the worker"
                            }
                        },
                        required: ["queueName", "jobName", "payload"]
                    }
                }
            ]
        };
    });

    // Execute tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case "gremius_query_dataset": {
                    const { datasetId, limit = 50, status } = args as any;
                    const { eq, and } = await import("drizzle-orm");

                    let query = db.select().from(schema.dataEntries)
                        .where(eq(schema.dataEntries.dataSetId, datasetId));

                    if (status) {
                        query = query.where(and(
                            eq(schema.dataEntries.dataSetId, datasetId),
                            eq(schema.dataEntries.status, status)
                        ));
                    }

                    const results = await query.limit(Math.min(limit, 100));

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(results, null, 2)
                            }
                        ]
                    };
                }

                case "gremius_insert_record": {
                    const { datasetId, title, data, status = "draft" } = args as any;

                    const [newRecord] = await db.insert(schema.dataEntries).values({
                        dataSetId: datasetId,
                        title,
                        data,
                        status
                    }).returning();

                    return {
                        content: [
                            {
                                type: "text",
                                text: `Successfully inserted record with ID: ${newRecord.id}`
                            }
                        ]
                    };
                }

                case "gremius_dispatch_worker": {
                    const { queueName, jobName, payload } = args as any;

                    try {
                        const jobId = await queue.addJob(queueName, jobName, payload);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Successfully dispatched job '${jobName}' to queue '${queueName}' with Job ID: ${jobId}`
                                }
                            ]
                        };
                    } catch (err: any) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Failed to dispatch job: ${err.message}`
                                }
                            ],
                            isError: true
                        };
                    }
                }

                default:
                    throw new McpError(
                        ErrorCode.MethodNotFound,
                        `Unknown tool: ${name}`
                    );
            }
        } catch (err: any) {
            throw new McpError(
                ErrorCode.InternalError,
                `Tool execution failed: ${err.message}`
            );
        }
    });
}

// Export for stdio transport (for CLI usage)
export { StdioServerTransport };
