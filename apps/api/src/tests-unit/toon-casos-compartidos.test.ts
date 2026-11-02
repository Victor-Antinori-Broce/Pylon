import { describe, it, expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { decodeToon, encodeToon } from "../lib/toon-tabular";

/**
 * Pares TOON → JSON que comparten los clientes en otros lenguajes (hoy, el SDK
 * Python: packages/sdk-python/tests/fixtures/toon-casos.json). Este test
 * exige que el fichero sea lo que el encoder de la API escribe HOY, así un
 * cambio del códec no deja al otro decoder probando un TOON que ya no existe.
 *
 * Regenerar: ACTUALIZAR_CASOS_TOON=1 bun test src/tests-unit/toon-casos-compartidos.test.ts
 */
const FICHERO = join(import.meta.dir, "..", "..", "..", "..", "packages", "sdk-python", "tests", "fixtures", "toon-casos.json");

const fila = (i: number) => ({ id: i, slug: `fila-${i}`, nombre: `Fila ${i}`, activo: i % 2 === 0, nota: i * 1.5 });

const CASOS: Record<string, unknown> = {
  "tabla plana": Array.from({ length: 4 }, (_, i) => fila(i)),
  "listado con sobre": { docs: [fila(1), fila(2)], totalDocs: 2, page: 1, hasNextPage: false },
  "columna plegada en la cabecera": {
    docs: [
      { id: "e1", _meta: { datasetId: "d1", createdAt: "2026-10-25T10:00:00.000Z" }, nombre: "Uno" },
      { id: "e2", _meta: { datasetId: "d1", createdAt: "2026-10-24T09:00:00.000Z" }, nombre: "Dos" },
    ],
  },
  "tabla con clave": { porId: { a: { x: 1, y: "uno" }, b: { x: 2, y: "dos" } } },
  "forma de lista con anidados": {
    docs: [
      { id: 1, data: { skills: ["fuego", "hielo"], stats: { atk: 10 } }, tags: [] },
      { id: 2, data: { skills: [], stats: { atk: 0 } }, extra: { nota: null } },
    ],
  },
  "objetos vacíos": { content: {}, externalIds: {}, lista: [{}, { a: {} }] },
  "hermanos de data": { data: { slug: "x" }, view: { filas: [["a", "b"], ["c"]] }, profile: null },
  "array raíz de objetos": [fila(1), fila(2)],
  "array raíz de escalares": [1, "dos", null, true, 2.5],
  "array raíz vacío": [],
  "objeto raíz vacío": {},
  "arrays de arrays": { matriz: [[1, 2], [3, 4]], mezcla: [1, [2, 3], { a: 1 }] },
  "textos que necesitan comillas": {
    numero: "42", ceros: "05", verdad: "true", nulo: "null", coma: "a,b", dosPuntos: "a:b", guion: "-x",
    almohadilla: "#tema", vacio: "", espacios: " a ", salto: "línea\nnueva", tab: "a\tb", comillas: 'dice "hola"',
    barra: "a\\b", control: "\u0001", unicode: "ñandú 😀", corchetes: "[x]", llaves: "{y}", tuberia: "a|b",
  },
  "claves con comillas": JSON.parse('{"x-y":1,"1a":2,"con espacio":3,"":4,"a.b":5,"__proto__":{"k":6}}'),
  "números": { entero: 42, negativo: -7, decimal: 3.25, grande: 1e21, pequeno: 1e-7, cero: 0 },
  escalar: "hola",
};

describe("casos TOON compartidos con otros clientes", () => {
  const actuales = Object.entries(CASOS).map(([nombre, json]) => ({ nombre, json, toon: encodeToon(json) }));

  if (process.env.ACTUALIZAR_CASOS_TOON === "1" || !existsSync(FICHERO)) {
    mkdirSync(dirname(FICHERO), { recursive: true });
    writeFileSync(FICHERO, JSON.stringify(actuales, null, 2) + "\n");
  }

  it("el fichero es lo que el encoder escribe hoy", () => {
    const guardados = JSON.parse(readFileSync(FICHERO, "utf8"));
    expect(guardados).toEqual(JSON.parse(JSON.stringify(actuales)));
  });

  it("cada caso vuelve a dar su JSON con el decoder de la API", () => {
    for (const c of actuales) expect(JSON.stringify(decodeToon(c.toon))).toBe(JSON.stringify(c.json));
  });
});
