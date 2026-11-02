/**
 * La galería de imágenes se elige, no se escribe a mano
 * ============================================================================
 *
 * ── LO QUE HABIA ───────────────────────────────────────────────────────────
 *
 * El bloque «Image Gallery» declaraba su campo así:
 *
 *     { key: "images", label: "Images (JSON)", type: "json" }
 *
 * Es decir: una caja de texto con `[]` dentro. Para montar un carrusel había
 * que ir a la biblioteca de medios, copiar la URL de cada imagen, volver y
 * componer el array a mano — con la biblioteca a un clic de distancia y un
 * selector (`MediaPicker`) ya escrito, con búsqueda y subida, usado por otros
 * tres sitios del panel.
 *
 * Otra vez la pieza existía y no estaba enchufada donde hacía falta.
 *
 * ── LO QUE VIGILA ESTA PRUEBA ──────────────────────────────────────────────
 *
 * Lo importante no es que exista el campo, sino que las DOS MITADES encajen:
 * lo que el editor escribe tiene que ser lo que el renderizador lee. Si el
 * editor guardara `{ src }` y el renderizador leyera `{ url }`, la galería se
 * editaría bien, se guardaría bien y saldría vacía en el sitio — sin un solo
 * error por medio. Es exactamente lo que pasó con `tags` frente a `tagIds`, y
 * con `name` frente a `title` en las colecciones.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderizarBloques } from "@kitsuden/shared";

const RAIZ = join(__dirname, "..", "..");
const ADMIN = join(RAIZ, "packages", "admin", "src");
const BLOQUES = join(ADMIN, "types", "blocks.ts");
const EDITOR = join(ADMIN, "lib", "components", "builder", "BlockEditor.svelte");
const PICKER = join(ADMIN, "lib", "components", "media", "MediaPicker.svelte");

describe("el campo de galería", () => {
  const bloques = readFileSync(BLOQUES, "utf-8");
  const editor = readFileSync(EDITOR, "utf-8");

  it("ya no pide un JSON escrito a mano", () => {
    const galeria = bloques.slice(
      bloques.indexOf('type: "image-gallery"'),
      bloques.indexOf('type: "tier-list"')
    );

    expect(galeria.length, "no se encontró el bloque `image-gallery`").toBeGreaterThan(0);

    expect(
      /key: "images",[\s\S]{0,120}type: "json"/.test(galeria),
      "el campo `images` no puede ser `json`: obliga a componer el array a mano " +
        "teniendo la biblioteca de medios al lado."
    ).toBe(false);

    expect(galeria).toContain('type: "gallery"');
  });

  it("el editor lo pinta y abre el selector de medios", () => {
    expect(editor).toContain('field.type === "gallery"');

    /**
     * Y con el selector en modo múltiple: si abriera el de una sola, elegir
     * ocho imágenes serían ocho aperturas.
     */
    const picker = editor.slice(editor.indexOf("galeriaEligiendo !== null"));
    expect(
      picker.includes("multiple"),
      "la galería tiene que abrir `MediaPicker` en modo múltiple."
    ).toBe(true);
  });

  it("se puede reordenar: en un carrusel el orden es el contenido", () => {
    expect(editor).toContain("function moverImagen");
  });

  it("cada imagen guarda su texto alternativo", () => {
    /**
     * El `alt` es accesibilidad y es SEO. Escribiendo el JSON a mano se
     * quedaba vacío casi siempre; con un campo al lado de la miniatura, no.
     */
    expect(editor).toContain('editarImagen(field.key, i, "alt"');
  });
});

describe("modo múltiple del selector", () => {
  const picker = readFileSync(PICKER, "utf-8");

  it("no cambia el comportamiento de quien ya lo usaba", () => {
    /**
     * `MediaPicker` lo usan el editor de blog, el formulario de datasets y los
     * campos de imagen de los bloques, todos de selección única. El modo nuevo
     * tiene que ser opcional y estar apagado por defecto.
     */
    expect(picker).toContain("multiple = false");
  });

  it("al subir varias, entran todas", () => {
    /**
     * Antes se quedaba con `subidos[0]`. Arrastrar ocho imágenes para un
     * carrusel subía las ocho a la biblioteca y metía UNA en el bloque: desde
     * fuera parece que la subida falló a medias.
     */
    expect(picker).toContain("for (const medio of subidos) onSelect(medio)");
  });
});

describe("lo que escribe el editor es lo que lee el renderizador", () => {
  it("una galería con la forma del editor se pinta entera", () => {
    /**
     * La comprobación que de verdad importa, y por eso ejecuta el renderizador
     * de verdad en vez de mirar el código: se construye el objeto EXACTO que
     * guarda `alternarEnGaleria` —`{ url, alt, mediaId }`— más un `caption`, y
     * se pasa por `renderizarBloques`.
     */
    const { html, interactivos } = renderizarBloques([
      {
        id: "1",
        type: "image-gallery",
        order: 0,
        data: {
          layout: "grid",
          columns: 3,
          images: [
            { url: "https://ejemplo.test/a.jpg", alt: "Primera", mediaId: "m1" },
            { url: "https://ejemplo.test/b.jpg", alt: "Segunda", caption: "Pie", mediaId: "m2" },
          ],
        },
      },
    ]);

    expect(html).toContain('src="https://ejemplo.test/a.jpg"');
    expect(html).toContain('alt="Primera"');
    expect(html).toContain('src="https://ejemplo.test/b.jpg"');
    expect(html, "el pie de foto tiene que salir").toContain("<figcaption>Pie</figcaption>");

    expect(interactivos, "una galería se pinta entera, no es un hueco").toEqual([]);

    /**
     * `mediaId` es del editor —sirve para marcar lo elegido en el selector— y
     * al renderizador no le hace falta. Lo que no puede es acabar impreso en la
     * página.
     */
    expect(html, "`mediaId` es de uso interno del editor").not.toContain("m1");
  });
});
