/**
 * El 404 de `/api/*` sugiere rutas sin colgar la API (auditoría F3/F8)
 *
 * El camino lo escribe un anónimo (hasta ~16 KB) y se comparaba con cada ruta
 * con una distancia de edición completa: O(rutas × largo²) en el único hilo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  distanciaAcotada,
  olvidarGastoDeSugerencias,
  olvidarRoutersDeKons,
  puedeSugerir,
  registrarRouterDeKon,
  SUGERENCIAS_POR_MINUTO,
  sugerirRutas,
} from "../../apps/api/src/lib/rutas-de-kons";

function levenshtein(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0]!;
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j]!;
      fila[j] = Math.min(fila[j]! + 1, fila[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length]!;
}

const nada = () => undefined;

beforeAll(() => {
  olvidarRoutersDeKons();
  const rutas: { method: string; path: string; handler: unknown }[] = [
    { method: "GET", path: "/tournaments/:id", handler: nada },
    { method: "GET", path: "/tournaments/:id/report", handler: nada },
    { method: "POST", path: "/tournaments/:id/report", handler: nada },
    { method: "GET", path: "/players", handler: nada },
    { method: "GET", path: "/files/*", handler: nada },
  ];
  // Muchas rutas con parámetro, del mismo número de segmentos que el ataque.
  for (let i = 0; i < 300; i++) rutas.push({ method: "GET", path: `/r${i}/:id`, handler: nada });
  // Y con literales a los dos lados del parámetro: lo común no se puede recortar.
  for (let i = 0; i < 300; i++) rutas.push({ method: "GET", path: `/x${i}/:id/report`, handler: nada });
  registrarRouterDeKon("kon-prueba", "/api/esports", { routes: rutas });
});

afterAll(() => olvidarRoutersDeKons());

describe("distanciaAcotada", () => {
  it("coincide con Levenshtein hasta el tope y da tope+1 por encima", () => {
    const pares = [
      ["", ""],
      ["abc", "abc"],
      ["kitten", "sitting"],
      ["/api/esports/tournaments/x/reports", "/api/esports/tournaments/x/report"],
      ["abcdef", "azced"],
      ["flaw", "lawn"],
      ["a", "bbbbbbbb"],
      ["/api/a/b/c", "/api/x/y/z/w"],
    ] as const;
    for (const [a, b] of pares) {
      const real = levenshtein(a, b);
      for (const tope of [0, 1, 2, 3, 5, 10]) {
        expect(distanciaAcotada(a, b, tope), `${a}|${b}|${tope}`).toBe(real <= tope ? real : tope + 1);
      }
    }
  });
});

describe("sugerirRutas", () => {
  it("sigue sugiriendo la ruta con una errata y el Allow del método equivocado", () => {
    const s = sugerirRutas("GET", "/api/esports/tournaments/abc/reports");
    expect(s.didYouMean[0]).toEqual({ method: "GET", path: "/api/esports/tournaments/:id/report" });
    expect(sugerirRutas("DELETE", "/api/esports/tournaments/abc/report").allow).toEqual(["GET", "POST"]);
    expect(sugerirRutas("GET", "/api/esports/files/a/b").allow).toEqual(["GET"]);
  });

  it("un camino enorme no se compara con nada y responde al momento", () => {
    for (const largo of [201, 2_000, 16_000]) {
      const camino = `/api/esports/r1/${"x".repeat(largo)}`;
      const inicio = performance.now();
      const s = sugerirRutas("GET", camino);
      expect(performance.now() - inicio, `largo ${largo}`).toBeLessThan(50);
      expect(s.didYouMean).toEqual([]);
    }
    const barras = `/api/${"/".repeat(16_000)}x`;
    const inicio = performance.now();
    sugerirRutas("GET", barras);
    expect(performance.now() - inicio).toBeLessThan(50);
  });

  it("en el tope de largo, 600 rutas con parámetro tampoco cuestan", () => {
    const camino = `/api/esports/r1/${"y".repeat(180)}`;
    const ambos = `/api/esports/q1/${"y".repeat(170)}/repord`;
    expect(ambos.length).toBeLessThanOrEqual(200);
    const inicio = performance.now();
    for (let i = 0; i < 20; i++) {
      sugerirRutas("GET", camino + i);
      sugerirRutas("GET", ambos.slice(0, -1) + (i % 10));
    }
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});

describe("presupuesto de sugerencias por cliente", () => {
  it("pasado el presupuesto del minuto, no se calculan más; otro cliente no se ve afectado", () => {
    olvidarGastoDeSugerencias();
    const t0 = 1_000_000;
    for (let i = 0; i < SUGERENCIAS_POR_MINUTO; i++) expect(puedeSugerir("203.0.113.9", t0 + i)).toBe(true);
    expect(puedeSugerir("203.0.113.9", t0 + 100)).toBe(false);
    expect(puedeSugerir("198.51.100.7", t0 + 100)).toBe(true);
    // Pasado el minuto, vuelve a tener presupuesto.
    expect(puedeSugerir("203.0.113.9", t0 + 60_000)).toBe(true);
  });
});
