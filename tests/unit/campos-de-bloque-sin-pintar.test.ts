/**
 * Todo tipo de campo que un bloque declara lo sabe pintar el editor
 * ============================================================================
 *
 * ── EL FALLO QUE ESTO PERSIGUE ─────────────────────────────────────────────
 *
 * `BlockEditor.svelte` pinta los campos con una cadena de `{#if field.type ===
 * "..."}`. Si el registro declara un tipo que esa cadena no contempla, el
 * campo **no se pinta**: ni error, ni hueco, ni aviso. El bloque simplemente
 * no tiene esa opción, y quien lo configura no puede saber que existía.
 *
 * Es la familia más cara de este panel —lo declarado que no llega— y ya se ha
 * cobrado `defaultFilter`, `singularName` y el `readonly` de una vista. Aquí
 * pasa entre dos ficheros que nadie mira a la vez: uno describe los campos y
 * otro decide cómo se dibujan.
 *
 * ── POR QUE NO BASTA CON MIRAR LA UNION DE TIPOS ───────────────────────────
 *
 * Porque la unión puede declarar tipos que ningún bloque usa todavía, y exigir
 * que se pinten sería ruido. Lo que importa es lo que algún bloque USA de
 * verdad: eso es lo que alguien va a abrir y no va a encontrar.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const REGISTRO = join(RAIZ, "packages", "admin", "src", "types", "blocks.ts");
const EDITOR = join(
  RAIZ,
  "packages",
  "admin",
  "src",
  "lib",
  "components",
  "builder",
  "BlockEditor.svelte"
);

const registro = readFileSync(REGISTRO, "utf-8");
const editor = readFileSync(EDITOR, "utf-8");

/** Los `type: "..."` que aparecen dentro de las definiciones de campo. */
function tiposUsados(): string[] {
  const desde = registro.indexOf("export const BLOCK_REGISTRY");
  expect(desde, "no se encontró `BLOCK_REGISTRY`").toBeGreaterThan(-1);

  const cuerpo = registro.slice(desde);

  /**
   * Se buscan solo los que van junto a una `key:`, que es la forma de una
   * definición de campo. `type:` a secas también identifica el bloque, y
   * contarlo metería «hero» o «comments» en la lista de tipos de campo.
   */
  const tipos = new Set<string>();
  for (const m of cuerpo.matchAll(/key:\s*"[^"]+",\s*\n\s*label:[^\n]*\n\s*type:\s*"([^"]+)"/g)) {
    tipos.add(m[1]);
  }
  // La forma corta de una línea: `{ key: "x", label: "Y", type: "number" }`.
  for (const m of cuerpo.matchAll(
    /\{\s*key:\s*"[^"]+",\s*label:\s*"[^"]*",\s*type:\s*"([^"]+)"/g
  )) {
    tipos.add(m[1]);
  }

  return [...tipos];
}

describe("los campos declarados se pintan", () => {
  const usados = tiposUsados();

  it("se han encontrado tipos de campo que revisar", () => {
    /**
     * Sin esto, cambiar la forma del registro dejaría la prueba recorriendo
     * una lista vacía y pasando en verde sin vigilar nada.
     */
    expect(usados.length, `solo se leyeron: ${usados.join(", ")}`).toBeGreaterThan(5);
  });

  it("el editor contempla todos", () => {
    const sinPintar = usados.filter((t) => !editor.includes(`field.type === "${t}"`));

    expect(
      sinPintar,
      `El registro de bloques usa ${sinPintar.map((t) => `«${t}»`).join(", ")} y ` +
        `\`BlockEditor.svelte\` no tiene rama para ese tipo. El campo no se pinta: ` +
        `sin error, sin hueco y sin aviso. Quien configure el bloque no podrá ` +
        `rellenarlo y no sabrá que existía.`
    ).toEqual([]);
  });
});

describe("elegir de una lista, no teclear un identificador", () => {
  /**
   * ── POR QUE ES UNA REGLA Y NO UNA PREFERENCIA ──────────────────────────────
   *
   * El bloque de tier list pedía el slug en un campo de texto, con
   * `placeholder: "meta-5-4"`. Teclearlo mal **no da ningún error**: la página
   * se guarda tan tranquila y sale sin la tier list. Y el bloque de
   * comentarios pedía el tipo de sujeto igual, donde `post` y `blog_post`
   * abren dos hilos distintos sobre el mismo artículo.
   *
   * Es la misma familia que produjo «Agregar All Gam»: una cadena que se
   * escribe a mano donde había una lista de la que elegir.
   */
  const REFERENCIAS = [
    ["tier-list", "templateSlug"],
    ["character-builder", "definitionSlug"],
    ["comments", "subjectType"],
  ] as const;

  for (const [bloque, campo] of REFERENCIAS) {
    it(`${bloque}: «${campo}» se elige`, () => {
      const i = registro.indexOf(`type: "${bloque}"`);
      expect(i, `no se encontró el bloque ${bloque}`).toBeGreaterThan(-1);

      const trozo = registro.slice(i, i + 2500);
      const j = trozo.indexOf(`key: "${campo}"`);
      expect(j, `${bloque} no declara el campo ${campo}`).toBeGreaterThan(-1);

      const definicion = trozo.slice(j, j + 300);

      expect(
        /type:\s*"(select|remote-select)"/.test(definicion),
        `«${campo}» apunta a otro contenido por su identificador. Con un campo ` +
          `de texto, escribirlo mal no falla: la página se guarda y sale vacía. ` +
          `Usa \`select\` si las opciones son fijas, o \`remote-select\` si viven ` +
          `en la base.`
      ).toBe(true);
    });
  }

  it("las opciones remotas dicen de dónde salen", () => {
    /**
     * Un `remote-select` sin `source` es un desplegable que nunca se llena: se
     * ve igual que «no hay ninguna creada todavía», y manda a crear algo que
     * ya existe.
     */
    const sinFuente: string[] = [];
    for (const m of registro.matchAll(
      /key:\s*"([^"]+)"[\s\S]{0,200}?type:\s*"remote-select"([\s\S]{0,300}?)(?=\n\s{6}\}|\n\s{6}\{)/g
    )) {
      if (!/source:\s*\{/.test(m[2])) sinFuente.push(m[1]);
    }

    expect(
      sinFuente,
      `${sinFuente.join(", ")}: un \`remote-select\` sin \`source\` nunca se ` +
        `llena, y un desplegable vacío se lee como «no hay ninguna».`
    ).toEqual([]);
  });
});
