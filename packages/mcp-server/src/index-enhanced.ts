/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENHANCED Kitsuden MCP Server
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Full MCP server with enhanced tools and resources for AI agents.
 * Uses the new @modelcontextprotocol/sdk McpServer class for easier registration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Import enhanced modules
import { registerProjectContext } from "./project-context.js";
import { registerEnhancedTools } from "./tools-enhanced.js";

import type { McpServerDependencies } from "./index";

/**
 * Create enhanced MCP server with all tools and resources
 */
export function createEnhancedMcpServer(deps: McpServerDependencies): McpServer {
  const server = new McpServer(
    {
      name: "kitsuden-mcp-server",
      version: "2.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Register basic tools
  registerBasicTools(server, deps);

  // Register enhanced tools
  registerEnhancedTools(server, deps);

  // Register project context resources
  registerProjectContext(server, deps);

  return server;
}

/**
 * Register basic CRUD tools (legacy compatible)
 */
function registerBasicTools(server: McpServer, deps: McpServerDependencies) {
  const { db, schema, queue } = deps;

  // Query dataset
  server.registerTool(
    "kitsuden_query_dataset",
    {
      title: "Query Dataset",
      description: "Select and filter records from a specific dataset",
      inputSchema: z.object({
        datasetId: z.string().describe("UUID of the dataset"),
        limit: z.number().optional().describe("Max number of records"),
        status: z.string().optional().describe("Filter by status"),
      }),
      outputSchema: z.any(),
    },
    async ({ datasetId, limit = 50, status }) => {
      const { eq, and } = await import("drizzle-orm");

      let query = db
        .select()
        .from(schema.dataEntries)
        .where(eq(schema.dataEntries.dataSetId, datasetId));

      if (status) {
        query = query.where(
          and(eq(schema.dataEntries.dataSetId, datasetId), eq(schema.dataEntries.status, status))
        );
      }

      const results = await query.limit(Math.min(limit, 100));

      return {
        content: [{ type: "text", text: JSON.stringify(results) }],
      };
    }
  );

  // Insert record
  server.registerTool(
    "kitsuden_insert_record",
    {
      title: "Insert Record",
      description: "Insert a new record into a dataset",
      inputSchema: z.object({
        datasetId: z.string().describe("UUID of the dataset"),
        title: z.string().describe("Title of the record"),
        data: z.record(z.string(), z.any()).describe("JSON payload"),
        status: z.string().default("draft").describe("Initial status"),
      }),
      outputSchema: z.any(),
    },
    async ({ datasetId, title, data, status }) => {
      const [newRecord] = await db
        .insert(schema.dataEntries)
        .values({
          dataSetId: datasetId,
          title,
          data,
          status,
        })
        .returning();

      return {
        content: [
          {
            type: "text",
            text: `Successfully inserted record with ID: ${newRecord.id}`,
          },
        ],
      };
    }
  );

  // Dispatch worker
  server.registerTool(
    "kitsuden_dispatch_worker",
    {
      title: "Dispatch Worker",
      description: "Enqueue an async background job (Postgres queue)",
      inputSchema: z.object({
        queueName: z.string().describe("Queue name"),
        jobName: z.string().describe("Job name"),
        payload: z.record(z.string(), z.any()).describe("Job payload"),
      }),
      outputSchema: z.any(),
    },
    async ({ queueName, jobName, payload }) => {
      try {
        const jobId = await queue.addJob(queueName, jobName, payload);
        return {
          content: [
            {
              type: "text",
              text: `Dispatched job '${jobName}' to '${queueName}' with ID: ${jobId}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed: ${err.message}` }],
        };
      }
    }
  );

  // List datasets resource
  server.registerResource(
    "datasets",
    "kitsuden://datasets",
    {
      title: "Datasets",
      description: "All datasets in the system",
      mimeType: "application/json",
    },
    async (uri) => {
      const allDatasets = await db.select().from(schema.dataSets);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              allDatasets.map((ds: any) => ({
                id: ds.id,
                name: ds.name,
                slug: ds.slug,
                description: ds.description,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Kons resource
  server.registerResource(
    "kons",
    "kitsuden://kons",
    {
      title: "Kons",
      description: "Active kon modules",
      mimeType: "application/json",
    },
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              Object.values(deps.konRegistry || {}).map((g: any) => ({
                id: g.id,
                name: g.name,
                version: g.version,
                mountPath: g.mountPath,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

/**
 * Start the enhanced MCP server with stdio transport
 */
export async function startEnhancedMcpServer(deps: McpServerDependencies) {
  const server = createEnhancedMcpServer(deps);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("Kitsuden MCP Server v2.0.0 started (stdio)");
  console.error(
    "Available resources: kitsuden://datasets, kitsuden://kons, kitsuden://project-context"
  );
  console.error(
    "Enhanced tools: intelligent_query, generate_kon, introspect_schema, batch_operations"
  );

  return server;
}

// Re-export for compatibility
export { StdioServerTransport };
export { registerEnhancedTools } from "./tools-enhanced.js";
export { registerProjectContext } from "./project-context.js";
