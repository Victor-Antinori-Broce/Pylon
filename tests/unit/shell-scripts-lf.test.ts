/**
 * Los scripts de shell tienen que estar en LF
 * ============================================================================
 *
 * Un `.sh` con finales de línea de Windows es sintácticamente válido en Windows
 * y basura en un contenedor Linux: `sh` se traga el `\r` como parte del token,
 * así que `set -e` se lee como `set -e\r` y el intérprete responde
 *
 *     set: line 10: illegal option -
 *
 * que no menciona ni el fichero, ni el retorno de carro, ni nada que lleve a la
 * causa. Pasó de verdad: `kitsuden_api_prod` arrancaba, moría, reintentaba, y
 * `docker compose up` solo decía «dependency failed to start: container
 * kitsuden_api_prod is unhealthy». Nueve scripts estaban en CRLF.
 *
 * ── POR QUÉ NO BASTA CON .gitattributes ────────────────────────────────────
 *
 * El repo YA declara `*.sh text eol=lf`. La regla es correcta y no sirvió de
 * nada, porque se añadió DESPUÉS de que los ficheros estuvieran en el árbol de
 * trabajo, y `.gitattributes` solo actúa al pasar por git. Con
 * `core.autocrlf=true` —lo normal en Windows— cualquier fichero que se cree o
 * se toque fuera de ese camino vuelve a nacer en CRLF.
 *
 * Y Docker copia del ÁRBOL DE TRABAJO, no del índice. Lo que git normalizaría
 * al hacer commit da igual: en la imagen entra lo que hay en disco.
 *
 * Por eso esto se comprueba sobre los bytes del fichero y no sobre la
 * configuración de git.
 */

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

/** Los `.sh` de las carpetas que acaban dentro de una imagen o de un despliegue. */
function scripts(): string[] {
  const encontrados: string[] = [];
  for (const carpeta of ["docker", "scripts"]) {
    for (const entrada of readdirSync(join(RAIZ, carpeta), { withFileTypes: true })) {
      if (entrada.isFile() && entrada.name.endsWith(".sh")) {
        encontrados.push(join(carpeta, entrada.name));
      }
    }
  }
  return encontrados;
}

describe("los scripts de shell no llevan CRLF", () => {
  const ficheros = scripts();

  it("hay scripts que inspeccionar", () => {
    // Sin esto, un fallo al listar dejaría la lista vacía y la comprobación de
    // abajo pasaría sin mirar un solo fichero.
    expect(ficheros.length).toBeGreaterThan(5);
  });

  for (const fichero of ficheros) {
    it(`${fichero}`, () => {
      const bytes = readFileSync(join(RAIZ, fichero));
      const primero = bytes.indexOf("\r\n");

      expect(
        primero,
        `${fichero} tiene CRLF (primer caso en el byte ${primero}). En Linux, ` +
          `sh incluye el \r en el token: 'set -e' pasa a ser 'set -e\r' y el ` +
          `contenedor muere con "illegal option -". Conviértelo a LF; ` +
          `.gitattributes no lo arregla solo, porque Docker copia del árbol de ` +
          `trabajo y no del índice.`
      ).toBe(-1);
    });
  }
});
