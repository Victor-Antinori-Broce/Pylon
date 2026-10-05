/**
 * Agents Service
 * Servicio para interactuar con el API de agentes
 */

import type {
  Agent,
  AgentTrace,
  AgentTraceStep,
  AgentIdentity,
  CreateAgentInput,
  UpdateAgentInput,
} from "$lib/types/agents";

const API_BASE = "/api/admin";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ============== Agents ==============

export async function listAgents(): Promise<Agent[]> {
  return fetchJson<Agent[]>(`${API_BASE}/agents`);
}

export async function getAgent(id: string): Promise<Agent> {
  return fetchJson<Agent>(`${API_BASE}/agents/${id}`);
}

export async function createAgent(
  data: CreateAgentInput
): Promise<{ agent: Agent; token: string }> {
  return fetchJson<{ agent: Agent; token: string }>(`${API_BASE}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateAgent(id: string, data: UpdateAgentInput): Promise<Agent> {
  return fetchJson<Agent>(`${API_BASE}/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/agents/${id}`, { method: "DELETE" });
}

export async function regenerateToken(agentId: string): Promise<{ token: string }> {
  return fetchJson<{ token: string }>(`${API_BASE}/agents/${agentId}/token`, {
    method: "POST",
  });
}

// ============== Traces ==============

interface ListTracesOptions {
  agentId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export async function listTraces(options: ListTracesOptions = {}): Promise<AgentTrace[]> {
  const { agentId, sessionId, limit = 20, offset = 0 } = options;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (sessionId) params.set("sessionId", sessionId);

  if (agentId) {
    return fetchJson<AgentTrace[]>(`${API_BASE}/agents/${agentId}/traces?${params}`);
  }

  return fetchJson<AgentTrace[]>(`/api/v1/traces?${params}`);
}

export async function getTrace(id: string): Promise<AgentTrace & { steps: AgentTraceStep[] }> {
  return fetchJson<AgentTrace & { steps: AgentTraceStep[] }>(`/api/v1/traces/${id}?expand=steps`);
}

export async function listTraceSteps(traceId: string): Promise<AgentTraceStep[]> {
  return fetchJson<AgentTraceStep[]>(`${API_BASE}/agents/traces/${traceId}/steps`);
}

// ============== Playground ==============

export interface PlaygroundMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PlaygroundResponse {
  success: boolean;
  response: string;
  traceId: string;
  sessionId: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  cached: boolean;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; result: string }>;
}

export async function sendPlaygroundMessage(
  agentId: string,
  message: string,
  sessionId?: string
): Promise<PlaygroundResponse> {
  return fetchJson<PlaygroundResponse>(`${API_BASE}/agents/${agentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      sessionId,
      enableMemory: true,
      enableBrainSearch: true,
    }),
  });
}

// ============== Agent Identities ==============

export async function listIdentities(): Promise<AgentIdentity[]> {
  return fetchJson<AgentIdentity[]>(`${API_BASE}/identities`);
}

export async function getIdentity(id: string): Promise<AgentIdentity> {
  return fetchJson<AgentIdentity>(`${API_BASE}/identities/${id}`);
}

export async function createIdentity(data: {
  name: string;
  systemPrompt: string;
  description?: string;
}): Promise<AgentIdentity> {
  return fetchJson<AgentIdentity>(`${API_BASE}/identities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateIdentity(
  id: string,
  data: Partial<{ name: string; systemPrompt: string; description?: string }>
): Promise<AgentIdentity> {
  return fetchJson<AgentIdentity>(`${API_BASE}/identities/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteIdentity(id: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/identities/${id}`, { method: "DELETE" });
}
