/**
 * Recorrido de ficheros para las pruebas de vigilancia.
 *
 * Existe una sola copia porque varias pruebas barren el repo buscando patrones
 * (rutas ensombrecidas, tablas declaradas, enlaces del panel) y cada una
 * escribía su propio `readdirSync` recursivo con una lista de exclusiones
 * ligeramente distinta. La que se olvidaba de excluir `node_modules` tardaba
 * minutos; la que se olvidaba de `dist` analizaba el código compilado y
 * denunciaba dos veces el mismo problema.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const IGNORADOS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".svelte-kit",
  "coverage",
  ".turbo",
  ".claude",
]);

/** Todos los ficheros bajo `raiz` cuyo nombre acaba en alguna de las extensiones. */
export function listarFicheros(raiz: string, ...extensiones: string[]): string[] {
  const encontrados: string[] = [];

  function recorrer(dir: string) {
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // el directorio puede no existir en un checkout parcial
    }

    for (const entrada of entradas) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (IGNORADOS.has(entrada.name)) continue;
        recorrer(ruta);
      } else if (extensiones.some((ext) => entrada.name.endsWith(ext))) {
        encontrados.push(ruta);
      }
    }
  }

  try {
    if (!statSync(raiz).isDirectory()) return [];
  } catch {
    return [];
  }

  recorrer(raiz);
  return encontrados.sort();
}
