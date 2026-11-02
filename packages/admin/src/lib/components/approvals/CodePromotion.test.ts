/**
 * Promoción de código (fase I): el camino de una versión en el panel
 * ============================================================================
 *
 * La pestaña «Promoción de código» de Aprobaciones enseña cada paso (pruebas,
 * escaneo, capacidades, decisión con sus motivos traducidos, vigilancia), deja
 * aprobar o rechazar lo que espera, volver atrás lo activo (con motivo
 * obligatorio) y cambiar el modo de cada agente. Todo contra la API del panel
 * (`/api/approvals/promotion`), con la sesión.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "$lib/i18n";

import CodePromotion from "./CodePromotion.svelte";

vi.mock("$lib/auth.svelte", () => ({ isAdmin: () => true }));
vi.setConfig({ testTimeout: 60_000 });

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/approvals/promotion`;
const ID = "22222222-2222-2222-2222-222222222222";

function version(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    target: { kind: "action", actionId: "a1", slug: "suma", name: "Suma" },
    versionNumber: 3,
    origin: "agent",
    status,
    mode: "turbo",
    agentId: "ag1",
    agentName: "Coder",
    sponsorUserId: null,
    sponsorName: null,
    channel: "mcp",
    description: "sum a and b",
    contentHash: "abcdef0123456789",
    baseHash: "fedcba9876543210",
    parentVersionId: null,
    previousVersionId: "p1",
    capabilities: { scopes: ["datasets:*:read"], fetchAllow: [], timeoutMs: 5000, memoryLimitMb: 64, maxCalls: 50 },
    testCount: 1,
    testReport: {
      total: 2,
      passed: 1,
      failed: 1,
      errored: 0,
      fromTarget: 0,
      durationMs: 400,
      cases: [
        { name: "adds", status: "passed", durationMs: 200, exitReason: "success", error: null, mismatches: [], unmockedCalls: [], logs: "" },
        {
          name: "wrong",
          status: "failed",
          durationMs: 200,
          exitReason: "success",
          error: null,
          mismatches: ["result differs"],
          unmockedCalls: ["GET /api/x"],
          logs: "",
        },
      ],
    },
    scanReport: { passed: true, bytes: 40, findings: [], apiCalls: [], fetchHosts: [], envVars: [] },
    capabilityDiff: {
      newTarget: false,
      scopesAdded: ["datasets:*:read"],
      scopesRemoved: [],
      denialsRemoved: [],
      denialsAdded: [],
      hostsAdded: [],
      hostsRemoved: [],
      limitsIncreased: [],
    },
    decision: { ruta: "proposal", motivos: ["tests_failed", "scope_escalation"], mode: "turbo", turboAllowed: true, touches: [], sensitiveCalls: [] },
    proposal: { id: "pp1", statusUrl: "/api/proposals/pp1" },
    activatedAt: null,
    activatedBy: null,
    watchUntil: null,
    watch: null,
    rolledBackAt: null,
    rolledBackBy: null,
    rollbackReason: null,
    activationError: null,
    createdAt: "2026-10-28T10:00:00.000Z",
    updatedAt: "2026-10-28T10:00:00.000Z",
    ...extra,
  };
}

const ajustes = {
  config: { turboAllowed: false, watchMinutes: 30, minExecutions: 3, maxErrorRate: 0.5 },
  updatedBy: null,
  updatedAt: null,
  approvalsEnabled: false,
  codeActionsEnabled: false,
  agents: [{ id: "ag1", name: "Coder", isActive: true, mode: "turbo", approvalMode: "inherit", canPropose: true }],
};

const respuesta = (cuerpo: unknown) => ({ ok: true, status: 200, statusText: "", json: async () => cuerpo }) as Response;
let pedidas: { metodo: string; url: string; cuerpo?: string; credenciales?: string }[] = [];

function simular(estado: string) {
  pedidas = [];
  let actual = version(estado);
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const metodo = init?.method ?? "GET";
    pedidas.push({ metodo, url: u, cuerpo: init?.body as string | undefined, credenciales: init?.credentials });
    if (u.endsWith("/settings")) return respuesta(ajustes);
    if (u.includes("/agents/")) return respuesta({ agentId: "ag1", mode: "suggestion", previous: "turbo" });
    if (u.endsWith("/approve")) actual = version("active", { activatedAt: "2026-10-28T11:00:00.000Z", activatedBy: "u1", activatedByName: "Ana" });
    if (u.endsWith("/rollback")) actual = version("rolled_back", { rolledBackAt: "2026-10-28T12:00:00.000Z", rollbackReason: "bad" });
    if (u.includes(`/versions/${ID}`)) {
      return respuesta({
        version: { ...actual, code: "return 1;", tests: [] },
        previous: null,
        proposal: { id: "pp1", status: "pending", decidedBy: null, decidedAt: null, comment: null, expiresAt: "2026-11-01T00:00:00.000Z", resultStatus: null, resultError: null },
        events: [{ id: "e1", at: "2026-10-28T10:00:00.000Z", action: "promotion_submitted", by: null, byName: null, success: true, details: {} }],
      });
    }
    return respuesta({ versions: [actual] });
  }) as typeof fetch;
}

describe("promoción de código en el panel", () => {
  afterEach(() => setLocale("en", { recargar: false }));

  it("enseña el camino de una versión y la aprueba con la sesión (en)", async () => {
    setLocale("en", { recargar: false });
    simular("awaiting_approval");
    render(CodePromotion, { props: { initialVersion: ID } });

    await screen.findByTestId("step-tests");
    expect(screen.getByTestId("step-tests").textContent).toContain("1 passed, 1 failed, 0 errored of 2");
    expect(screen.getByTestId("step-tests").textContent).toContain("Calls without a simulated response: GET /api/x");
    expect(screen.getByTestId("code-actions-off")).toBeTruthy();
    const motivos = screen.getAllByTestId("reason").map((n) => n.textContent?.trim());
    expect(motivos).toEqual(["A test failed", "It asks for more scopes than the active version"]);
    expect(screen.getByTestId("promotion-code").textContent).toBe("return 1;");

    await fireEvent.click(screen.getByText("Approve and activate"));
    await waitFor(() => expect(screen.getByTestId("detail-status").textContent?.trim()).toBe("Active"));
    const aprobar = pedidas.find((p) => p.url === `${BASE}/versions/${ID}/approve`);
    expect(aprobar?.metodo).toBe("POST");
    expect(aprobar?.credenciales).toBe("include");
  });

  it("vuelta atrás: exige motivo y lo manda (es)", async () => {
    setLocale("es", { recargar: false });
    simular("active");
    render(CodePromotion, { props: { initialVersion: ID } });
    const zona = await screen.findByTestId("promotion-rollback");
    const boton = zona.querySelector("button")!;
    expect(boton.disabled).toBe(true);
    await fireEvent.input(zona.querySelector("input")!, { target: { value: "falla en producción" } });
    await waitFor(() => expect(boton.disabled).toBe(false));
    await fireEvent.click(boton);
    await waitFor(() => expect(screen.getByTestId("detail-status").textContent?.trim()).toBe("Vuelta atrás"));
    const vuelta = pedidas.find((p) => p.url.endsWith("/rollback"));
    expect(JSON.parse(vuelta!.cuerpo!)).toEqual({ reason: "falla en producción" });
  });

  it("cambia el modo de un agente", async () => {
    setLocale("en", { recargar: false });
    simular("awaiting_approval");
    render(CodePromotion, { props: {} });
    const select = (await screen.findByTestId("promotion-mode-ag1")) as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: "suggestion" } });
    await waitFor(() => expect(pedidas.some((p) => p.metodo === "PUT" && p.url === `${BASE}/agents/ag1/mode`)).toBe(true));
    const put = pedidas.find((p) => p.metodo === "PUT" && p.url.endsWith("/mode"));
    expect(JSON.parse(put!.cuerpo!)).toEqual({ mode: "suggestion" });
  });
});
