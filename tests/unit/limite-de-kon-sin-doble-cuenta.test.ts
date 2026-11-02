/**
 * Los `rateLimits` de un kon no se cuentan dos veces (2026-10-19).
 *
 * `applyKonRateLimits` monta `rateLimit()` en la ruta del kon, y la API ya
 * pasa TODA petición de `/api/*` por `globalRateLimit()`. Los dos generaban la
 * misma clave de Valkey (`ratelimit:<ruta>:<cliente>`), así que cada petición
 * dejaba dos entradas en el mismo zset: un kon que declaraba `limit: 4`
 * cortaba a la tercera petición. Ahora el límite del kon cuenta en su propio
 * espacio (`ratelimit:kon:<id>:…`).
 *
 * Valkey es aquí un zset en memoria con las cuatro operaciones que usa el
 * limitador; el middleware y el montaje son los de verdad.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const zsets = new Map<string, Array<{ score: number; value: string }>>();

vi.mock("../../apps/api/src/lib/valkey", () => ({
  // Con Valkey configurado (sin él, el limitador cuenta en memoria del proceso).
  valkeyConfigurado: () => true,
  getValkeyClient: async () => ({
    zRemRangeByScore: async (k: string, _min: number, max: number) => {
      zsets.set(
        k,
        (zsets.get(k) ?? []).filter((e) => e.score > max)
      );
    },
    zCard: async (k: string) => (zsets.get(k) ?? []).length,
    zAdd: async (k: string, e: { score: number; value: string }) => {
      zsets.set(k, [...(zsets.get(k) ?? []), e]);
    },
    pExpire: async () => true,
  }),
}));

const { globalRateLimit } = await import("../../apps/api/src/lib/rate-limiter");
const { applyKonRateLimits } = await import("../../apps/api/src/lib/module-loader");

const desde = (ip: string) => ({ ip: { address: ip, family: "IPv4", port: 4000 } });

function appConKon() {
  const app = new Hono();
  app.use("/api/*", globalRateLimit());
  applyKonRateLimits(
    app,
    { id: "kon-prueba", rateLimits: [{ path: "/enviar", limit: 4, window: 60 }] } as never,
    "/api/prueba"
  );
  app.post("/api/prueba/enviar", (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => zsets.clear());

describe("límites de kon", () => {
  it("un limit: 4 deja pasar 4 peticiones, no 2", async () => {
    const app = appConKon();
    const estados: number[] = [];
    for (let i = 0; i < 5; i++) {
      estados.push(
        (await app.request("/api/prueba/enviar", { method: "POST" }, desde("203.0.113.7"))).status
      );
    }
    expect(estados).toEqual([200, 200, 200, 200, 429]);
  });

  it("el contador del kon y el global son claves distintas, una entrada por petición en cada una", async () => {
    const app = appConKon();
    await app.request("/api/prueba/enviar", { method: "POST" }, desde("203.0.113.8"));
    const claves = [...zsets.keys()].sort();
    expect(claves).toEqual([
      "ratelimit:/api/prueba/enviar:203.0.113.8",
      "ratelimit:kon:kon-prueba:/api/prueba/enviar:203.0.113.8",
    ]);
    for (const k of claves) expect(zsets.get(k)).toHaveLength(1);
  });
});
