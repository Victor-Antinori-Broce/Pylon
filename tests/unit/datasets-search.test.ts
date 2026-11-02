/**
 * DataSets — búsqueda, facetas y comparación
 * ============================================================================
 *
 * Estas tres capacidades nacieron como un kon aparte (`kon-gamedata`) con sus
 * propias tablas. Fue un error: duplicaban el almacén que ya existe en
 * `core/datasets`, y peor — `datasets.indexes.ts` ya generaba los índices sobre
 * `(data->>'campo')` que aquellas columnas dedicadas intentaban sustituir.
 *
 * Cada prueba de aquí fija una decisión que se toma mal con facilidad.
 */

import { describe, it, expect } from "vitest";

import {
  buscarEntradas,
  compararEntradas,
  condicionDeFiltro,
  filasDe,
  leerFiltros,
  normalizarTexto,
} from "../../packages/core/datasets/datasets.search";

describe("buscarEntradas con el driver de producción", () => {
  /**
   * `pg` devuelve `{ rows }` en `db.execute`, no un array: la búsqueda caía en
   * 500 («is not iterable») con cualquier dataset real. Nadie la probaba con
   * el resultado que da de verdad ese driver (Schemathesis, 2026-10-26).
   */
  function dbDePg(filas: unknown[], cuenta: number, grupos: unknown[]) {
    const consulta = {
      from: () => consulta,
      where: () => consulta,
      limit: () => consulta,
      offset: async () => filas,
    };
    let llamadas = 0;
    return {
      select: () => consulta,
      execute: async () => ({ rows: llamadas++ === 0 ? [{ n: cuenta }] : grupos, rowCount: 1 }),
    };
  }

  it("cuenta y facetas salen de `rows`", async () => {
    const r = await buscarEntradas(
      dbDePg([{ id: "e1" }], 7, [{ valor: "legendario", n: 3 }]) as never,
      {
        dataSetId: "ds",
        facetas: ["rareza"],
      }
    );
    expect(r.total).toBe(7);
    expect(r.facetas).toEqual([{ campo: "rareza", valores: [{ valor: "legendario", cuenta: 3 }] }]);
  });

  it("filasDe acepta el array de otros drivers y no revienta con nada", () => {
    expect(filasDe([{ n: 1 }])).toEqual([{ n: 1 }]);
    expect(filasDe({ rows: [{ n: 2 }] })).toEqual([{ n: 2 }]);
    expect(filasDe(undefined)).toEqual([]);
    expect(filasDe({})).toEqual([]);
  });
});

describe("normalización para buscar", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    // Sin esto, buscar "talisman" no encuentra "Talismán" y "wolfs" no
    // encuentra "Wolf's". Es la diferencia entre un buscador y una caja de
    // texto que casi nunca acierta.
    expect(normalizarTexto("Talismán")).toBe("talisman");
    expect(normalizarTexto("Wolf's Bane")).toBe("wolf s bane");
    expect(normalizarTexto("  ESPADA   Llameante ")).toBe("espada llameante");
  });
});

describe("lectura de filtros", () => {
  it("entiende igualdad y rangos abiertos por cualquier lado", () => {
    expect(leerFiltros("slot:helmet")).toEqual([{ campo: "slot", igual: "helmet" }]);
    expect(leerFiltros("damage:100..500")).toEqual([{ campo: "damage", min: 100, max: 500 }]);
    expect(leerFiltros("weight:..6.5")).toEqual([{ campo: "weight", max: 6.5 }]);
    expect(leerFiltros("level:60..")).toEqual([{ campo: "level", min: 60 }]);
  });

  it("acepta un valor que contiene dos puntos", () => {
    // `source:https://x.com` tiene dos puntos y no es un rango. Partir por el
    // PRIMER `:` y no por todos es lo que lo distingue.
    expect(leerFiltros("url:https://x.com")).toEqual([{ campo: "url", igual: "https://x.com" }]);
  });

  it("LANZA con un filtro mal formado en vez de ignorarlo", () => {
    // Es la decisión importante: un filtro que se salta en silencio devuelve
    // MÁS resultados de los pedidos, y quien los lee cree que ha filtrado.
    expect(() => leerFiltros("sinDosPuntos")).toThrow(/mal formado/);
    expect(() => leerFiltros(":sinCampo")).toThrow(/mal formado/);
    expect(() => leerFiltros("damage:abc..def")).toThrow(/no es un número/);
  });

  it("no inventa filtros de una cadena vacía", () => {
    expect(leerFiltros(undefined)).toEqual([]);
    expect(leerFiltros("")).toEqual([]);
    expect(leerFiltros("  ,  ")).toEqual([]);
  });
});

