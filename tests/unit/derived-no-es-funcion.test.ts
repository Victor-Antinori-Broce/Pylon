/**
 * Un valor de `$derived.by` no se llama con paréntesis
 * ============================================================================
 *
 * ── EL FALLO ───────────────────────────────────────────────────────────────
 *
 * `CalculatedField.svelte` y `DateField.svelte` hacían esto:
 *
 *     const displayValue = $derived.by(() => { … });
 *     …
 *     {displayValue()}          // ← con paréntesis
 *
 * `$derived.by(fn)` EJECUTA la función y guarda el resultado. Llamar al
 * resultado lanza `TypeError: displayValue is not a function`, que en el
 * paquete minificado llega como:
 *
 *     Uncaught TypeError: e(...) is not a function
 *
 * y tumba el renderizado de la fila entera. La tabla se queda con el girador
 * puesto y «0 records» — ni un mensaje que apunte al campo culpable.
 *
 * ── POR QUE ES FACIL EQUIVOCARSE ───────────────────────────────────────────
 *
 * Las dos formas se leen casi igual y hacen lo contrario:
 *
 *     $derived(() => …)      guarda LA FUNCIÓN     → sí se llama
 *     $derived.by(() => …)   guarda EL RESULTADO   → no se llama
 *
 * `GamesView` usa la primera con `sortedGames()` y es correcto. Por eso esta
 * prueba mira solo `.by`: señalar también la otra sería gritar sobre código
 * que funciona, y un guardián que grita sobre lo correcto se acaba ignorando.
 *
 * ── POR QUE NO LO VIO NADIE ANTES ──────────────────────────────────────────
 *
 * Estos componentes solo se montan cuando hay FILAS que pintar. Con las tablas
 * vacías nunca llegaban a ejecutarse. Es el mismo patrón que el bucle del
 * explorador: un fallo que espera a que haya datos reales para aparecer, y
 * entonces aparece en la pantalla principal.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "node:fs";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const ADMIN = join(RAIZ, "packages", "admin", "src");

/**
 * Quita comentarios de bloque y de línea.
 *
 * Sin esto, el propio comentario que explica el fallo —donde se escribe
 * `displayValue()` como ejemplo de lo que NO hacer— haría fallar la prueba.
 * Ya pasó en la primera versión.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("valores derivados con `.by`", () => {
  const ficheros = globSync("**/*.svelte", { cwd: ADMIN }).map((f) => join(ADMIN, f));

  it("se han encontrado componentes que revisar", () => {
    expect(ficheros.length, "no se localizó ningún .svelte del panel").toBeGreaterThan(20);
  });

  it("ninguno se invoca como si fuera una función", () => {
    const problemas: string[] = [];

    for (const ruta of ficheros) {
      const fuente = sinComentarios(readFileSync(ruta, "utf-8"));

      // `const X = $derived.by(` — solo `.by`, que es el que guarda el valor.
      const nombres = new Set(
        [...fuente.matchAll(/const\s+(\w+)\s*=\s*\$derived\.by\s*[<(]/g)].map((m) => m[1])
      );

      for (const nombre of nombres) {
        for (const m of fuente.matchAll(new RegExp(`(?<![\\w.$])${nombre}\\s*\\(`, "g"))) {
          // La propia declaración: `const X = $derived.by(`
          if (/=\s*\$derived\.by\s*$/.test(fuente.slice(Math.max(0, m.index! - 40), m.index!))) {
            continue;
          }

          const linea = fuente.slice(0, m.index!).split("\n").length;
          problemas.push(
            `${ruta.slice(RAIZ.length + 1)}:${linea} — \`${nombre}()\`. ` +
              `\`$derived.by\` guarda el RESULTADO, no la función: los paréntesis ` +
              `lanzan «is not a function» y tumban el render de la fila entera, ` +
              `dejando la tabla girando con «0 records». Quítalos.`
          );
        }
      }
    }

    expect(problemas, problemas.join("\n\n")).toEqual([]);
  });
});
