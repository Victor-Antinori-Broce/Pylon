/**
 * Fase F — el panel habla con la aprobación humana
 * ============================================================================
 *
 * Contrato con apps/api/src/routes/aprobaciones.ts (/api/approvals): métodos,
 * rutas y cuerpos; un 403/409 llega al usuario con el motivo de la API; y el
 * contador del menú no se rompe si la API falla.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

const BASE = import.meta.env.VITE_API_URL ?? "";

function respuesta(cuerpo: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => cuerpo } as Response;
}

describe("servicio de aprobaciones", () => {
  beforeEach(() => vi.resetModules());

  it("cada llamada va a su ruta con su método y su cuerpo", async () => {
    const llamadas: { que: string; cuerpo?: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({
        que: `${init?.method ?? "GET"} ${String(url)}`,
        cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (String(url).endsWith("/count")) return respuesta({ pending: 3 });
      return respuesta({ proposals: [], total: 0, events: [] });
    }) as typeof fetch;

    const s = await import("./services/approvals");
    await s.listProposals({ status: "pending", limit: 100 });
    expect(await s.countPendingProposals()).toBe(3);
    await s.getProposal("p1");
    await s.approveProposal("p1", "ok");
    await s.rejectProposal("p2");
    await s.getApprovalSettings();
    await s.saveApprovalSettings({ enabled: true, operations: { "kon:blog:borrar-entrada": null } });
    await s.setAgentApprovalMode("a1", "propose");
    await s.listApprovalAudit({ proposalId: "p1", limit: 50 });

    expect(llamadas.map((l) => l.que)).toEqual([
      `GET ${BASE}/api/approvals/proposals?status=pending&limit=100`,
      `GET ${BASE}/api/approvals/proposals/count`,
      `GET ${BASE}/api/approvals/proposals/p1`,
      `POST ${BASE}/api/approvals/proposals/p1/approve`,
      `POST ${BASE}/api/approvals/proposals/p2/reject`,
      `GET ${BASE}/api/approvals/settings`,
      `PUT ${BASE}/api/approvals/settings`,
      `PUT ${BASE}/api/approvals/agents/a1/mode`,
      `GET ${BASE}/api/approvals/audit?proposalId=p1&limit=50`,
    ]);
    expect(llamadas[3]!.cuerpo).toEqual({ comment: "ok" });
    expect(llamadas[4]!.cuerpo).toEqual({});
    expect(llamadas[6]!.cuerpo).toEqual({ enabled: true, operations: { "kon:blog:borrar-entrada": null } });
    expect(llamadas[7]!.cuerpo).toEqual({ mode: "propose" });
  });

  it("firmante del agente: GET y PUT a su ruta, null lo quita", async () => {
    const llamadas: string[] = [];
    const cuerpos: unknown[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (init?.body) cuerpos.push(JSON.parse(String(init.body)));
      return respuesta({ sponsor: null, candidates: [] });
    }) as typeof fetch;
    const s = await import("./services/agents");
    await s.getAgentSponsor("a1");
    await s.setAgentSponsor("a1", "u1");
    await s.setAgentSponsor("a1", null);
    expect(llamadas).toEqual([
      `GET ${BASE}/api/v1/agents/a1/sponsor`,
      `PUT ${BASE}/api/v1/agents/a1/sponsor`,
      `PUT ${BASE}/api/v1/agents/a1/sponsor`,
    ]);
    expect(cuerpos).toEqual([{ userId: "u1" }, { userId: null }]);
  });

  it("un 409 o un 403 llega con el motivo de la API", async () => {
    global.fetch = vi.fn(async () =>
      respuesta({ error: "Conflict", message: "Proposal is executed" }, 409)
    ) as typeof fetch;
    const s = await import("./services/approvals");
    await expect(s.approveProposal("p1")).rejects.toThrow("Proposal is executed");
  });

  it("el contador del menú se queda con el último valor si la API falla", async () => {
    let falla = false;
    global.fetch = vi.fn(async () => (falla ? respuesta({}, 500) : respuesta({ pending: 2 }))) as typeof fetch;
    const { aprobaciones } = await import("./states/aprobaciones.svelte");
    await aprobaciones.refrescar();
    expect(aprobaciones.pendientes).toBe(2);
    falla = true;
    await aprobaciones.refrescar();
    expect(aprobaciones.pendientes).toBe(2);
  });
});
