/**
 * OAuth para MCP — lo que usa el panel (consentimiento y conexiones)
 * Contrato con apps/api/src/routes/oauth.ts. Guía: docs/agents/oauth.md.
 */

const RAIZ = import.meta.env.VITE_API_URL ?? "";
const API = `${RAIZ}/api/oauth`;

export interface AgenteElegible {
  id: string;
  name: string;
  description: string | null;
  /** Scopes del agente que este humano puede delegar. */
  grantable: string[];
  /** Scopes del agente que este humano NO puede delegar (un editor no da `admin`). */
  notDelegable: string[];
  /** Denegaciones del agente: se aplican siempre. */
  denies: string[];
  sponsorUserId: string | null;
}

export interface VistaDeConsentimiento {
  request: { id: string; expiresAt: string; requestedScopes: string[]; resource: string };
  client: {
    id: string;
    name: string;
    kind: "dcr" | "cimd";
    uri: string | null;
    logoUri: string | null;
    softwareId: string | null;
    redirectUri: string;
    redirectHost: string;
    localhostRedirect: boolean;
    registeredAt: string;
  };
  human: { id: string; role: string; canCreateAgent: boolean };
  basicScopes: string[];
  agents: AgenteElegible[];
  /** Hay más agentes de los que caben en la lista (se enseñan los más recientes). */
  moreAgents?: boolean;
}

export interface ConexionOAuth {
  id: string;
  client: { id: string; name: string; kind: string; uri: string | null; logoUri: string | null };
  agent: { id: string; name: string };
  grantedBy: { id: string; name: string | null; email: string | null };
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const e = new Error(String(cuerpo.error ?? cuerpo.detail ?? `HTTP ${res.status}`)) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return cuerpo as T;
}

export function leerConsentimiento(idPeticion: string): Promise<VistaDeConsentimiento> {
  return pedir(`${API}/consent/${encodeURIComponent(idPeticion)}`);
}

export interface DecisionDeConsentimiento {
  decision: "approve" | "deny";
  agentId?: string;
  newAgent?: { name: string };
  scopes?: string[];
}

export function decidir(idPeticion: string, d: DecisionDeConsentimiento): Promise<{ redirectTo: string }> {
  return pedir(`${API}/consent/${encodeURIComponent(idPeticion)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
}

export async function listarConexiones(opciones: { agentId?: string; includeRevoked?: boolean } = {}): Promise<ConexionOAuth[]> {
  const q = new URLSearchParams();
  if (opciones.agentId) q.set("agentId", opciones.agentId);
  if (opciones.includeRevoked) q.set("includeRevoked", "true");
  const r = await pedir<{ grants: ConexionOAuth[] }>(`${API}/grants${q.size ? `?${q}` : ""}`);
  return r.grants;
}

export function revocarConexion(id: string): Promise<{ revoked: boolean }> {
  return pedir(`${API}/grants/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * Lo que se marca de entrada: lo que el cliente pidió (lo que el agente tenga)
 * y `mcp:connect`. Nothing it did not ask for: one click on Approve must not give
 * `admin` to a client that only asked to connect. El humano puede marcar más
 * antes de aprobar.
 */
export function scopesDeEntrada(pedidos: string[], _basicos: string[], delegables: string[]): string[] {
  const elegidos = delegables.filter((s) => pedidos.includes(s));
  if (delegables.includes("mcp:connect") && !elegidos.includes("mcp:connect")) elegidos.unshift("mcp:connect");
  return elegidos;
}
