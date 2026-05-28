/**
 * Agents Service
 * Servicio para interactuar con el API de agentes
 */

// @ts-ignore - Path alias $lib may not be resolved by tsc
import type { Agent, AgentTrace, AgentTraceStep, AgentIdentity, CreateAgentInput, UpdateAgentInput } from '$lib/types/agents';

const API_BASE = '/api/v1';

// ============== Agents ==============

export async function listAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAgent(id: string): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createAgent(data: CreateAgentInput): Promise<{ agent: Agent; token: string }> {
  const res = await fetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Error creating agent');
  }
  return res.json();
}

export async function updateAgent(id: string, data: UpdateAgentInput): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/agents/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function regenerateToken(agentId: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/token`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ============== Traces ==============

interface ListTracesOptions {
  agentId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export async function listTraces(options: ListTracesOptions = {}): Promise<{ traces: AgentTrace[]; total: number }> {
  const params = new URLSearchParams();
  if (options.agentId) params.set('agentId', options.agentId);
  if (options.sessionId) params.set('sessionId', options.sessionId);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  
  const res = await fetch(`${API_BASE}/traces?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTrace(id: string): Promise<AgentTrace & { steps: AgentTraceStep[] }> {
  const res = await fetch(`${API_BASE}/traces/${id}?expand=steps`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listTraceSteps(traceId: string): Promise<AgentTraceStep[]> {
  const res = await fetch(`${API_BASE}/traces/${traceId}/steps`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ============== Playground ==============

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

export async function sendPlaygroundMessage(
  agentId: string,
  messages: PlaygroundMessage[]
): Promise<PlaygroundResponse> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/playground`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Error in playground');
  }
  return res.json();
}

// ============== Agent Identities ==============

export async function listIdentities(): Promise<AgentIdentity[]> {
  const res = await fetch(`${API_BASE}/identities`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getIdentity(id: string): Promise<AgentIdentity> {
  const res = await fetch(`${API_BASE}/identities/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createIdentity(data: { name: string; systemPrompt: string; description?: string }): Promise<AgentIdentity> {
  const res = await fetch(`${API_BASE}/identities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateIdentity(id: string, data: Partial<{ name: string; systemPrompt: string; description?: string }>): Promise<AgentIdentity> {
  const res = await fetch(`${API_BASE}/identities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteIdentity(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/identities/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(await res.text());
}
