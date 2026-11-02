/**
 * Las tres piezas que se acaban de añadir al editor del blog
 * ============================================================================
 *
 * Categorías, autoguardado y detección de edición simultánea. Las tres tienen
 * un modo de fallo que NO se ve: no revientan, hacen otra cosa. Esta prueba
 * vigila justo eso.
 *
 * ── 1. LA TRAMPA DE LA PRECISIÓN ───────────────────────────────────────────
 *
 * `blog_posts.updated_at` es `timestamptz(6)` — Postgres guarda MICROSEGUNDOS.
 * Al salir por la API pasa por un `Date` de JavaScript, que solo llega a
 * MILISEGUNDOS:
 *
 *     en la base   2026-08-28T23:05:45.919009Z
 *     en el editor 2026-08-28T23:05:45.919Z
 *
 * Comparar esas dos con `=` no coincide jamás. Escrito así, la protección
 * contra pisotones rechazaba TODOS los guardados —una sola persona editando,
 * ningún conflicto— con un 409 que decía «otra persona lo ha cambiado».
 *
 * Se detectó ejecutándolo contra la base real, no leyéndolo: en el código las
 * dos versiones se leen exactamente igual de bien.
 *
 * ── 2. ZOD DESCARTA EN SILENCIO ────────────────────────────────────────────
 *
 * Las claves que el esquema no declara NO dan error: se tiran. Si `categoryIds`
 * falta en el esquema, el post se guarda sin categorías y no avisa nadie. Ya
 * pasó en este mismo editor con `tags` en vez de `tagIds`, y el síntoma era
 * «las etiquetas no se guardan», que no lleva a mirar el validador.
 *
 * ── 3. UN BORRADOR QUE SE BORRA SOLO NO ES UN BORRADOR ─────────────────────
 *
 * El autoguardado protege de cerrar la pestaña. Si al desmontar el componente
 * se llamara a `clearCurrentAutosave` en vez de a `stopAutosave`, salir de la
 * pantalla destruiría exactamente lo que esto viene a proteger.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const RUTAS = join(RAIZ, "packages", "kons", "kon-blog", "src", "routes.ts");
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

describe("edición simultánea de posts", () => {
  const rutas = sinComentarios(readFileSync(RUTAS, "utf-8"));

  it("la comparación de versiones trunca a milisegundos", () => {
    /**
     * Lo que se prohíbe es el `=` directo contra la columna. `date_trunc`
     * iguala las dos precisiones; sin él, todo guardado devuelve 409.
     */
    expect(
      rutas.includes("date_trunc('milliseconds'"),
      "La condición de `expectedUpdatedAt` tiene que truncar `updated_at` a " +
        "milisegundos. La columna es timestamptz(6) y lo que vuelve del editor " +
        "pasó por un Date de JavaScript, que solo tiene milisegundos: comparadas " +
        "en crudo NO coinciden nunca y CUALQUIER guardado se rechaza con un 409 " +
        "que culpa a otra persona inexistente."
    ).toBe(true);

    expect(
      /eq\(\s*blogPosts\.updatedAt\s*,/.test(rutas),
      "`eq(blogPosts.updatedAt, …)` compara microsegundos contra milisegundos y " +
        "no coincide jamás. Usa la comparación con `date_trunc`."
    ).toBe(false);
  });

  it("un conflicto no escribe nada y se distingue de un post inexistente", () => {
    // El blog es un kon del SDK: PATCH /:id es la operación `editar-entrada`.
    const patch = rutas.slice(rutas.indexOf('id: "editar-entrada"'));
    const cuerpo = patch.slice(0, patch.indexOf('id: "borrar-entrada"'));

    expect(cuerpo.length, "no se encontró el manejador PATCH /:id").toBeGreaterThan(0);

    // La condición va en el WHERE del UPDATE: si el filtro se aplicara después
    // de escribir, el pisotón ya habría ocurrido.
    expect(
      cuerpo.indexOf("const condicion") < cuerpo.indexOf(".update(blogPosts)"),
      "la condición de versión tiene que formar parte del WHERE del UPDATE, no " +
        "comprobarse después: después ya se ha escrito encima."
    ).toBe(true);

    // 409 y 404 no son lo mismo: uno manda a resolver un conflicto, el otro a
    // buscar un post que sí existe.
    expect(cuerpo).toContain("currentUpdatedAt");
    expect(cuerpo).toMatch(/409/);
    expect(cuerpo).toMatch(/"Post not found"/);
  });

  it("mandar la versión es opcional", () => {
    /**
     * Sin `expectedUpdatedAt` el comportamiento tiene que ser el de siempre.
     * Hacerlo obligatorio rompería de golpe a todo consumidor existente —
     * scripts, integraciones, el propio panel antes de recargarse.
     */
    expect(
      rutas.includes("expectedUpdatedAt\n        ? and(") ||
        /expectedUpdatedAt\s*\n?\s*\?/.test(rutas),
      "la condición tiene que ser un ternario sobre `expectedUpdatedAt`: quien no " +
        "la manda conserva el comportamiento anterior."
    ).toBe(true);
  });
});

