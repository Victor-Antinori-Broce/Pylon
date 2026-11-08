/**
 * El escáner de promoción no clasifica un camino por su primer literal
 * (auditoría F73): `kitsuden.api.delete("/api/ad" + "min/users/1")` llegaba
 * como `DELETE /api/ad`, que no es sensible, y se activaba solo en turbo.
 */
import { describe, expect, it } from "vitest";

import { escanearCodigo } from "../../packages/shared/src/escaneo-de-codigo";

const caminos = (codigo: string) => escanearCodigo(codigo).apiCalls.map((c) => [c.method, c.path]);

describe("escanearCodigo: el literal tiene que ser el argumento entero", () => {
  it("un literal seguido de `)` o `,` se clasifica como antes", () => {
    expect(caminos('await kitsuden.api.get("/api/items")')).toEqual([["GET", "/api/items"]]);
    expect(caminos('await kitsuden.api.post("/api/items", { a: 1 })')).toEqual([["POST", "/api/items"]]);
    expect(caminos('await kitsuden.api.request("DELETE", "/api/items/1")')).toEqual([["DELETE", "/api/items/1"]]);
    expect(caminos('await kitsuden.api.request("PATCH", "/api/items/1", { a: 1 })')).toEqual([["PATCH", "/api/items/1"]]);
  });

  it("concatenado, con método o con cualquier otra cosa detrás: sin clasificar", () => {
    for (const codigo of [
      'await kitsuden.api.delete("/api/ad" + "min/users/1")',
      'await kitsuden.api.delete("/api/ad"\n  + "min/users/1")',
      'await kitsuden.api.get("/api/x".concat("y"))',
      'await kitsuden.api.get("/api/x" + id)',
      'await kitsuden.api.get("/api/x"[0])',
      'await kitsuden.api.request("DELETE", "/api/ad" + "min/users/1")',
    ]) {
      const llamadas = escanearCodigo(codigo).apiCalls;
      expect(llamadas.length, codigo).toBe(1);
      expect(llamadas[0]!.path, codigo).toBeNull();
    }
  });
});
