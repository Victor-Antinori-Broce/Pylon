/**
 * El helper de ROLLBACK por test (kitsuden2.md C6), contra Postgres de verdad:
 * qué entra en la transacción del test, qué no, y cuánto se gana frente a
 * limpiar con DELETE. Ver la cabecera de `rollback.ts`.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { dbDeLaPeticion, transaccionRls, type ConexionTransaccional } from "../../../../packages/engine/src/rls-peticion";
import { db } from "../db";

import { conRollback, itConRollback } from "./rollback";
import { isDatabaseAvailable } from "./setup";

const TABLA = "rbt_prueba_rollback";
let disponible = false;
const instancia = dbDeLaPeticion(db);

function filas(r: unknown): Array<Record<string, unknown>> {
  return ((r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
}

async function cuantas(marca: string): Promise<number> {
  const [f] = filas(await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${TABLA} WHERE marca = '${marca}'`)));
  return Number(f?.n ?? 0);
}

const app = new Hono();
app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
app.post("/escribe/:marca", async (c) => {
  await instancia.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ('${c.req.param("marca")}')`));
  return c.json({ ok: true }, 201);
});

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
  if (!disponible) return;
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ${TABLA} (id serial PRIMARY KEY, marca text NOT NULL)`));
  await db.execute(sql.raw(`DELETE FROM ${TABLA}`));
});

afterAll(async () => {
  if (!disponible) return;
  await db.execute(sql.raw(`DROP TABLE IF EXISTS ${TABLA}`));
});

describe("rollback por test", () => {
  it("lo escrito por dbDeLaPeticion (y repo, y los kons) se revierte", async () => {
    if (!disponible) return;
    await conRollback(async () => {
      await instancia.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ('a')`));
      // Dentro del test se ve…
      const [f] = filas(await instancia.execute(sql.raw(`SELECT count(*)::int AS n FROM ${TABLA} WHERE marca = 'a'`)));
      expect(Number(f?.n)).toBe(1);
    });
    // …y fuera ya no existe.
    expect(await cuantas("a")).toBe(0);
  });

  it("un savepoint anidado funciona y también se revierte", async () => {
    if (!disponible) return;
    await conRollback(async (tx) => {
      await tx.transaction(async (sp: typeof tx) => {
        await sp.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ('sp')`));
      });
      const [f] = filas(await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM ${TABLA} WHERE marca = 'sp'`)));
      expect(Number(f?.n)).toBe(1);
    });
    expect(await cuantas("sp")).toBe(0);
  });

  it("una petición por transaccionRls reutiliza la transacción del test", async () => {
    if (!disponible) return;
    await conRollback(async () => {
      const res = await app.request("/escribe/http", { method: "POST" });
      expect(res.status).toBe(201);
    });
    expect(await cuantas("http")).toBe(0);
  });

  it("el db global usado directamente NO entra (se confirma)", async () => {
    if (!disponible) return;
    await conRollback(async () => {
      await db.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ('global')`));
    });
    expect(await cuantas("global")).toBe(1);
    await db.execute(sql.raw(`DELETE FROM ${TABLA} WHERE marca = 'global'`));
  });

  itConRollback("itConRollback: el cuerpo corre en la transacción", async (tx) => {
    if (!disponible) return;
    await tx.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ('it')`));
    const [f] = filas(await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM ${TABLA} WHERE marca = 'it'`)));
    expect(Number(f?.n)).toBe(1);
  });

  it("…y después no queda nada", async () => {
    if (!disponible) return;
    expect(await cuantas("it")).toBe(0);
  });

  it("es más rápido que limpiar con DELETE (medido)", async () => {
    if (!disponible) return;
    const N = 40;
    const FILAS = 25;
    const valores = Array.from({ length: FILAS }, (_, i) => `('m${i}')`).join(",");

    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      await db.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ${valores}`));
      await db.execute(sql.raw(`DELETE FROM ${TABLA}`));
    }
    const conDelete = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < N; i++) {
      await conRollback(async (tx) => {
        await tx.execute(sql.raw(`INSERT INTO ${TABLA} (marca) VALUES ${valores}`));
      });
    }
    const conRollbackMs = performance.now() - t1;

    console.log(
      `[C6] ${N} tests × ${FILAS} filas: DELETE ${conDelete.toFixed(0)} ms · ROLLBACK ${conRollbackMs.toFixed(0)} ms`
    );
    expect(await cuantas("m0")).toBe(0);
    // No se exige un factor: depende de la máquina. Que no sea peor.
    expect(conRollbackMs).toBeLessThan(conDelete * 1.5);
  }, 60_000);
});
