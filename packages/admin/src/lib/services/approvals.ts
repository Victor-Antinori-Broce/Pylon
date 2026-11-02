/**
 * Aprobación humana (fase F): bandeja, decisiones, configuración y auditoría.
 * La API está en apps/api/src/routes/aprobaciones.ts; la guía en
 * docs/agents/approvals.md.
 */

import type {
  ApprovalAuditEvent,
  ApprovalConfig,
  ApprovalMode,
  ApprovalSettings,
  Proposal,
  ProposalDetail,
  ProposalStatus,
} from "$lib/types/approvals";

const RAIZ = import.meta.env.VITE_API_URL ?? "";
const BASE = `${RAIZ}/api/approvals`;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || error.detail || error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function listProposals(
  filtro: { status?: ProposalStatus | ""; agentId?: string; limit?: number; offset?: number } = {}
): Promise<{ total: number; proposals: Proposal[] }> {
  const q = new URLSearchParams();
  if (filtro.status) q.set("status", filtro.status);
  if (filtro.agentId) q.set("agentId", filtro.agentId);
  if (filtro.limit) q.set("limit", String(filtro.limit));
  if (filtro.offset) q.set("offset", String(filtro.offset));
  const qs = q.toString();
  return fetchJson(`${BASE}/proposals${qs ? `?${qs}` : ""}`);
}

export async function countPendingProposals(): Promise<number> {
  const r = await fetchJson<{ pending: number }>(`${BASE}/proposals/count`);
  return r.pending;
}

export function getProposal(id: string): Promise<ProposalDetail> {
  return fetchJson(`${BASE}/proposals/${id}`);
}

/**
 * La miniatura de una imagen retenida, como URL `blob:` (la ruta exige la
 * sesión del equipo y la API puede estar en otro origen: un `<img src>`
 * directo no siempre lleva la cookie). Quien la pide la libera con
 * `URL.revokeObjectURL`.
 */
export async function proposalFileUrl(proposalId: string, fileId: string): Promise<string> {
  const res = await fetch(`${BASE}/proposals/${proposalId}/files/${fileId}`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

export function approveProposal(id: string, comment?: string): Promise<{ proposal: ProposalDetail }> {
  return fetchJson(`${BASE}/proposals/${id}/approve`, { method: "POST", ...json(comment ? { comment } : {}) });
}

export function rejectProposal(id: string, comment?: string): Promise<{ proposal: ProposalDetail }> {
  return fetchJson(`${BASE}/proposals/${id}/reject`, { method: "POST", ...json(comment ? { comment } : {}) });
}

export function getApprovalSettings(): Promise<ApprovalSettings> {
  return fetchJson(`${BASE}/settings`);
}

/** Cambio parcial; en `operations`, `null` vuelve a lo que declara el kon. */
export function saveApprovalSettings(
  cambio: Partial<Omit<ApprovalConfig, "operations">> & { operations?: Record<string, boolean | null> }
): Promise<ApprovalSettings> {
  return fetchJson(`${BASE}/settings`, { method: "PUT", ...json(cambio) });
}

export function setAgentApprovalMode(
  agentId: string,
  mode: ApprovalMode
): Promise<{ agentId: string; mode: ApprovalMode; previous: string }> {
  return fetchJson(`${BASE}/agents/${agentId}/mode`, { method: "PUT", ...json({ mode }) });
}

export function listApprovalAudit(
  filtro: { agentId?: string; proposalId?: string; limit?: number } = {}
): Promise<{ total: number; events: ApprovalAuditEvent[] }> {
  const q = new URLSearchParams();
  if (filtro.agentId) q.set("agentId", filtro.agentId);
  if (filtro.proposalId) q.set("proposalId", filtro.proposalId);
  if (filtro.limit) q.set("limit", String(filtro.limit));
  const qs = q.toString();
  return fetchJson(`${BASE}/audit${qs ? `?${qs}` : ""}`);
}
