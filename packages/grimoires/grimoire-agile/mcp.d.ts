/**
 * Grimoire Agile — MCP (Model Context Protocol) Tools
 *
 * Expone las capacidades del grimoire como herramientas consumibles
 * por modelos de lenguaje (Claude, Cursor, etc.)
 *
 * @version 1.0.0
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
type Database = NodePgDatabase<any>;
/**
 * Registra las herramientas MCP de Grimoire Agile
 *
 * USO:
 * ```typescript
 * import { registerAgileTools } from "@gremius/grimoire-agile/mcp";
 *
 * registerAgileTools(mcpServer, db);
 * ```
 */
export declare function registerAgileTools(server: any, db: Database): void;
/**
 * Definiciones de herramientas para registro manual
 *
 * Útil si el servidor MCP no usa el método registerTool del SDK
 */
export declare const agileMcpToolDefinitions: ({
    name: string;
    description: string;
    warning: string;
    inputSchema: {
        type: "object";
        properties: {
            projectId: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                default: number;
            };
            stateGroup: {
                type: string;
                enum: string[];
                description: string;
            };
            assigneeId: {
                type: string;
                description: string;
            };
            title?: undefined;
            description?: undefined;
            suggestedType?: undefined;
            suggestedPriority?: undefined;
            payload?: undefined;
            source?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    warning: string;
    inputSchema: {
        type: "object";
        properties: {
            projectId: {
                type: string;
                description: string;
            };
            title: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            suggestedType: {
                type: string;
                enum: string[];
                description: string;
                default: string;
            };
            suggestedPriority: {
                type: string;
                enum: string[];
                description: string;
                default: string;
            };
            payload: {
                type: string;
                description: string;
                additionalProperties: boolean;
                properties: {};
                examples: ({
                    errorLog: string;
                    confidence: number;
                    endpoint?: undefined;
                    method?: undefined;
                    statusCode?: undefined;
                    screenshot?: undefined;
                    browser?: undefined;
                    os?: undefined;
                } | {
                    endpoint: string;
                    method: string;
                    statusCode: number;
                    errorLog?: undefined;
                    confidence?: undefined;
                    screenshot?: undefined;
                    browser?: undefined;
                    os?: undefined;
                } | {
                    screenshot: string;
                    browser: string;
                    os: string;
                    errorLog?: undefined;
                    confidence?: undefined;
                    endpoint?: undefined;
                    method?: undefined;
                    statusCode?: undefined;
                })[];
            };
            source: {
                type: string;
                description: string;
                default: string;
            };
            limit?: undefined;
            stateGroup?: undefined;
            assigneeId?: undefined;
        };
        required: string[];
    };
})[];
/**
 * Handlers para ejecución manual de las herramientas
 *
 * Útil para integración con el servidor MCP existente
 */
export declare function executeAgileTool(name: string, args: any, db: Database): Promise<{
    content: any[];
    isError?: boolean;
}>;
export {};
//# sourceMappingURL=mcp.d.ts.map