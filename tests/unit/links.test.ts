/**
 * Enlaces polimórficos entre entidades de cualquier kon.
 *
 * Lo que hay que demostrar aquí no es que se inserte una fila, sino las cuatro
 * decisiones que hacen que esto sea un esqueleto y no deuda:
 *
 *   1. Se leen los DOS sentidos. `same_person` no tiene dirección, y si solo
 *      se mirara `from`, quien guardó la arista al revés obtendría cero
 *      resultados sin ningún error.
 *   2. No hay duplicados, y lo garantiza un índice — no una comprobación
 *      previa, entre la que cabe otra petición.
 *   3. Un tipo sin cargador se OMITE en vez de fallar: es un kon que no está
 *      instalado, no un error.
 *   4. Una fila que el cargador no devuelve desaparece. Así se filtran los
 *      huérfanos y así el RLS de la tabla destino sigue mandando.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

import { link, unlink, unlinkAll, neighbors, resolveNeighbors } from "@kitsuden/engine";
import { readSqlFile } from "../../apps/api/src/lib/sql-file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

beforeAll(async () => {
  const cliente = await PGlite.create();
  db = drizzle(cliente);

  // Solo la migración de enlaces: es autónoma y no depende del resto de la
  // cadena, que en PGlite no puede correr por falta de pgvector.
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ruta = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../apps/api/src/db/migrations/0032_links.sql"
  );

  for (const stmt of readSqlFile(ruta, "0032").statements) {
    await cliente.exec(stmt);
  }
});

beforeEach(async () => {
  const { sql } = await import("drizzle-orm");
  await db.execute(sql.raw("DELETE FROM kitsuden_links"));
});

const contacto = { type: "crm_contacts", id: "c-1" };
const jugador = { type: "players", id: "p-1" };
const pedido = { type: "shop_orders", id: "o-1" };

describe("crear y leer", () => {
  it("enlaza dos entidades de kons distintos", async () => {
    await link(contacto, jugador, { relation: "same_person" }, db);
    const v = await neighbors(contacto, {}, db);

    expect(v).toHaveLength(1);
    expect(v[0].type).toBe("players");
    expect(v[0].id).toBe("p-1");
    expect(v[0].relation).toBe("same_person");
  });

  it("se lee desde el OTRO extremo sin saber el sentido", async () => {
    // La decisión central: quien guardó la arista no tiene que acordarse de
    // en qué dirección lo hizo.
    await link(contacto, jugador, { relation: "same_person" }, db);
    const v = await neighbors(jugador, {}, db);

    expect(v).toHaveLength(1);
    expect(v[0].type).toBe("crm_contacts");
    expect(v[0].id).toBe("c-1");
  });

  it("guarda metadatos", async () => {
    await link(pedido, contacto, { relation: "ordered_by", metadata: { canal: "web" } }, db);
    const v = await neighbors(pedido, {}, db);
    expect(v[0].metadata).toEqual({ canal: "web" });
  });

  it("filtra por relación y por tipo", async () => {
    await link(contacto, jugador, { relation: "same_person" }, db);
    await link(contacto, pedido, { relation: "ordered_by" }, db);

    expect(await neighbors(contacto, { relation: "same_person" }, db)).toHaveLength(1);
    expect(await neighbors(contacto, { type: "shop_orders" }, db)).toHaveLength(1);
    expect(await neighbors(contacto, {}, db)).toHaveLength(2);
  });
});

describe("integridad", () => {
  it("repetir la misma arista NO crea duplicados", async () => {
    // Sin esto, cada lectura posterior devolvería la misma entidad N veces.
    await link(contacto, jugador, { relation: "same_person" }, db);
    await link(contacto, jugador, { relation: "same_person" }, db);
    await link(contacto, jugador, { relation: "same_person" }, db);

    expect(await neighbors(contacto, {}, db)).toHaveLength(1);
  });

  it("la misma pareja con OTRA relación sí es una arista distinta", async () => {
    await link(contacto, jugador, { relation: "same_person" }, db);
    await link(contacto, jugador, { relation: "invited_by" }, db);
    expect(await neighbors(contacto, {}, db)).toHaveLength(2);
  });

  it("una entidad no puede enlazarse consigo misma", async () => {
    // Una arista a sí misma no significa nada y ensucia toda consulta de
    // vecinos. Se rechaza en la API y también con un CHECK en la tabla.
    expect(link(contacto, { ...contacto }, {}, db)).rejects.toThrow(/consigo misma/);
  });

  it("rechaza referencias incompletas en vez de guardar basura", async () => {
    expect(link({ type: "", id: "x" }, jugador, {}, db)).rejects.toThrow(/from/);
    expect(link(contacto, { type: "players", id: "" }, {}, db)).rejects.toThrow(/to/);
  });
});

describe("borrado", () => {
  it("unlink borra en cualquiera de los dos sentidos", async () => {
    await link(contacto, jugador, { relation: "same_person" }, db);
    // Se pide al revés de como se guardó: debe encontrarla igual.
    await unlink(jugador, contacto, "same_person", db);
    expect(await neighbors(contacto, {}, db)).toHaveLength(0);
  });

  it("unlinkAll limpia ambos lados de una entidad", async () => {
    await link(contacto, jugador, { relation: "same_person" }, db);
    await link(pedido, contacto, { relation: "ordered_by" }, db);

    await unlinkAll(contacto, db);

    expect(await neighbors(contacto, {}, db)).toHaveLength(0);
    expect(await neighbors(jugador, {}, db)).toHaveLength(0);
    expect(await neighbors(pedido, {}, db)).toHaveLength(0);
  });
});

describe("resolución: el motor no conoce ninguna tabla", () => {
  it("un tipo SIN cargador se omite — es un kon no instalado, no un error", async () => {
    await link(contacto, jugador, { relation: "same_person" }, db);
    await link(contacto, pedido, { relation: "ordered_by" }, db);

    const v = await neighbors(contacto, {}, db);
    const r = await resolveNeighbors(v, {
      players: async (ids) => ids.map((id) => ({ id, nick: "Ana" })),
      // sin cargador para shop_orders: la tienda no está instalada
    });

    expect(r).toHaveLength(1);
    expect(r[0].entity).toEqual({ id: "p-1", nick: "Ana" });
  });

  it("una fila que el cargador no devuelve DESAPARECE", async () => {
    // Así se filtran los huérfanos (la fila se borró) y así el RLS de la tabla
    // destino sigue mandando (no puedes verla, el cargador no te la da).
    await link(contacto, jugador, { relation: "same_person" }, db);

    const v = await neighbors(contacto, {}, db);
    const r = await resolveNeighbors(v, {
      players: async () => [], // borrada, o sin permiso
    });

    expect(r).toHaveLength(0);
  });

  it("agrupa por tipo: un cargador por tipo, no uno por fila", async () => {
    // Si llamara por fila, cien vecinos serían cien consultas.
    await link(contacto, { type: "players", id: "p-1" }, {}, db);
    await link(contacto, { type: "players", id: "p-2" }, {}, db);
    await link(contacto, { type: "players", id: "p-3" }, {}, db);

    let llamadas = 0;
    const v = await neighbors(contacto, {}, db);
    const r = await resolveNeighbors(v, {
      players: async (ids) => {
        llamadas++;
        return ids.map((id) => ({ id }));
      },
    });

    expect(llamadas).toBe(1);
    expect(r).toHaveLength(3);
  });
});
