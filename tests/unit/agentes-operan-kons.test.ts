/**
 * Un agente con token puede operar el dominio de un kon
 * ============================================================================
 *
 * ── LO QUE PASABA ──────────────────────────────────────────────────────────
 *
 * Kitsuden se vende como «AI-native» y un agente no podía hacer nada en un kon.
 * Dos puertas cerradas, una detrás de otra:
 *
 *   1. `requireAuth` —el que usan todas las rutas de kon— solo miraba la
 *      sesión por COOKIE. El middleware global ya había verificado el token
 *      `Bearer kitsuden_agent_*` y dejado al agente en el contexto, pero
 *      `requireAuth` no lo consultaba: 401 en cualquier ruta protegida.
 *
 *   2. Aunque pasara, las policies preguntan por ROL (`admin`, `editor`) y un
 *      agente llega con `role: "agent"`. Generar un cuadro, reportar un set o
 *      editar una tier list ajena: 403.
 *
 * Así que las herramientas de MCP de dominio no habrían podido hacer nada, y un
 * vibecoder habría acabado escribiendo filas a mano — saltándose justo las
 * reglas que Kitsuden vende.
 *
 * ── LO QUE VIGILA ──────────────────────────────────────────────────────────
 *
 * Que el agente verificado pase `requireAuth`, que sus scopes concedan acciones
 * de las policies, y los tres límites que hacen que eso sea seguro: un scope
 * no inventa acciones, un usuario sin `agent` no se cuela, y a los humanos no
 * les cambia nada.
 */

import { Hono, type MiddlewareHandler } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  can,
  defineGate,
  definePolicy,
  readRouteMeta,
  resetAuthz,
  scopeConcede,
} from "@kitsuden/engine";

// La sesión por cookie no existe en estas pruebas: así se comprueba que el
// agente pasa por SU camino y no por uno que casualmente devolviera sesión.
vi.mock("../../apps/api/src/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

import { requireAuth } from "../../apps/api/src/middleware/auth";

describe("los scopes de un agente conceden acciones de las policies", () => {
  beforeEach(() => {
    resetAuthz();
    definePolicy("esports", {
      manage: (user) => user?.role === "admin" || user?.role === "editor",
    });
    defineGate("access-admin", (user) => user?.role === "admin");
  });

  const agente = (scopes: string[]) => ({ id: "ag_1", role: "agent", scopes });

  it("hoy un agente sin scopes no pasa una regla de rol", async () => {
    expect(await can(agente([]), "manage", {}, "esports")).toBe(false);
  });

  it("un scope exacto concede la acción", async () => {
    expect(await can(agente(["esports:manage"]), "manage", {}, "esports")).toBe(true);
  });

  it("`recurso:*` concede todas las acciones de ese recurso, y solo de ese", async () => {
    expect(await can(agente(["esports:*"]), "manage", {}, "esports")).toBe(true);
    expect(await can(agente(["tierlist:*"]), "manage", {}, "esports")).toBe(false);
  });

  it("`admin:*` concede lo que la policy define…", async () => {
    expect(await can(agente(["admin:*"]), "manage", {}, "esports")).toBe(true);
  });

  it("…pero NO inventa acciones que nadie escribió", async () => {
    /**
     * Deny-by-default tiene que seguir siendo cierto con cualquier scope. Si
     * `admin:*` abriera acciones sin regla, un kon que olvida definir `delete`
     * quedaría abierto para todos los agentes con ese scope.
     */
    expect(await can(agente(["admin:*"]), "delete", {}, "esports")).toBe(false);
    expect(await can(agente(["admin:*"]), "manage", {}, "recurso-inexistente")).toBe(false);
  });

  it("los gates se conceden con `gate:<nombre>`", async () => {
    expect(await can(agente(["gate:access-admin"]), "access-admin")).toBe(true);
    expect(await can(agente(["esports:*"]), "access-admin")).toBe(false);
  });

  it("a los humanos no les cambia nada", async () => {
    // Un usuario de Better Auth no lleva `scopes`: gana o pierde por su rol, como antes.
    expect(await can({ id: "u1", role: "editor" }, "manage", {}, "esports")).toBe(true);
    expect(await can({ id: "u2", role: "user" }, "manage", {}, "esports")).toBe(false);
  });

  it("las reglas del comparador de scopes", () => {
    expect(scopeConcede(["esports:manage"], "esports:manage")).toBe(true);
    expect(scopeConcede(["esports:*"], "esports:view")).toBe(true);
    expect(scopeConcede(["*:view"], "esports:view")).toBe(true);
    expect(scopeConcede(["*:view"], "esports:manage")).toBe(false);
    expect(scopeConcede(["admin"], "lo:que-sea")).toBe(true);
    expect(scopeConcede([], "esports:manage")).toBe(false);
    expect(scopeConcede(undefined, "esports:manage")).toBe(false);
  });
});

describe("`requireAuth` reconoce al agente ya verificado", () => {
  /**
   * Simula lo que deja el middleware global de `index.ts` tras verificar el
   * token. `/protegida` no es de ningún kon, así que desde la auditoría del
   * 2026-10-25 (middleware/agente-como-usuario.ts) solo pasa quien trae
   * `usuario:actuar`; con solo `esports:*` pasaría por /api/esports, no aquí.
   */
  const conScopes =
    (scopes: string[]): MiddlewareHandler =>
    async (c, next) => {
      c.set("agent" as never, { agentId: "ag_1", scopes } as never);
      c.set("user" as never, { id: "ag_1", role: "agent", scopes } as never);
      await next();
    };
  const comoAgenteVerificado = conScopes(["esports:*", "usuario:actuar"]);

  /** Lo que deja una clave legacy `kitsuden_sk_*`: usuario, pero sin `agent`. */
  const comoClaveLegacy: MiddlewareHandler = async (c, next) => {
    c.set("user" as never, { id: "machine-1", role: "admin" } as never);
    await next();
  };

  function app(...previos: MiddlewareHandler[]) {
    const a = new Hono();
    for (const mw of previos) a.use("*", mw);
    a.get("/protegida", requireAuth, (c) => c.json({ ok: true }));
    return a;
  }

  it("un agente verificado pasa sin cookie", async () => {
    const res = await app(comoAgenteVerificado).request("/protegida");
    expect(res.status, "con un token de agente válido esto daba 401").toBe(200);
  });

  it("…pero un agente sin `usuario:actuar` ni scope de la familia de la ruta no actúa como usuario", async () => {
    const res = await app(conScopes(["esports:*"])).request("/protegida");
    expect(res.status).toBe(403);
  });

  it("sin agente ni sesión sigue siendo 401", async () => {
    expect((await app().request("/protegida")).status).toBe(401);
  });

  it("un usuario puesto por otra vía NO basta: hace falta `agent`", async () => {
    /**
     * Las claves legacy `kitsuden_sk_*` dejan un usuario admin pero no
     * `agent`. Si `requireAuth` aceptara cualquier usuario del contexto, esas
     * claves —ya pasada su fecha de retirada— ganarían acceso a todas las
     * rutas de kon que hoy no tienen.
     */
    expect((await app(comoClaveLegacy).request("/protegida")).status).toBe(401);
  });

  it("deja escrito en la ruta que exige credencial", () => {
    // Es lo que marca la operación como protegida en el OpenAPI.
    expect(readRouteMeta(requireAuth)?.auth).toBe("required");
  });
});
