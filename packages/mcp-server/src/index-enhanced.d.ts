/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENHANCED GRemius MCP Server
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Full MCP server with enhanced tools and resources for AI agents.
 * Uses the new @modelcontextprotocol/sdk McpServer class for easier registration.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
export interface McpServerDependencies {
    db: any;
    schema: {
        dataSets: any;
        dataEntries: any;
    };
    queue: {
        addJob: (queueName: string, jobName: string, payload: any) => Promise<string | null>;
    };
    grimoireRegistry: Record<string, any>;
}
/**
 * Create enhanced MCP server with all tools and resources
 */
export declare function createEnhancedMcpServer(deps: McpServerDependencies): McpServer;
/**
 * Start the enhanced MCP server with stdio transport
 */
export declare function startEnhancedMcpServer(deps: McpServerDependencies): Promise<McpServer>;
export { StdioServerTransport };
export { registerEnhancedTools } from "./tools-enhanced.js";
export { registerProjectContext } from "./project-context.js";
//# sourceMappingURL=index-enhanced.d.ts.map