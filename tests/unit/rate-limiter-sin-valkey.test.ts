/**
 * El limitador SIN Valkey configurado (instancia única, kitsuden2.md B1b)
 * ============================================================================
 *
 * Sin `VALKEY_URL` todas las rutas cuentan en la memoria del proceso —no solo
 * las `failClosed`, como con Valkey caído— y nunca en Postgres. Si el tope de
 * claves se llena, las rutas normales dejan pasar y las `failClosed` rechazan
 * con 503 (el mismo criterio que con Valkey caído).
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intentos = vi.hoisted(() => ({ n: 0 }));

vi.mock("../../apps/api/src/lib/valkey", () => ({
  valkeyConfigurado: () => false,
  getValkeyClient: () => {
    intentos.n++;
    return Promise.reject(new Error("no debería llamarse sin VALKEY_URL"));
  },
}));

const { globalRateLimit, vaciarReservaEnMemoria } = await import(
  "../../apps/api/src/lib/rate-limiter"
);

function appGlobal() {
  const app = new Hono();
  app.use("/api/*", globalRateLimit());
  app.all("/api/*", (c) => c.json({ ok: true }));
  return app;
}

const desde = (ip: string) => ({ ip: { address: ip, family: "IPv4", port: 4000 } });
const get = (app: Hono, camino: string, ip = "203.0.113.20") =>
  app.request(camino, { method: "GET" }, desde(ip));
const post = (app: Hono, camino: string, ip = "203.0.113.20") =>
  app.request(camino, { method: "POST" }, desde(ip));

beforeEach(() => {
  vaciarReservaEnMemoria();
  intentos.n = 0;
  delete process.env.RATE_LIMIT_MEMORY_MAX_KEYS;
});
afterEach(() => {
  delete process.env.RATE_LIMIT_MEMORY_MAX_KEYS;
});

describe("limitador sin VALKEY_URL", () => {
  it("una ruta normal SÍ se frena (en memoria), no pasa sin límite", async () => {
    const app = appGlobal();
    let ultimo = 200;
    for (let i = 0; i < 400 && ultimo === 200; i++) ultimo = (await get(app, "/api/posts")).status;
    expect(ultimo).toBe(429);
  });

  it("no intenta conectar con Valkey", async () => {
    const app = appGlobal();
    await get(app, "/api/posts");
    await post(app, "/api/auth/sign-in/email");
    expect(intentos.n).toBe(0);
  });

  it("el login se frena igual: el intento 11 en 5 min da 429", async () => {
    const app = appGlobal();
    for (let i = 0; i < 10; i++) expect((await post(app, "/api/auth/sign-in/email")).status).toBe(200);
    expect((await post(app, "/api/auth/sign-in/email")).status).toBe(429);
  });

  it("tope lleno: la ruta normal deja pasar, la failClosed rechaza", async () => {
    process.env.RATE_LIMIT_MEMORY_MAX_KEYS = "1";
    const app = appGlobal();
    expect((await get(app, "/api/posts", "198.51.100.1")).status).toBe(200);
    expect((await get(app, "/api/posts", "198.51.100.2")).status).toBe(200);
    expect((await post(app, "/api/auth/sign-up/email", "198.51.100.3")).status).toBe(503);
  });
});
