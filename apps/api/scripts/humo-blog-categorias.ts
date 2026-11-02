/**
 * Comprobacion en proceso de lo que se acaba de anadir al blog
 * ============================================================================
 *
 * Tres cosas, y ninguna se puede dar por buena leyendo el codigo:
 *
 *   1. `GET /api/blog/categories` responde el manejador de CATEGORIAS y no el
 *      de `/:id`. En Hono eso depende del orden de registro y el fallo no da
 *      error: responde el manejador equivocado. Es el mismo mecanismo que dejo
 *      `/games/new` en 404.
 *   2. Un post puede guardarse con categorias y recuperarlas al releerlo. Zod
 *      DESCARTA en silencio las claves que no conoce, asi que un nombre mal
 *      puesto no da 400: guarda el post sin las categorias y no avisa. Ya paso
 *      con `tags` vs `tagIds`.
 *   3. La deteccion de edicion simultanea devuelve 409 y NO escribe. Sin
 *      probarlo de verdad, «el segundo guardado pisa al primero» y «el segundo
 *      guardado se rechaza» se leen igual en el codigo.
 *
 * Se ejecuta contra la base real y limpia todo lo que crea.
 */

import { app } from "../src/index";

let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = "") {
  console.log(`  ${condicion ? "ok  " : "FALLA"} ${descripcion}${detalle ? ` — ${detalle}` : ""}`);
  if (!condicion) fallos++;
}

/**
 * Las rutas de escritura exigen sesion. En vez de fabricar un usuario —que ya
 * rompio la pantalla de configuracion una vez— se comprueba lo que se puede sin
 * sesion y se dice claramente que queda fuera.
 */
async function main() {
  console.log("\nCategorias del blog\n");

  // ── 1. La ruta no esta ensombrecida ──────────────────────────────────────
  const res = await app.request("/api/blog/categories");
  const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  comprobar("GET /api/blog/categories responde 200", res.status === 200, `status ${res.status}`);

  /**
   * La prueba de fuego del sombreado: si `/:id` hubiera capturado la peticion,
   * «categories» no es un UUID y ese manejador devuelve `{ error: "Post not
   * found" }` con 404. Un 200 con `docs` solo lo puede producir el manejador
   * correcto.
   */
  comprobar(
    "la responde el manejador de categorias, no el de /:id",
    Array.isArray(cuerpo.docs),
    Array.isArray(cuerpo.docs)
      ? `${(cuerpo.docs as unknown[]).length} categorias`
      : JSON.stringify(cuerpo)
  );

  // ── 2. Las de escritura existen y piden sesion, no 404 ───────────────────
  const sinSesion = await app.request("/api/blog/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "X", slug: "x" }),
  });

  comprobar(
    "POST /api/blog/categories existe y exige sesion (401/403, no 404)",
    sinSesion.status === 401 || sinSesion.status === 403,
    `status ${sinSesion.status}`
  );

  const patchSinSesion = await app.request("/api/blog/categories/no-es-uuid", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "X" }),
  });

  comprobar(
    "PATCH /api/blog/categories/:id existe y exige sesion",
    patchSinSesion.status === 401 || patchSinSesion.status === 403,
    `status ${patchSinSesion.status}`
  );

  console.log(
    `\n${fallos === 0 ? "Sin fallos." : `${fallos} fallo(s).`}\n` +
      `Nota: el guardado de un post CON categorias y el 409 de edicion\n` +
      `simultanea necesitan sesion; se comprueban en la prueba de contrato\n` +
      `(tests/unit/categorias-de-blog.test.ts) y contra la base en la\n` +
      `verificacion manual, no aqui.\n`
  );

  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
