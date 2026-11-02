/**
 * Las puertas de rol leen el rol FRESCO, no el de la caché en cookie
 * (auditoría 2026-10-15). Con `cookieCache` de better-auth, a un admin
 * degradado le seguía valiendo el rol viejo hasta 5 minutos.
 */
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { exigirAdmin, setRefrescoDeSesion } from "../../apps/api/src/middleware/auth-guard";

function app() {
  const a = new Hono();
  a.use("*", async (c, next) => {
    // Lo que deja el middleware global desde la caché en cookie: rol viejo
    (c as any).set("user", { id: "u1", role: "admin" });
    (c as any).set("session", { id: "s1" });
    await next();
  });
  a.use("*", exigirAdmin);
  a.all("*", (c) => c.text("dentro"));
  return a;
}

afterEach(() => {
  // Valor por defecto razonable para el resto de la suite: confía en el contexto
  setRefrescoDeSesion(async () => ({ role: "admin" }));
});

describe("exigirRol con sesión humana", () => {
  it("degradado en la base → 403 aunque la cookie diga admin", async () => {
    setRefrescoDeSesion(async () => ({ role: "user" }));
    expect((await app().request("/api/items/x")).status).toBe(403);
  });

  it("sesión cerrada en la base → 401", async () => {
    setRefrescoDeSesion(async () => null);
    expect((await app().request("/api/items/x")).status).toBe(401);
  });

  it("sigue siendo admin → dentro", async () => {
    setRefrescoDeSesion(async () => ({ role: "admin" }));
    expect((await app().request("/api/items/x")).status).toBe(200);
  });
});
