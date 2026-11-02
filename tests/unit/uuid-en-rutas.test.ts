/**
 * Un id mal formado no puede devolver 500
 * ============================================================================
 *
 * Cuando una ruta `/:id` pasa el parámetro directamente a una consulta contra
 * una columna `uuid`, un valor que no lo sea hace que Postgres responda
 *
 *     invalid input syntax for type uuid
 *
 * y el manejador de errores lo convierte en **500**. Es decir: una URL mal
 * escrita se reporta como fallo del servidor.
 *
 * ── CÓMO APARECIÓ ──────────────────────────────────────────────────────────
 *
 * Barriendo la API en busca de 500. `GET /api/media/upload` daba error de
 * servidor, y el log lo explicaba: `"route":"/api/media/:id"`. La URL encajaba
 * con la ruta de detalle y `id` valía `"upload"` — no hay ningún endpoint de
 * subida por GET, así que cualquiera que lo probara generaba un 500.
 *
 * Eso significa que un enlace roto, un rastreador o alguien tanteando la API
 * llenan el log de errores 500 sobre una base perfectamente sana. Y cuando los
 * 500 son ruido de fondo, dejan de mirarse: el día que uno sea real, pasará
 * desapercibido entre los falsos.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Si un handler usa `c.req.param("id")` en una comparación contra una columna
 * uuid, tiene que comprobar antes la forma con `esUuid` y responder 404. Se
 * elige 404 y no 400 porque es lo que de verdad ocurre —ese id no puede
 * existir— y además no revela qué tipo de clave usa la tabla.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { esUuid } from "../../packages/engine/src/validation";

const RAIZ = join(__dirname, "..", "..");

/**
 * Rutas que ya mordieron. Se comprueban por fichero, no barriendo el repo
 * entero, porque no todas las columnas `id` son uuid: `auth_users.id` es text,
 * y exigir uuid ahí sería falso.
 */
const VIGILADOS = [
  { fichero: "packages/core/media/media.routes.ts", tabla: "media" },
  { fichero: "packages/kons/kon-blog/src/routes.ts", tabla: "blog_posts" },
];

describe("esUuid", () => {
  it("acepta un uuid v4 real", () => {
    expect(esUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
  });

  it("rechaza lo que llega por una URL mal escrita", () => {
    // `upload` es el caso literal que produjo el 500.
    for (const malo of ["upload", "", "123", "no-es-un-uuid", "../etc/passwd"]) {
      expect(esUuid(malo), `deberia rechazar ${JSON.stringify(malo)}`).toBe(false);
    }
  });

  it("rechaza null y undefined sin lanzar", () => {
    // Un parámetro ausente llega como undefined; explotar aquí convertiría el
    // 404 que buscamos en el mismo 500 que intentamos evitar.
    expect(esUuid(undefined)).toBe(false);
    expect(esUuid(null)).toBe(false);
  });

  it("rechaza un uuid con basura pegada", () => {
    // Sin anclas en la expresión regular, esto pasaría — y volveria el 500.
    expect(esUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301x")).toBe(false);
    expect(esUuid(" 3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(false);
  });
});

describe("los handlers de :id comprueban la forma antes de consultar", () => {
  for (const { fichero, tabla } of VIGILADOS) {
    it(fichero, () => {
      const fuente = readFileSync(join(RAIZ, fichero), "utf-8");

      // Si el fichero consulta por id, tiene que usar el validador.
      const consultaPorId = fuente.includes(".id,") || fuente.includes("eq(");
      if (!consultaPorId) return;

      expect(
        fuente.includes("esUuid("),
        `${fichero} atiende rutas /:id contra '${tabla}' y no comprueba la forma ` +
          `del id con esUuid. Un id que no sea uuid hace que Postgres lance ` +
          `"invalid input syntax for type uuid", y eso sale como 500 en vez del ` +
          `404 que corresponde.`
      ).toBe(true);
    });
  }
});
