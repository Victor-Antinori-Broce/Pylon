/**
 * Botones que no hacen nada, y etiquetas que dicen palabras inventadas
 * ============================================================================
 *
 * Cuatro fallos reportados a la vez en la pantalla de juegos. Ninguno daba un
 * error: tres no hacían nada y el cuarto escribía una palabra rota. Es la peor
 * familia de fallos de este panel, porque no dejan rastro en ningún log.
 *
 *   1. «Agregar All Gam»   — una singularización por expresión regular.
 *   2. «New Game»          — enlazaba a la pantalla del kon y ahí se acababa.
 *   3. Crear colección     — mandaba `name`; la columna se llama `title`.
 *   4. «Exportar»          — `return` mudo cuando la tabla está vacía.
 *
 * Los cuatro se ven igual desde fuera —«no funciona»— y tienen cuatro causas
 * distintas en cuatro capas distintas.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const EXPLORADOR = join(
  RAIZ,
  "packages",
  "admin",
  "src",
  "lib",
  "components",
  "admin",
  "DataExplorer.svelte"
);
const GAMES_VIEW = join(RAIZ, "packages", "admin", "src", "views", "games", "GamesView.svelte");
const GAMES_SCHEMA = join(RAIZ, "packages", "kons", "kon-games", "games.schema.ts");

describe("la etiqueta del botón de alta", () => {
  const explorador = readFileSync(EXPLORADOR, "utf-8");

  it("no se inventa el singular quitando letras", () => {
    /**
     * La regla era `titulo.replace(/e?s$/i, "")`. Con «Cursos» → «Curso»
     * acertaba, y por eso sobrevivió. Con la primera vista en inglés:
     *
     *     "All Games".replace(/e?s$/i, "")  →  "All Gam"
     *
     * Una regla que acierta a veces es peor que una que falla siempre: nadie
     * la revisa hasta que sale una palabra rota en pantalla.
     */
    const etiqueta = explorador.slice(
      explorador.indexOf("const etiquetaDeAlta"),
      explorador.indexOf("const columns")
    );

    expect(etiqueta.length, "no se encontró `etiquetaDeAlta`").toBeGreaterThan(0);

    expect(
      /\.replace\(\/[^/]*s\$/.test(etiqueta),
      "el nombre del botón no puede salir de recortarle letras al título de la " +
        "vista. Si el kon no declara un nombre, el botón dice «Agregar» a secas: " +
        "no es tan bonito, pero nunca es una palabra que no existe."
    ).toBe(false);
  });

  it("el nombre sale de lo que el kon declara", () => {
    const etiqueta = explorador.slice(
      explorador.indexOf("const etiquetaDeAlta"),
      explorador.indexOf("const columns")
    );

    expect(etiqueta).toContain("singularName");
  });
});

describe("«Exportar» dice algo cuando no hay nada", () => {
  const explorador = readFileSync(EXPLORADOR, "utf-8");

  it("no vuelve en silencio con la tabla vacía", () => {
    /**
     * Era `if (data.length === 0) return;`. Se pulsaba, no pasaba nada, no
     * salía ningún mensaje y no se descargaba ningún fichero — indistinguible
     * de un botón roto, y es el caso más frecuente en una instalación nueva.
     */
    const cuerpo = explorador.slice(
      explorador.indexOf("function handleExportCsv"),
      explorador.indexOf("async function openCreateModal")
    );

    expect(cuerpo.length, "no se encontró `handleExportCsv`").toBeGreaterThan(0);

    expect(
      /if \(data\.length === 0\) return;/.test(cuerpo),
      "un `return` a secas deja al usuario sin saber si el botón falló o si no " +
        "había nada. Hay que decírselo."
    ).toBe(false);

    expect(cuerpo).toContain("toast");
  });
});

describe("«New Game» abre el formulario", () => {
  const games = readFileSync(GAMES_VIEW, "utf-8");
  const explorador = readFileSync(EXPLORADOR, "utf-8");

  it("el enlace pide explícitamente el alta", () => {
    /**
     * Llevaba a `/g/kon-games` a secas: navegabas a la pantalla del kon y ahí
     * se acababa. Ningún formulario, ningún aviso.
     */
    expect(
      games.includes("/g/kon-games?crear=1"),
      "«New Game» tiene que abrir el alta, no dejar al usuario en una lista " +
        "esperando que adivine el siguiente clic."
    ).toBe(true);
  });

  it("el explorador atiende ese parámetro y lo limpia", () => {
    expect(explorador).toContain('searchParams.get("crear")');

    /**
     * Y se quita de la URL: si no, recargar o volver atrás reabre el
     * formulario una y otra vez.
     */
    expect(
      explorador.includes('searchParams.delete("crear")'),
      "el parámetro tiene que limpiarse tras abrir el alta."
    ).toBe(true);
  });
});

describe("las colecciones usan el campo que existe", () => {
  const games = readFileSync(GAMES_VIEW, "utf-8");
  const esquema = readFileSync(GAMES_SCHEMA, "utf-8");

  it("la tabla declara `title`, no `name`", () => {
    const tabla = esquema.slice(
      esquema.indexOf("export const gameCollections = pgTable("),
      esquema.indexOf("export const gameCollectionEntries")
    );

    expect(tabla.length, "no se encontró la tabla `game_collections`").toBeGreaterThan(0);
    expect(tabla).toContain('title: varchar("title"');
    expect(
      /\bname: varchar\("name"/.test(tabla),
      "si la columna pasara a llamarse `name`, esta prueba tiene que revisarse " +
        "junto con el panel: son las dos mitades del mismo contrato."
    ).toBe(false);
  });

  it("el panel manda y lee `title`", () => {
    /**
     * Mandaba `name`, así que al crear llegaba `title: undefined` contra una
     * columna `NOT NULL` y la petición reventaba con «Create failed». Y al
     * leer pasaba lo contrario: la API devuelve `title` y el panel pintaba
     * `c.name`, así que las colecciones salían sin nombre.
     *
     * Es el mismo fallo que `tags` frente a `tagIds` en el blog: el nombre del
     * campo ES el contrato, y equivocarlo no da un error de tipos.
     */
    const colecciones = games.slice(
      games.indexOf("async function createCollection"),
      games.indexOf("async function deleteCollection") > 0
        ? games.indexOf("async function deleteCollection")
        : games.length
    );

    expect(colecciones.length, "no se encontró `createCollection`").toBeGreaterThan(0);
    expect(colecciones).toContain("title:");

    expect(
      /^\s*name: (new|edit)CollectionName/m.test(games),
      "el campo que se envía tiene que ser `title`: es como se llama la columna " +
        "y es lo que lee el endpoint."
    ).toBe(false);

    expect(
      /\{c\.name\}/.test(games),
      "al pintar la colección hay que leer `c.title`: `c.name` no existe en la " +
        "respuesta y sale en blanco."
    ).toBe(false);
  });
});
