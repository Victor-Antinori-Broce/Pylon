/**
 * `semantica` en defineModelo (kitsuden2.md D5): validación y el SQL que
 * `makemigrations` genera al añadir, cambiar o quitar la búsqueda semántica.
 */

import {
  campo,
  defineModelo,
  generarMigracionDeModelos,
  instantaneaDeModelos,
  type DeclaracionDeModelo,
} from "@kitsuden/shared";
import { describe, expect, it } from "vitest";

const base = {
  nombre: "doc",
  descripcion: "A document.",
  campos: { title: campo.texto({ max: 200, requerido: true }), body: campo.textoLargo(), n: campo.entero() },
  acceso: { leer: "publico", escribir: "staff" },
} as const satisfies DeclaracionDeModelo;

const sin = defineModelo(base);
const con = defineModelo({ ...base, semantica: { campos: ["title", "body"], dimensiones: 384 } });

describe("semantica: validación", () => {
  it("solo campos de texto, al menos uno, dimensiones 1–2000", () => {
    expect(() => defineModelo({ ...base, semantica: { campos: [] } })).toThrow(/al menos un campo/);
    expect(() => defineModelo({ ...base, semantica: { campos: ["n"] } })).toThrow(/texto/);
    expect(() => defineModelo({ ...base, semantica: { campos: ["nada" as "title"] } })).toThrow(/no es un campo/);
    expect(() => defineModelo({ ...base, semantica: { campos: ["title"], dimensiones: 3072 } })).toThrow(/2000/);
    expect(defineModelo({ ...base, semantica: { campos: ["title"] } }).semantica).toEqual({ campos: ["title"], dimensiones: 1536 });
  });

  it("un modelo sin semantica no cambia su instantánea (las guardadas siguen valiendo)", () => {
    expect("semantica" in instantaneaDeModelos([sin], "k").modelos.doc!).toBe(false);
  });
});

describe("semantica: makemigrations", () => {
  it("modelo nuevo: columna vector(N) e índice HNSW", () => {
    const r = generarMigracionDeModelos(null, [con], { kon: "k" });
    expect(r.sql).toContain('ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "embedding" vector(384);');
    expect(r.sql).toContain('USING hnsw ("embedding" vector_cosine_ops)');
  });

  it("añadirla a un modelo existente: la columna, el índice y un aviso", () => {
    const r = generarMigracionDeModelos(instantaneaDeModelos([sin], "k"), [con], { kon: "k" });
    expect(r.cambios).toContain("add semantic search to doc (384 dimensions)");
    expect(r.sql).toContain("vector(384)");
    expect(r.avisos.join("\n")).toMatch(/no embedding/);
  });

  it("cambiar las dimensiones vacía los embeddings y rehace el índice", () => {
    const otra = defineModelo({ ...base, semantica: { campos: ["title", "body"], dimensiones: 768 } });
    const r = generarMigracionDeModelos(instantaneaDeModelos([con], "k"), [otra], { kon: "k" });
    expect(r.sql).toContain('ALTER COLUMN "embedding" TYPE vector(768) USING NULL;');
    expect(r.avisos.join("\n")).toMatch(/computed again/);
  });

  it("quitarla es destructivo: sale comentado", () => {
    const r = generarMigracionDeModelos(instantaneaDeModelos([con], "k"), [sin], { kon: "k" });
    expect(r.sql).toContain('-- DESTRUCTIVE (skipped; re-run with --allow-destructive to emit it): ALTER TABLE "docs" DROP COLUMN IF EXISTS "embedding";');
  });

  it("sin cambios, sin migración", () => {
    expect(generarMigracionDeModelos(instantaneaDeModelos([con], "k"), [con], { kon: "k" }).sql).toBe("");
  });
});
