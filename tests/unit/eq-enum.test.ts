/**
 * Filtros de enum que llegan de fuera
 * ============================================================================
 *
 * Este patrón estaba repetido 25 veces en 15 archivos:
 *
 *     if (status) conditions.push(eq(tabla.status, status as any));
 *
 * `status` sale de la query string. Con un valor que no pertenece al enum, la
 * consulta NO devuelve cero filas: Postgres falla con
 * `invalid input value for enum ...`. Una errata en la URL producía un 500 con
 * el nombre interno del tipo en el mensaje.
 *
 * Estas pruebas van contra PGlite —Postgres de verdad— porque el
 * comportamiento que se fija es del motor, no de Drizzle: un doble no habría
 * demostrado que sin el filtro la consulta REVIENTA.
 */

import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { eqEnum } from "../../packages/engine/src/db-conditions";

const estadoEnum = pgEnum("estado_doc", ["draft", "published", "archived"]);
const docs = pgTable("docs", {
  id: text("id").primaryKey(),
  titulo: text("titulo"),
  status: estadoEnum("status"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

beforeAll(async () => {
  const cliente = await PGlite.create();
  db = drizzle(cliente);
  await cliente.exec(`CREATE TYPE estado_doc AS ENUM ('draft','published','archived')`);
  await cliente.exec(`CREATE TABLE docs (id TEXT PRIMARY KEY, titulo TEXT, status estado_doc)`);
  await cliente.exec(
    `INSERT INTO docs (id, titulo, status) VALUES ('a','uno','draft'), ('b','dos','published')`
  );
});

describe("eqEnum", () => {
  it("un valor válido filtra", async () => {
    const filas = await db.select().from(docs).where(eqEnum(docs.status, "draft"));
    expect(filas.map((f: { id: string }) => f.id)).toEqual(["a"]);
  });

  it("un valor que no pertenece al enum NO revienta: se ignora", async () => {
    // Esto es lo que antes daba 500.
    const filas = await db
      .select()
      .from(docs)
      .where(and(eqEnum(docs.status, "publicado")));
    expect(filas).toHaveLength(2);
  });

  it("el `as any` que se sustituye SÍ revienta — la razón de existir de esto", async () => {
    // Drizzle envuelve el error ("Failed query: ...") y deja el de Postgres en
    // `cause`. Lo que importa es que LANZA: con el patrón viejo, un parámetro
    // mal escrito no devolvía cero filas, tumbaba la petición.
    let fallo: unknown;
    try {
      await db
        .select()
        .from(docs)
        .where(eq(docs.status, "publicado" as any));
    } catch (e) {
      fallo = e;
    }

    expect(fallo).toBeInstanceOf(Error);
    const cadena = `${(fallo as Error).message} ${String((fallo as Error).cause ?? "")}`;
    expect(cadena).toMatch(/invalid input value for enum|estado_doc/i);
  });

  it("undefined y cadena vacía no filtran", async () => {
    expect(eqEnum(docs.status, undefined)).toBeUndefined();
    expect(eqEnum(docs.status, "")).toBeUndefined();
    expect(eqEnum(docs.status, 42)).toBeUndefined();
  });

  it("sobre una columna de texto normal compara tal cual", async () => {
    // Sin `enumValues` no hay lista contra la que validar: devolver undefined
    // silenciaría un filtro legítimo.
    const filas = await db.select().from(docs).where(eqEnum(docs.titulo, "uno"));
    expect(filas.map((f: { id: string }) => f.id)).toEqual(["a"]);
  });

  it("lee los valores de la propia columna, sin lista paralela", () => {
    // Si el esquema añade un estado, el filtro lo acepta sin tocar nada aquí.
    expect(eqEnum(docs.status, "archived")).toBeDefined();
    expect(eqEnum(docs.status, "borrador")).toBeUndefined();
  });
});
