/**
 * Gestión de agentes solo por personas, rol fresco en `requireAuth` e IP de
 * auditoría en `agentAuthWithRBAC` (auditoría 2026-11-04, F5, F74, F14)
 * ============================================================================
 *
 *   · F5: un agente con `admin` (y denegaciones `!patrón`) podía reescribir sus
 *     propios scopes por REST (`PUT /api/v1/agents/<él>/scopes`), crear otro
 *     agente admin o acuñarse claves. Ahora toda ESCRITURA de un agente en la
 *     gestión de agentes es 403; las lecturas siguen la puerta de siempre. Y
 *     `exigirRol` no deja pasar a un `admin` cuya denegación cubre la ruta.
 *   · F74: `requireAuth` pisaba el usuario fresco del middleware global con el
 *     de la caché en cookie (rol viejo hasta 5 minutos).
 *   · F14: `agentAuthWithRBAC` guardaba `x-forwarded-for` crudo como IP.
 *
 * La base está simulada y LANZA si alguien la toca: una ruta que debía cortar
 * la puerta y llega al manejador se ve como un 500, nunca como una consulta.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sesiones = vi.hoisted(() => ({
  /** Lo que devuelve `getSession` desde la caché en cookie. */
  deCookie: null as null | { user: Record<string, unknown>; session: Record<string, unknown> },
  /** Lo que devuelve `getSession` con `disableCookieCache` (la base). */
  deBase: null as null | { user: Record<string, unknown>; session: Record<string, unknown> },
  llamadas: [] as Array<{ sinCache: boolean }>,
}));

vi.mock("../../apps/api/src/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async (opts: { query?: { disableCookieCache?: boolean } }) => {
        const sinCache = opts?.query?.disableCookieCache === true;
        sesiones.llamadas.push({ sinCache });
        return sinCache ? sesiones.deBase : sesiones.deCookie;
      }),
    },
  },
}));

vi.mock("../../apps/api/src/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("la base no está disponible en esta prueba");
      },
    }
  ),
}));

const autenticaciones = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("../../apps/api/src/services/agent-auth", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return {
    ...real,
    authenticateAgent: vi.fn(async (_clave: string, opts: Record<string, unknown>) => {
      autenticaciones.push(opts);
      return { success: false, error: "Invalid API key", code: "INVALID_KEY" };
    }),
  };
});

import { olvidarRoutersDeKons, registrarRouterDeKon } from "../../apps/api/src/lib/rutas-de-kons";
import { agentAuthWithRBAC } from "../../apps/api/src/middleware/agent-rbac";
import { requireAuth } from "../../apps/api/src/middleware/auth";
import {
  exigirAdmin,
  setRefrescoDeSesion,
  sinAgentesEnGestionDeAgentes,
} from "../../apps/api/src/middleware/auth-guard";
import agentPlaygroundRoutes from "../../apps/api/src/routes/agent-playground";
import agentRoutes from "../../apps/api/src/routes/agents";
import { agentsV1Routes } from "../../apps/api/src/routes/agents-v1";
import { avisosDeAgentesRoutes } from "../../apps/api/src/routes/avisos-de-agentes";
import { permisosDeAgentesRoutes } from "../../apps/api/src/routes/permisos-de-agentes";

registrarRouterDeKon("kon-pruebadeny", "/api/pruebadeny", { routes: [] });
afterAll(() => olvidarRoutersDeKons());

beforeEach(() => {
  sesiones.deCookie = null;
  sesiones.deBase = null;
  sesiones.llamadas.length = 0;
  autenticaciones.length = 0;
  setRefrescoDeSesion(async () => ({ role: "admin" }));
});
afterEach(() => setRefrescoDeSesion(async () => ({ role: "admin" })));

// ── Quién llama ─────────────────────────────────────────────────────────────

const AGENTE_ADMIN_RECORTADO = ["admin", "!datasets:nominas:*"];

function comoAgente(scopes: string[], id = "ag_yo"): MiddlewareHandler {
  return async (c, next) => {
    c.set("agent" as never, { agentId: id, scopes, sponsor: null } as never);
    c.set("user" as never, { id, role: "agent", scopes } as never);
    c.set("session" as never, null as never);
    await next();
  };
}

function comoPersona(role: string): MiddlewareHandler {
  return async (c, next) => {
    c.set("user" as never, { id: "u_admin", role } as never);
    c.set("session" as never, { id: "s_1" } as never);
    await next();
  };
}

function comoClaveHeredada(): MiddlewareHandler {
  return async (c, next) => {
    c.set("user" as never, { id: "machine-k1", role: "admin" } as never);
    c.set("session" as never, null as never);
    await next();
  };
}

