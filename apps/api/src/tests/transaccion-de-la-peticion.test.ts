/**
 * La transacción de la petición contra Postgres DE VERDAD (2026-10-23)
 * ============================================================================
 *
 * Los tres riesgos de «una petición = una transacción», con el `db` de la API
 * (pool de pg envuelto por `conTransaccionesPerezosas`) y las piezas del
 * engine que monta el anfitrión delante de cada kon:
 *
 *   1. un `Promise.all` no llama a `client.query()` con otra en curso (lo que
 *      pg 8 avisa como obsoleto y pg 9 quita);
 *   2. un error de SQL tragado deja la transacción abortada: lo siguiente
 *      falla con 25P02 y la escritura se pierde (y ya no responde 201); con
 *      `intentarSql` va en su savepoint y todo lo demás se guarda;
 *   3. una ruta que espera algo de fuera ANTES de consultar no retiene una
 *      conexión «idle in transaction».
 *
 * La versión sin Postgres (orden exacto de sentencias): tests/unit/
 * rls-transaccion-perezosa.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import pg from "pg";

import {
  dbDeLaPeticion,
  intentarSql,
  transaccionRls,
  type ConexionTransaccional,
} from "../../../../packages/engine/src/rls-peticion";
import { db } from "../db";

import { isDatabaseAvailable } from "./setup";

const TABLA = "rtx_prueba_transaccion";
let disponible = false;
const instancia = dbDeLaPeticion(db);

/** Código SQLSTATE de un error de Drizzle (lo envuelve en `cause`). */
function codigoDe(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

const app = new Hono();
app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
app.get("/paralelo", async (c) => {
  const filas = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      instancia.execute(sql`SELECT ${i}::int AS n, pg_sleep(0.005)`)
    )
  );
  return c.json({ n: filas.length });
});
app.post("/tragado/:marca", async (c) => {
  const marca = c.req.param("marca");
  await instancia.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ('${marca}')`));
  try {
    await instancia.execute(sql`SELECT * FROM rtx_tabla_que_no_existe`);
  } catch {
    // tragado, como hacían varias rutas: «si no está, seguimos»
  }
  const segunda = await instancia.execute(sql`SELECT 1`).then(
    () => "bien",
    (e: unknown) => codigoDe(e)
  );
  return c.json({ segunda }, 201);
});
app.post("/con-savepoint/:marca", async (c) => {
  const marca = c.req.param("marca");
  await instancia.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ('${marca}')`));
  const opcional = await intentarSql(
    () => instancia.execute(sql`SELECT * FROM rtx_tabla_que_no_existe`),
    null
  );
  const segunda = await instancia.execute(sql`SELECT 1`).then(
    () => "bien",
    (e: unknown) => codigoDe(e)
  );
  return c.json({ opcional, segunda }, 201);
});
app.get("/espera-fuera", async (c) => {
  // Una llamada externa lenta ANTES de la primera consulta.
  await new Promise((r) => setTimeout(r, 400));
  await instancia.execute(sql`SELECT 1`);
  return c.json({ ok: true });
});

/** Cuántas veces se llamó a `client.query()` con otra consulta en curso en ese cliente. */
let solapes = 0;
const queryOriginal = pg.Client.prototype.query;

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
  if (!disponible) return;
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS ${TABLA} (id serial PRIMARY KEY, marca text NOT NULL)`)
  );
  await db.execute(sql.raw(`DELETE FROM ${TABLA}`));
  const activas = new WeakMap<object, number>();
  pg.Client.prototype.query = function (this: object, ...args: unknown[]) {
    const n = activas.get(this) ?? 0;
    if (n > 0) solapes++;
    activas.set(this, n + 1);
    const r = (queryOriginal as (...a: unknown[]) => unknown).apply(this, args);
    const fin = () => activas.set(this, (activas.get(this) ?? 1) - 1);
    if (r && typeof (r as Promise<unknown>).then === "function")
      (r as Promise<unknown>).then(fin, fin);
    else fin();
    return r;
  } as typeof queryOriginal;
});

afterAll(async () => {
  pg.Client.prototype.query = queryOriginal;
  if (disponible) await db.execute(sql.raw(`DROP TABLE IF EXISTS ${TABLA}`));
});

async function marcas(): Promise<string[]> {
  const r = (await db.execute(sql.raw(`SELECT marca FROM ${TABLA} ORDER BY id`))) as unknown as {
    rows: { marca: string }[];
  };
  return r.rows.map((f) => f.marca);
}

describe("transacción de la petición (Postgres real)", () => {
  it("1. Promise.all de 20 consultas: ningún client.query() con otra en curso", async () => {
    if (!disponible) return;
    solapes = 0;
    const r = await app.request("/paralelo");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ n: 20 });
    expect(solapes).toBe(0);
  });

  it("2a. error tragado SIN savepoint: lo siguiente da 25P02, no se guarda nada y no responde 201", async () => {
    if (!disponible) return;
    const r = await app.request("/tragado/sin", { method: "POST" });
    // La ruta vio el 25P02 y contestaba 201; Postgres convirtió el COMMIT en
    // ROLLBACK y el middleware lo cambia por un 500 en vez de mentir.
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ code: "KITSUDEN_E_INTERNAL" });
    expect(await marcas()).not.toContain("sin");
  });

  it("2b. el mismo error CON intentarSql: lo siguiente va bien y la escritura se guarda", async () => {
    if (!disponible) return;
    const r = await app.request("/con-savepoint/con", { method: "POST" });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ opcional: null, segunda: "bien" });
    expect(await marcas()).toContain("con");
  });

  it("3. esperar fuera antes de consultar no deja una conexión «idle in transaction»", async () => {
    if (!disponible) return;
    const observador = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await observador.connect();
    try {
      const peticion = app.request("/espera-fuera");
      await new Promise((r) => setTimeout(r, 150));
      const { rows } = await observador.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'"
      );
      expect(rows[0].n).toBe(0);
      expect((await peticion).status).toBe(200);
    } finally {
      await observador.end();
    }
  });
});
