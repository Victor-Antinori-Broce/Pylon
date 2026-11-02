import { describe, it, expect, beforeEach } from "bun:test";

import {
  codificarRespuesta,
  firmaDeForma,
  formatoPedido,
  idaYVuelta,
  olvidarFormas,
  REMEDIR_CADA,
  UMBRAL_GRANDE,
} from "../lib/formatos";

const filas = (n: number, extra = "") =>
  Array.from({ length: n }, (_, i) => ({ id: i, slug: `fila-${i}${extra}`, nombre: `Fila número ${i}`, activo: i % 2 === 0 }));

beforeEach(() => olvidarFormas());

describe("formatoPedido (negociación REST)", () => {
  it("tipos propios en Accept", () => {
    expect(formatoPedido("application/vnd.toon", undefined)).toEqual({ pedido: "toon" });
    expect(formatoPedido("application/vnd.tron", undefined)).toEqual({ pedido: "tron" });
    expect(formatoPedido("application/vnd.kitsuden.auto", undefined)).toEqual({ pedido: "auto" });
  });

  it("?format= cuando el Accept no pide JSON", () => {
    expect(formatoPedido(undefined, "auto")).toEqual({ pedido: "auto" });
    expect(formatoPedido("*/*", "toon")).toEqual({ pedido: "toon" });
    expect(formatoPedido("*/*", "toonp")).toBeNull(); // es del Toon Protocol, otro middleware
    expect(formatoPedido(undefined, "json")).toBeNull();
  });

  it("Accept: application/json gana siempre a ?format=", () => {
    expect(formatoPedido("application/json", "auto")).toBeNull();
    expect(formatoPedido("application/json, text/plain, */*", "toon")).toBeNull();
  });

  it("varios tipos: gana la q más alta, y a igualdad el primero", () => {
    expect(formatoPedido("application/vnd.toon;q=0.5, application/vnd.tron", undefined)).toEqual({ pedido: "tron" });
    expect(formatoPedido("application/vnd.toon, application/json", undefined)).toEqual({ pedido: "toon" });
    expect(formatoPedido("application/vnd.toon;q=0, application/json", undefined)).toBeNull();
  });

  it("formats=\"…\" limita los candidatos de auto", () => {
    expect(formatoPedido('application/vnd.kitsuden.auto; formats="json,toon"', undefined)).toEqual({
      pedido: "auto",
      candidatos: ["json", "toon"],
    });
  });
});

describe("codificarRespuesta", () => {
  it("json es JSON compacto", () => {
    const r = codificarRespuesta({ a: [1, 2], b: { c: "x" } }, "json");
    expect(r).toEqual({ formato: "json", texto: '{"a":[1,2],"b":{"c":"x"}}', motivo: "pedido" });
  });

  it("nunca devuelve algo que no vuelva a dar los datos", () => {
    // TRON 0.1.3 no sabe leer lo que escribe con una propiedad llamada `class`.
    const datos = [{ class: 1, b: 2 }, { class: 3, b: 4 }];
    const r = codificarRespuesta(datos, "tron");
    expect(r.formato).toBe("json");
    expect(r.motivo).toBe("no-reversible");
    // Y la clave __proto__, que TRON pierde al leer.
    const conProto = JSON.parse(`[${Array.from({ length: 20 }, (_, i) => `{"__proto__":${i},"b":"${"x".repeat(20)}"}`).join(",")}]`);
    const r2 = codificarRespuesta(conProto, "auto", { candidatos: ["json", "tron"] });
    expect(r2.formato).toBe("json");
  });

  it("idaYVuelta rechaza un texto que el decoder no entiende", () => {
    expect(idaYVuelta("toon", 'a: "sin cerrar', '{"a":"x"}')).toBe(false);
    expect(idaYVuelta("tron", "class A: null,b\n\n[A(1,2)]", '[{"null":1,"b":2}]')).toBe(false);
  });

  it("auto recuerda el ganador por forma en respuestas grandes y vuelve a medir de vez en cuando", () => {
    const grande = filas(400);
    expect(JSON.stringify(grande).length).toBeGreaterThan(UMBRAL_GRANDE);
    const primera = codificarRespuesta(grande, "auto", { clave: "GET /x" });
    expect(primera.motivo).toBe("medida");
    expect(primera.formato).toBe("toon");
    // Otra página con la misma forma: ya no mide
    const segunda = codificarRespuesta(filas(400, "-b"), "auto", { clave: "GET /x" });
    expect(segunda.motivo).toBe("recordada");
    expect(segunda.formato).toBe("toon");
    const motivos = new Set<string>();
    for (let i = 0; i < REMEDIR_CADA; i++) motivos.add(codificarRespuesta(grande, "auto", { clave: "GET /x" }).motivo);
    expect(motivos.has("medida")).toBe(true);
    // Otra ruta con la misma forma no comparte recuerdo
    expect(codificarRespuesta(grande, "auto", { clave: "GET /y" }).motivo).toBe("medida");
  });

  it("si el formato recordado no sirve para estos datos, mide otra vez", () => {
    const grande = filas(400);
    codificarRespuesta(grande, "auto", { clave: "GET /z", candidatos: ["json", "tron"] });
    // Misma firma (los primeros elementos iguales) pero con una fila que TRON no lee:
    // (dos filas: TRON solo declara clase para claves que se repiten)
    const trampa = filas(400).map((f, i) => (i >= 398 ? { ...f, class: i } : f));
    const r = codificarRespuesta(trampa, "auto", { clave: "GET /z", candidatos: ["json", "tron"] });
    expect(r.motivo).not.toBe("recordada");
    expect(r.formato).toBe("json");
    expect(JSON.parse(r.texto)).toEqual(trampa);
  });

  it("la firma de forma no depende de los valores ni del tamaño exacto", () => {
    expect(firmaDeForma(filas(120))).toBe(firmaDeForma(filas(150, "-z")));
    expect(firmaDeForma(filas(5))).not.toBe(firmaDeForma(filas(500)));
    expect(firmaDeForma({ a: 1 })).not.toBe(firmaDeForma({ b: 1 }));
  });
});

describe("datos que no son JSON puro (filas de Drizzle en MCP)", () => {
  it("un Date sale como en JSON en los tres formatos", () => {
    const filas = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      titulo: `Entrada ${i}`,
      creada: new Date(Date.UTC(2026, 9, 25, 10, i)),
      datos: { etiquetas: ["a", "b"], nivel: i },
    }));
    const json = JSON.stringify(filas);
    for (const pedido of ["tron", "toon", "auto"] as const) {
      const r = codificarRespuesta(filas, pedido);
      expect(r.formato).not.toBe("json");
      expect(idaYVuelta(r.formato, r.texto, json)).toBe(true);
    }
  });
});
