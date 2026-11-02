/**
 * `schema-merger` no puede importar `db` en tiempo de ejecución
 * ============================================================================
 *
 * ── EL BLOQUEO ─────────────────────────────────────────────────────────────
 *
 * `apps/api/src/db/index.ts` termina con:
 *
 *     export const db = await getDbInstance();
 *
 * Un `await` de nivel superior, cuya inicialización carga `schema-merger`. Si
 * `schema-merger` importa `db` de vuelta, hay un ciclo con `await` de nivel
 * superior — y en ESM eso **se bloquea o no según por dónde entres**:
 *
 *   · Entrando por `db`: funciona. `db` empieza, carga `schema-merger`, que ve
 *     `db` a medio evaluar (zona muerta, legal), termina, y `db` resuelve.
 *
 *   · Entrando por cualquier módulo que alcance `schema-merger` antes: ESM
 *     programa su evaluación DESPUÉS de `db`. `db` espera a `schema-merger`,
 *     `schema-merger` espera su turno detrás de `db`. Bloqueo permanente.
 *
 * ── POR QUÉ MERECE UNA PRUEBA ──────────────────────────────────────────────
 *
 * Porque no se parece a un fallo. El proceso quedaba al **0% de CPU y sin una
 * sola conexión abierta**: sin excepción, sin traza, sin timeout. La API nunca
 * llegaba a escuchar y lo único visible era
 *
 *     dependency failed to start: container kitsuden_api_prod is unhealthy
 *
 * Localizarlo costó bisecar los 40 imports del índice del engine uno a uno.
 *
 * ── LO QUE SE VIGILA AHORA ─────────────────────────────────────────────────
 *
 * La primera versión de esta prueba vigilaba el síntoma: que el índice del
 * engine no reexportara `buildMergedSchema`. Servía, pero dejaba la trampa
 * puesta — cualquier otro módulo podía volver a cerrar el ciclo.
 *
 * Ahora `buildMergedSchema` RECIBE el acceso a base como parámetro, y
 * `schema-merger` solo conserva un `import type`, que TypeScript borra. Sin
 * arista de ejecución no hay ciclo posible, venga la carga por donde venga.
 *
 * Esta prueba protege eso: que ese import siga siendo solo de tipo.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const MERGER = join(RAIZ, "apps", "api", "src", "lib", "schema-merger.ts");

/** Líneas `import`/`export ... from` reales, sin comentarios. */
function importes(fuente: string): string[] {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .filter((l) => /^\s*(import|export)\b[^;]*\bfrom\s*["']/.test(l));
}

describe("schema-merger no reabre el ciclo con db", () => {
  const lineas = importes(readFileSync(MERGER, "utf-8"));

  it("hay imports que inspeccionar", () => {
    // Sin esto, un cambio de formato que rompiera el filtro dejaría la lista
    // vacía y la comprobación de abajo pasaría sin mirar nada.
    expect(lineas.length).toBeGreaterThan(3);
  });

  it("el import de ../db es SOLO de tipo", () => {
    // `../db/schema-core` no cuenta: es el esquema, no la conexión, y no
    // arrastra el `await` de nivel superior.
    const haciaDb = lineas.filter((l) => /from\s*["']\.\.\/db["']/.test(l));
    const conValor = haciaDb.filter((l) => !/^\s*import\s+type\b/.test(l));

    expect(
      conValor,
      `apps/api/src/lib/schema-merger.ts importa '../db' en tiempo de ` +
        `EJECUCIÓN:\n\n${conValor.join("\n")}\n\n` +
        `Eso reabre el ciclo con el 'await' de nivel superior de db/index.ts y ` +
        `bloquea el arranque de la API para siempre — sin error, sin CPU y sin ` +
        `conexiones. Si necesitas consultar la base aquí, recíbela como ` +
        `parámetro (buildMergedSchema ya lo hace) en vez de importarla.`
    ).toEqual([]);
  });

  it("buildMergedSchema sigue aceptando la base por parametro", () => {
    // Si alguien quita el parámetro, la única forma de volver a consultar la
    // base desde aquí es importarla — y eso reabre el bloqueo.
    const fuente = readFileSync(MERGER, "utf-8");
    expect(
      /export async function buildMergedSchema\(\s*consultas\?:/.test(fuente),
      "buildMergedSchema ya no recibe la base por parámetro: sin esa vía, " +
        "consultar installed_kons obliga a importar '../db' y reabrir el ciclo."
    ).toBe(true);
  });
});
