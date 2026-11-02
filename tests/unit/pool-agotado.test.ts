/**
 * Pool de Postgres agotado → 503 + Retry-After, no 500 (2026-10-18).
 *
 * Con carga, `GET /api/blog` respondía 500: pg-pool lanzaba «timeout exceeded
 * when trying to connect» y el `catch` del kon devolvía su propio 500. Aquí se
 * usa un `pg.Pool` DE VERDAD contra un servidor TCP que acepta y no contesta
 * (como un Postgres saturado): `connect` agota su espera y la petición, aunque
 * el handler capture el error y responda 500, sale como 503 con Retry-After.
 */
import { createRequire } from "node:module";
import { createServer, type Server, type Socket } from "node:net";
import { resolve } from "node:path";

import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as Pg from "../../apps/api/node_modules/@types/pg";
import {
  configuracionDelPool,
  esPoolAgotado,
  poolAgotadoA503,
  REINTENTO_POOL_S,
  vigilarPool,
} from "../../apps/api/src/lib/pool-agotado";

// `pg` es dependencia de apps/api, no de la raíz: se carga desde allí, con sus tipos.
const pg = createRequire(resolve(__dirname, "../../apps/api/package.json"))("pg") as typeof Pg;

let servidor: Server;
const sockets: Socket[] = [];
let puerto = 0;

beforeAll(async () => {
  servidor = createServer((s) => sockets.push(s)); // acepta y calla
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  puerto = (servidor.address() as { port: number }).port;
});

afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((ok) => servidor.close(ok));
});

function appConPool() {
  const pool = vigilarPool(
    new pg.Pool({
      connectionString: `postgresql://nadie@127.0.0.1:${puerto}/nada`,
      max: 1,
      connectionTimeoutMillis: 150,
    })
  );
  const app = new Hono();
  app.use("*", poolAgotadoA503());
  app.use("*", async (c, next) => {
    c.header("access-control-allow-origin", "https://ejemplo.test");
    await next();
  });
  // Como los kons: captura y responde 500 por su cuenta.
  app.get("/api/blog", async (c) => {
    try {
      await pool.query("SELECT 1");
      return c.json({ ok: true });
    } catch {
      return c.json({ error: "Failed to fetch posts" }, 500);
    }
  });
  // Sin capturar: llega a onError.
  app.get("/api/sin-catch", async (c) => {
    await pool.query("SELECT 1");
    return c.json({ ok: true });
  });
  app.onError((_err, c) => c.json({ error: "Internal Server Error" }, 500));
  // Un 500 que no tiene que ver con el pool sigue siendo 500.
  app.get("/api/roto", (c) => c.json({ error: "x" }, 500));
  return { app, pool };
}

describe("pool agotado", () => {
  it("un kon que captura el error y responde 500 sale como 503 + Retry-After", async () => {
    const { app, pool } = appConPool();
    const r = await app.request("/api/blog");
    expect(r.status).toBe(503);
    expect(r.headers.get("retry-after")).toBe(String(REINTENTO_POOL_S));
    // Conserva las cabeceras ya puestas (CORS): si no, el navegador no lo lee
    expect(r.headers.get("access-control-allow-origin")).toBe("https://ejemplo.test");
    expect(await r.json()).toMatchObject({ error: "Service Unavailable" });
    await pool.end().catch(() => {});
  });

  it("un error sin capturar (onError) también", async () => {
    const { app, pool } = appConPool();
    expect((await app.request("/api/sin-catch")).status).toBe(503);
    await pool.end().catch(() => {});
  });

  it("un 500 que no viene del pool no se toca", async () => {
    const { app, pool } = appConPool();
    expect((await app.request("/api/roto")).status).toBe(500);
    await pool.end().catch(() => {});
  });

  it("reconoce los dos mensajes de pg-pool, también envueltos en `cause`", () => {
    expect(esPoolAgotado(new Error("timeout exceeded when trying to connect"))).toBe(true);
    const envuelto = new Error("Failed query: select ...", {
      cause: new Error("Connection terminated due to connection timeout"),
    });
    expect(esPoolAgotado(envuelto)).toBe(true);
    expect(esPoolAgotado(new Error("relation does not exist"))).toBe(false);
  });

  it("tamaño y esperas del pool salen del entorno, con valores por defecto", () => {
    expect(configuracionDelPool({})).toEqual({
      max: 20,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    expect(
      configuracionDelPool({ DB_POOL_MAX: "40", DB_POOL_CONNECTION_TIMEOUT_MS: "8000" })
    ).toMatchObject({
      max: 40,
      connectionTimeoutMillis: 8000,
    });
    // Basura → el valor por defecto, no NaN
    expect(configuracionDelPool({ DB_POOL_MAX: "muchos" }).max).toBe(20);
  });
});
