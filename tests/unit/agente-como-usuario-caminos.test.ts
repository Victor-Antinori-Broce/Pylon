/**
 * «Una clave de agente no es una cuenta» frente a las fases E y F
 * ============================================================================
 *
 * middleware/agente-como-usuario.ts (auditoría 2026-10-25) cierra un agujero:
 * `requireAuth`/`protectRoute` dejaban pasar a CUALQUIER agente por las rutas
 * que solo piden «estar autenticado» (comentar, inscribirse, guardar builds).
 * Estas pruebas fijan cómo convive con lo que E y F ya permitían, cada cosa
 * por su camino explícito y sin reabrir el agujero:
 *
 *   · operación del SDK (marca `operacionSdk`): decide su `permiso`;
 *   · puerta por prefijo que ya abrió por scope (`agenteAbiertoPorPuerta`);
 *   · scopes por dataset (`datasets:<slug>:<acción>`) en las rutas de datasets
 *     (la ruta mira después el dataset concreto);
 *   · FIRMANTE humano (fase F): firma lo que el agente crea, NO le da permisos;
 *     sin scope, el agente con firmante sigue sin actuar como usuario;
 *   · APROBACIÓN (fase F): se ejecuta con la identidad del agente releída de la
 *     base, así que pasa por esta misma regla: aprobar no amplía permisos;
 *   · una denegación `!usuario:actuar` no cuenta como concesión.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/api/src/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

import { olvidarRoutersDeKons, registrarRouterDeKon } from "../../apps/api/src/lib/rutas-de-kons";
import { requireAuth } from "../../apps/api/src/middleware/auth";
import { protectRoute } from "../../apps/api/src/middleware/auth-guard";

// Un kon de mentira montado en su prefijo: la familia de la ruta sale de ahí.
registrarRouterDeKon("kon-pruebacomentarios", "/api/pruebacomentarios", { routes: [] });
registrarRouterDeKon("kon-datasets", "/api/datasets", { routes: [] });
afterAll(() => olvidarRoutersDeKons());

interface Agente {
  scopes: string[];
  sponsor?: { userId: string; valido: boolean } | null;
}

function comoAgente(a: Agente, marcas: Record<string, unknown> = {}): MiddlewareHandler {
  return async (c, next) => {
    c.set("agent" as never, { agentId: "ag_1", scopes: a.scopes, sponsor: a.sponsor ?? null } as never);
    c.set("user" as never, { id: "ag_1", role: "agent", scopes: a.scopes, sponsor: a.sponsor ?? null } as never);
    for (const [k, v] of Object.entries(marcas)) c.set(k as never, v as never);
    await next();
  };
}

function app(previo: MiddlewareHandler) {
  const a = new Hono();
  a.use("*", previo);
  for (const camino of ["/api/pruebacomentarios", "/api/datasets/clientes/entries", "/api/data-sets/clientes", "/api/otra"]) {
    a.post(camino, requireAuth, (c) => c.json({ ok: true }));
    a.post(`/guard${camino}`, protectRoute, (c) => c.json({ ok: true }));
  }
  return a;
}

const estado = async (previo: MiddlewareHandler, camino: string) =>
  (await app(previo).request(camino, { method: "POST" })).status;

describe("agente como usuario: los caminos explícitos de E y F", () => {
  it("sin scope útil → 403 en requireAuth y en protectRoute", async () => {
    const a = comoAgente({ scopes: ["datasets:clientes:read"] });
    expect(await estado(a, "/api/pruebacomentarios")).toBe(403);
    expect(await estado(a, "/guard/api/pruebacomentarios")).toBe(403);
  });

  it("con `usuario:actuar` o `admin` → pasa", async () => {
    expect(await estado(comoAgente({ scopes: ["usuario:actuar"] }), "/api/otra")).toBe(200);
    expect(await estado(comoAgente({ scopes: ["admin"] }), "/guard/api/otra")).toBe(200);
  });

  it("scope de la familia del kon (`<kon>:…` o `kon:<kon>:…`) → pasa en SU kon, no en otro", async () => {
    expect(await estado(comoAgente({ scopes: ["pruebacomentarios:*"] }), "/api/pruebacomentarios")).toBe(200);
    expect(await estado(comoAgente({ scopes: ["kon:pruebacomentarios:crear"] }), "/api/pruebacomentarios")).toBe(200);
    expect(await estado(comoAgente({ scopes: ["kon:pruebacomentarios:crear"] }), "/api/otra")).toBe(403);
  });

  it("scopes por dataset → pasan en /api/datasets y en la API lite /api/data-sets (la ruta mira el dataset)", async () => {
    const a = comoAgente({ scopes: ["datasets:clientes:write"] });
    expect(await estado(a, "/api/datasets/clientes/entries")).toBe(200);
    expect(await estado(a, "/api/data-sets/clientes")).toBe(200);
    expect(await estado(a, "/api/pruebacomentarios")).toBe(403);
  });

  it("FIRMANTE humano no amplía permisos: con firmante y sin scope, 403", async () => {
    const a = comoAgente({ scopes: ["mcp:connect", "mcp:write"], sponsor: { userId: "u_humano", valido: true } });
    expect(await estado(a, "/api/pruebacomentarios")).toBe(403);
    expect(await estado(a, "/api/otra")).toBe(403);
  });

  it("operación del SDK u otra puerta que ya abrió por scope → decide ella, no esta regla", async () => {
    const sinNada = { scopes: ["mcp:connect"] };
    expect(await estado(comoAgente(sinNada, { operacionSdk: true }), "/api/otra")).toBe(200);
    expect(await estado(comoAgente(sinNada, { agenteAbiertoPorPuerta: true }), "/guard/api/otra")).toBe(200);
  });

  it("una DENEGACIÓN `!usuario:actuar` no concede", async () => {
    expect(await estado(comoAgente({ scopes: ["!usuario:actuar"] }), "/api/otra")).toBe(403);
  });
});
