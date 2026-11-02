/**
 * Ningún kon crea sus tablas en tiempo de ejecución
 * ============================================================================
 *
 * Las tablas se crean con migraciones. Punto. Un `CREATE TABLE` dentro del
 * código del kon es, en producción, código muerto que además miente.
 *
 * ── POR QUÉ NO PUEDE FUNCIONAR ─────────────────────────────────────────────
 *
 * La API se conecta con `kitsuden_app`, un rol SIN privilegio CREATE sobre el
 * esquema. No es un descuido: es lo que hace que Row-Level Security se aplique
 * de verdad, porque Postgres se salta las políticas para un superusuario. Un
 * `CREATE TABLE` desde la aplicación tiene que fallar, y falla.
 *
 * ── Y POR QUÉ NO SE NOTABA ─────────────────────────────────────────────────
 *
 * Porque el ayudante que las ejecutaba capturaba el error, escribía una línea
 * de log y devolvía `false` — que nadie comprobaba:
 *
 *     } catch (err) {
 *       ctx.logger.error(`❌ Academy: ${description} failed - ${error.message}`);
 *       return false;                    // ← y el kon seguía arrancando
 *     }
 *
 * En el arranque real eso eran veinticinco «permission denied for schema
 * public» seguidos, entre cientos de líneas de log, y el kon se daba por
 * iniciado. Si alguna de esas tablas NO estuviera también en una migración —y
 * nada lo garantizaba— el kon arrancaría sin ella y fallaría al primer uso.
 *
 * Academy y Booking hacían esto. Sus migraciones ya creaban las mismas 25 y 6
 * tablas respectivamente, así que el bloque entero era peso muerto con
 * capacidad de confundir.
 *
 * ── QUÉ SE PERMITE ─────────────────────────────────────────────────────────
 *
 * Los ficheros `.sql` de `migrations/`, obviamente. Y las tablas TEMPORALES,
 * que viven en la sesión y no tocan el esquema.
 */

import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { listarFicheros } from "./helpers/ficheros";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");

/**
 * Neutraliza comentarios de bloque y de línea: un CREATE TABLE citado en una
 * nota no cuenta.
 *
 * Se sustituyen por espacios en vez de borrarse, y los saltos de línea se
 * conservan. Si se borraran, el número de línea que informa esta prueba sería
 * el del texto recortado y no el del fichero: la primera versión hacía eso y
 * señalaba la línea 369 de un fichero cuyo CREATE TABLE está en la 475 — un
 * diagnóstico que manda a leer el sitio equivocado.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (l.trimStart().startsWith("//") ? "" : l))
    .join("\n");
}

describe("los kons no crean tablas en ejecución", () => {
  const hallazgos: string[] = [];

  const fuentes = [
    ...listarFicheros(join(RAIZ, "packages", "kons"), ".ts"),
    ...listarFicheros(join(RAIZ, "packages", "core"), ".ts"),
  ].filter((f) => !f.includes(".test.") && !f.endsWith(".d.ts"));

  for (const fichero of fuentes) {
    const codigo = sinComentarios(readFileSync(fichero, "utf-8"));

    for (const m of codigo.matchAll(/CREATE\s+(?:(TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE/gi)) {
      // Las temporales viven en la sesión: no necesitan CREATE sobre el esquema
      // y desaparecen solas. No son el problema.
      if (m[1]) continue;

      const linea = codigo.slice(0, m.index).split("\n").length;
      hallazgos.push(
        `${fichero
          .slice(RAIZ.length + 1)
          .split(sep)
          .join("/")}:${linea}`
      );
    }
  }

  it.skipIf(!HAY_KONS_INSTALADOS)("se han leído fuentes de kons", () => {
    expect(fuentes.length).toBeGreaterThan(50);
  });

  it("ninguna fuente TypeScript ejecuta CREATE TABLE", () => {
    expect(
      hallazgos,
      `Estos ficheros crean tablas desde la aplicación:\n\n${hallazgos.join("\n")}\n\n` +
        `No puede funcionar: la API se conecta con un rol sin privilegio CREATE, ` +
        `que es lo que hace efectivo el aislamiento por RLS. Y el fallo es ` +
        `silencioso — se registra un error y el kon arranca igual.\n\n` +
        `Mueve el SQL a packages/kons/<kon>/migrations/NNNN_*.sql. Ahí se aplica ` +
        `con el rol de administración, queda registrado en kitsuden_migrations ` +
        `y falla ruidosamente si algo va mal.`
    ).toEqual([]);
  });
});
