/**
 * Trinquete de supresiones de TypeScript
 * ============================================================================
 *
 * Hermano de `any-ratchet`, y por el mismo motivo: `strict: true` no garantiza
 * nada en las líneas donde alguien apagó el comprobador.
 *
 * Pero aquí hay una diferencia que importa. Un `any` es una imprecisión; un
 * `@ts-ignore` es el compilador diciendo "esto está mal" y alguien
 * respondiendo "cállate". Esta sesión encontró uno que ocultaba un fallo de
 * datos real: `dbQuery.where()` llamado dos veces en el servidor MCP, que en
 * Drizzle REEMPLAZA la condición anterior en vez de combinarla — se perdía el
 * filtro por `dataSetId` y la búsqueda devolvía entradas de todos los
 * datasets. TypeScript lo impedía. El `@ts-ignore` no decía por qué.
 *
 * ── LAS DOS REGLAS ─────────────────────────────────────────────────────────
 *
 * 1. NINGUNA supresión sin explicación. Un silencio mudo es indistinguible de
 *    un descuido, y nadie se atreve a quitarlo por si acaso. Con una razón
 *    escrita, el siguiente que pase puede juzgarla.
 * 2. El total no sube. Baja el techo cuando limpies; nunca lo subas para que
 *    pase un commit.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

/**
 * Techo de supresiones por área. Deuda medida, no objetivo.
 *
 * El grueso son `@ts-nocheck` en ficheros generados (drizzle), plantillas del
 * CLI —donde es correcto: referencian cosas que no existen hasta generar el
 * proyecto— y scripts sueltos.
 */
const TECHOS: Record<string, number> = {
  "apps/api/src": 11,
  "packages/engine/src": 4,
  // Cero, y así se queda: los kons son la superficie que se publica y que
  // escribe gente de fuera. Si uno necesita suprimir algo, que lo justifique
  // subiendo este número a propósito y no de rebote.
  "packages/kons": 0,
  "packages/core": 6,
  "packages/mcp-server/src": 1,
};

const DIRECTIVA = /@ts-(ignore|expect-error|nocheck)\b/;

/**
 * Lo que sigue a la directiva en la misma línea, si es que sigue algo.
 *
 * Sin ancla `$`: en ficheros con finales de línea de Windows la línea termina
 * en `\r`, que `.` no captura y `$` no cruza — el `match` fallaba entero y toda
 * razón salía vacía. En un repositorio con CRLF eso convierte el guard en un
 * detector de nada que además acusa a código correcto.
 */
function razonDe(linea: string): string {
  const m = linea.match(/@ts-(?:ignore|expect-error|nocheck)\b([^\r\n]*)/);
  if (!m) return "";
  // Se admite cualquier separador: `--`, `-`, `:` o directamente el texto.
  return m[1].replace(/^[\s\-:—]+/, "").trim();
}

interface Hallazgo {
  fichero: string;
  linea: number;
  texto: string;
}

function recorrer(dir: string): Hallazgo[] {
  const salida: Hallazgo[] = [];

  function walk(actual: string): void {
    let entradas;
    try {
      entradas = readdirSync(actual, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entradas) {
      if (["node_modules", "dist", ".git", "build", ".svelte-kit"].includes(e.name)) continue;
      const ruta = join(actual, e.name);

      if (e.isDirectory()) {
        walk(ruta);
        continue;
      }
      if (!/\.(ts|tsx|svelte)$/.test(e.name) || e.name.endsWith(".d.ts")) continue;
      // Los tests pueden necesitar suprimir para provocar errores a propósito.
      if (/\.(test|spec)\.ts$/.test(e.name)) continue;

      const lineas = readFileSync(ruta, "utf8").split("\n");
      lineas.forEach((l, i) => {
        if (DIRECTIVA.test(l)) {
          salida.push({
            fichero: ruta.replace(ROOT, "").replace(/\\/g, "/"),
            linea: i + 1,
            texto: l,
          });
        }
      });
    }
  }

  walk(join(ROOT, dir));
  return salida;
}

describe("trinquete de supresiones de TypeScript", () => {
  for (const [area, techo] of Object.entries(TECHOS)) {
    it(`${area} no supera ${techo} supresiones`, () => {
      const n = recorrer(area).length;
      expect(
        n,
        n > techo
          ? `${area} subió a ${n} (techo ${techo}). Un @ts-ignore es el compilador ` +
              `avisando de un problema real: arréglalo en vez de silenciarlo.`
          : `${area} bajó a ${n}: baja el techo en tests/unit/ts-suppression-ratchet.test.ts`
      ).toBeLessThanOrEqual(techo);
    });
  }

  it("ninguna supresión sin explicación", () => {
    // La regla que de verdad importa. Un `@ts-ignore` mudo no se puede juzgar
    // ni retirar: el siguiente que pase no sabe si tapa un problema real o si
    // sobra desde hace dos años.
    const mudas = Object.keys(TECHOS)
      .flatMap((a) => recorrer(a))
      .filter((h) => razonDe(h.texto).length < 4);

    expect(
      mudas.length,
      mudas.length === 0
        ? ""
        : `Supresiones sin explicar:\n` +
            mudas.map((m) => `  ${m.fichero}:${m.linea}`).join("\n") +
            `\n\nEscribe POR QUÉ: "// @ts-ignore -- la librería no publica tipos".`
    ).toBe(0);
  });
});
