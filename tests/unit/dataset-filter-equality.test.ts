/**
 * Igualdad de los filtros de datasets
 * ============================================================================
 *
 * `evaluateCondition` comparaba con `==`. Parece inofensivo —el filtro llega
 * como texto y el dato vive en JSONB, así que hace falta coaccionar— pero `==`
 * trae de regalo sus propias reglas: `"" == 0` es cierto. Traducido al
 * producto: un filtro `stock eq 0` devolvía también las filas donde el campo
 * está VACÍO, que es justo lo contrario de lo que el usuario pidió.
 *
 * Y `in` no usaba `==` sino `includes`, o sea `===`, así que dos operadores
 * hermanos daban respuestas distintas para el mismo dato.
 *
 * Estas pruebas fijan el criterio: se coacciona donde significa algo y el
 * vacío se queda fuera.
 */

import { describe, expect, it } from "vitest";

import { evaluateCondition, mismoValor } from "../../packages/core/datasets/datasets.calculated";

const fila = (campos: Record<string, unknown>) => ({ row: campos }) as never;

describe("mismoValor", () => {
  it("cruza texto y número, que es para lo que se pedía el operador laxo", () => {
    expect(mismoValor(30, "30")).toBe(true);
    expect(mismoValor("30", 30)).toBe(true);
    expect(mismoValor(30.5, "30.50")).toBe(true);
    expect(mismoValor(30, "31")).toBe(false);
  });

  it("NO trata el vacío como cero — la regresión que motivó todo esto", () => {
    expect(mismoValor(0, "")).toBe(false);
    expect(mismoValor("", 0)).toBe(false);
    expect(mismoValor(0, "   ")).toBe(false);
    expect(mismoValor(0, null)).toBe(false);
    expect(mismoValor(0, false)).toBe(false);
  });

  it("null y undefined son el mismo 'sin valor', y no casan con nada más", () => {
    expect(mismoValor(null, undefined)).toBe(true);
    expect(mismoValor(null, null)).toBe(true);
    expect(mismoValor(null, "")).toBe(false);
    expect(mismoValor(undefined, 0)).toBe(false);
  });

  it("acepta 'true'/'false' de un formulario, pero no 0/1", () => {
    expect(mismoValor(true, "true")).toBe(true);
    expect(mismoValor(false, "false")).toBe(true);
    expect(mismoValor(true, "false")).toBe(false);
    // `1 == true` en JS. Aquí no: si el campo es booleano, se compara como tal.
    expect(mismoValor(true, 1)).toBe(false);
    expect(mismoValor(false, 0)).toBe(false);
    expect(mismoValor(false, "")).toBe(false);
  });

  it("compara fechas por instante, no por identidad de objeto", () => {
    expect(mismoValor(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(true);
    expect(mismoValor(new Date("2026-01-01"), "2026-01-01")).toBe(true);
    expect(mismoValor(new Date("2026-01-01"), new Date("2026-01-02"))).toBe(false);
    expect(mismoValor(new Date("2026-01-01"), "no es una fecha")).toBe(false);
  });
});

describe("evaluateCondition", () => {
  it("eq encuentra el número guardado como texto", () => {
    expect(
      evaluateCondition({ field: "edad", operator: "eq", value: 30 } as never, fila({ edad: "30" }))
    ).toBe(true);
  });

  it("eq 0 ya no arrastra las filas vacías", () => {
    const cond = { field: "stock", operator: "eq", value: 0 } as never;
    expect(evaluateCondition(cond, fila({ stock: 0 }))).toBe(true);
    expect(evaluateCondition(cond, fila({ stock: "" }))).toBe(false);
    expect(evaluateCondition(cond, fila({ stock: null }))).toBe(false);
  });

  it("neq es la negación exacta de eq, no un `!=` suelto", () => {
    const eq = { field: "stock", operator: "eq", value: 0 } as never;
    const neq = { field: "stock", operator: "neq", value: 0 } as never;
    for (const valor of [0, "", null, "0", 1, false]) {
      expect(evaluateCondition(neq, fila({ stock: valor }))).toBe(
        !evaluateCondition(eq, fila({ stock: valor }))
      );
    }
  });

  it("in usa el mismo criterio que eq", () => {
    // Antes: `eq 30` encontraba `"30"` pero `in [30]` no.
    const dentro = { field: "edad", operator: "in", value: [30, 40] } as never;
    expect(evaluateCondition(dentro, fila({ edad: "30" }))).toBe(true);
    expect(evaluateCondition(dentro, fila({ edad: 40 }))).toBe(true);
    expect(evaluateCondition(dentro, fila({ edad: "35" }))).toBe(false);
    expect(evaluateCondition(dentro, fila({ edad: "" }))).toBe(false);
  });

  it("empty sigue distinguiendo el vacío del cero", () => {
    const vacio = { field: "nota", operator: "empty", value: null } as never;
    expect(evaluateCondition(vacio, fila({ nota: "" }))).toBe(true);
    expect(evaluateCondition(vacio, fila({ nota: null }))).toBe(true);
    expect(evaluateCondition(vacio, fila({ nota: 0 }))).toBe(false);
  });
});
