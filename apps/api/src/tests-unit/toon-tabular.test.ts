import { describe, it, expect } from "bun:test";

import { decode as decodeRef, encode as encodeRef } from "@toon-format/toon";

import { encodeToon, decodeToon, ToonDecodeError } from "../lib/toon-tabular";

/**
 * El códec propio frente a la implementación de referencia
 * (`@toon-format/toon@4.4.0`, devDependency fijada). Los cuatro fallos que
 * encontró la medición G1 (docs/agents/benchmarks.md) tienen cada uno su test:
 * con el códec anterior, los cuatro fallaban.
 */

/** Ida y vuelta completa: mismo texto que la referencia y los dos decoders devuelven el valor. */
function idaYVuelta(valor: unknown): void {
  const texto = encodeToon(valor);
  expect(texto).toBe(encodeRef(valor as never));
  expect(decodeToon(texto)).toEqual(valor as never);
  expect(decodeRef(texto)).toEqual(valor as never);
}

describe("TOON — los cuatro fallos de G1", () => {
  it("1. arrays en forma de lista con objetos anidados: el decoder ya no devuelve []", () => {
    // Antes: decodeToon(encodeToon(v)) daba { a: [] } sin ningún error.
    const v = { a: [{ x: 1, m: { z: 2 }, t: ["p", "q"] }, { x: 2, m: { z: 3 } }] };
    const texto = encodeToon(v);
    expect(texto).toContain("a[2]:\n  - x: 1");
    expect(decodeToon(texto)).toEqual(v);
    idaYVuelta(v);
    // Y la forma real de un listado de entradas de dataset
    idaYVuelta({
      docs: [
        { id: "e1", title: "Uno", data: { skills: ["a", "b"], tier: "S" }, _meta: { datasetId: "d", createdAt: "2026-10-25" } },
        { id: "e2", title: "Dos", data: { skills: [], tier: null }, _meta: { datasetId: "d", createdAt: "2026-10-24" } },
      ],
      totalDocs: 2,
      page: 1,
    });
  });

  it("2. los hermanos de `data` en el sobre no se pierden (nada se desenvuelve)", () => {
    // Antes: encodeTOON({ data, view }) tiraba `view` (la tier list entera).
    const v = { data: { slug: "x", tiers: [{ id: "S", items: 3 }] }, view: { filas: [{ tier: "S", ids: ["a", "b"] }] }, profile: null };
    const texto = encodeToon(v);
    expect(texto).toContain("view:");
    expect(texto).toContain("profile: null");
    expect(decodeToon(texto)).toEqual(v);
    idaYVuelta(v);
  });

  it("3. el objeto vacío se escribe como TOON (`clave:` sin nada) y se lee como {}", () => {
    // Antes: `content: {}`, que la referencia lee como el texto "{}".
    const v = { content: {}, externalIds: {}, nombre: "x" };
    const texto = encodeToon(v);
    expect(texto).toBe("content:\nexternalIds:\nnombre: x");
    expect(decodeRef(texto)).toEqual(v);
    idaYVuelta(v);
    idaYVuelta({});
    idaYVuelta([{}, {}]);
    idaYVuelta({ lista: [{ a: {} }, { a: {}, b: 1 }] });
  });

  it("4. un array raíz es un array raíz para los dos decoders (sin clave `data` inventada)", () => {
    // Antes: `data[2]{id}:`, que la referencia leía como { data: [...] }.
    const v = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
    const texto = encodeToon(v);
    expect(texto).toBe("[2]{id,name}:\n  1,a\n  2,b");
    expect(decodeToon(texto)).toEqual(v);
    expect(decodeRef(texto)).toEqual(v);
    idaYVuelta([]);
    idaYVuelta([1, "dos", null]);
    idaYVuelta([[1, 2], [3]]);
  });
});

