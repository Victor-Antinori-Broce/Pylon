/**
 * El guardián en ejecución, puesto a prueba
 * ============================================================================
 *
 * Un guardián sin una prueba que lo rompa a propósito es una declaración de
 * intenciones. Aquí se comprueban las dos cosas que hay que comprobar:
 *
 *   1. Que dispara.
 *   2. Que dispara EN EL CASO QUE LA REGEX NO VE — el filtro repartido entre
 *      funciones. Eso es lo que justifica tener dos guardianes y no uno.
 *
 * Y una tercera, igual de importante: que NO dispara sobre el uso correcto,
 * porque un guardián que da falsos positivos acaba desactivado.
 */

import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { DobleWhereError } from "./guard-drizzle-where";

const cosas = pgTable("cosas", {
  id: text("id").primaryKey(),
  orgId: text("org_id"),
  tipo: text("tipo"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

beforeAll(async () => {
  const cliente = await PGlite.create();
  db = drizzle(cliente);
  await cliente.exec(`CREATE TABLE cosas (id TEXT PRIMARY KEY, org_id TEXT, tipo TEXT)`);
  await cliente.exec(
    `INSERT INTO cosas (id, org_id, tipo) VALUES ('a','org-A','x'), ('b','org-B','x')`
  );
});

describe("guardián de doble .where()", () => {
  it("deja pasar la forma correcta: una sola llamada", async () => {
    const condiciones = [eq(cosas.orgId, "org-A"), eq(cosas.tipo, "x")];
    const filas = await db
      .select()
      .from(cosas)
      .where(and(...condiciones));

    expect(filas.map((f: { id: string }) => f.id)).toEqual(["a"]);
  });

  it("lanza en el encadenado directo", () => {
    const q = db.select().from(cosas).where(eq(cosas.orgId, "org-A"));
    expect(() => q.where(eq(cosas.tipo, "x"))).toThrow(DobleWhereError);
  });

  it("lanza aunque el filtro se aplique DESDE UNA FUNCIÓN AUXILIAR", () => {
    // Esta es la forma que el guardián de texto no puede ver: en el archivo no
    // aparece ningún `q = q.where(...)`, solo dos llamadas a `aplicar`. Para la
    // expresión regular esto es invisible; para Drizzle es el mismo error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aplicar = (constructor: any, condicion: any) => constructor.where(condicion);

    let q = db.select().from(cosas);
    q = aplicar(q, eq(cosas.orgId, "org-A"));

    expect(() => aplicar(q, eq(cosas.tipo, "x"))).toThrow(DobleWhereError);
  });

  it("lanza en un bucle sobre los campos de un filtro", () => {
    // La otra forma real: recorrer un objeto `where` y llamar por cada campo.
    // Es lo que hacían `batch.ts` y `batch-api.ts` con las ESCRITURAS.
    const filtro = { orgId: "org-A", tipo: "x" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.delete(cosas);

    expect(() => {
      for (const [campo, valor] of Object.entries(filtro)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = q.where(eq((cosas as any)[campo], valor));
      }
    }).toThrow(DobleWhereError);
  });

  it("vigila también UPDATE y DELETE, no solo SELECT", () => {
    const up = db.update(cosas).set({ tipo: "y" }).where(eq(cosas.id, "a"));
    expect(() => up.where(eq(cosas.orgId, "org-A"))).toThrow(DobleWhereError);

    const del = db.delete(cosas).where(eq(cosas.id, "a"));
    expect(() => del.where(eq(cosas.orgId, "org-A"))).toThrow(DobleWhereError);
  });

  it("el mensaje dice qué hacer, no solo qué pasó", () => {
    const q = db.select().from(cosas).where(eq(cosas.id, "a"));
    let mensaje = "";
    try {
      q.where(eq(cosas.tipo, "x"));
    } catch (e) {
      mensaje = (e as Error).message;
    }

    expect(mensaje).toContain("SUSTITUYE");
    expect(mensaje).toContain("and(...condiciones)");
    // La salida cuando el filtro cruza funciones: pasar condiciones, no builders.
    expect(mensaje).toContain("no el builder");
  });

  it("builders distintos son independientes", () => {
    // El seguimiento es POR INSTANCIA: dos consultas seguidas en el mismo
    // manejador no pueden interferir, o el guardián sería inservible.
    const a = db.select().from(cosas).where(eq(cosas.id, "a"));
    const b = db.select().from(cosas).where(eq(cosas.id, "b"));
    expect(a).toBeDefined();
    expect(b).toBeDefined();
  });
});
