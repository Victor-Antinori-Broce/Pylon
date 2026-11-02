import { describe, it, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";

const executed: { sql: any; params: any[] }[] = [];

function createTx(overrides: any = {}) {
  return {
    execute: mock(async (sql: any, ...params: any[]) => {
      executed.push({ sql, params });
      if (typeof overrides.execute === "function") {
        return overrides.execute(sql, ...params);
      }
      return { rows: [] };
    }),
  };
}

const db = {
  execute: mock(async (sql: any, ...params: any[]) => {
    executed.push({ sql, params });
    return { rows: [] };
  }),
  transaction: mock(async (fn: any) => {
    const tx = createTx();
    return fn(tx);
  }),
};

mock.module("drizzle-orm", () => ({
  // `sql` DEBE conservar `.raw` (mock.module es global en bun).
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => ({
      text: strings.reduce(
        (acc, s, i) => acc + s + (values[i] !== undefined ? `$${i + 1}` : ""),
        ""
      ),
      values,
    }),
    { raw: (s: string) => s }
  ),
}));

mock.module("../db", () => ({
  db,
  DatabaseTransaction: {},
}));

import {
  setRLSContext,
  clearRLSContext,
  getRLSContext,
  withTransactionalRLS,
  withRLSContextOnly,
  withRLSContext,
  withAdminRLS,
} from "../middleware/transactional-rls";

afterAll(() => {
  mock.restore();
});

beforeAll(() => {
  executed.length = 0;
});

function makeContext(user?: any) {
  const store = new Map<string, any>();
  if (user) store.set("user", user);
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: any) => store.set(k, v),
  } as any;
}

const next = mock(async () => {});

describe("transactional-rls", () => {
  beforeEach(() => {
    executed.length = 0;
    db.execute.mockClear?.();
    db.transaction.mockClear?.();
    next.mockClear?.();
  });

  it("setRLSContext injects user_id and role", async () => {
    const tx = createTx();
    await setRLSContext(tx as any, { id: "u1", role: "admin" });
    // Una sola ida: los dos `set_config` en la misma sentencia.
    expect(executed.length).toBe(1);
    expect(executed[0].sql.text).toContain("set_config");
    expect(executed[0].sql.values).toContain("u1");
    expect(executed[0].sql.values).toContain("admin");
  });

  /**
   * El tercer argumento de `set_config` es `is_local`. Con `false` el valor se
   * queda en la SESIÓN, y aquí las sesiones son conexiones de un pool: la
   * petición siguiente que reutilice esa conexión y no fije contexto hereda el
   * usuario de la anterior. Nada falla; simplemente se ve lo que no se debe.
   */
  it("el contexto es LOCAL a la transacción, no de sesión", async () => {
    const tx = createTx();
    await setRLSContext(tx as any, { id: "u1", role: "admin" });
    for (const q of executed) expect(q.sql.text).toContain("true)");
    executed.length = 0;
    await clearRLSContext(tx as any);
    for (const q of executed) expect(q.sql.text).toContain("true)");
  });

  it("setRLSContext defaults to anonymous", async () => {
    const tx = createTx();
    await setRLSContext(tx as any, null);
    expect(executed[0].sql.values).toContain("");
    expect(executed[0].sql.values).toContain("anonymous");
  });

  it("setRLSContext: una cuenta sin rol es `user`, no `anonymous`", async () => {
    const tx = createTx();
    await setRLSContext(tx as any, { id: "u3" } as any);
    expect(executed[0].sql.values).toContain("u3");
    expect(executed[0].sql.values).toContain("user");
  });

  it("clearRLSContext resets session variables", async () => {
    const tx = createTx();
    await clearRLSContext(tx as any);
    expect(executed.length).toBe(2);
    expect(executed[0].sql.text).toContain("app.current_user_id");
    expect(executed[1].sql.text).toContain("app.current_user_role");
  });

  it("getRLSContext reads current settings and detects admin", async () => {
    const tx = createTx({
      execute: async (sql: any) => {
        const setting = sql.text.includes("user_id") ? "u2" : "admin";
        return { rows: [{ current_setting: setting }] };
      },
    });
    const ctx = await getRLSContext(tx as any);
    expect(ctx.userId).toBe("u2");
    expect(ctx.userRole).toBe("admin");
    expect(ctx.isAdmin).toBe(true);
  });

  it("withTransactionalRLS runs next inside a transaction", async () => {
    const c = makeContext({ id: "u3", role: "user" });
    await withTransactionalRLS()(c, next);
    expect(db.transaction.mock.calls.length).toBe(1);
    expect(next.mock.calls.length).toBe(1);
    expect(c.get("rlsUser")).toEqual({ id: "u3", role: "user" });
  });

  it("withTransactionalRLS handles anonymous users", async () => {
    const c = makeContext();
    await withTransactionalRLS()(c, next);
    expect(c.get("rlsUser")).toEqual({ id: null, role: "anonymous" });
  });

  it("withRLSContextOnly sets context without transaction, and cleans up after", async () => {
    const c = makeContext({ id: "u4", role: "editor" });
    await withRLSContextOnly()(c, next);
    // Dos para poner el contexto y dos para quitarlo: sin transacción el
    // contexto es de sesión, y la sesión se le presta a la petición siguiente
    expect(db.execute.mock.calls.length).toBe(4);
    expect(next.mock.calls.length).toBe(1);
    expect(c.get("rlsUser")).toEqual({ id: "u4", role: "editor" });
  });

  it("withRLSContextOnly limpia el contexto aunque la ruta falle", async () => {
    const c = makeContext({ id: "u4", role: "editor" });
    const revienta = mock(async () => {
      throw new Error("la ruta ha fallado");
    });
    await expect(withRLSContextOnly()(c, revienta as never)).rejects.toThrow("la ruta ha fallado");
    expect(db.execute.mock.calls.length).toBe(4);
  });

  it("withRLSContext helper runs function in a transaction", async () => {
    const fn = mock(async (tx: any) => "result");
    const result = await withRLSContext({ id: "u5", role: "user" }, fn);
    expect(result).toBe("result");
    expect(db.transaction.mock.calls.length).toBe(1);
    expect(fn.mock.calls.length).toBe(1);
  });

  it("withAdminRLS helper runs function as admin", async () => {
    const fn = mock(async (tx: any) => "admin-result");
    const result = await withAdminRLS(fn);
    expect(result).toBe("admin-result");
    expect(db.transaction.mock.calls.length).toBe(1);
  });
});
