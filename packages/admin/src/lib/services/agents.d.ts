/**
 * Agents Service
 * Servicio para interactuar con el API de agentes
 */
import type { Agent, AgentTrace, AgentTraceStep, AgentIdentity, CreateAgentInput, UpdateAgentInput } from '$lib/types/agents';
export declare function listAgents(): Promise<Agent[]>;
export declare function getAgent(id: string): Promise<Agent>;
export declare function createAgent(data: CreateAgentInput): Promise<{
    agent: Agent;
    token: string;
}>;
export declare function updateAgent(id: string, data: UpdateAgentInput): Promise<Agent>;
export declare function deleteAgent(id: string): Promise<void>;
export declare function regenerateToken(agentId: string): Promise<{
    token: string;
}>;
interface ListTracesOptions {
    agentId?: string;
    sessionId?: string;
    limit?: number;
    offset?: number;
}
export declare function listTraces(options?: ListTracesOptions): Promise<{
    traces: AgentTrace[];
    total: number;
}>;
export declare function getTrace(id: string): Promise<AgentTrace & {
    steps: AgentTraceStep[];
}>;
export declare function listTraceSteps(traceId: string): Promise<AgentTraceStep[]>;
export interface PlaygroundMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface PlaygroundResponse {
    message: string;
    traceId?: string;
    metadata?: {
        tokensIn: number;
        tokensOut: number;
        duration: number;
        toolCalls: string[];
    };
}
export declare function sendPlaygroundMessage(agentId: string, messages: PlaygroundMessage[]): Promise<PlaygroundResponse>;
export declare function listIdentities(): Promise<AgentIdentity[]>;
export declare function getIdentity(id: string): Promise<AgentIdentity>;
export declare function createIdentity(data: {
    name: string;
    systemPrompt: string;
    description?: string;
}): Promise<AgentIdentity>;
export declare function updateIdentity(id: string, data: Partial<{
    name: string;
    systemPrompt: string;
    description?: string;
}>): Promise<AgentIdentity>;
export declare function deleteIdentity(id: string): Promise<void>;
export {};
//# sourceMappingURL=agents.d.ts.map