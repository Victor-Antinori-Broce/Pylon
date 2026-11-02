/**
 * Valkey caído no puede costar un timeout por llamada (2026-10-18).
 *
 * Cada `getValkeyClient()` abría un cliente nuevo y esperaba ~2 s a que
 * fallara; una petición pasa por varias llamadas (limitador, caché, sesión) y,
 * medido en un contenedor con Valkey parado, `/api/*` superaba el idleTimeout
 * de bun: la conexión se cerraba SIN respuesta (ni 429 ni 503). Ahora tras un
 * fallo se rechaza al momento durante unos segundos y los intentos simultáneos
 * comparten la misma conexión en curso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Valkey CONFIGURADO (sin URL no se intenta conectar: modo de instancia única).
vi.hoisted(() => {
  process.env.VALKEY_URL ??= "redis://localhost:6379";
});

const creados: number[] = [];

// `redis` es dependencia de apps/api, no de la raíz: se mockea por su ruta.
vi.mock("../../apps/api/node_modules/redis", () => ({
  createClient: () => {
    creados.push(Date.now());
    return {
      isOpen: false,
      on: () => {},
      // Nunca conecta: como un host que no contesta.
      connect: () => new Promise(() => {}),
      disconnect: () => Promise.resolve(),
    };
  },
}));

afterEach(() => {
  vi.useRealTimers();
});

describe("getValkeyClient con Valkey caído", () => {
  it("las llamadas simultáneas comparten UN intento, y tras fallar se rechaza al momento", async () => {
    vi.useFakeTimers();
    const { getValkeyClient } = await import("../../apps/api/src/lib/valkey");

    const a = getValkeyClient();
    const b = getValkeyClient();
    const fallos = Promise.allSettled([a, b]);
    await vi.advanceTimersByTimeAsync(2_100);
    const [ra, rb] = await fallos;
    expect(ra.status).toBe("rejected");
    expect(rb.status).toBe("rejected");
    expect(creados).toHaveLength(1);

    // Dentro de la ventana: sin cliente nuevo y sin esperar al timeout.
    await expect(getValkeyClient()).rejects.toThrow(/recent connection failure/);
    expect(creados).toHaveLength(1);

    // Pasada la ventana se vuelve a intentar.
    await vi.advanceTimersByTimeAsync(5_100);
    const otra = getValkeyClient();
    const resultado = Promise.allSettled([otra]);
    await vi.advanceTimersByTimeAsync(2_100);
    await resultado;
    expect(creados).toHaveLength(2);
  });
});