/** La app con los routers de gestión de agentes montados como en index.ts / rpc.ts. */
function appDeGestion(quien: MiddlewareHandler) {
  const a = new Hono();
  a.use("*", quien);
  a.route("/api/admin/agents", avisosDeAgentesRoutes);
  a.route("/api/admin/agents", agentRoutes);
  a.route("/api/v1", agentsV1Routes);
  a.route("/api/v1", permisosDeAgentesRoutes);
  a.route("/api/admin/agents", agentPlaygroundRoutes);
  return a;
}

function pedir(a: Hono, metodo: string, camino: string, cuerpo?: unknown) {
  return a.request(camino, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

const ESCRITURAS: Array<[string, string, unknown]> = [
  ["PUT", "/api/v1/agents/ag_yo/scopes", { scopes: ["admin"] }],
  ["POST", "/api/v1/agents/ag_yo/keys", {}],
  ["POST", "/api/v1/agents/ag_yo/keys/k1/rotate", {}],
  ["PUT", "/api/v1/agents/ag_yo/quotas", { writesPerDay: null }],
  ["PUT", "/api/v1/agents/ag_yo/sponsor", { userId: null }],
  ["PUT", "/api/v1/agents/ag_yo/mcp-settings", { toolset: null }],
  ["POST", "/api/v1/agents", { name: "otro", scopes: ["admin"] }],
  ["PATCH", "/api/v1/agents/ag_yo", { scopes: ["admin"] }],
  ["POST", "/api/v1/agents/ag_otro/token", {}],
  ["POST", "/api/v1/agents/ag_otro/playground", { message: "hola" }],
  ["POST", "/api/v1/identities", { name: "otro", scopes: ["admin"] }],
  ["PATCH", "/api/v1/identities/ag_yo", { scopes: ["admin"] }],
  ["DELETE", "/api/v1/identities/ag_otro", undefined],
  ["POST", "/api/admin/agents", { name: "otro", scopes: ["admin"] }],
  ["PUT", "/api/admin/agents/ag_yo", { scopes: ["admin"] }],
  ["DELETE", "/api/admin/agents/ag_otro", undefined],
  ["POST", "/api/admin/agents/ag_yo/keys", {}],
  ["DELETE", "/api/admin/agents/ag_yo/keys/k1", undefined],
  ["POST", "/api/admin/agents/ag_otro/chat", { message: "hola" }],
  ["PUT", "/api/admin/agents/ag_yo/notify", { url: null }],
  ["POST", "/api/admin/agents/ag_yo/notify/rotate", {}],
];

// ── F5 ──────────────────────────────────────────────────────────────────────

describe("F5: la gestión de agentes no la escribe un agente", () => {
  it.each(ESCRITURAS)("agente admin con denegaciones: %s %s → 403", async (metodo, camino, cuerpo) => {
    const r = await pedir(appDeGestion(comoAgente(AGENTE_ADMIN_RECORTADO)), metodo, camino, cuerpo);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { message?: string }).message ?? "").toMatch(/Agents cannot manage agents/);
  });

  it("tampoco un agente con `admin` a secas, ni contra otro agente", async () => {
    const a = appDeGestion(comoAgente(["admin"]));
    expect((await pedir(a, "PUT", "/api/v1/agents/ag_otro/scopes", { scopes: ["admin"] })).status).toBe(403);
    expect((await pedir(a, "POST", "/api/admin/agents", { name: "x" })).status).toBe(403);
  });

  it("ni una clave heredada `kitsuden_sk_*` (usuario sintético `machine-…`)", async () => {
    // Sin sesión de cookie, `requireAuth` ya la para (401); el middleware, si llega, 403.
    const a = appDeGestion(comoClaveHeredada());
    expect([401, 403]).toContain((await pedir(a, "PUT", "/api/v1/agents/ag_otro/scopes", { scopes: ["admin"] })).status);
    const b = new Hono();
    b.use("*", comoClaveHeredada());
    b.use("*", sinAgentesEnGestionDeAgentes);
    b.all("*", (c) => c.text("dentro"));
    expect((await b.request("/x", { method: "PUT" })).status).toBe(403);
  });

  it("una persona admin pasa la puerta (llega al manejador: aquí, la base simulada)", async () => {
    const a = appDeGestion(comoPersona("admin"));
    const r = await pedir(a, "PUT", "/api/v1/agents/ag_otro/scopes", { scopes: ["admin"] });
    expect(r.status).not.toBe(403);
    const r2 = await pedir(a, "POST", "/api/admin/agents", { name: "nuevo" });
    expect(r2.status).not.toBe(403);
  });

  it("el middleware deja pasar las lecturas y a las personas", async () => {
    const a = new Hono();
    a.use("*", comoAgente(["admin"]));
    a.use("*", sinAgentesEnGestionDeAgentes);
    a.all("*", (c) => c.text("dentro"));
    expect((await a.request("/x", { method: "GET" })).status).toBe(200);
    expect((await a.request("/x", { method: "HEAD" })).status).toBe(200);
    expect((await a.request("/x", { method: "POST" })).status).toBe(403);

    const b = new Hono();
    b.use("*", comoPersona("admin"));
    b.use("*", sinAgentesEnGestionDeAgentes);
    b.all("*", (c) => c.text("dentro"));
    expect((await b.request("/x", { method: "POST" })).status).toBe(200);
  });
});

