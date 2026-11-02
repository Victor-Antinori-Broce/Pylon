/**
 * El renderizador de bloques, ejecutado de verdad
 * ============================================================================
 *
 * ── QUE ARREGLA ────────────────────────────────────────────────────────────
 *
 * `blog_posts.blocks` se editaba, se guardaba, la API lo servía… y nadie lo
 * pintaba. Buscando `PageBlock` en todo el árbol solo aparecía en componentes
 * del panel. Añadías una galería, mirabas la vista previa y salía idéntica a un
 * post sin bloques — que no se lee como «esto no se soporta» sino como «no se
 * ha guardado».
 *
 * ── POR QUE ESTA PRUEBA EJECUTA Y NO MIRA EL CODIGO ────────────────────────
 *
 * Las otras pruebas de esta carpeta vigilan que cierto código siga escrito de
 * cierta forma, porque vigilan contratos entre ficheros. Esta no: aquí hay una
 * función pura que transforma datos en HTML, así que lo correcto es darle datos
 * y mirar el HTML. Un grep no distingue entre escapar y no escapar.
 *
 * Lo que más importa son los tres últimos casos: un renderizador que emite
 * HTML a partir de lo que alguien escribió en un editor es, si se descuida, un
 * XSS almacenado en todas las páginas del blog.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderizarBloques, urlSegura, escaparHtml } from "@kitsuden/shared";

describe("bloques que se pintan del todo", () => {
  it("una galería sale con sus imágenes, no con un hueco", () => {
    const { html, interactivos } = renderizarBloques([
      {
        id: "1",
        type: "image-gallery",
        order: 0,
        data: {
          layout: "grid",
          columns: 2,
          images: [
            { url: "https://ejemplo.test/a.jpg", alt: "Primera", caption: "Pie" },
            { url: "https://ejemplo.test/b.jpg", alt: "Segunda" },
          ],
        },
      },
    ]);

    expect(html).toContain('src="https://ejemplo.test/a.jpg"');
    expect(html).toContain('alt="Primera"');
    expect(html).toContain("<figcaption>Pie</figcaption>");
    expect(html).toContain('src="https://ejemplo.test/b.jpg"');
    expect(interactivos, "una galería no necesita hidratarse").toEqual([]);
  });

  it("el orden lo manda `order`, no la posición en el array", () => {
    /**
     * `blocks` es jsonb: quien escriba por API no tiene por qué respetar el
     * orden del array. Si se pintara en el orden recibido, un post editado por
     * script saldría desordenado sin que nada fallara.
     */
    const { html } = renderizarBloques([
      { id: "b", type: "callout", order: 2, data: { content: "SEGUNDO", variant: "info" } },
      { id: "a", type: "callout", order: 1, data: { content: "PRIMERO", variant: "info" } },
    ]);

    expect(html.indexOf("PRIMERO")).toBeLessThan(html.indexOf("SEGUNDO"));
  });

  it("un llamante puede sustituir el conversor de markdown", () => {
    /**
     * La opción sigue existiendo para casos concretos —un sitio con su propio
     * dialecto, por ejemplo— pero YA NO hace falta pasarla: el defecto vive en
     * el renderizador. Ver el bloque «la vista previa y lo publicado no pueden
     * divergir»: cuando cada llamante traía el suyo, se dejaron mitades
     * distintas y el resultado dejó de coincidir sin que nada fallara.
     */
    const { html } = renderizarBloques(
      [{ id: "1", type: "richtext", order: 0, data: { content: "# Hola", format: "markdown" } }],
      { markdownAHtml: (md) => `<h2>${md.replace(/^# /, "")}</h2>` }
    );

    expect(html).toContain("<h2>Hola</h2>");
  });
});

describe("bloques que necesitan al sitio", () => {
  it("se emiten como hueco, declarados y con su configuración", () => {
    const { html, interactivos } = renderizarBloques([
      {
        id: "1",
        type: "smart-grid",
        order: 0,
        data: { datasetId: "armas", columns: ["nombre"], enableGrouping: false },
      },
    ]);

    expect(interactivos, "el llamante tiene que saber que esto es un hueco").toEqual([
      "smart-grid",
    ]);
    expect(html).toContain('data-kitsuden-block="smart-grid"');
    expect(html, "la configuración viaja para que el sitio pueda hidratar").toContain("armas");
  });

  it("no se finge que están renderizados", () => {
    /**
     * Un mapa con miles de marcadores, zoom y capas no se resuelve con HTML
     * estático. Emitir algo que lo aparente es peor que el hueco: se maqueta
     * sobre un resultado que nadie va a publicar.
     */
    const { interactivos } = renderizarBloques([
      { id: "1", type: "game-map", order: 0, data: { mapSlug: "elden-ring" } },
      { id: "2", type: "tier-list", order: 1, data: { templateSlug: "parche-12" } },
      { id: "3", type: "dynamic-carousel", order: 2, data: { source: "games", limit: 5 } },
    ]);

    expect(interactivos.sort()).toEqual(["dynamic-carousel", "game-map", "tier-list"]);
  });

  it("un tipo desconocido se reporta y no se traga", () => {
    const { html, desconocidos } = renderizarBloques([
      { id: "1", type: "inventado-en-el-futuro", order: 0, data: {} },
    ]);

    expect(desconocidos).toEqual(["inventado-en-el-futuro"]);
    expect(html, "mejor no pintar nada que pintar basura").toBe("");
  });
});

