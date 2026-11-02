/**
 * El explorador genérico no llega a las tablas de plataforma
 * ============================================================================
 *
 * `/api/explorer/*` estaba protegido solo con `requireAuth` —que comprueba que
 * hay sesión y nada más; los roles son `admin`, `editor` y `user`— y su
 * `resolveTable()` caía a introspección dinámica, así que resolvía CUALQUIER
 * tabla. Medido sobre la instalación real antes de cerrarlo:
 *
 *     kitsuden_secrets      resuelve (13 columnas)
 *     auth_accounts         resuelve (13 columnas)   ← credenciales
 *     api_keys              resuelve (8 columnas)
 *     kitsuden_migrations   resuelve (5 columnas)
 *
 * Con `PATCH`, `POST` y `DELETE` en el mismo router. Un `editor` podía leer y
 * escribir los secretos, las credenciales y el historial de migraciones —y
 * editar `kitsuden_migrations` desde el navegador desincroniza historial y
 * esquema en silencio, que es el fallo que costó un día entero de diagnóstico.
 *
 * ── QUÉ VIGILA ESTA PRUEBA ─────────────────────────────────────────────────
 *
 * Tres cosas, y ninguna es el síntoma:
 *
 *   1. Que la lista negra siga cubriendo lo que no puede salir nunca.
 *   2. Que la política se aplique donde se RESUELVE la tabla, que es el punto
 *      por el que pasan todas las rutas. Comprobar handler por handler dejaría
 *      fuera el que se añada mañana.
 *   3. Que ninguna ruta vuelva a enumerar tablas sin filtrarlas: un 404 que
 *      lista lo que hay es un índice de la base.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const POLITICA = join(RAIZ, "apps", "api", "src", "lib", "tablas-explorables.ts");
const EXPLORADOR = join(RAIZ, "apps", "api", "src", "routes", "data-explorer.ts");

/** Lo que jamás puede alcanzarse por el explorador genérico. */
const DEBEN_ESTAR_PROHIBIDAS = [
  "kitsuden_secrets",
  "auth_accounts",
  "auth_sessions",
  "auth_verifications",
  "api_keys",
  "agent_api_keys",
  "kitsuden_migrations",
  "rate_limit_logs",
];

describe("tablas alcanzables por el explorador", () => {
  const politica = readFileSync(POLITICA, "utf-8");
  const explorador = sinComentarios(readFileSync(EXPLORADOR, "utf-8"));

  it("la lista negra cubre credenciales, secretos e historial", () => {
    const ausentes = DEBEN_ESTAR_PROHIBIDAS.filter((t) => !politica.includes(`"${t}"`));

    expect(
      ausentes,
      `Estas tablas han salido de TABLAS_PROHIBIDAS:\n\n${ausentes.join("\n")}\n\n` +
        `Ninguna tiene sentido detrás de una rejilla genérica: o son secretos, ` +
        `o son el registro interno de algo que se administra por su propia ` +
        `pantalla. Editar kitsuden_migrations desde el navegador desincroniza ` +
        `historial y esquema sin que nada avise.`
    ).toEqual([]);
  });

  it("resolveTable consulta la política antes de introspectar", () => {
    /**
     * El orden importa: la comprobación tiene que ir ANTES de
     * `introspectTable`. Después seguiría filtrando el resultado, pero el
     * trabajo ya estaría hecho y el siguiente que reordene el bloque abriría el
     * agujero sin darse cuenta.
     */
    const cuerpo = explorador.slice(
      explorador.indexOf("async function resolveTable"),
      explorador.indexOf("function humanizeTableNameLocal")
    );

    expect(cuerpo.length, "no se encontró resolveTable").toBeGreaterThan(0);

    const iPolitica = cuerpo.indexOf("tablaEsExplorable");
    const iIntrospect = cuerpo.indexOf("introspectTable");

    expect(iPolitica, "resolveTable ya no consulta tablaEsExplorable").toBeGreaterThan(-1);
    expect(
      iIntrospect === -1 || iPolitica < iIntrospect,
      "la comprobación de política tiene que ir ANTES de introspectar la tabla"
    ).toBe(true);
  });

  it("las escrituras sensibles exigen rol admin", () => {
    // Las tres rutas de mutación tienen que pasar por el guardián. Se cuenta
    // porque son exactamente tres: PATCH, POST y DELETE.
    const usos = [...explorador.matchAll(/denegarEscrituraSensible\(/g)].length;

    expect(
      usos,
      "cada ruta de escritura del explorador (PATCH, POST, DELETE) tiene que " +
        "llamar a `denegarEscrituraSensible`: modificar auth_users cambia roles " +
        "y modificar modules instala kons."
    ).toBeGreaterThanOrEqual(4); // 3 llamadas + la definición
  });

  it("ninguna respuesta enumera tablas sin filtrar", () => {
    /**
     * `getAllTables()` devuelve la base entera. Aparecía crudo en la lista de
     * `available` de un 404 y en `/tables`, así que un mensaje de «no
     * encontrada» era un índice de todo lo que hay, secretos incluidos.
     */
    for (const m of explorador.matchAll(/getAllTables\(\)/g)) {
      // Se mira hacia DELANTE hasta el final del handler: el filtrado ocurre
      // despues de traer la lista, a veces decenas de lineas mas abajo (en
      // `/discover/:konId` se cruzan tres fuentes antes de filtrar).
      const desde = m.index!;
      const finHandler = explorador.indexOf("\nexplorerRoutes.", desde);
      const contexto = explorador.slice(desde, finHandler === -1 ? undefined : finHandler);

      const linea = explorador.slice(0, desde).split("\n").length;
      expect(
        contexto.includes("tablaEsExplorable"),
        `El uso de getAllTables() en data-explorer.ts:${linea} no se filtra por ` +
          `la politica antes de responder. Enumerar la base entera convierte ` +
          `cualquier respuesta en un indice de las tablas que existen, secretos ` +
          `incluidos.`
      ).toBe(true);
    }
  });
});
