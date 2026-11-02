/**
 * Un kon activado en caliente ve la identidad que ya resolvió la API
 * (2026-10-15). Antes, `router.fetch(...)` empezaba un contexto vacío: un
 * agente con `Bearer` recibía 401 en el kon hasta reiniciar la API.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { conContextoDelHost, envParaElKon } from "../../apps/api/src/lib/contexto-del-host";

function kon() {
  const r = new Hono();
  r.post("/bloques", (c) => {
    const agente = (c.get as (k: string) => unknown)("agent") as { scopes?: string[] } | undefined;
    const ip = (c.env as { ip?: { address?: string } } | undefined)?.ip?.address ?? null;
    if (!agente) return c.json({ error: "Unauthorized" }, 401);
    return c.json({ scopes: agente.scopes, ip });
  });
  return r;
}

function host(envuelto: Hono | null) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    (c as any).set("agent", { scopes: ["contenido:editar"] });
    await next();
  });
  const router = envuelto ?? kon();
  app.all("/api/games/*", (c) => {
    const url = new URL(c.req.raw.url);
    url.pathname = url.pathname.slice("/api/games".length);
    return envuelto
      ? router.fetch(new Request(url.toString(), c.req.raw), envParaElKon(c.env, c.get as never))
      : router.fetch(new Request(url.toString(), c.req.raw));
  });
  return app;
}

const pedir = (app: Hono) =>
  app.request("/api/games/bloques", { method: "POST" }, { ip: { address: "203.0.113.7" } });

describe("delegado de kons diferidos", () => {
  it("antes: el kon no veía al agente → 401", async () => {
    expect((await pedir(host(null))).status).toBe(401);
  });

  it("ahora: ve al agente y la IP del socket", async () => {
    const r = await pedir(host(conContextoDelHost(kon())));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ scopes: ["contenido:editar"], ip: "203.0.113.7" });
  });
});