describe("condición SQL de un filtro", () => {
  const sqlDe = (x: unknown) => JSON.stringify(x);

  it("usa data->>'campo', que es lo que indexa datasets.indexes", () => {
    // `datasets.indexes.ts` crea `CREATE INDEX ... ON data_entries
    // ((data->>'campo'))`. Escribir aquí `data#>>'{campo}'` daría el mismo
    // resultado y NO usaría el índice: la consulta pasaría de milisegundos a
    // segundos sin que nada fallara.
    const c = sqlDe(condicionDeFiltro({ campo: "rarity", igual: "legendary" }));
    expect(c).toContain("data->>");
  });

  it("un filtro numérico descarta lo que no declara el campo", () => {
    // Si buscas "daño > 100" y aparecen cosas sin daño, crees que las has
    // comparado. Por eso la condición lleva siempre un IS NOT NULL.
    const c = sqlDe(condicionDeFiltro({ campo: "damage", min: 100 }));
    expect(c).toContain("IS NOT NULL");
  });

  it("title y status son columnas, no campos de data", () => {
    const c = sqlDe(condicionDeFiltro({ campo: "status", igual: "published" }));
    expect(c).not.toContain("data->>");
  });
});

describe("comparación entre entradas distintas", () => {
  it("devuelve SOLO los campos donde hay diferencia", () => {
    // La pregunta que trae a alguien a un comparador es "en qué se diferencian".
    // Enseñar cuarenta filas de las que treinta y ocho son idénticas esconde la
    // respuesta entre ruido.
    const dif = compararEntradas([
      { id: "a", title: "Espada A", data: { damage: 100, weight: 5, type: "sword" } },
      { id: "b", title: "Espada B", data: { damage: 120, weight: 5, type: "sword" } },
    ]);

    expect(dif).toHaveLength(1);
    expect(dif[0]!.campo).toBe("damage");
    expect(dif[0]!.valores).toEqual({ a: 100, b: 120 });
  });

  it("un campo que solo tiene una de las dos ES una diferencia", () => {
    const dif = compararEntradas([
      { id: "a", title: "A", data: { damage: 100, bleed: 50 } },
      { id: "b", title: "B", data: { damage: 100 } },
    ]);
    expect(dif.map((d) => d.campo)).toEqual(["bleed"]);
    expect(dif[0]!.valores).toEqual({ a: 50, b: null });
  });

  it("un campo que NINGUNA declara no aparece", () => {
    const dif = compararEntradas([
      { id: "a", title: "A", data: { damage: 100 } },
      { id: "b", title: "B", data: { damage: 100 } },
    ]);
    expect(dif).toEqual([]);
  });

  it("compara valores complejos por su contenido, no por referencia", () => {
    // Dos arrays con el mismo contenido son objetos distintos en JS. Comparar
    // con === los daría por diferentes SIEMPRE, y el comparador enseñaría cada
    // campo de lista como si hubiera cambiado.
    const dif = compararEntradas([
      { id: "a", title: "A", data: { tags: ["fire", "sword"] } },
      { id: "b", title: "B", data: { tags: ["fire", "sword"] } },
    ]);
    expect(dif).toEqual([]);
  });

  it("aguanta entradas sin data", () => {
    const dif = compararEntradas([
      { id: "a", title: "A", data: null },
      { id: "b", title: "B", data: { x: 1 } },
    ]);
    expect(dif.map((d) => d.campo)).toEqual(["x"]);
  });
});

// kitsuden-test: no-necesita-kons (nombra kon-gamedata para comprobar que NO está)
describe("kon-gamedata no debe volver", () => {
  it("no existe un kon que duplique el almacén de datasets", async () => {
    // Se escribió y se borró: duplicaba `data_sets` / `data_entries` con tablas
    // paralelas. Dos sitios donde vive "una entidad" no dan un error el día que
    // alguien importa en uno y busca en el otro — dan cero resultados.
    //
    // Esta prueba no es paranoia: el kon llegó a existir, con migración y todo,
    // porque busqué duplicados en `packages/kons/` y nunca abrí `packages/core/`.
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(process.cwd(), "packages/kons/kon-gamedata"))).toBe(false);
  });
});
