/**
 * Turnos con datos de terceros: toda escritura espera a una persona (auditoría 2026-11-04, F9)
 * ============================================================================
 *
 * Una acción `agent` con datos del evento en el prompt ejecuta el agente con
 * `retenerEscrituras`. Aunque las aprobaciones estén apagadas, una herramienta
 * que escribe se guarda como propuesta en vez de ejecutarse; una que solo lee
 * sigue su regla normal (aquí, ninguna: se ejecuta).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  propuestas: [] as Array<{ camino: string; motivo: string; metodo: string }>,
  escribe: new Set<string>(["kitsuden_delete_record"]),
}));

vi.mock("../../apps/api/src/lib/aprobaciones", () => ({
  ClaveDeIdempotenciaReutilizada: class extends Error {},
  PropuestaNoAdmitida: class extends Error {},
  agentePodriaEjecutar: async () => true,
  calcularDiff: async () => null,
  crearPropuesta: async (p: { camino: string; motivo: string; metodo: string }) => {
    estado.propuestas.push(p);
    return {
      propuesta: { id: "11111111-1111-4111-8111-111111111111", status: "pending", expiresAt: null },
    };
  },
  // Todo apagado: sin `retenerEscrituras` no se retendría nada.
  evaluarHerramientaDelNucleo: () => null,
  evaluarPeticion: () => null,
  instantaneaDeAprobaciones: async () => ({ config: { enabled: false }, modos: new Map() }),
  todoApagado: () => true,
  urlDeEstado: (id: string) => `/api/approvals/proposals/${id}/status`,
  vistaParaAgente: (p: unknown) => p,
}));

vi.mock("../../apps/api/src/services/mcp-tools", () => ({
  herramientaQueEscribe: (n: string) => estado.escribe.has(n),
  puedeIntentarHerramienta: () => true,
}));

vi.mock("@kitsuden/engine", () => ({ listMCPTools: () => [] }));
vi.mock("../../apps/api/src/lib/operaciones-mcp", () => ({ peticionDeHerramienta: () => null }));

import { retenerHerramientaSiHaceFalta } from "../../apps/api/src/lib/aprobaciones-mcp";

const agente = (retenerEscrituras?: boolean) => ({
  agentId: "ag_1",
  agentName: "Triaje",
  apiKeyId: "",
  scopes: ["admin"],
  allowedTools: [],
  retenerEscrituras,
});

describe("retenerEscrituras", () => {
  beforeEach(() => {
    estado.propuestas.length = 0;
  });

  it("sin la marca y con todo apagado, nada se retiene", async () => {
    expect(await retenerHerramientaSiHaceFalta("kitsuden_delete_record", { id: "x" }, agente())).toBeNull();
    expect(estado.propuestas).toHaveLength(0);
  });

  it("con la marca, una herramienta que escribe queda como propuesta", async () => {
    const r = await retenerHerramientaSiHaceFalta("kitsuden_delete_record", { id: "x" }, agente(true));
    expect(r).not.toBeNull();
    expect(JSON.stringify(r)).toContain("KITSUDEN_E_APPROVAL_REQUIRED");
    expect(estado.propuestas).toEqual([
      expect.objectContaining({ camino: "mcp:kitsuden_delete_record", motivo: "propose_only", metodo: "POST" }),
    ]);
  });

  it("con la marca, una que solo lee se ejecuta", async () => {
    expect(await retenerHerramientaSiHaceFalta("kitsuden_query_collection", {}, agente(true))).toBeNull();
    expect(estado.propuestas).toHaveLength(0);
  });
});
