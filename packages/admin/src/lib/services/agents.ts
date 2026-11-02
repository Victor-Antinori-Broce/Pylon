/**
 * Agents Service
 * Servicio para interactuar con el API de agentes
 */

import type {
  AccessCatalog,
  AgentAccess,
  AgentApiKey,
  AgentQuotas,
  AgentQuotaLimits,
  AgentMcpSettings,
  UntrustedWrap,
  AgentSponsor,
  Agent,
  AgentTrace,
  AgentTraceStep,
  AgentIdentity,
  CreateAgentInput,
  UpdateAgentInput,
} from "$lib/types/agents";

// Con VITE_API_URL (panel y API en orígenes distintos) una ruta relativa iba al
// servidor del panel y devolvía su index.html con 404.
const RAIZ = import.meta.env.VITE_API_URL ?? "";
/**
 * Agentes, trazas e identidades viven en `/api/v1` (routes/agents-v1.ts), que es
 * el contrato que este servicio espera: listas planas y `{ agent, token }`.
 * Apuntaba a `/api/admin`, que envuelve en `{ success, data }` y no tiene
 * identidades: la pantalla de agentes salía vacía aunque hubiera agentes.
 */
const API_BASE = `${RAIZ}/api/v1`;
/** El chat del playground sí está en /api/admin/agents/:id/chat (agent-playground.ts). */
const API_ADMIN = `${RAIZ}/api/admin`;

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

  if (agentId) params.set("agentId", agentId);

  // /api/v1/traces responde { traces, total }
  const res = await fetchJson<{ traces: AgentTrace[] } | AgentTrace[]>(`${API_BASE}/traces?${params}`);
  return Array.isArray(res) ? res : (res.traces ?? []);
}

export async function getTrace(id: string): Promise<AgentTrace & { steps: AgentTraceStep[] }> {
  return fetchJson<AgentTrace & { steps: AgentTraceStep[] }>(`${API_BASE}/traces/${id}?expand=steps`);
}

export async function listTraceSteps(traceId: string): Promise<AgentTraceStep[]> {
  return fetchJson<AgentTraceStep[]>(`${API_BASE}/traces/${traceId}/steps`);
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
  return fetchJson<PlaygroundResponse>(`${API_ADMIN}/agents/${agentId}/chat`, {
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

// ============== Permisos, claves y cuotas (fase E: routes/permisos-de-agentes.ts) ==============

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Qué se puede conceder: presets, scopes amplios, operaciones por kon y datasets. */
export function getAccessCatalog(): Promise<AccessCatalog> {
  return fetchJson<AccessCatalog>(`${API_BASE}/agent-access/catalog`);
}

/** Lo que este agente puede hacer, ya fusionado (amplio + fino − denegado). */
export function getAgentAccess(agentId: string): Promise<AgentAccess> {
  return fetchJson<AgentAccess>(`${API_BASE}/agents/${agentId}/access`);
}

/** Reemplaza la lista de scopes (la API la valida: 422 con el motivo). */
export function setAgentScopes(agentId: string, scopes: string[]): Promise<AgentAccess> {
  return fetchJson<AgentAccess>(`${API_BASE}/agents/${agentId}/scopes`, { method: "PUT", ...json({ scopes }) });
}

export async function listAgentKeys(agentId: string): Promise<AgentApiKey[]> {
  const r = await fetchJson<{ keys: AgentApiKey[] }>(`${API_BASE}/agents/${agentId}/keys`);
  return r.keys;
}

export function createAgentKey(
  agentId: string,
  data: { name?: string; expiresInDays?: number | null }
): Promise<{ key: AgentApiKey; apiKey: string }> {
  return fetchJson(`${API_BASE}/agents/${agentId}/keys`, { method: "POST", ...json(data) });
}

export function rotateAgentKey(
  agentId: string,
  keyId: string,
  data: { graceHours: number; expiresInDays?: number | null }
): Promise<{ key: AgentApiKey; apiKey: string; previous: AgentApiKey }> {
  return fetchJson(`${API_BASE}/agents/${agentId}/keys/${keyId}/rotate`, { method: "POST", ...json(data) });
}

export function revokeAgentKey(agentId: string, keyId: string): Promise<{ key: AgentApiKey }> {
  return fetchJson(`${API_BASE}/agents/${agentId}/keys/${keyId}/revoke`, { method: "POST", ...json({}) });
}

export function getAgentQuotas(agentId: string): Promise<AgentQuotas> {
  return fetchJson<AgentQuotas>(`${API_BASE}/agents/${agentId}/quotas`);
}

export function setAgentQuotas(agentId: string, limits: Partial<AgentQuotaLimits>): Promise<AgentQuotas> {
  return fetchJson<AgentQuotas>(`${API_BASE}/agents/${agentId}/quotas`, { method: "PUT", ...json(limits) });
}

// ============== Ajustes MCP (toolset y contenido no confiable) ==============

export function getAgentMcpSettings(agentId: string): Promise<AgentMcpSettings> {
  return fetchJson<AgentMcpSettings>(`${API_BASE}/agents/${agentId}/mcp-settings`);
}

/** `toolset: null` = todas las herramientas. */
export function setAgentMcpSettings(
  agentId: string,
  settings: { toolset?: string | null; untrustedWrap?: UntrustedWrap }
): Promise<AgentMcpSettings> {
  return fetchJson<AgentMcpSettings>(`${API_BASE}/agents/${agentId}/mcp-settings`, { method: "PUT", ...json(settings) });
}

// ============== Firmante humano (fase F) ==============

/** Quién firma lo que crea el agente, y quién puede hacerlo (admin o editor). */
export function getAgentSponsor(agentId: string): Promise<AgentSponsor> {
  return fetchJson<AgentSponsor>(`${API_BASE}/agents/${agentId}/sponsor`);
}

/** `null` quita el firmante (el agente vuelve a lo de antes). */
export function setAgentSponsor(agentId: string, userId: string | null): Promise<AgentSponsor> {
  return fetchJson<AgentSponsor>(`${API_BASE}/agents/${agentId}/sponsor`, { method: "PUT", ...json({ userId }) });
}
