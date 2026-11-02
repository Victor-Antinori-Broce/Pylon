/**
 * Filtros de enum sin castear
 * ============================================================================
 *
 * Este patrón estaba en 25 sitios de 15 archivos:
 *
 *     const status = c.req.query("status");
 *     if (status) conditions.push(eq(tabla.status, status as any));
 *
 * `status` es texto sin validar de la URL, y la columna es un enum de
 * PostgreSQL. Con un valor que no pertenece, la consulta NO devuelve cero
 * filas: **falla**. `invalid input value for enum dms_document_status`. Una
 * errata del cliente producía un 500, y el mensaje publicaba el nombre interno
 * del tipo.
 *
 * Es la misma clase de fallo que apareció en la frontera MCP y en `kon-dms`:
 * un `as any` sobre algo que cruza una frontera esconde un supuesto que nadie
 * comprueba. Aquí el supuesto era "lo que venga en la URL es un valor del
 * enum".
 *
 * La forma correcta es `eqEnum`, que contrasta el valor con `enumValues` —la
 * lista que la propia columna trae— y devuelve `undefined` si no pertenece.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const AREAS = ["apps/api/src", "packages/kons", "packages/core", "packages/engine/src"];

/** `eq(tabla.columna, valor as any)` — comparación con un cast en el valor. */
const CAST_EN_COMPARACION = /\b(eq|ne)\(\s*\w+\.\w+\s*,\s*[\w.?]+\s+as\s+any\s*\)/;

function archivosTs(dir: string, acc: string[] = []): string[] {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entradas) {
    if (["node_modules", "dist", "build", ".git"].includes(e.name)) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      archivosTs(ruta, acc);
      continue;
    }
    if (!e.name.endsWith(".ts") || e.name.endsWith(".d.ts") || e.name.endsWith(".test.ts"))
      continue;
    acc.push(ruta);
  }
  return acc;
}

describe("comparaciones contra columnas", () => {
  it("nadie compara una columna con un valor casteado a any", () => {
    const infractores: string[] = [];

    for (const area of AREAS) {
      for (const ruta of archivosTs(join(RAIZ, area))) {
        readFileSync(ruta, "utf8")
          .split(/\r?\n/)
          .forEach((linea, i) => {
            // Los comentarios que documentan el patrón viejo no cuentan.
            if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
            if (!CAST_EN_COMPARACION.test(linea)) return;
            infractores.push(`${ruta.replace(RAIZ, "").split(sep).join("/")}:${i + 1}`);
          });
      }
    }

    expect(
      infractores,
      `Comparar una columna con un valor casteado a \`any\` salta la ` +
        `comprobación. Si la columna es un ENUM de Postgres, un valor que no ` +
        `pertenece no devuelve cero filas: hace fallar la consulta entera (500). ` +
        `Usa \`eqEnum(columna, valor)\` de @kitsuden/engine, que valida contra ` +
        `los valores que la propia columna declara. Sitios: ${infractores.join(", ")}`
    ).toEqual([]);
  });
});
