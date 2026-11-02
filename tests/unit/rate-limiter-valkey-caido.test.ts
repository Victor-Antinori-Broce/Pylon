/**
 * Limitador con Valkey CAÍDO (auditoría 2026-10-18).
 *
 * `getValkeyClient()` no devuelve null cuando Valkey no está: lanza. La
 * llamada estaba fuera del `try` de `checkRateLimit`, la excepción llegaba al
 * `catch {}` del middleware —que deja pasar— y el login, el alta, la
 * recuperación de contraseña y el enlace mágico se quedaban SIN freno: fuerza
 * bruta y bombardeo de correos ilimitados mientras Valkey estuviera caído.
 * Las rutas de kons `failClosed` (pedidos de la tienda, newsletter) igual.
 *
 * Aquí se ejecuta el middleware de verdad con un Valkey que rechaza la
 * conexión. Va en vitest y no en bun test porque `vi.mock` es por fichero;
 * el `mock.module` de bun se filtraría a toda la suite (test-suite-caveats).
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/api/src/lib/valkey", () => ({
  // Valkey CONFIGURADO y caído (sin URL, el limitador cuenta en memoria siempre:
  // tests/unit/rate-limiter-sin-valkey.test.ts).
  valkeyConfigurado: () => true,
  getValkeyClient: () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:6379")),
}));

const { globalRateLimit, rateLimit, RATE_LIMIT_CONFIGS, vaciarReservaEnMemoria } =
  await import("../../apps/api/src/lib/rate-limiter");

function appGlobal() {
  const app = new Hono();
  app.use("/api/*", globalRateLimit());
  app.all("/api/*", (c) => c.json({ ok: true }));
  return app;
}

/** Hono lee la IP del socket de `env.ip` (lo que pone bun en producción). */
const desde = (ip: string) => ({ ip: { address: ip, family: "IPv4", port: 4000 } });

const post = (app: Hono, camino: string, ip = "203.0.113.9") =>
  app.request(camino, { method: "POST" }, desde(ip));

beforeEach(() => {
  vaciarReservaEnMemoria();
  delete process.env.RATE_LIMIT_MEMORY_MAX_KEYS;
});
afterEach(() => {
  delete process.env.RATE_LIMIT_MEMORY_MAX_KEYS;
});

describe("rutas que mandan correo o comprueban contraseña: fallan CERRADAS", () => {
  const SENSIBLES = [
    "/api/auth/sign-in/email",
    "/api/auth/sign-up/email",
    "/api/auth/request-password-reset",
    "/api/auth/forget-password",
    "/api/auth/send-verification-email",
    "/api/auth/change-password",
    "/api/auth/change-email",
    "/api/auth/delete-user",
    "/api/auth/reset-password",
    "/api/members/signin",
  ];

  it.each(SENSIBLES)("%s marca failClosed", (camino) => {
    expect(RATE_LIMIT_CONFIGS[camino]?.failClosed).toBe(true);
  });

  it("el login sigue frenado sin Valkey: el intento 11 en 5 min da 429", async () => {
    const app = appGlobal();
    for (let i = 0; i < 10; i++) {
      expect((await post(app, "/api/auth/sign-in/email")).status).toBe(200);
    }
    const res = await post(app, "/api/auth/sign-in/email");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("el cupo es por cliente: otra IP no hereda el bloqueo", async () => {
    const app = appGlobal();
    for (let i = 0; i < 11; i++) await post(app, "/api/auth/sign-in/email", "203.0.113.1");
    expect((await post(app, "/api/auth/sign-in/email", "203.0.113.2")).status).toBe(200);
  });

  it("si tampoco se puede contar en memoria: 503 con Retry-After y mensaje genérico", async () => {
    process.env.RATE_LIMIT_MEMORY_MAX_KEYS = "2";
    const app = appGlobal();
    expect((await post(app, "/api/auth/sign-up/email", "198.51.100.1")).status).toBe(200);
    expect((await post(app, "/api/auth/sign-up/email", "198.51.100.2")).status).toBe(200);

    const res = await post(app, "/api/auth/sign-up/email", "198.51.100.3");
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const cuerpo = JSON.stringify(await res.json());
    // Genérico: ni la pieza que falla ni el error interno.
    expect(cuerpo).not.toMatch(/valkey|redis|ECONNREFUSED|6379/i);
  });
});

describe("el resto de rutas siguen fallando ABIERTAS", () => {
  it("una lectura normal pasa aunque Valkey esté caído", async () => {
    process.env.RATE_LIMIT_MEMORY_MAX_KEYS = "1";
    const app = appGlobal();
    for (let i = 0; i < 400; i++) {
      // Por encima del 300/min del global: sin contador no se frena.
      if (i % 100 === 0) expect((await post(app, "/api/posts")).status).toBe(200);
    }
    expect((await post(app, "/api/posts", "192.0.2.77")).status).toBe(200);
  });
});

describe("límites declarados por kons (rateLimit) con failClosed", () => {
  it("frenan sin Valkey y no dejan pasar sin límite", async () => {
    const app = new Hono();
    app.use("/api/shop/orders", rateLimit({ limit: 2, window: 60, failClosed: true }));
    app.post("/api/shop/orders", (c) => c.json({ ok: true }));

    expect((await post(app, "/api/shop/orders")).status).toBe(200);
    expect((await post(app, "/api/shop/orders")).status).toBe(200);
    expect((await post(app, "/api/shop/orders")).status).toBe(429);
  });

  it("sin failClosed, el kon falla abierto", async () => {
    const app = new Hono();
    app.use("/api/x/unsubscribe", rateLimit({ limit: 1, window: 60 }));
    app.post("/api/x/unsubscribe", (c) => c.json({ ok: true }));
    for (let i = 0; i < 3; i++) expect((await post(app, "/api/x/unsubscribe")).status).toBe(200);
  });
});
