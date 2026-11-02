/**
 * Los scripts embebidos en el arranque tienen que terminar siempre
 * ============================================================================
 *
 * `docker/start-with-check.sh` ejecuta trozos de TypeScript con `bun run -`.
 * Uno de ellos acababa así:
 *
 *     main().catch(() => process.exit(0));
 *
 * Que solo termina por el camino MALO. Por el bueno, `main()` hacía todo su
 * trabajo —registraba los kons, imprimía cada línea— y el proceso **no salía**:
 * `db` deja abierto un pool de Postgres, y mientras quede un handle vivo el
 * runtime no termina.
 *
 * El efecto: el arranque se paraba ahí para siempre. El paso [6/6] nunca
 * llegaba a lanzar la API, nada escuchaba en el 3000, y `docker compose up`
 * decía únicamente que el contenedor estaba `unhealthy`. **Sin una sola línea
 * de error, porque error no había.** Al medirlo con el arreglo, ese mismo paso
 * pasó de colgarse indefinidamente a tardar 0,20 s.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Si un script del arranque llama a una función asíncrona de nivel superior,
 * tiene que salir por AMBOS caminos: `.finally(() => process.exit(...))`, o un
 * `process.exit` alcanzable en los dos. Un `.catch()` a secas no basta.
 *
 * Se comprueba leyendo el script y no ejecutándolo: una prueba que ejecutara el
 * arranque necesitaría base de datos, y si el fallo reapareciera se colgaría
 * ella misma — un test colgado bloquea la suite y no informa de nada.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const SCRIPT = join(RAIZ, "docker", "start-with-check.sh");

describe("los scripts embebidos en el arranque terminan", () => {
  const fuente = readFileSync(SCRIPT, "utf-8");

  it("el script de arranque existe y tiene contenido", () => {
    expect(fuente.length).toBeGreaterThan(500);
  });

  it("no hay un main().catch() sin salida por el camino bueno", () => {
    /**
     * El patrón exacto que colgó el arranque: `.catch()` cerrando la cadena,
     * sin `.finally()` ni un `process.exit` posterior.
     */
    const sospechosos = fuente
      .split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /^\s*main\(\)[\s\S]*\.catch\(/.test(l))
      .filter(([, l]) => !l.includes(".finally("));

    expect(
      sospechosos.map(([n, l]) => `linea ${n}: ${l.trim()}`),
      `docker/start-with-check.sh vuelve a cerrar un main() solo con .catch(). ` +
        `Eso termina el proceso cuando falla, pero NO cuando funciona: el pool ` +
        `de Postgres sigue abierto y el runtime no sale nunca. El arranque se ` +
        `queda ahí y el contenedor figura 'unhealthy' sin ningún error. ` +
        `Usa .finally(() => process.exit(0)).`
    ).toEqual([]);
  });

  it("cada main() del script sale por finally", () => {
    // Comprobación positiva: no basta con que no exista el patrón malo, tiene
    // que existir el bueno. Si alguien reescribe el bloque de otra forma y se
    // olvida de salir, esto lo detecta.
    const invocaciones = (fuente.match(/^\s*main\(\)/gm) ?? []).length;
    if (invocaciones === 0) return; // el bloque ya no existe: nada que exigir

    const salidas = (fuente.match(/\.finally\(\s*\(\)\s*=>\s*process\.exit\(/g) ?? []).length;
    expect(
      salidas,
      `El script invoca main() ${invocaciones} vez/veces pero solo ${salidas} ` +
        `cierran con .finally(() => process.exit(...)). Un main() que no sale ` +
        `por el camino bueno cuelga el arranque entero, en silencio.`
    ).toBeGreaterThanOrEqual(invocaciones);
  });
});