describe("lo que impide un XSS almacenado", () => {
  it("el texto de los datos se escapa", () => {
    const { html } = renderizarBloques([
      {
        id: "1",
        type: "hero",
        order: 0,
        data: { title: "<script>alert(1)</script>", subtitle: '" onload="alert(2)' },
      },
    ]);

    expect(html, "el script no puede salir como etiqueta").not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html, "ni romper el atributo para inyectar un manejador").not.toContain('onload="');
  });

  it("`javascript:` en un enlace se descarta", () => {
    /**
     * Un `href="javascript:…"` ejecuta al pulsar. El CTA de un hero es texto
     * que alguien escribe en un formulario, así que es exactamente por donde
     * entraría.
     */
    expect(urlSegura("javascript:alert(1)")).toBe("");
    expect(urlSegura("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(urlSegura("vbscript:msgbox(1)")).toBe("");

    // Y lo legítimo sigue pasando.
    expect(urlSegura("https://ejemplo.test/a")).toBe("https://ejemplo.test/a");
    expect(urlSegura("/blog/mi-post")).toBe("/blog/mi-post");
    expect(urlSegura("mailto:hola@ejemplo.test")).toBe("mailto:hola@ejemplo.test");

    const { html } = renderizarBloques([
      {
        id: "1",
        type: "hero",
        order: 0,
        data: { title: "T", ctaLabel: "Pulsa", ctaUrl: "javascript:alert(1)" },
      },
    ]);
    expect(html).not.toContain("javascript:");
  });

  it("sin saneador, el HTML de un richtext se ESCAPA en vez de emitirse", () => {
    /**
     * Es la decisión de diseño que más importa del módulo: quien olvide pasar
     * el saneador obtiene contenido feo, no un XSS en todas las páginas. Se
     * falla del lado seguro.
     */
    const { html } = renderizarBloques([
      {
        id: "1",
        type: "richtext",
        order: 0,
        data: { content: '<img src=x onerror="alert(1)">', format: "html" },
      },
    ]);

    /**
     * La propiedad que importa NO es que la cadena «onerror» no aparezca: es
     * que no se cree NINGUNA etiqueta a partir de la entrada. Aquí sale como
     * texto dentro de un <pre>, con los < > y las comillas escapados, así que
     * el navegador no tiene ningún elemento al que colgarle un manejador.
     */
    expect(html, "no puede construirse una etiqueta img").not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html, "las comillas escapadas impiden cerrar el atributo").toContain("&quot;");
  });

  it("con saneador, se usa el saneador", () => {
    const { html } = renderizarBloques(
      [
        {
          id: "1",
          type: "richtext",
          order: 0,
          data: { content: "<b>negrita</b><script>malo()</script>", format: "html" },
        },
      ],
      { sanearHtml: (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "") }
    );

    expect(html).toContain("<b>negrita</b>");
    expect(html).not.toContain("malo()");
  });

  it("escaparHtml cubre las cinco que importan", () => {
    expect(escaparHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("la vista previa y lo publicado no pueden divergir", () => {
  const RAIZ = join(__dirname, "..", "..");
  const API = join(RAIZ, "packages", "kons", "kon-blog", "src", "routes.ts");
  const PANEL = join(RAIZ, "packages", "admin", "src", "lib", "components", "LivePreview.svelte");

  /**
   * ── EL FALLO QUE ESTO IMPIDE ──────────────────────────────────────────────
   *
   * El renderizador nació con las opciones a cargo de cada llamante. Cada uno
   * se dejó una mitad distinta:
   *
   *     API   : { sanearHtml }        → markdown sin convertir
   *     Panel : { markdownAHtml }     → markdown convertido
   *
   * Medido sobre el mismo bloque:
   *
   *     API   : <div class="ks-richtext"><pre># Hola</pre></div>
   *     Panel : <div class="ks-richtext"><h1>Hola</h1></div>
   *
   * La vista previa enseñaba un encabezado y el sitio publicaba el markdown en
   * crudo. Nada fallaba. Es justo lo que el módulo existía para impedir, y se
   * coló porque «acordarse de pasar lo mismo en dos ficheros» no es una
   * garantía, es una intención.
   *
   * La solución no fue pasar las mismas opciones: fue que no haya opciones que
   * pasar. Esta prueba vigila eso.
   */
  it("ningún llamante pasa opciones propias", () => {
    for (const [nombre, ruta] of [
      ["la API", API],
      ["el panel", PANEL],
    ] as const) {
      const fuente = readFileSync(ruta, "utf-8");
      const llamadas = [...fuente.matchAll(/renderizarBloques\(([^)]*)\)/g)];

      expect(llamadas.length, `no se encontró la llamada en ${nombre}`).toBeGreaterThan(0);

      for (const llamada of llamadas) {
        expect(
          llamada[1].includes("{"),
          `${nombre} pasa opciones a renderizarBloques. En cuanto los dos lados ` +
            `pasan opciones distintas, la vista previa deja de enseñar lo que se ` +
            `va a publicar — y no falla nada, así que nadie se entera. Los ` +
            `valores por defecto viven en el renderizador justo para esto.`
        ).toBe(false);
      }
    }
  });

  it("el markdown se convierte por defecto, sin que nadie lo pida", () => {
    const { html } = renderizarBloques([
      { id: "1", type: "richtext", order: 0, data: { content: "# Hola", format: "markdown" } },
    ]);

    expect(html, "sin pasar nada, el markdown tiene que convertirse").toContain("<h1");
    expect(html).not.toContain("<pre># Hola</pre>");
  });

  it("el markdown por defecto no deja pasar etiquetas", () => {
    /**
     * `marked` NO sanea —desde la v5 no tiene opción `sanitize`— y markdown
     * admite HTML en línea. Sin escapar antes, un `<script>` escrito en el
     * cuerpo del post saldría tal cual en todas las páginas donde aparezca.
     */
    const { html } = renderizarBloques([
      {
        id: "1",
        type: "richtext",
        order: 0,
        data: { content: "texto <script>alert(1)</script> más texto", format: "markdown" },
      },
    ]);

    expect(html, "no puede formarse la etiqueta").not.toContain("<script");
    expect(html).toContain("&lt;script");
  });

  it("las citas de markdown siguen funcionando", () => {
    /**
     * Se escapa solo el `<`. Escapar también el `>` neutralizaría las citas,
     * que en markdown empiezan justo por ahí — el arreglo de seguridad se
     * habría llevado por delante una función normal del editor.
     */
    const { html } = renderizarBloques([
      { id: "1", type: "richtext", order: 0, data: { content: "> una cita", format: "markdown" } },
    ]);

    expect(html).toContain("<blockquote");
  });
});

describe("casos de borde que no pueden reventar", () => {
  it("una lista vacía o ausente da HTML vacío", () => {
    expect(renderizarBloques([]).html).toBe("");
    expect(renderizarBloques(null).html).toBe("");
    expect(renderizarBloques(undefined).html).toBe("");
  });

  it("un bloque sin `data` no rompe el render", () => {
    /**
     * La columna es jsonb y no hay nada en la base que obligue a que cada
     * bloque traiga `data`. Un post antiguo, o uno escrito por API, puede no
     * tenerlo — y si eso lanza, el post entero deja de servirse.
     */
    expect(() =>
      renderizarBloques([
        { id: "1", type: "hero", order: 0 },
        { id: "2", type: "divider", order: 1 },
        { id: "3", type: "image-gallery", order: 2 },
      ])
    ).not.toThrow();
  });
});

describe("el bloque «Grupo de Facebook»", () => {
  const pintar = (data: Record<string, unknown>) =>
    renderizarBloques([{ id: "fb", type: "facebook-group", order: 0, data }]).html;

  it("es una tarjeta con enlace: nada de iframe ni de script de Facebook", () => {
    const html = pintar({ url: "https://www.facebook.com/groups/example" });
    expect(html).toContain('href="https://www.facebook.com/groups/example"');
    expect(html).toContain("Unirme al grupo");
    expect(html).not.toMatch(/<iframe|<script/i);
    expect(html).toContain('rel="noopener"');
  });

  it("usa el título, el texto y el botón que se le pongan, escapados", () => {
    const html = pintar({
      url: "https://facebook.com/groups/123",
      title: "Builds <b>en grupo</b>",
      description: "Dudas & consejos",
      ctaLabel: "Entrar",
    });
    expect(html).toContain("Builds &lt;b&gt;en grupo&lt;/b&gt;");
    expect(html).toContain("Dudas &amp; consejos");
    expect(html).toContain(">Entrar<");
  });

  it("solo acepta enlaces de facebook.com: ni otros sitios ni esquemas peligrosos", () => {
    for (const url of [
      "https://evil.example/groups/1",
      "https://facebook.com.evil.example/groups/1",
      "javascript:alert(1)",
      "http://facebook.com/groups/1",
      "",
    ]) {
      expect(pintar({ url }), url).toBe("");
    }
  });
});
