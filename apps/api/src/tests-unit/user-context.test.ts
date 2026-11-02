import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test";

function createMockFn(defaultImpl?: (...args: any[]) => any) {
  let impl = defaultImpl;
  const calls: any[][] = [];
  const fn = (...args: any[]) => {
    calls.push(args);
    return impl ? impl(...args) : undefined;
  };
  (fn as any).mock = { calls };
  (fn as any).mockReset = () => {
    calls.length = 0;
    impl = defaultImpl;
  };
  (fn as any).mockResolvedValue = (v: any) => {
    impl = () => Promise.resolve(v);
  };
  (fn as any).mockRejectedValue = (e: any) => {
    impl = () => Promise.reject(e);
  };
  return fn as any;
}

const dbExecute = createMockFn(() => Promise.resolve({ rows: [] }));

mock.module("../db", () => ({
  mergedSchema: {},
  db: { execute: dbExecute },
}));

mock.module("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: any[]) =>
    Object.assign(
      () => ({
        strings,
        values,
      }),
      { strings, values }
    ),
}));

import { enrichUserContext, olvidarTablaDeEmpleados } from "../middleware/user-context";

afterAll(() => {
  mock.restore();
});

function createMockContext(initialVars?: Record<string, any>) {
  const vars = new Map(Object.entries(initialVars ?? {}));
  return {
    get: (k: string) => vars.get(k),
    set: (k: string, v: any) => vars.set(k, v),
  } as any;
}

const next = createMockFn(() => Promise.resolve());

describe("enrichUserContext", () => {
  beforeEach(() => {
    next.mockReset();
    dbExecute.mockReset();
    olvidarTablaDeEmpleados();
  });

  it("no user → sets empty roleIds and null departmentId, calls next", async () => {
    const c = createMockContext();
    await enrichUserContext(c, next);

    expect(c.get("userRoleIds")).toEqual([]);
    expect(c.get("userDepartmentId")).toBeNull();
    expect(next.mock.calls.length).toBe(1);
  });

  it("user with role → sets userRoleIds = ['admin'], queries db for department_id", async () => {
    // La misma fila contesta a las dos consultas: existe la tabla, y sin departamento
    dbExecute.mockResolvedValue({ rows: [{ existe: true }] });
    const c = createMockContext({ user: { id: "user-1", role: "admin" } });
    await enrichUserContext(c, next);

    expect(c.get("userRoleIds")).toEqual(["admin"]);
    // ¿existe la tabla? + el departamento
    expect(dbExecute.mock.calls.length).toBe(2);
    expect(next.mock.calls.length).toBe(1);
  });

  it("user without role → sets userRoleIds = []", async () => {
    dbExecute.mockResolvedValue({ rows: [] });
    const c = createMockContext({ user: { id: "user-1" } });
    await enrichUserContext(c, next);

    expect(c.get("userRoleIds")).toEqual([]);
    expect(next.mock.calls.length).toBe(1);
  });

  it("DB returns department_id → sets userDepartmentId correctly", async () => {
    dbExecute.mockResolvedValue({
      rows: [{ existe: true, department_id: "dept-1" }],
    });
    const c = createMockContext({ user: { id: "user-1", role: "admin" } });
    await enrichUserContext(c, next);

    expect(c.get("userDepartmentId")).toBe("dept-1");
    expect(next.mock.calls.length).toBe(1);
  });

  it("DB returns empty rows → sets userDepartmentId = null", async () => {
    dbExecute.mockResolvedValue({ rows: [] });
    const c = createMockContext({ user: { id: "user-1", role: "admin" } });
    await enrichUserContext(c, next);

    expect(c.get("userDepartmentId")).toBeNull();
    expect(next.mock.calls.length).toBe(1);
  });

  it("DB throws (table missing) → sets userDepartmentId = null, does not crash", async () => {
    dbExecute.mockRejectedValue(new Error('relation "directory_employees" does not exist'));
    const c = createMockContext({ user: { id: "user-1", role: "admin" } });
    await enrichUserContext(c, next);

    expect(c.get("userDepartmentId")).toBeNull();
    expect(next.mock.calls.length).toBe(1);
  });

  it("sin la tabla (kon-directory no instalado) → una sola comprobación por minuto, no una consulta por petición", async () => {
    dbExecute.mockResolvedValue({ rows: [{ existe: false }] });
    for (let i = 0; i < 3; i++) {
      const c = createMockContext({ user: { id: "user-1", role: "admin" } });
      await enrichUserContext(c, next);
      expect(c.get("userDepartmentId")).toBeNull();
    }
    expect(dbExecute.mock.calls.length).toBe(1);
    expect(next.mock.calls.length).toBe(3);
  });

  it("un agente no es un empleado → no consulta nada", async () => {
    dbExecute.mockResolvedValue({ rows: [{ existe: true, department_id: "dept-1" }] });
    const c = createMockContext({ user: { id: "agente-1", role: "agent" }, agent: { agentId: "agente-1" } });
    await enrichUserContext(c, next);
    expect(c.get("userRoleIds")).toEqual(["agent"]);
    expect(c.get("userDepartmentId")).toBeNull();
    expect(dbExecute.mock.calls.length).toBe(0);
  });
});