describe("categorías del blog", () => {
  const rutas = sinComentarios(readFileSync(RUTAS, "utf-8"));
  const editor = readFileSync(EDITOR, "utf-8");

  it("`categoryIds` está declarado en el esquema de validación", () => {
    /**
     * Sin esto zod lo DESCARTA sin protestar: el post se guarda, las categorías
     * no, y no hay ni error ni aviso. El fallo silencioso es peor que el 400.
     */
    const crear = rutas.slice(
      rutas.indexOf("const createPostSchema"),
      rutas.indexOf("const categoriaSchema")
    );

    expect(
      crear.includes("categoryIds"),
      "`categoryIds` falta en createPostSchema/updatePostSchema. Zod descarta " +
        "las claves que no conoce SIN protestar: las categorías se perderían " +
        "en cada guardado sin un solo mensaje."
    ).toBe(true);
  });

  it("se sincronizan al crear y al actualizar, no solo en uno", () => {
    const veces = [
      ...rutas.matchAll(
        /blogPostsToCategories\)?\s*\n?\s*\.values\(|insert\(blogPostsToCategories\)/g
      ),
    ];
    expect(
      veces.length,
      "las categorías tienen que guardarse tanto en POST / como en PATCH /:id. " +
        "Con una sola, crear un post con categorías funciona y editarlo las pierde."
    ).toBeGreaterThanOrEqual(2);
  });

  it("`GET /:id` devuelve las categorías del post", () => {
    /**
     * Es la mitad que faltaba con las etiquetas: se guardaban y al reabrir el
     * post salía vacío, que se lee como «no tiene» y no como «no te las he
     * traído».
     */
    expect(
      rutas.includes("categoryIds: categorias.map"),
      "`GET /api/blog/:id` tiene que devolver `categoryIds`. Si no, el editor " +
        "muestra el post SIN categorías por muchas que tenga, y el siguiente " +
        "guardado las borra de verdad."
    ).toBe(true);
  });

  it("el editor manda la lista aunque esté vacía", () => {
    /**
     * `[]` significa «quítalas todas» y omitir la clave significa «no las
     * toques». Si el editor solo la mandara cuando hay alguna, quitar la última
     * categoría de un post sería imposible: se vería quitada y volvería al
     * recargar.
     */
    expect(
      editor.includes("if (postId || categoryIds.length > 0) postData.categoryIds = categoryIds;"),
      "al editar un post existente, `categoryIds` tiene que viajar SIEMPRE, " +
        "también vacío: si no, quitar la última categoría no se guarda nunca."
    ).toBe(true);
  });
});

describe("insertar imágenes en el texto", () => {
  const editor = readFileSync(EDITOR, "utf-8");
  const EDITORES = join(RAIZ, "packages", "admin", "src", "lib", "components", "editor");
  const rapido = readFileSync(join(EDITORES, "SlashCommandEditor.svelte"), "utf-8");
  const markdown = readFileSync(join(EDITORES, "MdxEditor.svelte"), "utf-8");

  it("`/image` abre la biblioteca en vez de escribir un hueco", () => {
    /**
     * El comando insertaba el texto `![alt](url)` y ya está. Eso no es insertar
     * una imagen: es dejar deberes — ir a otra pantalla, buscar el fichero,
     * copiar su URL y volver a pegarla. Con la biblioteca de medios YA CARGADA
     * en esta misma pantalla, que se usaba para la imagen de portada.
     *
     * Es el patrón de siempre en este repo: la pieza existe, funciona, y no
     * está enchufada donde hace falta.
     */
    expect(
      rapido.includes('command.id === "image" && onPedirImagen'),
      "el comando `/image` tiene que abrir el selector de medios, no insertar " +
        "`![alt](url)` para que alguien rellene la URL a mano."
    ).toBe(true);
  });

  it("los dos modos de escritura pueden insertar", () => {
    /**
     * Markdown es CodeMirror y Rápido es un textarea: insertar en la posición
     * del cursor se hace distinto en cada uno. Si solo uno lo soportara, el
     * botón dejaría de funcionar al cambiar de modo sin avisar de nada.
     */
    expect(rapido).toContain("export function insertarImagen");
    expect(markdown).toContain("export function insertarImagen");
    expect(editor).toContain("bind:this={editorRapido}");
    expect(editor).toContain("bind:this={editorMarkdown}");
  });

  it("la biblioteca sabe si la imagen va a portada o al texto", () => {
    /**
     * Es el MISMO modal para las dos cosas. Sin distinguir el destino, elegir
     * una imagen para el cuerpo del artículo cambiaría la portada del post
     * —en silencio— y al revés.
     */
    expect(editor).toContain("destinoDeLaImagen");

    const abiertas = [...editor.matchAll(/showMediaModal = true/g)].length;
    const fijados = [...editor.matchAll(/destinoDeLaImagen = "(portada|contenido)"/g)].length;
    expect(
      fijados >= abiertas,
      "cada sitio que abre la biblioteca tiene que fijar antes el destino. El " +
        "que no lo haga hereda el del uso anterior: pedir la portada acabaría " +
        "insertando en el texto."
    ).toBe(true);
  });

  it("el `alt` sale de la biblioteca, no se queda en «alt»", () => {
    /**
     * Escrito a mano, el texto alternativo se queda en el marcador de posición
     * casi siempre. Y el `alt` es accesibilidad y es SEO — dos cosas que este
     * mismo editor puntúa en su propia barra.
     */
    expect(
      editor.includes("media.alt || media.filename"),
      "al insertar hay que usar el `alt` que ya tiene el fichero en la " +
        "biblioteca, con el nombre del fichero como respaldo."
    ).toBe(true);
  });

  it("la posición del cursor se guarda antes de abrir el modal", () => {
    /**
     * Abrir el modal quita el foco del textarea. Apoyarse en que
     * `selectionStart` sobreviva al blur es frágil: basta con que el modal
     * enfoque algo para que la imagen aparezca al principio del texto en vez de
     * donde se estaba escribiendo.
     */
    expect(rapido).toContain("posicionGuardada");
  });
});

