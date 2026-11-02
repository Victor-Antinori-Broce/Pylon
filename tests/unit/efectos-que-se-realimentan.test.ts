/**
 * Un `$effect` no puede depender de lo que él mismo provoca
 * ============================================================================
 *
 * ── EL FALLO ───────────────────────────────────────────────────────────────
 *
 * En `components/DataExplorer.svelte` estaba escrito así:
 *
 *     $effect(() => {
 *       if (!initialData && apiEndpoint) loadData();
 *     });
 *
 * En Svelte 5, todo lo que se LEE dentro de un efecto pasa a ser dependencia
 * suya — incluido lo que se lee dentro de las funciones que llama. Y `loadData`
 * hacía esto:
 *
 *     rows = response.docs || response;
 *     pagination.total = response.totalDocs || rows.length;   // ← LEE `rows`
 *     pagination.totalPages = Math.ceil(pagination.total / …); // ← LEE `total`
 *
 * Es decir: el efecto acababa dependiendo de `rows` y de `pagination.total`,
 * que son justo lo que la carga escribe. Cargar provocaba cargar.
 *
 * ── POR QUE NO SE VEIA ─────────────────────────────────────────────────────
 *
 * Mientras la lista estuvo VACIA no pasaba nada: se reescribían los mismos
 * valores. Apareció en cuanto hubo un post de verdad que devolver. Es el tipo
 * de fallo que espera a que haya datos para manifestarse — y entonces lo hace
 * en la pantalla principal.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Si un efecto llama a una función que escribe estado, las dependencias se
 * ESCRIBEN a mano y la llamada va dentro de `untrack`. En Svelte 5, «reacciona
 * a esto» se declara, no se deduce.
 *
 * Ya se aplicó tres veces en este panel —editor de blog, selector de vistas,
 * pestañas de games— antes de encontrarlo aquí.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const COMPONENTES = join(RAIZ, "packages", "admin", "src", "lib", "components");

/** Los dos exploradores: el de las vistas de kon y el de las vistas propias. */
const EXPLORADORES = [
  ["vistas propias", join(COMPONENTES, "DataExplorer.svelte")],
  ["vistas de kon", join(COMPONENTES, "admin", "DataExplorer.svelte")],
] as const;

describe("los exploradores no se recargan a sí mismos", () => {
  for (const [nombre, ruta] of EXPLORADORES) {
    it(`${nombre}: la carga va aislada dentro del efecto`, () => {
      const fuente = readFileSync(ruta, "utf-8");

      /**
       * Se buscan los `$effect` que llaman a `loadData` y se exige que la
       * llamada esté envuelta en `untrack`. Una llamada desnuda ata el efecto
       * a todo lo que la carga toca.
       */
      const efectos = [...fuente.matchAll(/\$effect\(\(\) => \{([\s\S]*?)\n {2}\}\);/g)].map(
        (m) => m[1]
      );

      const conCarga = efectos.filter((cuerpo) => /\bloadData\(\)/.test(cuerpo));

      expect(
        conCarga.length,
        `no se encontró ningún \`$effect\` que cargue datos en ${nombre}`
      ).toBeGreaterThan(0);

      for (const cuerpo of conCarga) {
        expect(
          cuerpo.includes("untrack("),
          `Hay un \`$effect\` que llama a \`loadData()\` sin \`untrack\` en ` +
            `${nombre}. Todo lo que la carga lee se vuelve dependencia del ` +
            `efecto, incluido lo que ella misma escribe: cargar provoca cargar. ` +
            `No falla mientras la tabla está vacía, porque se reescriben los ` +
            `mismos valores — aparece en cuanto hay datos.`
        ).toBe(true);
      }
    });
  }

  it("la carga no lee el estado que acaba de escribir", () => {
    /**
     * El otro lado del mismo fallo: aunque el efecto esté aislado, leer
     * `rows.length` justo después de asignar `rows` es frágil y vuelve a atar
     * la función a su propia salida en cuanto alguien la llame desde un efecto.
     * Se trabaja sobre una variable local.
     */
    for (const [nombre, ruta] of EXPLORADORES) {
      const fuente = readFileSync(ruta, "utf-8");

      expect(
        /(pagination\.total|totalCount) = [^;]*(rows|data)\.length/.test(fuente),
        `En ${nombre}, el total se calcula leyendo la lista que se acaba de ` +
          `asignar. Usa una variable local con la respuesta: leer lo que acabas ` +
          `de escribir vuelve a atar la función a su propia salida en cuanto ` +
          `alguien la llame desde un efecto.`
      ).toBe(false);
    }
  });
});
