/**
 * OAuth para MCP en el panel: consentimiento y conexiones
 * ============================================================================
 *
 * Contrato con apps/api/src/routes/oauth.ts: la pantalla de consentimiento
 * enseña cliente, redirección (con aviso si es localhost) y agentes; marca de
 * entrada lo que toca; aprobar manda agente + scopes y sigue la redirección;
 * la lista de conexiones revoca. Ver docs/agents/oauth.md.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "$lib/i18n";
import { scopesDeEntrada } from "$lib/services/oauth";

import Conexiones from "../routes/oauth/connections/+page.svelte";
import Consentimiento from "../routes/oauth/consent/+page.svelte";

vi.setConfig({ testTimeout: 60_000 });

vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (v: unknown) => void) {
      run({ url: new URL("http://localhost/oauth/consent?request=11111111-1111-1111-1111-111111111111"), params: {} });
      return () => {};
    },
  },
}));

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/oauth`;
const PETICION = "11111111-1111-1111-1111-111111111111";

function respuesta(cuerpo: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "", json: async () => cuerpo } as Response;
}

const VISTA = {
  request: { id: PETICION, expiresAt: new Date().toISOString(), requestedScopes: ["mcp:connect", "mcp:read"], resource: "http://localhost:3000/api/mcp" },
  client: {
    id: "kc_abc",
    name: "Claude Code",
    kind: "dcr",
    uri: null,
    logoUri: null,
    softwareId: null,
    redirectUri: "http://localhost:33418/callback",
    redirectHost: "localhost:33418",
    localhostRedirect: true,
    registeredAt: new Date().toISOString(),
  },
  human: { id: "u1", role: "admin", canCreateAgent: true },
  basicScopes: ["mcp:connect", "mcp:read", "mcp:write"],
  agents: [
    { id: "a1", name: "Lector", description: null, grantable: ["mcp:connect", "mcp:read", "brain:read"], notDelegable: [], denies: ["!kon:crm:*"], sponsorUserId: null },
  ],
};

describe("scopesDeEntrada", () => {
  it("ticks only what was asked for, and mcp:connect: nothing the client did not request", () => {
    const basicos = ["mcp:connect", "mcp:read", "mcp:write"];
    expect(scopesDeEntrada([], basicos, ["mcp:connect", "brain:read"])).toEqual(["mcp:connect"]);
    expect(scopesDeEntrada(["mcp:connect"], basicos, ["mcp:connect", "admin"])).toEqual(["mcp:connect"]);
    expect(scopesDeEntrada(["mcp:read"], basicos, ["mcp:connect", "mcp:read", "brain:read"])).toEqual(["mcp:connect", "mcp:read"]);
    expect(scopesDeEntrada(["brain:read"], basicos, ["mcp:connect", "mcp:read", "brain:read"])).toEqual(["mcp:connect", "brain:read"]);
    expect(scopesDeEntrada(["admin"], basicos, ["mcp:connect"])).toEqual(["mcp:connect"]);
  });
});

describe("pantalla de consentimiento", () => {
  let destino = "";
  beforeEach(() => {
    setLocale("en", { recargar: false });
    destino = "";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() {
          return destino;
        },
        set href(v: string) {
          destino = v;
        },
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("enseña cliente y aviso de localhost; aprobar manda agente y scopes y redirige", async () => {
    const llamadas: { que: string; cuerpo?: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({ que: `${init?.method ?? "GET"} ${String(url)}`, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      if ((init?.method ?? "GET") === "GET") return respuesta(VISTA);
      return respuesta({ redirectTo: "http://localhost:33418/callback?code=x&state=s&iss=http%3A%2F%2Flocalhost%3A3000" });
    }) as typeof fetch;

    render(Consentimiento);
    await screen.findByText("Connect Claude Code to Kitsuden");
    expect(screen.getByTestId("oauth-localhost-warning").textContent).toContain("localhost:33418");
    expect(screen.getByText(/Always denied for this agent: !kon:crm:\*/)).toBeTruthy();
    // A single agent: selected. What the client did not ask for stays unticked.
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas.map((c) => c.checked)).toEqual([true, true, false]);
    await fireEvent.click(screen.getByText("Allow"));
    await waitFor(() => expect(destino).toContain("code=x"));
    expect(llamadas[0]!.que).toBe(`GET ${BASE}/consent/${PETICION}`);
    expect(llamadas[1]).toEqual({ que: `POST ${BASE}/consent/${PETICION}`, cuerpo: { decision: "approve", agentId: "a1", scopes: ["mcp:connect", "mcp:read"] } });
  });

  it("sin mcp:connect no deja aprobar; denegar manda deny", async () => {
    const llamadas: unknown[] = [];
    global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return respuesta(VISTA);
      llamadas.push(JSON.parse(String(init!.body)));
      return respuesta({ redirectTo: "http://localhost:33418/callback?error=access_denied" });
    }) as typeof fetch;
    render(Consentimiento);
    await screen.findByText("Connect Claude Code to Kitsuden");
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    await fireEvent.click(casillas[0]!); // quitar mcp:connect
    expect((screen.getByText("Allow").closest("button") as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByText("Deny"));
    await waitFor(() => expect(destino).toContain("access_denied"));
    expect(llamadas).toEqual([{ decision: "deny" }]);
  });

  it("una petición caducada lo dice", async () => {
    global.fetch = vi.fn(async () => respuesta({ error: "not found" }, 404)) as typeof fetch;
    render(Consentimiento);
    expect((await screen.findByTestId("oauth-consent-error")).textContent).toContain("expired");
  });
});

describe("conexiones OAuth", () => {
  beforeEach(() => setLocale("en", { recargar: false }));

  it("lista y revoca", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const llamadas: string[] = [];
    let revocada = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (init?.method === "DELETE") {
        revocada = true;
        return respuesta({ revoked: true });
      }
      return respuesta({
        grants: revocada
          ? []
          : [
              {
                id: "g1",
                client: { id: "kc_abc", name: "Claude Code", kind: "dcr", uri: null, logoUri: null },
                agent: { id: "a1", name: "Lector" },
                grantedBy: { id: "u1", name: "Admin", email: null },
                scopes: ["mcp:connect", "mcp:read"],
                createdAt: new Date().toISOString(),
                lastUsedAt: null,
                revokedAt: null,
                revokedReason: null,
              },
            ],
      });
    }) as typeof fetch;
    render(Conexiones);
    await screen.findByText("Claude Code");
    expect(screen.getByText("mcp:connect mcp:read")).toBeTruthy();
    await fireEvent.click(screen.getByText("Revoke"));
    await screen.findByTestId("oauth-connections-empty");
    expect(llamadas).toEqual([`GET ${BASE}/grants`, `DELETE ${BASE}/grants/g1`, `GET ${BASE}/grants`]);
  });
});
