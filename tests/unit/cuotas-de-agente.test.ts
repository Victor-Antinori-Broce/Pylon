/**
 * Cuotas por agente (fase E): la lógica de contar, sin base ni Valkey reales
 * ============================================================================
 *
 * El recorrido HTTP completo (Valkey real y reserva en Postgres) está en
 * apps/api/src/tests/permisos-finos-de-agentes.test.ts. Aquí: qué se cuenta,
 * cuándo se rechaza, qué `retry_after` sale y que lo rechazado por cuota diaria
 * no se cobra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/api/src/db", () => ({ db: {} }));
vi.mock("../../apps/api/src/db/schema", () => ({ agentQuotaUsage: {} }));
vi.mock("../../apps/api/src/lib/valkey", () => ({
  getValkeyClient: async () => {
    throw new Error("sin valkey en esta prueba");
  },
}));

import {
  consumirCuota,
  consumoDePeticion,
  diaUtc,
  problemaDeCuota,
  segundosHastaMedianocheUtc,
  setValkeyDeCuotas,
  vaciarMemoriaDeCuotas,
} from "../../apps/api/src/lib/cuotas-de-agente";

/** Un Valkey de mentira: INCR/INCRBY/DECRBY/GET/EXPIRE sobre un Map. */
function valkeyFalso() {
  const m = new Map<string, number>();
  return {
    datos: m,
    cliente: {
      incr: async (k: string) => (m.set(k, (m.get(k) ?? 0) + 1), m.get(k)!),
      incrBy: async (k: string, n: number) => (m.set(k, (m.get(k) ?? 0) + n), m.get(k)!),
      decrBy: async (k: string, n: number) => (m.set(k, (m.get(k) ?? 0) - n), m.get(k)!),
      expire: async () => 1,
      get: async (k: string) => (m.has(k) ? String(m.get(k)) : null),
    },
  };
}

const AHORA = Date.UTC(2026, 9, 24, 23, 59, 30); // 30 s antes de medianoche UTC

describe("tiempo", () => {
  it("día UTC y segundos hasta medianoche", () => {
    expect(diaUtc(AHORA)).toBe("2026-10-24");
    expect(segundosHastaMedianocheUtc(AHORA)).toBe(30);
  });
});

describe("consumirCuota con Valkey", () => {
  let v: ReturnType<typeof valkeyFalso>;
  beforeEach(() => {
    v = valkeyFalso();
    setValkeyDeCuotas(async () => v.cliente);
  });

  it("por minuto: el (n+1)-ésimo es KITSUDEN_E_RATE_LIMITED con retry_after hasta el minuto siguiente", async () => {
    const lim = { agentId: "a", rateLimit: 2, writesPerDay: null, budgetUnitsPerDay: null };
    const pedido = { peticion: true, escritura: false, unidades: 0 };
    expect((await consumirCuota(lim, pedido, AHORA)).permitido).toBe(true);
    expect((await consumirCuota(lim, pedido, AHORA)).permitido).toBe(true);
    const r = await consumirCuota(lim, pedido, AHORA);
    expect(r).toMatchObject({ permitido: false, codigo: "KITSUDEN_E_RATE_LIMITED", maximo: 2, retryAfter: 30 });
  });

  it("escrituras del día: rechaza y NO cobra lo rechazado", async () => {
    const lim = { agentId: "b", rateLimit: null, writesPerDay: 1, budgetUnitsPerDay: null };
    const w = { peticion: true, escritura: true, unidades: 1 };
    expect((await consumirCuota(lim, w, AHORA)).permitido).toBe(true);
    const r = await consumirCuota(lim, w, AHORA);
    expect(r).toMatchObject({ permitido: false, codigo: "KITSUDEN_E_QUOTA_EXCEEDED", limite: "writes_per_day" });
    expect(v.datos.get("kitsuden:cuota:b:w:2026-10-24")).toBe(1);
    // Leer no es escribir
    expect((await consumirCuota(lim, { peticion: true, escritura: false, unidades: 1 }, AHORA)).permitido).toBe(true);
  });

  it("presupuesto: suma el coste declarado", async () => {
    const lim = { agentId: "c", rateLimit: null, writesPerDay: null, budgetUnitsPerDay: 10 };
    expect((await consumirCuota(lim, { peticion: true, escritura: false, unidades: 7 }, AHORA)).permitido).toBe(true);
    const r = await consumirCuota(lim, { peticion: true, escritura: false, unidades: 5 }, AHORA);
    expect(r).toMatchObject({ permitido: false, limite: "budget_units_per_day", maximo: 10, retryAfter: 30 });
    expect(v.datos.get("kitsuden:cuota:c:u:2026-10-24")).toBe(7);
  });

  it("el problem+json lleva code, retry_after, quota y limit", () => {
    const p = problemaDeCuota(
      { permitido: false, codigo: "KITSUDEN_E_QUOTA_EXCEEDED", limite: "writes_per_day", maximo: 5, retryAfter: 120 },
      "/api/blog"
    );
    expect(p).toMatchObject({
      status: 429,
      code: "KITSUDEN_E_QUOTA_EXCEEDED",
      retryable: true,
      retry_after: 120,
      quota: "writes_per_day",
      limit: 5,
    });
  });
});

describe("sin Valkey", () => {
  beforeEach(() => {
    vaciarMemoriaDeCuotas();
    setValkeyDeCuotas(async () => null);
  });

  it("el minuto se cuenta en memoria", async () => {
    const lim = { agentId: "d", rateLimit: 1, writesPerDay: null, budgetUnitsPerDay: null };
    const pedido = { peticion: true, escritura: true, unidades: 1 };
    expect((await consumirCuota(lim, pedido, AHORA)).permitido).toBe(true);
    expect((await consumirCuota(lim, pedido, AHORA)).permitido).toBe(false);
    // Otro minuto: vuelve a dejar
    expect((await consumirCuota(lim, pedido, AHORA + 60_000)).permitido).toBe(true);
  });
});

describe("consumoDePeticion", () => {
  it("escrituras por método, y el sobre de MCP solo cuenta el minuto", () => {
    expect(consumoDePeticion("GET", "/api/blog")).toEqual({ peticion: true, escritura: false, unidades: 1 });
    expect(consumoDePeticion("DELETE", "/api/x/1")).toEqual({ peticion: true, escritura: true, unidades: 1 });
    expect(consumoDePeticion("POST", "/api/mcp")).toEqual({ peticion: true, escritura: false, unidades: 0 });
    expect(consumoDePeticion("OPTIONS", "/api/blog").peticion).toBe(false);
  });
});
