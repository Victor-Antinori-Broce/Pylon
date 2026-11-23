/**
 * Arreglos de la auditoría de seguridad del 2026-11-18 (run-1 y run-2)
 * ============================================================================
 *
 * Las piezas puras de cada arreglo: lo que se puede comprobar sin base ni
 * servidor. Las rutas (code-graph, kon-assets, auto-kon) se cubren aparte.
 */
import { describe, expect, it } from "vitest";

import { PlanNoValido, caminoCanonico, validarPlan } from "../../apps/api/src/lib/planes-de-agente";
import { isSafeAssetPath } from "../../packages/shared/src/admin-view";
import { escanearCodigo } from "../../packages/shared/src/escaneo-de-codigo";

describe("kon-assets: los source maps no se sirven", () => {
  it("rechaza .map y sigue aceptando js/mjs/css", () => {
    expect(isSafeAssetPath("admin/view.js.map")).toBe(false);
    expect(isSafeAssetPath("dist/index.map", { allowHtml: true })).toBe(false);
    expect(isSafeAssetPath("admin/view.js")).toBe(true);
    expect(isSafeAssetPath("admin/view.mjs")).toBe(true);
    expect(isSafeAssetPath("admin/view.css")).toBe(true);
  });
});

describe("planes: el camino que se comprueba es el que se ejecuta", () => {
  const plan = (path: string) => validarPlan({ goal: "g", steps: [{ method: "GET", path }] });

  it("rechaza segmentos punto, codificados o no, y lo que el parser de URL cambiaría", () => {
    for (const path of [
      "/api/./admin/users",
      "/api/x/../admin/users",
      "/api/%2e/admin/users",
      "/api/%2E%2E/admin/users",
      "/api//admin/users",
      "/api/x%2fadmin",
      "/api\\admin\\users",
      "/api/ad\tmin/users",
      "/api/ad\nmin/users",
    ]) {
      expect(() => plan(path), JSON.stringify(path)).toThrow(PlanNoValido);
    }
  });

  it("sigue vetando /api/admin y aceptando caminos normales, con query y con ñ", () => {
    expect(() => plan("/api/admin/users")).toThrow(/admin/);
    expect(plan("/api/kons/blog/entradas/1?x=1").steps[0]!.path).toBe("/api/kons/blog/entradas/1?x=1");
    expect(caminoCanonico("/api/wiki/año", 0)).toBe("/api/wiki/año");
    expect(caminoCanonico("/api/wiki/a%C3%B1o", 0)).toBe("/api/wiki/a%C3%B1o");
  });
});

describe("escáner de promoción: escapes y barras", () => {
  const caminos = (codigo: string) => escanearCodigo(codigo).apiCalls.map((c) => [c.method, c.path]);

  it("decodifica \\x, \\u, \\u{} y octal antes de clasificar un camino", () => {
    expect(caminos('await kitsuden.api.delete("/api/\\x61dmin/users/1")')).toEqual([
      ["DELETE", "/api/admin/users/1"],
    ]);
    expect(caminos('await kitsuden.api.delete("/api/\\u0061dmin/users/1")')).toEqual([
      ["DELETE", "/api/admin/users/1"],
    ]);
    expect(caminos('await kitsuden.api.delete("/api/\\u{61}dmin/users/1")')).toEqual([
      ["DELETE", "/api/admin/users/1"],
    ]);
    expect(caminos('await kitsuden.api.delete("/api/\\141dmin/users/1")')).toEqual([
      ["DELETE", "/api/admin/users/1"],
    ]);
    // Continuación de línea: ni la barra ni el salto son texto.
    expect(caminos('await kitsuden.api.delete("/api/ad\\\nmin/users/1")')).toEqual([
      ["DELETE", "/api/admin/users/1"],
    ]);
  });

  it("una barra tras ++/-- es división: el código que sigue no se esconde", () => {
    const informe = escanearCodigo("let a = 1; a++ / 2; process.exit(1)");
    expect(informe.passed).toBe(false);
    expect(informe.findings.some((h) => h.rule !== "ambiguous_slash")).toBe(true);
    expect(informe.findings.some((h) => h.rule === "ambiguous_slash")).toBe(true);
  });
});
