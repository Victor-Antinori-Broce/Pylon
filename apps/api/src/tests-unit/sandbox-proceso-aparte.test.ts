/**
 * Acciones de código: proceso aparte, sin los secretos de la API
 * ============================================================================
 *
 * Auditoría 2026-10-25: el sandbox era un Worker del mismo proceso y el código
 * de la acción leía `globalThis.process.env` (todos los secretos) y lanzaba
 * comandos. Ahora corre en un proceso hijo con el entorno vacío, con tiempo
 * máximo, y en producción viene apagado salvo `ENABLE_CODE_ACTIONS=true`.
 * Desde 2026-10-26 el código corre además dentro de QuickJS (WASM): las pruebas
 * de ataque están en sandbox-hostil.test.ts.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { accionesDeCodigoHabilitadas, executeSandbox } from "../lib/worker-sandbox";

const base = { payload: { hola: "mundo" }, envVars: {}, timeoutMs: 5000, memoryLimitMb: 64 };
const nodeEnv = process.env.NODE_ENV;
const interruptor = process.env.ENABLE_CODE_ACTIONS;

afterEach(() => {
  process.env.NODE_ENV = nodeEnv;
  if (interruptor === undefined) delete process.env.ENABLE_CODE_ACTIONS;
  else process.env.ENABLE_CODE_ACTIONS = interruptor;
});

describe("sandbox de acciones de código", () => {
  test("devuelve el resultado y el evento llega", async () => {
    const r = await executeSandbox({ ...base, code: "console.log('x'); return { eco: event.hola, n: 1 + 1 };" });
    expect(r.error).toBeNull();
    expect(r.result).toEqual({ eco: "mundo", n: 2 });
    expect(r.logs).toContain("[LOG] x");
  });

  test("los secretos del proceso de la API no llegan al código", async () => {
    process.env.SECRETO_DE_PRUEBA_SANDBOX = "no-debe-verse";
    try {
      const r = await executeSandbox({
        ...base,
        envVars: { DECLARADA: "si" },
        // Desde 2026-10-26 ni siquiera hay `process` (QuickJS): ver sandbox-hostil.test.ts.
        code: "return { hayProcess: typeof globalThis.process !== 'undefined', env };",
      });
      expect(JSON.stringify(r.result)).not.toContain("no-debe-verse");
      expect(JSON.stringify(r.result)).not.toContain("DATABASE_URL");
      expect((r.result as { env: Record<string, string> }).env.DECLARADA).toBe("si");
      expect((r.result as { hayProcess: boolean }).hayProcess).toBe(false);
    } finally {
      delete process.env.SECRETO_DE_PRUEBA_SANDBOX;
    }
  });

  test("un bucle infinito se corta por tiempo", async () => {
    const r = await executeSandbox({ ...base, timeoutMs: 800, code: "while (true) {}" });
    expect(r.exitReason).toBe("timeout");
  });

  test("en producción viene apagado salvo ENABLE_CODE_ACTIONS=true", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_CODE_ACTIONS;
    expect(accionesDeCodigoHabilitadas()).toBe(false);
    const r = await executeSandbox({ ...base, code: "return 1;" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("ENABLE_CODE_ACTIONS");
    process.env.ENABLE_CODE_ACTIONS = "true";
    expect(accionesDeCodigoHabilitadas()).toBe(true);
  });
});
