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
  return fn as any;
}

const getSession = createMockFn(() => Promise.resolve(null));

mock.module("../lib/auth", () => ({
  auth: { api: { getSession } },
}));

import { registrarRouterDeKon } from "../lib/rutas-de-kons";
import { protectRoute, requireAdmin, requireScope } from "../middleware/auth-guard";

afterAll(() => {
  mock.restore();
});

function createMockContext(initialVars: Record<string, any> = {}, path = "/api/comments") {
  const vars = new Map<string, any>(Object.entries(initialVars));
  return {
    get: (k: string) => vars.get(k),
    set: (k: string, v: any) => vars.set(k, v),
    req: { raw: { headers: new Headers() }, path, method: "POST" },
    json: (body: any, status?: number) => Promise.resolve({ body, status }),
  } as any;
}

const next = createMockFn(() => Promise.resolve());

describe("protectRoute", () => {
  beforeEach(() => {
    getSession.mockReset();
    next.mockReset();
  });

  // Auditoría 2026-10-25 (middleware/agente-como-usuario.ts): una clave de
  // agente no es una cuenta por serlo. Pasa con `usuario:actuar`, `admin` o un
  // scope de la familia de la ruta; con otro scope cualquiera, 403.
  it("agent with usuario:actuar → calls next()", async () => {
    const c = createMockContext({ agent: { id: "agent-1", scopes: ["usuario:actuar"] } });
    await protectRoute(c, next);
    expect(next.mock.calls.length).toBe(1);
  });

  it("agent with a scope of the route's kon → calls next()", async () => {
    // La familia sale del kon MONTADO en ese prefijo (uno de mentira, con un
    // prefijo propio: no pisa el registro de los kons de verdad)
    registrarRouterDeKon("kon-prueba-guarda", "/api/prueba-guarda", { routes: [] });
    const c = createMockContext(
      { agent: { id: "agent-1", scopes: ["kon:prueba-guarda:crear"] } },
      "/api/prueba-guarda/algo"
    );
    await protectRoute(c, next);
    expect(next.mock.calls.length).toBe(1);
  });

  it("agent with an unrelated scope → 403, next() not called", async () => {
    const c = createMockContext({ agent: { id: "agent-1", scopes: ["read"] } });
    const result = (await protectRoute(c, next)) as any;
    expect(result.status).toBe(403);
    expect(next.mock.calls.length).toBe(0);
  });

  it("user present → calls next()", async () => {
    const c = createMockContext({ user: { id: "user-1", role: "admin" } });
    await protectRoute(c, next);
    expect(next.mock.calls.length).toBe(1);
  });

  it("no agent/user but auth session returns user → sets user/session, calls next()", async () => {
    const session = { user: { id: "user-2", role: "user" }, session: { id: "sess-1" } };
    getSession.mockResolvedValue(session);
    const c = createMockContext();
    await protectRoute(c, next);
    expect(c.get("user")).toEqual(session.user);
    expect(c.get("session")).toEqual(session.session);
    expect(next.mock.calls.length).toBe(1);
  });

  it("no agent/user and no session → returns 401", async () => {
    getSession.mockResolvedValue(null);
    const c = createMockContext();
    const result = await protectRoute(c, next);
    expect(result as any).toEqual({
      body: { error: "Unauthorized", message: "Valid session or agent API key required" },
      status: 401,
    });
    expect(next.mock.calls.length).toBe(0);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    next.mockReset();
  });

  it("user with admin role → calls next()", async () => {
    const c = createMockContext({ user: { id: "user-1", role: "admin" } });
    await requireAdmin(c, next);
    expect(next.mock.calls.length).toBe(1);
  });

  it("agent with admin scope → calls next()", async () => {
    const c = createMockContext({ agent: { id: "agent-1", scopes: ["admin"] } });
    await requireAdmin(c, next);
    expect(next.mock.calls.length).toBe(1);
  });

  it("neither → returns 403", async () => {
    const c = createMockContext({ user: { id: "user-1", role: "user" } });
    const result = await requireAdmin(c, next);
    expect(result as any).toEqual({
      body: { error: "Forbidden", message: "Admin access required" },
      status: 403,
    });
    expect(next.mock.calls.length).toBe(0);
  });
});

describe("requireScope", () => {
  beforeEach(() => {
    next.mockReset();
  });

  it('agent with "read" scope → calls next()', async () => {
    const c = createMockContext({ agent: { id: "agent-1", scopes: ["read"] } });
    await requireScope("read")(c, next);
    expect(next.mock.calls.length).toBe(1);
  });

  it('agent with "admin" scope → calls next() even for "read" scope', async () => {
    const c = createMockContext({ agent: { id: "agent-1", scopes: ["admin"] } });
    await requireScope("read")(c, next);
    expect(next.mock.calls.length).toBe(1);
  });

  it("agent without scope → returns 403", async () => {
    const c = createMockContext({ agent: { id: "agent-1", scopes: ["write"] } });
    const result = await requireScope("read")(c, next);
    expect(result as any).toEqual({
      body: { error: "Forbidden", message: "Scope 'read' required", granted: ["write"] },
      status: 403,
    });
    expect(next.mock.calls.length).toBe(0);
  });

  it("no agent → returns 403", async () => {
    const c = createMockContext();
    const result = await requireScope("read")(c, next);
    expect(result as any).toEqual({
      body: { error: "Forbidden", message: "Agent authentication required" },
      status: 403,
    });
    expect(next.mock.calls.length).toBe(0);
  });
});
