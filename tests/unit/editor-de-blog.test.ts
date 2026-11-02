/**
 * El editor de blog guarda, y es UNO solo
 * ============================================================================
 *
 * ── LO QUE HABIA ───────────────────────────────────────────────────────────
 *
 * Tres componentes de edicion repartidos en dos pantallas, y la que se abria no
 * servia para nada:
 *
 *   · `EditorView` — markdown con vista previa. Era lo que abrian «Nuevo Post»
 *     y editar un post, via `/content/edit` -> `/g/system-tools/editor`.
 *     IGNORABA `?collection` e `?id` —arrancaba con su texto de demostracion— y
 *     su boton «Save Draft» NO TENIA `onclick`. Un boton decorativo.
 *   · `BlogPostEditor` — CRUD completo contra `/api/blog`. Nadie lo enlazaba.
 *   · `PageBuilder` — bloques. En una tercera pantalla.
 *
 * O sea: crear un post era imposible, y editar uno abria un documento de
 * ejemplo. Nada de eso daba error: simplemente no pasaba nada al pulsar
 * guardar.
 *
 * ── LO QUE VIGILA ESTA PRUEBA ──────────────────────────────────────────────
 *
 * Que el editor siga sabiendo guardar y que no reaparezca un segundo editor.
 * No comprueba el sintoma («el boton no hace nada») sino las tres propiedades
 * que lo causaron.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const EDITOR = join(
  RAIZ,
  "packages",
  "admin",
  "src",
  "lib",
  "components",
  "blog",
  "BlogPostEditor.svelte"
);
const RUTA = join(RAIZ, "packages", "admin", "src", "routes", "content", "edit", "+page.svelte");

describe("editor de blog", () => {
  const editor = sinComentarios(readFileSync(EDITOR, "utf-8"));

  it("la ruta del editor renderiza el editor que guarda", () => {
    expect(
      existsSync(RUTA),
      "/content/edit ya no renderiza nada. Es a donde van «Nuevo Post» y el " +
        "clic en una fila desde la lista de posts."
    ).toBe(true);

    const ruta = sinComentarios(readFileSync(RUTA, "utf-8"));
    expect(
      /BlogPostEditor/.test(ruta),
      "/content/edit tiene que montar `BlogPostEditor`, que es el unico que " +
        "carga el post por id y lo guarda."
    ).toBe(true);
    expect(
      /searchParams\.get\("id"\)/.test(ruta),
      "la ruta tiene que leer `?id`: sin eso, editar un post existente abriria " +
        "uno en blanco — que es exactamente lo que hacia el editor anterior."
    ).toBe(true);
  });

  it("guardar esta conectado a un manejador", () => {
    // El fallo original no fue una excepcion: fue un `<button>` sin `onclick`.
    // Se comprueba que el boton de guardar tenga manejador Y que exista la
    // funcion que llama a la API.
    expect(
      /api\.(createPost|updatePost)\(/.test(editor),
      "el editor ya no llama a `api.createPost` / `api.updatePost`."
    ).toBe(true);

    const guardar = editor.match(/onclick=\{[^}]*handleSave[^}]*\}/);
    expect(
      guardar,
      "ningun boton del editor llama a `handleSave`. El editor anterior tenia " +
        "un boton «Save Draft» sin `onclick` y por eso no guardaba nada."
    ).toBeTruthy();
  });

  it("los bloques viajan con el post", () => {
    // La pestaña de bloques edita la columna `blocks`. Si no se incluye en el
    // envio, se editan y se pierden: decorativa, como el boton de antes.
    // El corte se busca DESPUES de `const postData`: hay un `if (postId)` antes,
    // en `onMount`, y buscarlo desde el principio devolvia un trozo vacio — la
    // prueba fallaba con `blocks` correctamente en su sitio.
    const inicio = editor.indexOf("const postData");
    expect(inicio, "no se encontro el cuerpo que se envia al guardar").toBeGreaterThan(-1);
    const envio = editor.slice(inicio, editor.indexOf("if (postId)", inicio));
    expect(
      /\bblocks\b/.test(envio),
      "`blocks` no viaja en el cuerpo que se guarda: la pestaña de bloques " + "seria decorativa."
    ).toBe(true);
  });

  it("no ha reaparecido un segundo editor de contenido", () => {
    expect(
      existsSync(join(RAIZ, "packages", "admin", "src", "views", "EditorView.svelte")),
      "ha vuelto `EditorView`. Su editor de markdown vive ahora DENTRO de " +
        "BlogPostEditor como modo de escritura; una pantalla aparte vuelve a " +
        "abrir la puerta a un editor que no guarda."
    ).toBe(false);
  });
});

/**
 * El cuerpo que envía el editor tiene que encajar con el esquema de la API
 * ============================================================================
 *
 * Tres desajustes reales, y ninguno se veía leyendo el código de un solo lado:
 *
 *   · `publishedAt: null` y `featuredImageId: null` daban **400**. El esquema
 *     los declara `.optional()`, que en zod es `undefined`, NO `null`. Guardar
 *     un borrador sin imagen —un post nuevo, el caso más común— fallaba
 *     siempre.
 *   · El editor enviaba `tags` y el esquema espera `tagIds`. Zod descarta lo
 *     que no conoce en vez de protestar, así que las etiquetas se perdían EN
 *     SILENCIO: el post se guardaba y las etiquetas no.
 *
 * Se descubrieron pasando el cuerpo real por el esquema real, no leyendo. Esta
 * prueba conserva esa comprobación en el sitio donde se rompería.
 */
