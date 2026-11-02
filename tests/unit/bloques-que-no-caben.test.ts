/**
 * El editor no puede ofrecer bloques que la página no sabe guardar
 * ============================================================================
 *
 * ── EL FALLO, MEDIDO ───────────────────────────────────────────────────────
 *
 * Había TRES vocabularios de bloques y no coincidían:
 *
 *   1. El enum `block_content_type` — lo que `block_contents` podía guardar:
 *        hero, text, image, video, grid, cards, quote, cta, embed, divider,
 *        spacer, custom
 *   2. `BLOCK_REGISTRY` del panel — lo que el editor OFRECE:
 *        hero, richtext, image-gallery, game-map, tier-list,
 *        character-builder, comments, streamer-widget, embed, callout,
 *        divider, dynamic-carousel, smart-filter, comparison-slider,
 *        smart-grid
 *   3. `render-blocks.ts` — lo que se sabe PINTAR: el mismo conjunto que 2.
 *
 * La intersección de 1 y 2 eran TRES tipos. De los quince que el constructor
 * ofrece, **doce no se podían guardar en una página**: el INSERT falla con un
 * valor de enum inválido.
 *
 * ── POR QUE NADIE LO HABIA VISTO ───────────────────────────────────────────
 *
 * Porque los bloques de un ARTICULO no pasan por el enum: `blog_posts.blocks`
 * es jsonb sin restricción, así que ahí los quince funcionan y todo parece
 * bien. Solo las páginas del constructor tienen la restricción — y no había
 * ninguna creada. El fallo esperaba a la primera página.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Todo lo que el editor ofrece tiene que poder guardarse Y pintarse. Al revés
 * no: la lista puede llevar valores viejos que ya nadie ofrece, y puede haber
 * páginas guardadas con ellos.
 *
 * ── DÓNDE VIVE HOY LA RESTRICCIÓN ──────────────────────────────────────────
 *
 * Ya no en la base. La migración 0009 convirtió la columna en texto: el enum
 * costaba una migración de PRODUCCIÓN por cada bloque nuevo (siete seguidas,
 * de 0002 a 0008) y solo vigilaba las páginas, porque los artículos van en un
 * jsonb sin restricción.
 *
 * La autoridad es ahora `TIPOS_DE_BLOQUE` en `blocks.schema.ts`, y la ruta que
 * publica valida contra ella. Es decir: ESTA prueba es lo que queda del
 * guardián que antes ponía Postgres. Si se relaja, el fallo vuelve callado.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const REGISTRO = readFileSync(
  join(RAIZ, "packages", "admin", "src", "types", "blocks.ts"),
  "utf-8"
);
const ESQUEMA = readFileSync(join(RAIZ, "packages", "core", "blocks", "blocks.schema.ts"), "utf-8");
const RENDER = readFileSync(join(RAIZ, "packages", "shared", "src", "render-blocks.ts"), "utf-8");
const RUTAS = readFileSync(join(RAIZ, "packages", "core", "blocks", "blocks.routes.ts"), "utf-8");

/** Los tipos que el editor ofrece: los `type:` de primer nivel del registro. */
function ofrecidos(): string[] {
  const cuerpo = REGISTRO.slice(REGISTRO.indexOf("export const BLOCK_REGISTRY"));
  return [...cuerpo.matchAll(/^\s{4}type:\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]);
}

