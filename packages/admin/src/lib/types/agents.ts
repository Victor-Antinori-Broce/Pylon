/**
 * Agent Types
 * Tipos para el sistema de agentes AI
 */

// ============== Base Types ==============

export type AgentStatus = "active" | "paused" | "error";
export type TraceStatus = "running" | "completed" | "error";
export type StepType = "thinking" | "tool_call" | "tool_result" | "system" | "error";

// ============== Agent ==============

export interface Agent {
  id: string;
  name: string;
  description?: string;
  identityId?: string;
  model: string;
  config?: Record<string, unknown>;
  enabled: boolean;
  status: AgentStatus;
  tokenHash?: string;
  createdAt: string;
  updatedAt: string;
  // Aggregated data
  totalTraces?: number;
  totalTokens?: number;
  lastActiveAt?: string;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  identityId?: string;
  model: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  identityId?: string;
  model?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  status?: AgentStatus;
}

// ============== Agent Identity ==============

export interface AgentIdentity {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  tools: string[];
  createdAt: string;
  updatedAt: string;
}

// ============== Agent Trace ==============

export interface AgentTrace {
  id: string;
  agentId: string;
  agentName?: string;
  sessionId?: string;
  status: TraceStatus;
  totalTokens: number;
  totalDurationMs: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  // Expanded
  steps?: AgentTraceStep[];
}

// ============== Agent Trace Step ==============

export interface AgentTraceStep {
  id: string;
  traceId: string;
  stepType: StepType;
  content: Record<string, unknown>;
  tokensUsed: number;
  latencyMs: number;
  createdAt: string;
}

// ============== API Request/Response Types ==============

export interface CreateAgentResponse {
  agent: Agent;
  token: string;
}

export interface ListTracesResponse {
  traces: AgentTrace[];
  total: number;
  limit: number;
  offset: number;
}

export interface PlaygroundMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PlaygroundRequest {
  messages: PlaygroundMessage[];
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

// ============== Component Props ==============

export interface TimelineProps {
  steps: AgentTraceStep[];
  class?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: {
    tokensIn?: number;
    tokensOut?: number;
    duration?: number;
    toolCalls?: string[];
  };
}

export interface ChatInterfaceProps {
  messages: ChatMessage[];
  loading?: boolean;
  agentName?: string;
  onSend: (message: string) => void;
}
