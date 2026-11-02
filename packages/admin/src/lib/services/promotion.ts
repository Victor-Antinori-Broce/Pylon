/**
 * Promoción de código (fase I): versiones, decisiones, vuelta atrás y
 * configuración. La API está en apps/api/src/routes/promocion.ts; la guía en
 * docs/agents/promotion.md.
 */

import type {
  CodeVersion,
  CodeVersionDetail,
  PromotionConfig,
  PromotionMode,
  PromotionSettings,
  VersionStatus,
} from "$lib/types/promotion";

const RAIZ = import.meta.env.VITE_API_URL ?? "";
const BASE = `${RAIZ}/api/approvals/promotion`;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    const detalle = error?.error && typeof error.error === "object" ? error.error.message : null;
    throw new Error(detalle || error.message || error.detail || (typeof error.error === "string" ? error.error : "") || `HTTP ${res.status}`);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function getPromotionSettings(): Promise<PromotionSettings> {
  return fetchJson(`${BASE}/settings`);
}

export function savePromotionSettings(cambio: Partial<PromotionConfig>): Promise<PromotionSettings> {
  return fetchJson(`${BASE}/settings`, { method: "PUT", ...json(cambio) });
}

export function setAgentPromotionMode(
  agentId: string,
  mode: PromotionMode
): Promise<{ agentId: string; mode: PromotionMode; previous: string }> {
  return fetchJson(`${BASE}/agents/${agentId}/mode`, { method: "PUT", ...json({ mode }) });
}

export function listCodeVersions(
  filtro: { status?: VersionStatus | ""; slug?: string; agentId?: string; limit?: number } = {}
): Promise<{ versions: CodeVersion[] }> {
  const q = new URLSearchParams();
  if (filtro.status) q.set("status", filtro.status);
  if (filtro.slug) q.set("slug", filtro.slug);
  if (filtro.agentId) q.set("agentId", filtro.agentId);
  if (filtro.limit) q.set("limit", String(filtro.limit));
  const qs = q.toString();
  return fetchJson(`${BASE}/versions${qs ? `?${qs}` : ""}`);
}

export function getCodeVersion(id: string): Promise<CodeVersionDetail> {
  return fetchJson(`${BASE}/versions/${id}`);
}

export function approveCodeVersion(id: string, comment?: string): Promise<CodeVersionDetail> {
  return fetchJson(`${BASE}/versions/${id}/approve`, { method: "POST", ...json(comment ? { comment } : {}) });
}

export function rejectCodeVersion(id: string, comment?: string): Promise<CodeVersionDetail> {
  return fetchJson(`${BASE}/versions/${id}/reject`, { method: "POST", ...json(comment ? { comment } : {}) });
}

export function rollbackCodeVersion(id: string, reason: string): Promise<CodeVersionDetail> {
  return fetchJson(`${BASE}/versions/${id}/rollback`, { method: "POST", ...json({ reason }) });
}

export function activateCodeVersion(id: string): Promise<CodeVersionDetail> {
  return fetchJson(`${BASE}/versions/${id}/activate`, { method: "POST" });
}
