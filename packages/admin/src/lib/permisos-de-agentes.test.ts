/**
 * Fase E — el panel habla con las rutas de permisos, claves y cuotas
 * ============================================================================
 *
 * Contrato con routes/permisos-de-agentes.ts (montado en /api/v1, solo admin):
 * métodos, rutas y cuerpos. Y que un 422 de scopes inválidos llega al usuario
 * con el motivo de la API, no con un «HTTP 422» mudo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

const BASE = import.meta.env.VITE_API_URL ?? "";

function respuesta(cuerpo: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => cuerpo } as Response;
}

describe("servicio de permisos de agentes", () => {
  beforeEach(() => vi.resetModules());

  it("cada llamada va a su ruta con su método y su cuerpo", async () => {
    const llamadas: { que: string; cuerpo?: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({
        que: `${init?.method ?? "GET"} ${String(url)}`,
        cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (String(url).endsWith("/keys") && !init?.method) return respuesta({ keys: [{ id: "k1" }] });
      return respuesta({});
    }) as typeof fetch;

    const s = await import("./services/agents");
    await s.getAccessCatalog();
    await s.getAgentAccess("a1");
    await s.setAgentScopes("a1", ["kon:blog:crear-entrada", "!kon:blog:borrar-entrada"]);
    expect(await s.listAgentKeys("a1")).toEqual([{ id: "k1" }]);
    await s.createAgentKey("a1", { name: "ci", expiresInDays: 30 });
    await s.rotateAgentKey("a1", "k1", { graceHours: 24 });
    await s.revokeAgentKey("a1", "k1");
    await s.getAgentQuotas("a1");
    await s.setAgentQuotas("a1", { writesPerDay: 100, budgetUnitsPerDay: null });

    expect(llamadas.map((l) => l.que)).toEqual([
      `GET ${BASE}/api/v1/agent-access/catalog`,
      `GET ${BASE}/api/v1/agents/a1/access`,
      `PUT ${BASE}/api/v1/agents/a1/scopes`,
      `GET ${BASE}/api/v1/agents/a1/keys`,
      `POST ${BASE}/api/v1/agents/a1/keys`,
      `POST ${BASE}/api/v1/agents/a1/keys/k1/rotate`,
      `POST ${BASE}/api/v1/agents/a1/keys/k1/revoke`,
      `GET ${BASE}/api/v1/agents/a1/quotas`,
      `PUT ${BASE}/api/v1/agents/a1/quotas`,
    ]);
    expect(llamadas[2]!.cuerpo).toEqual({ scopes: ["kon:blog:crear-entrada", "!kon:blog:borrar-entrada"] });
    expect(llamadas[4]!.cuerpo).toEqual({ name: "ci", expiresInDays: 30 });
    expect(llamadas[5]!.cuerpo).toEqual({ graceHours: 24 });
    expect(llamadas[8]!.cuerpo).toEqual({ writesPerDay: 100, budgetUnitsPerDay: null });
  });

  it("ajustes MCP: GET y PUT a /mcp-settings con toolset y envoltorio", async () => {
    const llamadas: { que: string; cuerpo: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({ que: `${init?.method ?? "GET"} ${String(url)}`, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      return respuesta({ settings: { toolset: "read", untrustedWrap: "delimiters" }, options: { toolsets: [], kons: [], untrustedWrap: [] } });
    }) as typeof fetch;
    const s = await import("./services/agents");
    await s.getAgentMcpSettings("a1");
    const r = await s.setAgentMcpSettings("a1", { toolset: "read", untrustedWrap: "delimiters" });
    expect(r.settings.untrustedWrap).toBe("delimiters");
    expect(llamadas.map((l) => l.que)).toEqual([
      `GET ${BASE}/api/v1/agents/a1/mcp-settings`,
      `PUT ${BASE}/api/v1/agents/a1/mcp-settings`,
    ]);
    expect(llamadas[1]!.cuerpo).toEqual({ toolset: "read", untrustedWrap: "delimiters" });
  });

  it("un scope inválido trae el motivo de la API", async () => {
    global.fetch = vi.fn(async () =>
      respuesta({ error: "Invalid scope '!admin': '!admin' is not allowed: remove 'admin' instead" }, 422)
    ) as typeof fetch;
    const { setAgentScopes } = await import("./services/agents");
    await expect(setAgentScopes("a1", ["!admin"])).rejects.toThrow(/is not allowed/);
  });
});
