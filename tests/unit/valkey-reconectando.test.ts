/**
 * Valkey que se cae DESPUÉS de conectar (2026-10-19).
 *
 * El cliente de node-redis sigue con `isOpen = true` mientras reconecta, y
 * `getValkeyClient()` lo devolvía igual: cada comando se quedaba en la cola de
 * espera hasta que Valkey volviera. Medido en un contenedor: con Valkey
 * parado, `/api/version` —que no usa ni base ni caché, solo pasa por el
 * limitador— no respondía nunca; bun cerraba la conexión a los ~10 s. Ni el
 * fallo abierto del limitador ni el cerrado llegaban a ejecutarse.
 */
import { describe, expect, it, vi } from "vitest";

// Valkey CONFIGURADO (sin URL no se intenta conectar: modo de instancia única).
vi.hoisted(() => {
  process.env.VALKEY_URL ??= "redis://localhost:6379";
});

const opciones: unknown[] = [];
const cliente = {
  isOpen: false,
  isReady: false,
  on: () => {},
  connect: async () => {
    cliente.isOpen = true;
    cliente.isReady = true;
  },
  disconnect: () => Promise.resolve(),
};

vi.mock("../../apps/api/node_modules/redis", () => ({
  createClient: (o: unknown) => {
    opciones.push(o);
    return cliente;
  },
}));

describe("getValkeyClient con la conexión caída a mitad", () => {
  it("con el cliente reconectando rechaza al momento en vez de devolverlo", async () => {
    const { getValkeyClient } = await import("../../apps/api/src/lib/valkey");
    expect(await getValkeyClient()).toBe(cliente);

    // Valkey se cae: el cliente sigue «abierto» pero ya no está listo
    cliente.isReady = false;
    const t = Date.now();
    await expect(getValkeyClient()).rejects.toThrow(/reconnecting/);
    expect(Date.now() - t).toBeLessThan(100);
    expect(opciones).toHaveLength(1); // no abre otro cliente encima

    // Vuelve: se usa el mismo cliente
    cliente.isReady = true;
    expect(await getValkeyClient()).toBe(cliente);
  });

  it("los comandos no esperan en cola con la conexión caída", () => {
    expect(opciones[0]).toMatchObject({ disableOfflineQueue: true });
  });
});
