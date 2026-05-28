/**
 * Gremius MCP Server
 *
 * Model Context Protocol server for AI agents (Claude, Cursor, etc.)
 * to interact with Gremius CMS backend.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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
    grimoireRegistry: any[];
}
export declare function createGremiusMcpServer(deps: McpServerDependencies): Server;
export { StdioServerTransport };
//# sourceMappingURL=index.d.ts.map