describe("autoguardado del editor", () => {
  const editor = readFileSync(EDITOR, "utf-8");

  it("salir de la pantalla NO borra el borrador", () => {
    expect(
      editor.includes("onDestroy(() => autosaveStore.stopAutosave())"),
      "`onDestroy` tiene que PARAR el autoguardado, no limpiarlo. Con " +
        "`clearCurrentAutosave` aquí, salir de la pantalla destruiría el " +
        "borrador — justo lo que esto protege."
    ).toBe(true);

    const destroy = editor.slice(editor.indexOf("onDestroy("), editor.indexOf("onDestroy(") + 120);
    expect(
      destroy.includes("clearCurrentAutosave"),
      "`clearCurrentAutosave` en `onDestroy` borra el borrador al salir."
    ).toBe(false);
  });

  it("el borrador se limpia solo tras guardar de verdad", () => {
    const guardar = editor.slice(editor.indexOf("async function handleSave"));
    const cuerpo = guardar.slice(0, guardar.indexOf("async function handleDelete"));

    const iGuardado = Math.max(cuerpo.indexOf("api.updatePost"), cuerpo.indexOf("api.createPost"));
    const iLimpieza = cuerpo.indexOf("clearCurrentAutosave");

    expect(iLimpieza, "tras guardar hay que limpiar el borrador").toBeGreaterThan(-1);
    expect(
      iLimpieza > iGuardado,
      "el borrador se limpia DESPUÉS de que la API confirme. Antes, un fallo de " +
        "red se llevaría por delante la única copia que queda de lo escrito."
    ).toBe(true);

    // Y en el catch NO puede limpiarse: es justo cuando más falta hace.
    const captura = cuerpo.slice(cuerpo.indexOf("} catch"));
    expect(
      captura.includes("clearCurrentAutosave"),
      "si el guardado falla, el borrador local es lo único que conserva el " +
        "trabajo: no se toca."
    ).toBe(false);
  });

  it("el seguimiento de cambios no se pelea consigo mismo", () => {
    /**
     * El store es reactivo. Un `$effect` que lo escriba y lo lea entra en
     * realimentación. Ya ocurrió en el explorador de datos de este mismo panel,
     * y el síntoma —la interfaz deshaciendo lo que hace quien la usa— no se
     * parece en nada a la causa.
     */
    expect(
      editor.includes("untrack(() => autosaveStore.updateData(datos))"),
      "la escritura al store dentro del `$effect` tiene que ir en `untrack`."
    ).toBe(true);
  });

  it("restaurar una versión del historial mueve el formulario", () => {
    /**
     * `VersionHistory` (el desplegable del indicador) restaura llamando a
     * `restoreVersion`, que se limita a dejar los datos en
     * `autosaveStore.restoredData`. El store no pinta nada.
     *
     * Sin un efecto que lo lea, el botón «Restore» existe, se pulsa, no da
     * error y NO PASA NADA — el mismo patrón que tenía la pestaña de bloques
     * antes de conectarla: código completo y desenchufado. Un fallo así no se
     * ve en ninguna comprobación de tipos.
     */
    expect(
      editor.includes("autosaveStore.restoredData"),
      "el editor tiene que reaccionar a `restoredData`: si no, el botón " +
        "«Restore» del historial de versiones no hace absolutamente nada."
    ).toBe(true);

    expect(
      editor.includes("aplicarInstantanea(recuperado)"),
      "lo restaurado tiene que aplicarse al formulario."
    ).toBe(true);
  });

  it("solo se ofrece recuperar un borrador MÁS NUEVO que el servidor", () => {
    expect(
      editor.includes("ultima.timestamp > guardadoEnServidor"),
      "ofrecer un borrador más viejo que lo guardado es proponer perder trabajo, " +
        "no recuperarlo."
    ).toBe(true);
  });
});
