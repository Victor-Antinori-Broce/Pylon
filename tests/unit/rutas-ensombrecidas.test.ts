/**
 * Ninguna ruta literal puede registrarse detrás de un comodín que la cubra
 * ============================================================================
 *
 * Hono resuelve por ORDEN DE REGISTRO entre patrones de la misma longitud. Una
 * ruta declarada así:
 *
 *     app.get("/:id", ...)          // línea 145
 *     app.get("/collections", ...)  // línea 283  ← nunca se ejecuta
 *
 * deja la segunda inalcanzable. Y el fallo no se parece a un problema de
 * enrutado, que es lo que la hace cara:
 *
 *   · `GET /api/games/collections` entraba por `/:id` con `id="collections"`,
 *     consultaba `WHERE games.id = 'collections'` y Postgres devolvía
 *     `invalid input syntax for type uuid`. Un **500**, no un 404.
 *   · `GET /api/explorer/schema/json/cursos` entraba por `/schema/:kon/:table`
 *     con `kon="json"`. Devolvía 404 «tabla json no encontrada» — el panel lo
 *     leía como «esta tabla no tiene esquema» y enseñaba un formulario vacío.
 *
 * En los dos casos el aviso «las rutas paramétricas van al final» ya estaba
 * escrito en el propio fichero. Un comentario no lo impide; esta prueba sí.
 *
 * ── QUÉ CUENTA COMO SOMBRA ─────────────────────────────────────────────────
 *
 * Una ruta A ensombrece a B si, con el mismo método y el mismo número de
 * segmentos, A se registró antes y cada segmento de A es o bien idéntico al de
 * B o bien un parámetro (`:x`). Es decir: A acepta todo lo que acepta B.
 *
 * Dos parámetros con nombres distintos en la misma posición NO son sombra
 * entre sí: `/:kon/:table` y `/:a/:b` aceptan lo mismo, así que la segunda no
 * pierde nada que la primera no le quitara ya.
 */

import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { listarFicheros } from "./helpers/ficheros";

const RAIZ = join(__dirname, "..", "..");

interface Ruta {
  metodo: string;
  patron: string;
  segmentos: string[];
  linea: number;
  router: string;
}

/**
 * Extrae los registros `router.get("/x", …)` de un fichero.
 *
 * Se agrupa por variable de router porque un fichero puede montar varios, y
 * dos routers distintos no compiten entre sí.
 */
function rutasDe(fuente: string): Ruta[] {
  const rutas: Ruta[] = [];
  const re = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all)\(\s*(["'`])([^"'`]*)\3/g;

  for (const m of fuente.matchAll(re)) {
    const [, router, metodo, , patron] = m;
    // `use("/*")` y los comodines globales no son rutas concretas.
    if (patron.includes("*")) continue;
    if (!patron.startsWith("/")) continue;

    rutas.push({
      router,
      metodo,
      patron,
      segmentos: patron.split("/").filter(Boolean),
      linea: fuente.slice(0, m.index).split("\n").length,
    });
  }
  return rutas;
}

/** ¿`a` acepta todo lo que acepta `b`, siendo a distinta de b? */
function ensombrece(a: Ruta, b: Ruta): boolean {
  if (a.metodo !== b.metodo && a.metodo !== "all") return false;
  if (a.segmentos.length !== b.segmentos.length) return false;
  if (a.patron === b.patron) return false;

  let masLaxa = false;
  for (let i = 0; i < a.segmentos.length; i++) {
    const sa = a.segmentos[i]!;
    const sb = b.segmentos[i]!;
    if (sa === sb) continue;
    if (sa.startsWith(":") && !sb.startsWith(":")) {
      masLaxa = true; // comodín donde la otra exige un literal
      continue;
    }
    return false;
  }
  return masLaxa;
}

function ficherosDeRutas(): string[] {
  return [
    ...listarFicheros(join(RAIZ, "apps", "api", "src"), ".ts"),
    ...listarFicheros(join(RAIZ, "packages", "kons"), ".ts"),
    ...listarFicheros(join(RAIZ, "packages", "core"), ".ts"),
  ].filter((f) => !f.includes("node_modules") && !f.endsWith(".d.ts") && !f.includes(".test."));
}

describe("orden de registro de rutas", () => {
  const hallazgos: string[] = [];

  for (const fichero of ficherosDeRutas()) {
    const fuente = readFileSync(fichero, "utf-8");
    if (!/\.(get|post|put|patch|delete)\(\s*["'`]\//.test(fuente)) continue;

    const rutas = rutasDe(fuente);
    const relativo = fichero
      .slice(RAIZ.length + 1)
      .split(sep)
      .join("/");

    for (let i = 0; i < rutas.length; i++) {
      for (let j = 0; j < i; j++) {
        const antes = rutas[j]!;
        const despues = rutas[i]!;
        if (antes.router !== despues.router) continue;
        if (ensombrece(antes, despues)) {
          hallazgos.push(
            `${relativo}:${despues.linea}  ${despues.metodo.toUpperCase()} ${despues.patron} ` +
              `— inalcanzable: ${antes.patron} se registró en la línea ${antes.linea}`
          );
        }
      }
    }
  }

  it("ninguna ruta queda inalcanzable", () => {
    expect(
      hallazgos,
      `Estas rutas nunca se ejecutan porque un patrón anterior las cubre:\n\n` +
        `${hallazgos.join("\n")}\n\n` +
        `Muévelas ANTES del patrón que las ensombrece. Registrar primero lo ` +
        `literal y después lo paramétrico es la única forma de que ambas ` +
        `funcionen: Hono no reintenta con la siguiente ruta cuando el handler ` +
        `de la primera falla.`
    ).toEqual([]);
  });
});
