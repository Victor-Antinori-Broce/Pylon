/**
 * El «día 2» de defineModelo con filas EXISTENTES (kitsuden2.md C3)
 * ============================================================================
 *
 * `modelos-makemigrations.test.ts` cubre el diff y un ALTER sobre una fila.
 * Esto cubre lo que solo se ve con datos de verdad en la tabla, aplicando el
 * SQL generado sobre PGlite, igual que el runner (una transacción por fichero):
 *
 *   1. Volver obligatorio un campo opcional:
 *        · con `porDefecto`: el generador rellena los NULL antes del SET NOT NULL;
 *        · sin él: avisa, y aplicarlo con NULL FALLA… sin dejar nada a medias.
 *      El camino que funciona: rellenar (una migración de datos) y luego
 *      volverlo obligatorio.
 *   2. Hacer único un campo con duplicados: falla entero, nada a medias.
 *   3. Estrechar los valores (una CHECK) con filas que ya no cumplen: falla.
 *   4. Un campo obligatorio NUEVO con valor por defecto: las filas viejas lo toman.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import {
  campo,
  defineModelo,
  generarMigracionDeModelos,
  instantaneaDeModelos,
  type Modelo,
} from "@kitsuden/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const RAIZ = resolve(__dirname, "../..");
const KON = "dia2";

function tarea(campos: Modelo["campos"]): Modelo {
  return defineModelo({ nombre: "task", descripcion: "A task.", campos, acceso: { leer: "publico", escribir: "staff" } });
}

const v1 = tarea({
  title: campo.texto({ max: 200, requerido: true }),
  owner: campo.texto({ max: 80 }),
  code: campo.texto({ max: 20 }),
  status: campo.enumerado(["todo", "doing", "done", "dropped"], { requerido: true, porDefecto: "todo" }),
});

let pg: PGlite;

/** Como el runner: el fichero entero en UNA transacción. */
async function aplicar(sql: string): Promise<void> {
  await pg.exec(`BEGIN;\n${sql}\nCOMMIT;`).catch(async (e) => {
    await pg.exec("ROLLBACK").catch(() => {});
    throw e;
  });
}

async function columnas(): Promise<Record<string, { nulo: string; def: string | null }>> {
  const r = await pg.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
    "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'tasks'"
  );
  return Object.fromEntries(r.rows.map((c) => [c.column_name, { nulo: c.is_nullable, def: c.column_default }]));
}

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(readFileSync(resolve(RAIZ, "apps/api/src/db/funciones-de-agente.sql"), "utf8"));
  await aplicar(generarMigracionDeModelos(null, [v1], { kon: KON }).sql);
  // Filas de «la semana pasada»: owner a NULL, códigos repetidos, un estado que luego se quita.
  await pg.exec(`INSERT INTO tasks (title, owner, code, status) VALUES
    ('a', NULL, 'X', 'todo'), ('b', 'ana', 'X', 'dropped'), ('c', 'luis', 'Y', 'done')`);
});

afterEach(async () => {
  await pg.close();
});

const antes = () => instantaneaDeModelos([v1], KON);

describe("día 2 con filas existentes", () => {
  it("opcional → obligatorio CON valor por defecto: rellena los NULL y aplica", async () => {
    const v2 = tarea({ ...v1.campos, owner: campo.texto({ max: 80, requerido: true, porDefecto: "nobody" }) });
    const r = generarMigracionDeModelos(antes(), [v2], { kon: KON });
    expect(r.sql).toContain(`UPDATE "tasks" SET "owner" = 'nobody' WHERE "owner" IS NULL;`);
    await aplicar(r.sql);
    const filas = await pg.query<{ owner: string }>("SELECT owner FROM tasks ORDER BY title");
    expect(filas.rows.map((f) => f.owner)).toEqual(["nobody", "ana", "luis"]);
    expect((await columnas()).owner?.nulo).toBe("NO");
  });

  it("opcional → obligatorio SIN valor por defecto: avisa, falla con NULL y no deja nada a medias", async () => {
    const v2 = tarea({ ...v1.campos, owner: campo.texto({ max: 80, requerido: true }) });
    const r = generarMigracionDeModelos(antes(), [v2], { kon: KON });
    expect(r.avisos.join("\n")).toMatch(/fill them first/);
    await expect(aplicar(r.sql)).rejects.toThrow(/null/i);
    expect((await columnas()).owner?.nulo).toBe("YES");
  });

  it("…el camino que funciona: rellenar primero (migración de datos) y luego volverlo obligatorio", async () => {
    await aplicar(`UPDATE tasks SET owner = 'sin-asignar' WHERE owner IS NULL;`);
    const v2 = tarea({ ...v1.campos, owner: campo.texto({ max: 80, requerido: true }) });
    await aplicar(generarMigracionDeModelos(antes(), [v2], { kon: KON }).sql);
    expect((await columnas()).owner?.nulo).toBe("NO");
  });

  it("hacer único un campo con duplicados falla entero, sin dejar el índice a medias", async () => {
    const v2 = tarea({ ...v1.campos, code: campo.texto({ max: 20, unico: true }) });
    const r = generarMigracionDeModelos(antes(), [v2], { kon: KON });
    await expect(aplicar(r.sql)).rejects.toThrow(/duplicate|unique/i);
    const restr = await pg.query("SELECT conname FROM pg_constraint WHERE conname LIKE 'tasks_code%'");
    expect(restr.rows).toHaveLength(0);
  });

  it("estrechar los valores con filas que ya no cumplen falla (y la CHECK vieja sigue)", async () => {
    const v2 = tarea({ ...v1.campos, status: campo.enumerado(["todo", "doing", "done"], { requerido: true, porDefecto: "todo" }) });
    const r = generarMigracionDeModelos(antes(), [v2], { kon: KON });
    await expect(aplicar(r.sql)).rejects.toThrow(/check/i);
    // La CHECK de antes sigue en pie: 'dropped' vale, lo inventado no.
    await pg.exec("INSERT INTO tasks (title, status) VALUES ('d', 'dropped')");
    await expect(pg.exec("INSERT INTO tasks (title, status) VALUES ('e', 'inventado')")).rejects.toThrow(/check/i);
  });

  it("un campo obligatorio NUEVO con valor por defecto: las filas viejas lo toman", async () => {
    const v2 = tarea({ ...v1.campos, points: campo.entero({ min: 0, requerido: true, porDefecto: 1 }) });
    await aplicar(generarMigracionDeModelos(antes(), [v2], { kon: KON }).sql);
    const filas = await pg.query<{ points: number }>("SELECT points FROM tasks");
    expect(filas.rows.every((f) => f.points === 1)).toBe(true);
  });
});