describe("el cuerpo que guarda encaja con la API", () => {
  const editor = sinComentarios(readFileSync(EDITOR, "utf-8"));
  const rutasApi = sinComentarios(
    readFileSync(join(RAIZ, "packages", "kons", "kon-blog", "src", "routes.ts"), "utf-8")
  );

  it("no se envían nulos donde el esquema espera opcionales", () => {
    const envio = editor.slice(
      editor.indexOf("const postData"),
      editor.indexOf("if (postId)", editor.indexOf("const postData"))
    );

    for (const campo of ["publishedAt", "featuredImageId", "authorId"]) {
      expect(
        new RegExp(`${campo}:\s*[^,\n]*\bnull\b`).test(envio),
        `El editor vuelve a enviar \`${campo}\` en null. El esquema de la API lo ` +
          `declara \`.optional()\`, que en zod significa \`undefined\`: un null da ` +
          `400 «Validation failed». Omite el campo cuando no haya valor.`
      ).toBe(false);
    }
  });

  it("las etiquetas se envían con el nombre que la API espera", () => {
    expect(
      /tagIds/.test(editor),
      "el editor ya no envía `tagIds`. Enviar `tags` no da error: zod descarta " +
        "la clave y las etiquetas se pierden sin aviso."
    ).toBe(true);

    expect(
      /tagIds:\s*z\.array/.test(rutasApi),
      "la API ya no declara `tagIds` en su esquema; revisa cómo se llama ahora " +
        "y actualiza el editor a la vez."
    ).toBe(true);
  });

  it("el post devuelve sus etiquetas al abrirlo", () => {
    // `GET /:id` devolvía la fila cruda, y las etiquetas viven en una tabla de
    // relación: abrir un post existente lo mostraba siempre sin etiquetas.
    expect(
      /tagIds:\s*etiquetas\.map/.test(rutasApi),
      "`GET /api/blog/:id` ya no devuelve `tagIds`. Sin eso el editor abre todos " +
        "los posts sin etiquetas y no se pueden ni ver ni quitar."
    ).toBe(true);
  });
});

/**
 * La pestaña de bloques tiene que estar ENTERA
 * ============================================================================
 *
 * El panel de bloques se escribió y su botón no: el script que insertaba los dos
 * abortó a mitad y solo se reejecutó la parte del panel. Resultado — un panel
 * perfectamente funcional al que no se podía llegar desde ninguna parte, y una
 * barra de pestañas con Content / SEO / Settings y nada más.
 *
 * No dio ningún error: `activeTab` simplemente nunca valía "blocks".
 */
describe("pestaña de bloques", () => {
  const editor = sinComentarios(readFileSync(EDITOR, "utf-8"));

  it("existen el botón y el panel", () => {
    expect(
      /activeTab = "blocks"/.test(editor),
      'no hay ningún botón que ponga `activeTab` en "blocks": el panel de ' +
        "bloques existe pero es inalcanzable."
    ).toBe(true);

    expect(
      /activeTab === "blocks"/.test(editor),
      'no hay panel para `activeTab === "blocks"`: la pestaña llevaría a una ' + "pantalla vacía."
    ).toBe(true);

    expect(/<PageBuilder/.test(editor), "la pestaña de bloques ya no monta `PageBuilder`.").toBe(
      true
    );
  });
});

/**
 * Lo primero que se ve al abrir el editor es dónde escribir
 * ============================================================================
 *
 * El cuerpo del post era el CUARTO campo —después de título, slug, imagen
 * destacada y extracto— y quedaba por debajo del pliegue: se abría «Nuevo Post»
 * y no se veía dónde escribir. La imagen y el extracto son metadatos; el cuerpo
 * es a lo que se viene.
 */
describe("orden de los campos del editor", () => {
  const editor = readFileSync(EDITOR, "utf-8");

  it("el cuerpo va antes que la imagen destacada y el extracto", () => {
    const contenido = editor.indexOf("<!-- Content Editor -->");
    const imagen = editor.indexOf("<!-- Featured Image -->");
    const extracto = editor.indexOf("<!-- Excerpt -->");

    expect(contenido, "no se encontró el editor de contenido").toBeGreaterThan(-1);
    expect(
      contenido < imagen && contenido < extracto,
      "el campo donde se escribe el post ha vuelto a quedar por debajo de los " +
        "metadatos. Es lo único que se viene a hacer aquí: va primero."
    ).toBe(true);
  });
});
