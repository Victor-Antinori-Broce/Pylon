/**
 * Patrones de validación sin ReDoS (auditoría 2026-10-25)
 *
 * `^(a+)+$` contra "aaaa…!" colgaba el hilo de eventos de la API. Los
 * patrones arriesgados se ignoran y el valor probado tiene tope.
 */
import { describe, expect, it } from "vitest";

import { patronSeguro, probarPatron } from "../../packages/shared/src/patron-seguro";

describe("patronSeguro", () => {
  it("rechaza los patrones de retroceso exponencial y las retrorreferencias", () => {
    for (const p of ["^(a+)+$", "(a|aa)*", "(\\w*)*", "^(x+x+)+y$", "(a{1,9})+", "(a)\\1", "(?<x>a)\\k<x>", "x".repeat(300)]) {
      expect(patronSeguro(p), p).toBeNull();
    }
  });

  it("acepta los patrones normales", () => {
    for (const p of ["^[A-Z]{3}-\\d{4}$", "^\\S+@\\S+$", "^(es|en|pt)$", "^\\d+(\\.\\d+)?$", "^\\(\\d{3}\\) \\d+$"]) {
      expect(patronSeguro(p), p).toBeInstanceOf(RegExp);
    }
  });

  it("un patrón catastrófico no se prueba y no cuelga", () => {
    const inicio = Date.now();
    expect(probarPatron("^(a+)+$", "a".repeat(40) + "!")).toBe(true);
    expect(Date.now() - inicio).toBeLessThan(100);
  });

  it("un valor enorme no se prueba", () => {
    expect(probarPatron("^a+$", "a".repeat(20_000))).toBe(false);
  });
});
