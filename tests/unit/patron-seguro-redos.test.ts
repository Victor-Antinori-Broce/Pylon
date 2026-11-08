/**
 * ReDoS en `validationRegex` (auditoría F4)
 *
 * El filtro anterior era una regex sobre el texto del patrón: no veía a
 * través de paréntesis anidados (`^((a+))+$`) ni los patrones polinómicos sin
 * grupos (`^a*a*a*a*a*b$`). Ahora el patrón se analiza con un lector de verdad.
 */
import { describe, expect, it } from "vitest";

import {
  LONGITUD_MAXIMA_A_PROBAR,
  patronArriesgado,
  patronSeguro,
  probarPatron,
} from "../../packages/shared/src/patron-seguro";

const PELIGROSOS = [
  // Grupos repetidos con algo variable dentro, a cualquier profundidad
  "^((a+))+$",
  "^(((a+)))+$",
  "^(?:(?:a+))+$",
  "^(?:a+){2}$",
  "^(\\((a+)\\))+$",
  "^([)]+)+$",
  "^(a?){25}a{25}$",
  "^(ab|a)*c$",
  "^(?:\\w|\\d)+$",
  "^(?=(a+)+b)",
  "^(?<g>a+)+$",
  // Polinómicos sin grupos: cuantificadores que se reparten los caracteres
  "^a*a*a*a*a*b$",
  "^.*a.*a.*a.*b$",
  "^[\\s\\S]*,[\\s\\S]*,[\\s\\S]*$",
  "^\\d+\\d+\\d+x$",
  "a*a*b",
  "\\S+@\\S+$",
  "^(a+)?(a+)?(a+)?b$",
  "^" + "a?".repeat(30) + "a{30}$",
  "^\\d{1,100}\\d{1,100}\\d{1,100}\\d{1,100}\\d{1,100}x$",
  // Retrorreferencias
  "(a)\\1",
  "(?<x>a)\\k<x>",
];

const NORMALES = [
  "^[A-Z]{3}-\\d{4}$",
  "^\\S+@\\S+$",
  "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
  "^(es|en|pt)$",
  "^\\d+(\\.\\d+)?$",
  "^-?\\d+(\\.\\d+)?$",
  "^-?\\d+(\\.\\d+)?(e\\d+)?$",
  "^\\(\\d{3}\\) \\d+$",
  "^https?://.+$",
  "^\\d{5}(-\\d{4})?$",
  "^\\+?\\d{1,3}[- ]?\\d{3}[- ]?\\d{4}$",
  "^#?[0-9a-fA-F]{6}$",
  "^#[0-9a-fA-F]{3,8}$",
  "^[a-z0-9-]+$",
  "^[A-Za-z0-9._:/-]*$",
  "^[\\w.:/@-]+$",
  "^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$",
  "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$",
  "^-?\\d{1,15}(\\.\\d{1,4})?$",
  "^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$",
  "^.*a.*$",
  "\\d+\\.\\d+",
  "[{}]",
  "^a{,3}$",
  "^[\\]\\-\\\\]+$",
];

describe("patronSeguro: análisis del patrón (F4)", () => {
  it("rechaza los patrones catastróficos aunque se escondan en paréntesis anidados o no lleven grupos", () => {
    for (const p of PELIGROSOS) {
      expect(() => new RegExp(p), p).not.toThrow();
      expect(patronSeguro(p), p).toBeNull();
    }
  });

  it("sigue aceptando los patrones normales de un campo", () => {
    for (const p of NORMALES) expect(patronSeguro(p), p).toBeInstanceOf(RegExp);
  });

  it("un patrón que el lector no entiende se trata como arriesgado", () => {
    expect(patronArriesgado("(")).toBe(true);
  });

  it("los patrones peligrosos no se prueban: nada tarda", () => {
    const inicio = performance.now();
    for (const p of PELIGROSOS) {
      expect(probarPatron(p, "a".repeat(LONGITUD_MAXIMA_A_PROBAR - 1) + "!"), p).toBe(true);
    }
    expect(performance.now() - inicio).toBeLessThan(200);
  });

  it("el peor caso de un patrón admitido (grado 2) con el valor más largo sigue siendo rápido", () => {
    const valor = "@".repeat(LONGITUD_MAXIMA_A_PROBAR - 1) + " ";
    const inicio = performance.now();
    expect(probarPatron("^\\S+@\\S+$", valor)).toBe(false);
    expect(probarPatron("^a*a*b$", "a".repeat(LONGITUD_MAXIMA_A_PROBAR))).toBe(false);
    expect(performance.now() - inicio).toBeLessThan(1500);
  });

  it("un valor por encima del tope no se prueba", () => {
    expect(probarPatron("^a+$", "a".repeat(LONGITUD_MAXIMA_A_PROBAR + 1))).toBe(false);
    expect(probarPatron("^a+$", "a".repeat(LONGITUD_MAXIMA_A_PROBAR))).toBe(true);
  });
});