describe("TOON — formas de la especificación", () => {
  it("tabla: claves una vez y filas CSV", () => {
    expect(encodeToon({ users: [{ id: 1, name: "Alice", role: "admin" }, { id: 2, name: "Bob", role: "user" }] })).toBe(
      "users[2]{id,name,role}:\n  1,Alice,admin\n  2,Bob,user"
    );
  });

  it("pliega en la cabecera una columna que es un objeto uniforme", () => {
    const v = { items: [{ id: 1, _meta: { ds: "d", at: "t1" } }, { id: 2, _meta: { ds: "d", at: "t2" } }] };
    expect(encodeToon(v)).toBe("items[2]{id,_meta{ds,at}}:\n  1,d,t1\n  2,d,t2");
    idaYVuelta(v);
  });

  it("tabla con clave para un objeto de objetos uniformes", () => {
    const v = { porId: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } } };
    expect(encodeToon(v)).toBe("porId[2:]{x,y}:\n  a: 1,2\n  b: 3,4");
    idaYVuelta(v);
  });

  it("entrecomilla lo que si no cambiaría de tipo o rompería la línea", () => {
    const v = { a: "1", b: "true", c: "x,y", d: "plain", e: "", f: " sp", g: "-x", h: "#h", i: "a:b", j: "05", k: "l\nn" };
    const texto = encodeToon(v);
    for (const l of ['a: "1"', 'b: "true"', 'c: "x,y"', "d: plain", 'e: ""', 'f: " sp"', 'g: "-x"', 'h: "#h"', 'i: "a:b"', 'j: "05"', 'k: "l\\nn"']) {
      expect(texto).toContain(l);
    }
    idaYVuelta(v);
  });

  it("claves que necesitan comillas, incluida __proto__", () => {
    idaYVuelta(JSON.parse('{"x-y":1,"1a":2,"con espacio":3,"":4,"__proto__":{"k":5}}'));
  });

  it("arrays vacíos y escalares en la raíz", () => {
    expect(encodeToon({ items: [] })).toBe("items: []");
    expect(encodeToon(42)).toBe("42");
    expect(encodeToon("hola")).toBe("hola");
    expect(encodeToon(null)).toBe("null");
    for (const v of [{ items: [] }, 42, "hola", null, true, ""]) idaYVuelta(v);
  });

  it("semántica de JSON.stringify: Date, undefined, NaN", () => {
    const fecha = new Date("2026-10-25T10:00:00.000Z");
    const v = { f: fecha, u: undefined, n: Number.NaN, l: [undefined, 1] };
    expect(decodeToon(encodeToon(v))).toEqual(JSON.parse(JSON.stringify(v)));
  });

  it("lee delimitadores tabulador y barra (los escribe la referencia con opciones)", () => {
    const v = { t: [{ a: 1, b: "x y" }, { a: 2, b: "z" }] };
    expect(decodeToon(encodeRef(v, { delimiter: "\t" }))).toEqual(v);
    expect(decodeToon(encodeRef(v, { delimiter: "|" }))).toEqual(v);
  });

  it("TOON mal formado lanza en vez de devolver datos a medias", () => {
    expect(() => decodeToon("a[3]{x}:\n  1\n  2")).toThrow(ToonDecodeError);
    expect(() => decodeToon("a[2]:\n  - 1")).toThrow(ToonDecodeError);
    expect(() => decodeToon('a: "sin cerrar')).toThrow(ToonDecodeError);
  });
});

describe("TOON — datos aleatorios contra la referencia", () => {
  it("20 000 valores: mismo texto que la referencia y los dos decoders los devuelven", () => {
    let semilla = 20261025;
    const rnd = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
    const de = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const TEXTOS = ["", "a", "Hola mundo", "1", "05", "-3", "true", "null", "x,y", "a:b", "#h", "-x", " sp", 'q"t', "l\nn", "t\tb", "[x]", "{y}", "\\", "\u0001", "é ñ", "1e5", "+1", "a|b"];
    const CLAVES = ["id", "name", "_meta", "a.b", "x-y", "1a", "", "con espacio", "k", "__proto__", "tags"];
    const poner = (o: Record<string, unknown>, k: string, v: unknown) =>
      Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
    const escalar = (): unknown => de<unknown>([null, true, false, 0, -1, 3.25, 1e21, 42, de(TEXTOS), de(TEXTOS)]);
    const valor = (p: number): unknown => {
      const r = rnd();
      if (p > 3 || r < 0.35) return escalar();
      if (r < 0.55) return Array.from({ length: Math.floor(rnd() * 4) }, () => valor(p + 1));
      if (r < 0.75) {
        const ks = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => de(CLAVES));
        const anidada = rnd() < 0.5;
        return Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => {
          const o: Record<string, unknown> = {};
          for (const k of ks) poner(o, k, anidada && rnd() < 0.5 ? { p: escalar(), q: escalar() } : rnd() < 0.85 ? escalar() : valor(p + 1));
          return o;
        });
      }
      const o: Record<string, unknown> = {};
      const n = Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) poner(o, de(CLAVES), valor(p + 1));
      return o;
    };
    let fallos = 0;
    for (let i = 0; i < 20_000; i++) {
      const v = valor(0);
      const texto = encodeToon(v);
      const json = JSON.stringify(v);
      if (texto !== encodeRef(v as never) || JSON.stringify(decodeToon(texto)) !== json || JSON.stringify(decodeRef(texto)) !== json) {
        fallos++;
      }
    }
    expect(fallos).toBe(0);
  });
});
