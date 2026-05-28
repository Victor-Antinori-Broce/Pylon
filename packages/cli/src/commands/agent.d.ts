/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AGENT COMMANDS - AI-Friendly CLI Operations
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Commands for AI agents to:
 * - Generate grimoires from descriptions
 * - Validate code
 * - Debug MCP connection
 * - Initialize project context
 */
export declare function createGrimoire(name: string, options: {
    description?: string;
    features?: string[];
    dataModel?: string;
    output?: string;
}): Promise<void>;
export declare function validateCode(options: {
    grimoire?: string;
    typecheck?: boolean;
    lint?: boolean;
    security?: boolean;
    fix?: boolean;
}): Promise<void>;
export declare function debugMcp(options: {
    token?: string;
    url?: string;
}): Promise<void>;
export declare function initAgent(options: {
    editor?: string;
    force?: boolean;
}): Promise<void>;
export declare function generateSdk(options: {
    grimoire?: string;
    language: "typescript" | "python" | "go" | "java" | "php";
    output: string;
}): Promise<void>;
declare const _default: {
    createGrimoire: typeof createGrimoire;
    validateCode: typeof validateCode;
    debugMcp: typeof debugMcp;
    initAgent: typeof initAgent;
    generateSdk: typeof generateSdk;
};
export default _default;
//# sourceMappingURL=agent.d.ts.map