describe("F5: `exigirRol` no salta las denegaciones de un agente `admin`", () => {
  function app(scopes: string[]) {
    const a = new Hono();
    a.use("*", comoAgente(scopes));
    a.use("*", exigirAdmin);
    a.all("*", (c) => c.text("dentro"));
    return a;
  }

  it("`admin` + `!pruebadeny:*` → 403 en el kon denegado", async () => {
    const r = await app(["admin", "!pruebadeny:*"]).request("/api/pruebadeny/algo");
    expect(r.status).toBe(403);
    expect(((await r.json()) as { message: string }).message).toContain("!pruebadeny:*");
  });

  it("`admin` + una denegación que no cubre la ruta → dentro", async () => {
    expect((await app(["admin", "!otrokon:*"]).request("/api/pruebadeny/algo")).status).toBe(200);
    expect((await app(["admin"]).request("/api/pruebadeny/algo")).status).toBe(200);
  });
});

// ── F74 ─────────────────────────────────────────────────────────────────────

describe("F74: `requireAuth` no pisa el usuario fresco con el de la cookie", () => {
  function app(previo?: MiddlewareHandler) {
    const a = new Hono();
    if (previo) a.use("*", previo);
    a.use("*", requireAuth);
    a.get("*", (c) => c.json({ role: (c.get("user" as never) as { role?: string } | null)?.role ?? null }));
    return a;
  }

  it("sesión ya resuelta por el middleware global (rol releído: user) → se respeta", async () => {
    // La cookie aún dice admin; el global ya releyó de la base y dejó `user`.
    sesiones.deCookie = { user: { id: "u1", role: "admin" }, session: { id: "s1" } };
    const r = await app(comoPersona("user")).request("/api/graph/data_sources");
    expect(r.status).toBe(200);
    expect(((await r.json()) as { role: string }).role).toBe("user");
    expect(sesiones.llamadas).toHaveLength(0);
  });

  it("sin middleware global (rutas tempranas): un rol privilegiado se relee sin caché", async () => {
    sesiones.deCookie = { user: { id: "u1", role: "admin" }, session: { id: "s1" } };
    sesiones.deBase = { user: { id: "u1", role: "user" }, session: { id: "s1" } };
    const r = await app().request("/api/graph/data_sources");
    expect(r.status).toBe(200);
    expect(((await r.json()) as { role: string }).role).toBe("user");
    expect(sesiones.llamadas).toEqual([{ sinCache: false }, { sinCache: true }]);
  });

  it("sesión cerrada en la base → 401", async () => {
    sesiones.deCookie = { user: { id: "u1", role: "editor" }, session: { id: "s1" } };
    sesiones.deBase = null;
    expect((await app().request("/x")).status).toBe(401);
  });

  it("un rol sin privilegios no paga la segunda lectura", async () => {
    sesiones.deCookie = { user: { id: "u1", role: "user" }, session: { id: "s1" } };
    expect((await app().request("/x")).status).toBe(200);
    expect(sesiones.llamadas).toEqual([{ sinCache: false }]);
  });

  it("sin sesión → 401; y una clave heredada (sin sesión) sigue sin pasar", async () => {
    expect((await app().request("/x")).status).toBe(401);
    expect((await app(comoClaveHeredada()).request("/x")).status).toBe(401);
  });
});

// ── F14 ─────────────────────────────────────────────────────────────────────

describe("F14: `agentAuthWithRBAC` audita la IP de verdad", () => {
  function app() {
    const a = new Hono();
    a.use("*", agentAuthWithRBAC({ scopes: ["memory:read"], action: "read", resource: "memory" } as never));
    a.get("*", (c) => c.text("dentro"));
    return a;
  }

  it("socket público: `x-forwarded-for` del cliente no cuenta", async () => {
    const r = await app().request(
      "/api/agent/memory",
      { headers: { Authorization: "Bearer x", "X-Forwarded-For": "203.0.113.9" } },
      { ip: { address: "198.51.100.7" } }
    );
    expect(r.status).toBe(401);
    expect(autenticaciones).toHaveLength(1);
    expect(autenticaciones[0]!.ipAddress).toBe("198.51.100.7");
    expect(autenticaciones[0]!.ruta).toBe("/api/agent/memory");
  });

  it("tras nuestro proxy: lo que el cliente escribe a la izquierda no cuenta", async () => {
    await app().request(
      "/api/agent/memory",
      { headers: { Authorization: "Bearer x", "X-Forwarded-For": "203.0.113.9, 198.51.100.20" } },
      { ip: { address: "10.0.0.2" } }
    );
    expect(autenticaciones[0]!.ipAddress).toBe("198.51.100.20");
  });
});
