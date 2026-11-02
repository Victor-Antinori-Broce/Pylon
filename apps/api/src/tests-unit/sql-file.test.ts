/**
 * El troceador de ficheros SQL.
 *
 * De esto depende todo el runner de migraciones: si trocea mal, un `DO $$ … $$`
 * llega partido a Postgres y la migración falla por un motivo que no tiene
 * nada que ver con su SQL. Ya pasó dos veces mientras se construía —una con
 * los cuerpos con etiqueta dólar, otra con el separador propio de drizzle— y
 * por eso hay tests.
 */

import { describe, it, expect } from "bun:test";

import { readSqlFile, splitStatements } from "../lib/sql-file";

describe("statements simples", () => {
  it("parte por punto y coma", () => {
    expect(splitStatements("SELECT 1;\nSELECT 2;")).toEqual(["SELECT 1;", "SELECT 2;"]);
  });

  it("descarta comentarios y líneas en blanco", () => {
    const r = splitStatements("-- un comentario\n\nSELECT 1;\n-- otro\nSELECT 2;");
    expect(r).toEqual(["SELECT 1;", "SELECT 2;"]);
  });

  it("conserva un statement final sin punto y coma", () => {
    expect(splitStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  it("un fichero vacío no produce statements", () => {
    expect(splitStatements("")).toEqual([]);
    expect(splitStatements("-- solo comentarios\n\n")).toEqual([]);
  });

  it("corta aunque el punto y coma lleve un comentario detrás", () => {
    // Encontrado ejecutando rls-policies.sql: la línea
    // `ALTER TABLE x FORCE ROW LEVEL SECURITY; -- nota` no termina en `;`, así
    // que se fusionaba con el statement siguiente y Postgres recibía las dos
    // cosas juntas.
    const r = splitStatements(
      "ALTER TABLE x FORCE ROW LEVEL SECURITY; -- aplica al owner\nSELECT 1;"
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("ALTER TABLE x");
    expect(r[1]).toContain("SELECT 1");
  });

  it("un `--` dentro de una cadena NO es un comentario", () => {
    // Si se recortara aquí, el statement se cortaría a mitad de la cadena.
    const r = splitStatements("SELECT '-- no soy comentario' AS t\nFROM x;");
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("FROM x");
  });

  it("las comillas escapadas ('') no descuadran la detección", () => {
    const r = splitStatements("SELECT 'it''s fine'; -- nota\nSELECT 2;");
    expect(r).toHaveLength(2);
  });
});

describe("cuerpos con etiqueta dólar", () => {
  it("NO parte por los punto y coma internos de un DO", () => {
    // Este es el fallo original: partir aquí entrega a Postgres un `DO $$`
    // sin cerrar y un `END $$;` huérfano.
    const sql = `DO $$
BEGIN
  CREATE TYPE x AS ENUM ('a');
  RAISE NOTICE 'hecho';
END $$;`;
    const r = splitStatements(sql);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("RAISE NOTICE");
  });

  it("maneja varios bloques seguidos", () => {
    const sql = `DO $$ BEGIN CREATE TYPE a AS ENUM ('x'); END $$;
DO $$ BEGIN CREATE TYPE b AS ENUM ('y'); END $$;`;
    expect(splitStatements(sql)).toHaveLength(2);
  });

  it("una etiqueta $$ DENTRO de un $POLICY$ es contenido, no delimitador", () => {
    // La versión anterior contaba marcadores sin recordar cuál abrió: este
    // caso le descuadraba el contador y a partir de ahí troceaba mal el
    // fichero ENTERO, no solo este statement.
    const sql = `DO $POLICY$
BEGIN
  EXECUTE format($$ SELECT 1 $$);
END $POLICY$;
SELECT 'siguiente';`;
    const r = splitStatements(sql);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("$POLICY$");
    expect(r[1]).toContain("siguiente");
  });

  it("un cuerpo de función con varios ; queda entero", () => {
    const sql = `CREATE FUNCTION f() RETURNS void AS $$
BEGIN
  UPDATE t SET a = 1;
  UPDATE t SET b = 2;
END;
$$ LANGUAGE plpgsql;`;
    expect(splitStatements(sql)).toHaveLength(1);
  });
});

describe("separador de drizzle", () => {
  it("usa --> statement-breakpoint cuando está presente", () => {
    // Las líneas de drizzle terminan en `;--> statement-breakpoint`, no en `;`,
    // así que el heurístico de punto y coma veía el fichero entero como UN
    // statement y se lo entregaba a Postgres de una pieza.
    const sql = `DO $$ BEGIN CREATE TYPE a AS ENUM ('x'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE t (id int);--> statement-breakpoint
CREATE TABLE u (id int);`;
    const r = splitStatements(sql);
    expect(r).toHaveLength(3);
    expect(r[0]).toContain("CREATE TYPE a");
    expect(r[1]).toContain("CREATE TABLE t");
    expect(r[2]).toContain("CREATE TABLE u");
  });

  it("no deja fragmentos vacíos", () => {
    const sql = `SELECT 1;--> statement-breakpoint\n--> statement-breakpoint\nSELECT 2;`;
    expect(splitStatements(sql).every((s) => s.trim().length > 0)).toBe(true);
  });
});

describe("las migraciones reales del repositorio", () => {
  const casos = [
    ["drizzle/0000_amusing_lethal_legion.sql", "../../drizzle/0000_amusing_lethal_legion.sql"],
    [
      "migrations/0029_rename_kitsuden_and_kons.sql",
      "../db/migrations/0029_rename_kitsuden_and_kons.sql",
    ],
    ["migrations/0022_critical_features.sql", "../db/migrations/0022_critical_features.sql"],
  ] as const;

  for (const [nombre, rel] of casos) {
    it(`${nombre} se trocea en varios statements`, async () => {
      const { resolve, dirname } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const path = resolve(dirname(fileURLToPath(import.meta.url)), rel);
      const f = readSqlFile(path, nombre);

      // El síntoma de un troceo roto es exactamente este: UN solo statement
      // gigante con el fichero entero dentro.
      expect(f.statements.length).toBeGreaterThan(1);
      expect(f.checksum).toMatch(/^[0-9a-f]{16}$/);
      // Y ningún statement debe quedar vacío.
      expect(f.statements.every((s) => s.trim().length > 0)).toBe(true);
    });
  }

  it("0029 conserva sus bloques DO enteros", async () => {
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const path = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../db/migrations/0029_rename_kitsuden_and_kons.sql"
    );
    const f = readSqlFile(path, "0029");

    // Cada bloque DO tiene que estar completo: si alguno abre y no cierra, el
    // troceo lo partió.
    for (const s of f.statements) {
      const abre = (s.match(/DO \$\$/g) ?? []).length;
      const cierra = (s.match(/END \$\$/g) ?? []).length;
      expect(abre).toBe(cierra);
    }
  });
});

describe("checksum", () => {
  it("cambia si cambia el contenido", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const dir = mkdtempSync(join(tmpdir(), "kits-sql-"));
    const p = join(dir, "0001_x.sql");

    writeFileSync(p, "SELECT 1;");
    const a = readSqlFile(p, "0001_x.sql").checksum;
    writeFileSync(p, "SELECT 2;");
    const b = readSqlFile(p, "0001_x.sql").checksum;

    // Es lo que permite detectar que una migración YA APLICADA cambió, que es
    // el aviso de que la base y el repositorio dicen cosas distintas.
    expect(a).not.toBe(b);
  });
});
