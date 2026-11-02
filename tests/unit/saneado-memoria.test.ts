/**
 * Saneador del blog: recordar lo saneado no cambia NADA de lo que sale
 * ============================================================================
 *
 * Rendimiento, 2026-10-27: el listado del blog saneaba el cuerpo de cada
 * entrada en cada petición (9–13 ms por página). Ahora el resultado se
 * recuerda con el texto completo como clave. Esto comprueba que lo recordado
 * es idéntico a sanear desde cero, también para cargas maliciosas y para un
 * texto que cambia en un solo carácter.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { olvidarSaneados, sanearHtml } from "../../packages/kons/kon-blog/src/saneado";

const relleno = "<p>Texto normal de una entrada con <strong>negritas</strong> y <a href=\"https://x.test\">un enlace</a>.</p>".repeat(20);

const CARGAS = [
  `${relleno}<script>alert(1)</script>`,
  `${relleno}<img src=x onerror=alert(1)>`,
  `${relleno}<a href="javascript:alert(1)">x</a>`,
  `${relleno}<x@x/tabindex='1'/autofocus/onfocus='alert(document.domain)'>`,
  `${relleno}<https://x/onfocus=alert(1)/autofocus/tabindex=1>`,
  `${relleno}<iframe src="https://mal.test"></iframe><svg onload=alert(1)>`,
  relleno,
];

describe("saneado del blog con memoria", () => {
  beforeEach(() => olvidarSaneados());

  it("la segunda vez (recordada) da exactamente lo mismo que la primera y que sanear sin memoria", () => {
    for (const carga of CARGAS) {
      const primera = sanearHtml(carga);
      const segunda = sanearHtml(carga);
      olvidarSaneados();
      const desdeCero = sanearHtml(carga);
      expect(segunda, carga.slice(-60)).toBe(primera);
      expect(desdeCero, carga.slice(-60)).toBe(primera);
      expect(segunda).not.toMatch(/<script|onerror=|javascript:|<iframe|<svg/i);
    }
  });

  it("un texto que cambia en un carácter no reutiliza lo saneado del anterior", () => {
    const limpio = `${relleno}<p>ok</p>`;
    const sucio = `${relleno}<p>ok</p><script>alert(1)</script>`;
    expect(sanearHtml(limpio)).toContain("<p>ok</p>");
    const resultado = sanearHtml(sucio);
    expect(resultado).not.toContain("<script");
    // Y el limpio sigue igual después del sucio
    expect(sanearHtml(limpio)).toBe(sanearHtml(`${relleno}<p>ok</p>`));
  });

  it("sanear es idempotente también con memoria", () => {
    for (const carga of CARGAS) {
      const una = sanearHtml(carga);
      expect(sanearHtml(una)).toBe(una);
    }
  });
});
