/**
 * Request-scoped DI — pruebas deterministas (sin DB).
 * Verifica que resolveExecutor/useRequest respetan el AsyncLocalStorage y que
 * repo() toma el tx del scope automáticamente.
 */

import {
  runInRequestScope,
  useRequest,
  useUser,
  setRequestTx,
  clearRequestTx,
  provideRequestService,
  resolveExecutor,
} from "@kitsuden/engine";
import { describe, it, expect } from "bun:test";

const FALLBACK = { name: "global-db" };
const TX = { name: "rls-tx" };

describe("Request-scoped DI", () => {
  it("resolveExecutor usa fallback fuera de un request", () => {
    expect(resolveExecutor(FALLBACK)).toBe(FALLBACK);
    expect(useRequest()).toBeUndefined();
  });

  it("dentro del scope, resolveExecutor devuelve el tx cuando se setea", () => {
    runInRequestScope({ requestId: "r1" }, () => {
      expect(resolveExecutor(FALLBACK)).toBe(FALLBACK); // aún sin tx
      setRequestTx(TX);
      expect(resolveExecutor(FALLBACK)).toBe(TX); // ahora bajo RLS
      clearRequestTx();
      expect(resolveExecutor(FALLBACK)).toBe(FALLBACK); // liberado
    });
  });

  it("el scope aísla entre requests concurrentes (ALS)", async () => {
    const results: string[] = [];
    await Promise.all([
      runInRequestScope({ requestId: "A" }, async () => {
        setRequestTx({ name: "tx-A" });
        await new Promise((r) => setTimeout(r, 5));
        results.push((resolveExecutor(FALLBACK) as any).name);
      }),
      runInRequestScope({ requestId: "B" }, async () => {
        setRequestTx({ name: "tx-B" });
        await new Promise((r) => setTimeout(r, 1));
        results.push((resolveExecutor(FALLBACK) as any).name);
      }),
    ]);
    expect(results.sort()).toEqual(["tx-A", "tx-B"]);
  });

  it("useUser lee el usuario del scope", () => {
    runInRequestScope({ user: { id: "u1", role: "admin" } }, () => {
      expect(useUser()?.id).toBe("u1");
    });
    expect(useUser()).toBeNull();
  });

  it("provideRequestService instancia una vez por request (singleton scoped)", () => {
    let created = 0;
    runInRequestScope({ services: {} }, () => {
      const a = provideRequestService("svc", () => ({ n: ++created }));
      const b = provideRequestService("svc", () => ({ n: ++created }));
      expect(a).toBe(b); // misma instancia dentro del request
      expect(created).toBe(1);
    });
    // Otro request → nueva instancia.
    runInRequestScope({ services: {} }, () => {
      provideRequestService("svc", () => ({ n: ++created }));
    });
    expect(created).toBe(2);
  });
});
