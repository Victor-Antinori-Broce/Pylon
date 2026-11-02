/**
 * `.where()` encadenado sobre el mismo builder
 * ============================================================================
 *
 * En Drizzle, `.where()` FIJA la condición; no la acumula. Reasignar el builder
 * para ir añadiendo filtros —
 *
 *     let q = db.select().from(t);
 *     if (a) q = q.where(eq(t.orgId, a));
 *     if (b) q = q.where(eq(t.industry, b));   // ← borra el filtro anterior
 *
 * — compila, no lanza, y devuelve DE MÁS. Es la peor combinación posible: el
 * filtro que se pierde suele ser el primero, y el primero suele ser el de
 * aislamiento (`organizationId`, `dataSetId`, `tenantId`).
 *
 * Cuando se escribió esta prueba había SIETE sitios así, en seis archivos:
 *
 *   · `tools-enhanced.ts` — la búsqueda MCP devolvía entradas de todos los
 *     datasets, no solo del pedido.
 *   · `crm.routes.ts` — empresas, contactos y oportunidades de TODAS las
 *     organizaciones en cuanto se combinaba un filtro con la búsqueda.
 *   · `esports.routes.ts` — el filtro de texto se ignoraba si venía con estado.
 *   · `media.routes.ts` — la biblioteca ignoraba la carpeta al filtrar por tipo.
 *   · `datasets.import-export.ts` — el peor: `dataSetId` estaba en la consulta
 *     base, así que exportar CON filtro se llevaba entradas de todos los
 *     datasets a un fichero.
 *   · `batch.ts` y `batch-api.ts` — aquí no era leer sino ESCRIBIR: un
 *     `where: {}` dejaba el UPDATE (y el DELETE) sin WHERE.
 *
 * Ninguno daba error. Todos daban una respuesta.
 *
 * La forma correcta es acumular en un array y llamar UNA vez:
 *
 *     const condiciones = [];
 *     if (a) condiciones.push(eq(t.orgId, a));
 *     if (b) condiciones.push(eq(t.industry, b));
 *     const filas = await db.select().from(t)
 *       .where(condiciones.length ? and(...condiciones) : undefined);
 *
 * Ojo al combinar: un `sql\`A OR B\`` crudo NO lleva paréntesis propios, y
 * dentro de un `and()` la precedencia de SQL lo convierte en `(X AND A) OR B`.
 * Usa `or(...)` de Drizzle, que sí agrupa.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const AREAS = ["apps/api/src", "packages/kons", "packages/core", "packages/engine/src"];

/** `q = q.where(` — el mismo nombre a los dos lados del igual. */
const REASIGNACION = /^\s*(\w+)\s*=\s*\1\s*\.where\s*\(/;

/** `let q = ...` / `const q = ...` — nace un builder nuevo, grupo nuevo. */
const DECLARACION = /^\s*(?:let|const|var)\s+(\w+)\s*(?::[^=]+)?=/;

/** `} else {` o `} else if (...) {` — rama de una cadena, no un filtro más. */
const RAMA_ELSE = /^\s*\}?\s*else\b/;

/**
 * Sitios donde un MISMO builder recibe dos o más `.where()` que pueden
 * ejecutarse los dos.
 *
 * Las dos cosas que hay que distinguir para no dar la lata con falsos avisos:
 *
 *   · Una reasignación SUELTA es inofensiva: se llama una vez y ya.
 *   · Un `if / else if / else` también: solo entra por una rama. Ahí el
 *     builder se reasigna varias veces en el texto pero nunca en la ejecución.
 *
 * Lo que sí es un fallo son varios `if` INDEPENDIENTES, cada uno añadiendo lo
 * suyo — que es exactamente como se escribe un filtro opcional, y por eso este
 * error se repite.
 */
function sitiosMalos(fuente: string): number[] {
  const lineas = fuente.split(/\r?\n/);
  const grupos = new Map<string, number[]>();
  const malos: number[] = [];

  const cerrar = (nombre: string) => {
    const g = grupos.get(nombre);
    // Con dos o más que NO son ramas de la misma cadena, se acumulan de verdad.
    if (g && g.length >= 2) malos.push(...g);
    grupos.delete(nombre);
  };

  lineas.forEach((linea, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;

    const decl = DECLARACION.exec(linea);
    if (decl) cerrar(decl[1]!); // el builder anterior con ese nombre ya terminó

    const reasig = REASIGNACION.exec(linea);
    if (!reasig) return;
    const nombre = reasig[1]!;

    // ¿Cuelga de un `else`? Se mira hacia atrás la guarda más cercana.
    let esRama = false;
    for (let j = i - 1; j >= 0 && j > i - 6; j--) {
      const anterior = lineas[j]!.trim();
      if (anterior === "") continue;
      if (RAMA_ELSE.test(anterior)) esRama = true;
      if (/\bif\s*\(|\belse\b|\{$/.test(anterior)) break;
    }
    if (esRama) return;

    grupos.set(nombre, [...(grupos.get(nombre) ?? []), i + 1]);
  });

  for (const nombre of [...grupos.keys()]) cerrar(nombre);
  return malos;
}

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

describe("filtros de Drizzle", () => {
  it("nadie acumula filtros reasignando el builder", () => {
    const infractores: string[] = [];

    for (const area of AREAS) {
      for (const ruta of archivosTs(join(RAIZ, area))) {
        for (const linea of sitiosMalos(readFileSync(ruta, "utf8"))) {
          infractores.push(`${ruta.replace(RAIZ, "").replace(/\\/g, "/")}:${linea}`);
        }
      }
    }

    expect(
      infractores,
      `\`.where()\` en Drizzle SUSTITUYE la condición anterior, no la suma. ` +
        `Reasignar el builder para ir añadiendo filtros hace que solo valga el ` +
        `ÚLTIMO, sin error: la consulta devuelve de más y el filtro que se ` +
        `pierde suele ser el de aislamiento. Acumula en un array y llama a ` +
        `\`.where(and(...condiciones))\` una sola vez. Sitios: ` +
        `${infractores.join(", ")}`
    ).toEqual([]);
  });
});