/** Los tipos que la lista del esquema admite. */
function almacenables(): string[] {
  const i = ESQUEMA.indexOf("export const TIPOS_DE_BLOQUE = [");
  expect(i, "no se encontró la lista de tipos de bloque").toBeGreaterThan(-1);
  /**
   * Se corta desde el `[`, no desde el `export const`. Cortando antes, el
   * nombre de la constante entra en la lista y hay que quitarlo con un
   * `slice(1)` — que es lo que se hizo primero, con el enum, y se llevó por
   * delante el PRIMER valor real, `hero`. Un ajuste a ojo para compensar un
   * corte mal puesto: así se construye un guardián que denuncia lo correcto.
   */
  const bloque = ESQUEMA.slice(ESQUEMA.indexOf("[", i), ESQUEMA.indexOf("] as const;", i));
  return [...bloque.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

/** Los que el renderizador sabe pintar: `case` estáticos + mapa de interactivos. */
function pintables(): string[] {
  const casos = [...RENDER.matchAll(/case "([a-z0-9-]+)":/g)].map((m) => m[1]);

  const i = RENDER.indexOf("const INTERACTIVOS");
  const mapa = RENDER.slice(i, RENDER.indexOf("\n};", i));
  const interactivos = [...mapa.matchAll(/^\s{2}"?([a-z0-9-]+)"?:\s*\{/gm)].map((m) => m[1]);

  return [...new Set([...casos, ...interactivos])];
}

describe("los tres vocabularios de bloques", () => {
  const ofrece = ofrecidos();
  const guarda = almacenables();
  const pinta = pintables();

  it("se han leído los tres, y no están vacíos", () => {
    /**
     * Sin esto, cambiar la forma de cualquiera de los tres ficheros dejaría la
     * prueba comparando listas vacías y pasando en verde.
     */
    expect(ofrece.length, `registro: ${ofrece.join(", ")}`).toBeGreaterThan(10);
    expect(guarda.length, `lista: ${guarda.join(", ")}`).toBeGreaterThan(10);
    expect(pinta.length, `renderizador: ${pinta.join(", ")}`).toBeGreaterThan(10);
  });

  it("todo lo que el editor ofrece se puede GUARDAR", () => {
    const noCaben = ofrece.filter((t) => !guarda.includes(t));

    expect(
      noCaben,
      `El editor ofrece ${noCaben.map((t) => `«${t}»`).join(", ")} y ` +
        `\`TIPOS_DE_BLOQUE\` no los admite: al publicar la página, la ruta ` +
        `responde 422 «Tipo de bloque desconocido». Añádelos a la lista de ` +
        `\`blocks.schema.ts\` — ya no hace falta ninguna migración.`
    ).toEqual([]);
  });

  it("todo lo que el editor ofrece se puede PINTAR", () => {
    const invisibles = ofrece.filter((t) => !pinta.includes(t));

    expect(
      invisibles,
      `El editor ofrece ${invisibles.map((t) => `«${t}»`).join(", ")} y ` +
        `\`render-blocks.ts\` no sabe pintarlos: se guardan y la página sale sin ` +
        `ellos, sin ningún error.`
    ).toEqual([]);
  });
});

describe("publicar como página", () => {
  it("la ruta es genérica y vive donde viven las páginas", () => {
    /**
     * La alternativa era que `kon-tierlist` escribiera en `block_pages`, lo que
     * lo ataría a `kon-blocks` y habría que repetirlo por cada kon que quiera
     * publicar algo. Aquí el dueño de las páginas ofrece el servicio.
     */
    // Desde el SDK de kons la ruta es una operación declarada (`defineOperacion`).
    expect(RUTAS).toContain('ruta: "/pages/from-block"');

    const ruta = RUTAS.slice(
      RUTAS.indexOf('id: "publicar-bloque-como-pagina"'),
      RUTAS.indexOf('id: "editar-pagina"')
    );

    expect(ruta.length, "no se encontró la ruta").toBeGreaterThan(0);
    expect(ruta, "publicar es escribir: exige sesión").toContain('acceso: "sesion"');
    expect(ruta, "y el permiso de crear páginas").toContain('accion: "create"');
  });

  it("el tipo se valida contra la lista del esquema, no contra una paralela", () => {
    const ruta = RUTAS.slice(
      RUTAS.indexOf('id: "publicar-bloque-como-pagina"'),
      RUTAS.indexOf('id: "editar-pagina"')
    );

    /**
     * Una lista escrita a mano en la ruta es exactamente como se llegó a tener
     * tres vocabularios que no coincidían.
     */
    expect(ruta).toContain("TIPOS_DE_BLOQUE");
  });

  it("el tipo de bloque NO vuelve a ser un enum de Postgres", () => {
    /**
     * Un enum aquí significa una migración contra producción por cada bloque
     * nuevo. Ya costó siete seguidas (0002-0008) y dejó a `deck` sin poder
     * guardarse en una página. Si alguien lo repone, que falle aquí y no en
     * el despliegue.
     */
    expect(
      ESQUEMA.includes('pgEnum("block_content_type"'),
      "el tipo de bloque volvería a exigir una migración de producción por cada " +
        "bloque nuevo; la lista TIPOS_DE_BLOQUE existe justo para evitarlo."
    ).toBe(false);
  });

  it("republicar actualiza la misma página, no crea otra", () => {
    const ruta = RUTAS.slice(
      RUTAS.indexOf('id: "publicar-bloque-como-pagina"'),
      RUTAS.indexOf('id: "editar-pagina"')
    );

    /**
     * Republicar cada parche es la operación normal de una tier list, no la
     * excepción. Sin esto, la segunda vez falla con «ese slug ya existe» o deja
     * páginas sueltas.
     */
    expect(ruta).toContain("existente");
    expect(
      ruta.includes("delete(blocks)"),
      "al actualizar hay que limpiar los bloques anteriores: si no, la página " +
        "acumula una copia por republicación."
    ).toBe(true);
  });

  it("el kon de tier lists no importa el de páginas", () => {
    /**
     * El punto entero de que la ruta sea genérica: se le PIDE, no se le importa.
     */
    const kon = readFileSync(join(RAIZ, "packages", "kons", "kon-tierlist", "index.ts"), "utf-8");

    expect(
      /from ["'].*kon-blocks/.test(kon) || /from ["'].*core\/blocks/.test(kon),
      "kon-tierlist no puede depender de kon-blocks: publicar es una petición " +
        "HTTP a una ruta genérica, no una importación."
    ).toBe(false);
  });
});

describe("el hueco de un bloque interactivo no publica jerga interna", () => {
  /**
   * ── EL FALLO ───────────────────────────────────────────────────────────────
   *
   * El contenido de reserva —lo que ve el lector si el sitio no hidrata— era la
   * nota del programador, con el identificador del bloque en negrita:
   *
   *     tier-list — Referencia una plantilla de kon-tierlist; sus filas viven
   *     en esa tabla.
   *
   * Eso salía en medio de un artículo publicado. La nota es útil, pero para
   * quien implementa el frontend, no para quien lee el artículo.
   */
  it("cada bloque interactivo declara etiqueta y motivo por separado", () => {
    const i = RENDER.indexOf("const INTERACTIVOS");
    const mapa = RENDER.slice(i, RENDER.indexOf("\n};", i));

    const entradas = [...mapa.matchAll(/^\s{2}"?([a-z0-9-]+)"?:\s*\{/gm)].map((m) => m[1]);
    expect(entradas.length, "no se leyó ningún bloque interactivo").toBeGreaterThan(5);

    expect(
      (mapa.match(/etiqueta:/g) ?? []).length,
      "cada bloque interactivo necesita una etiqueta humana"
    ).toBe(entradas.length);
  });

  it("lo que se pinta es la etiqueta, no el motivo", () => {
    const i = RENDER.indexOf("const reserva =");
    const trozo = RENDER.slice(i, i + 400);

    expect(trozo.length, "no se encontró el contenido de reserva").toBeGreaterThan(0);
    expect(trozo).toContain(".etiqueta");

    expect(
      /\$\{escaparHtml\(tipo\)\}<\/strong>/.test(trozo),
      "el identificador del bloque no es texto para un lector."
    ).toBe(false);
  });
});
