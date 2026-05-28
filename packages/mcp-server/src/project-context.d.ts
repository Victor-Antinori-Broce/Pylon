/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROJECT CONTEXT RESOURCE - Full Project State for AI Agents
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides AI agents with complete project understanding including:
 * - Active grimoires and their capabilities
 * - Available endpoints and schemas
 * - Data relationships
 * - Event system
 * - Configuration
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerDependencies } from "./index";
export declare function registerProjectContext(server: McpServer, deps: McpServerDependencies): void;
declare const _default: {
    registerProjectContext: typeof registerProjectContext;
};
export default _default;
//# sourceMappingURL=project-context.d.ts.map