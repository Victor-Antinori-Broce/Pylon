/**
 * La fachada del engine y los ciclos
 * ============================================================================
 *
 * Tres archivos de `apps/api` importan submódulos del engine por ruta profunda
 * (`packages/engine/src/...`) en vez de por la fachada `@kitsuden/engine`, y
 * cada uno lleva un comentario explicando por qué: el índice del engine
 * re-exporta ESE MISMO archivo, así que importar la fachada desde ahí cierra
 * un ciclo.
 *
 * El comentario, por sí solo, no impide nada. De hecho no lo impidió: al
 * añadir un `messageOf` a `module-loader.ts` y a `agent-tools.ts` se coló un
 * `import { messageOf } from "@kitsuden/engine"` —en uno de los casos, dos
 * líneas por debajo del comentario que lo prohíbe— y volvió el ciclo.
 *
 * Esta prueba convierte la nota en regla: si un archivo decidió esquivar la
 * fachada, no puede importarla por la puerta de atrás para una utilidad
 * suelta. La salida correcta es hacer deep import también de esa utilidad.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const API = join(RAIZ, "apps", "api", "src");

/** Recorre `apps/api/src` devolviendo los .ts que no son pruebas. */
function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", "tests", "tests-unit"].includes(entrada.name)) continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      archivosFuente(ruta, acc);
      continue;
    }
    if (!entrada.name.endsWith(".ts") || entrada.name.endsWith(".test.ts")) continue;
    acc.push(ruta);
  }
  return acc;
}

/** Líneas de `import`/`export ... from`, ya sin comentarios. */
function especificadores(fuente: string): string[] {
  return fuente
    .split(/\r?\n/)
    .filter((l) => /^\s*(import|export)\b/.test(l))
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
}

describe("fachada del engine", () => {
  it("quien hace deep import del engine no importa además la fachada", () => {
    const infractores: string[] = [];

    for (const ruta of archivosFuente(API)) {
      const lineas = especificadores(readFileSync(ruta, "utf8"));
      const profundo = lineas.some((l) => /packages\/engine\/src\//.test(l));
      if (!profundo) continue;

      // `import type` no existe en runtime: no puede cerrar ningún ciclo.
      const fachada = lineas.some(
        (l) => /["']@kitsuden\/engine["']/.test(l) && !/^\s*import\s+type\b/.test(l)
      );
      if (fachada) infractores.push(ruta.replace(RAIZ, "").replace(/\\/g, "/"));
    }

    expect(
      infractores,
      `Estos archivos esquivan la fachada del engine a propósito (mira el ` +
        `comentario junto a su deep import) pero la importan igualmente, lo que ` +
        `reabre el ciclo que intentaban evitar. Haz deep import también de lo ` +
        `que falte, p. ej. "packages/engine/src/errors" para messageOf. ` +
        `Archivos: ${infractores.join(", ")}`
    ).toEqual([]);
  });
});
