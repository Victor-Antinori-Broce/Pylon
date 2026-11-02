/**
 * Pub/Sub sin Valkey (kitsuden2.md B1b): lo publicado llega a los
 * suscriptores de ESTE proceso (y, por NOTIFY, a las demás réplicas). Antes,
 * con Valkey caído, `publish` solo dejaba un aviso y el tiempo real se callaba.
 */

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  delete process.env.VALKEY_URL;
  delete process.env.REDIS_URL;
});

const escuchados = vi.hoisted(() => [] as string[]);
vi.mock("../../apps/api/src/lib/escucha-postgres", () => ({
  escuchar: async (canal: string) => {
    escuchados.push(canal);
    return async () => {};
  },
}));
// El NOTIFY a otras réplicas: aquí no hay base; se comprueba que no rompe.
vi.mock("../../apps/api/src/db", () => ({
  db: { execute: async () => ({ rows: [] }) },
  isPgMem: false,
  isLiteMode: false,
}));

const { publish, subscribe, valkeyConfigurado } = await import("../../apps/api/src/lib/valkey");

describe("bus sin Valkey", () => {
  it("sin URL no hay Valkey configurado", () => {
    expect(valkeyConfigurado()).toBe(false);
  });

  it("entrega en el proceso por patrón y escucha el canal de Postgres", async () => {
    const recibidos: Array<[string, string]> = [];
    const quitar = await subscribe("table:*", (canal, msg) => recibidos.push([canal, msg]));
    await publish("table:abc", { op: "insert" });
    await publish("entry:xyz", { op: "update" });
    expect(recibidos).toEqual([["table:abc", JSON.stringify({ op: "insert" })]]);
    expect(escuchados).toContain("kitsuden_bus");
    await quitar();
    await publish("table:abc", { op: "delete" });
    expect(recibidos).toHaveLength(1);
  });
});
