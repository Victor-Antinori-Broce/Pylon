/**
 * Page builder — saneado del contenido de los bloques
 * ============================================================================
 *
 * La primera mitad es COPIA LITERAL de `packages/kons/kon-blog/src/saneado.ts`
 * (de «Etiquetas que se conservan» a `sanearUrlsDe`). Está duplicada porque un
 * kon de núcleo no puede importar de un kon de dominio y `@kitsuden/shared`
 * es de otra área; su sitio natural es `shared`. La prueba
 * `tests/unit/seg-blog-saneado.test.ts` comprueba que las dos copias siguen
 * siendo idénticas, para que no se separen sin que nadie se entere.
 *
 * Por qué hace falta: las páginas las escriben el equipo y el token de Inti
 * (`contenido:editar`), y las pinta un frontend con su HTML. Un bloque `text`
 * en HTML/markdown, un `embed` o una URL `javascript:` en un botón eran código
 * guardado que se ejecutaba a cada visitante. Ver la nota larga en la copia
 * del blog.
 */

// ── COPIA de kon-blog/src/saneado.ts: no editar aquí sin editar allí ──────
/** Etiquetas que se conservan. */
const ETIQUETAS = new Set([
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
]);

/** Etiquetas que se quitan junto con TODO lo que llevan dentro. */
const CON_CONTENIDO = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "template",
  "noscript",
  "noembed",
  "noframes",
  "textarea",
  "title",
  "xmp",
  "plaintext",
  "svg",
  "math",
  "select",
  "option",
  "head",
]);

/** Atributos que se conservan en cualquier etiqueta permitida. */
const ATRIBUTOS = new Set([
  "class",
  "id",
  "title",
  "lang",
  "dir",
  "role",
  "alt",
  "loading",
  "decoding",
  "width",
  "height",
  "colspan",
  "rowspan",
  "scope",
  "start",
  "reversed",
  "datetime",
  "open",
  "target",
  "rel",
]);

/** Atributos que llevan una URL: solo esquemas de la lista blanca o relativas (`destinoPeligroso`). */
const ATRIBUTOS_URL = new Set(["href", "src", "cite"]);

/** Texto de un nodo: lo que el navegador leería como marcado, escapado. */
function escaparTexto(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escaparAtributo(valor: string): string {
  return valor
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]{0,31};|#[0-9]{1,7};|#x[0-9a-fA-F]{1,6};)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const RE_ATRIBUTO = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function atributosLimpios(crudos: string): string {
  let salida = "";
  const vistos = new Set<string>();
  for (const m of crudos.matchAll(RE_ATRIBUTO)) {
    const nombre = m[1]!.toLowerCase();
    if (vistos.has(nombre)) continue;
    const valor = m[2] ?? m[3] ?? m[4];

    let limpio: string | null = null;
    if (ATRIBUTOS_URL.has(nombre)) {
      // Lista blanca de esquemas (http, https, mailto, tel) o relativa; con
      // entidades y blancos decodificados antes de mirar (`&#106;avascript:`).
      const url = (valor ?? "").trim();
      if (url && !destinoPeligroso(url)) limpio = url;
    } else if (
      ATRIBUTOS.has(nombre) ||
      /^aria-[a-z-]+$/.test(nombre) ||
      /^data-[a-z0-9-]+$/.test(nombre)
    ) {
      limpio = valor ?? "";
    }

    if (limpio === null) continue;
    vistos.add(nombre);
    salida += valor === undefined ? ` ${nombre}` : ` ${nombre}="${escaparAtributo(limpio)}"`;
  }
  return salida;
}

// ── Marcas internas ─────────────────────────────────────────────────────────
//
// El saneado aparta trozos ya limpios con una marca de control (NUL) que se
// QUITA antes de la entrada, así que nadie puede forjarla. Las
// expresiones que la buscan se construyen desde la constante en
// vez de escribir `\u0000` dentro de un literal /…/: `no-control-regex` lo
// prohíbe —con razón en general: casi siempre es un error— y aquí el carácter
// de control es justo lo que se busca. Para quitarla basta `replaceAll`.
const NULO = String.fromCharCode(0);
const RE_APARTADO = new RegExp(`${NULO}(\\d+)${NULO}`, "g");

/**
 * Quita los caracteres de control C0 (U+0000–U+001F), el espacio y la barra
 * invertida: los navegadores los ignoran dentro de un esquema (`java\tscript:`),
 * así que se compara sin ellos. Equivale a la clase de regex «de U+0000 a U+0020
 * más la barra invertida» que había aquí.
 */
function sinControlesNiBlancos(texto: string): string {
  let salida = "";
  for (const ch of texto) {
    if (ch.charCodeAt(0) > 0x20 && ch !== "\\") salida += ch;
  }
  return salida;
}

/**
 * HTML (o markdown con HTML dentro) → lo mismo con solo lo permitido.
 *
 * Idempotente: sanear dos veces da lo mismo que una. Lo que no es una
 * etiqueta (`a < b`, `<3`) se deja como está.
 */
export function sanearHtml(entrada: unknown): string {
  if (typeof entrada !== "string" || entrada === "")
    return typeof entrada === "string" ? entrada : "";

  let html = entrada
    // El nulo se usa abajo como marca; en un texto no pinta nada.
    .replaceAll(NULO, "")
    // Comentarios, CDATA y declaraciones: nada que mostrar y un escondite fácil.
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/gi, "")
    .replace(/<![^>]*>?/g, "")
    .replace(/<\?[^>]*>?/g, "");

  // Fuera, con lo que llevan dentro. Sin cierre, hasta el final: un `<script>`
  // sin cerrar lo es igual para el navegador.
  for (const etiqueta of CON_CONTENIDO) {
    const re = new RegExp(`<${etiqueta}\\b[\\s\\S]*?(?:<\\/${etiqueta}\\s*>|$)`, "gi");
    html = html.replace(re, "");
    html = html.replace(new RegExp(`<\\/${etiqueta}\\s*>`, "gi"), "");
  }

  // Autoenlaces de markdown (`<https://…>`, `<a@b.c>`). NO se conservan en
  // crudo: para el navegador `<x@x/onfocus=…>` y `<https://x/onfocus=…>` SON
  // etiquetas (la `/` corta el nombre) con un manejador de eventos, y apartarlas
  // tal cual las libraba de la lista blanca (XSS, auditoría 2026-10-25). Se
  // reescriben como un `<a>` construido aquí, con el destino escapado: el mismo
  // enlace y nada más. Los de otro esquema (`<javascript:…>`) caen abajo.
  const apartados: string[] = [];
  const apartar = (trozo: string) => {
    apartados.push(trozo);
    return `\u0000${apartados.length - 1}\u0000`;
  };
  html = html.replace(
    /<((?:https?|mailto):[^\s<>"'`]+|[^\s<>@"'`/=]+@[^\s<>@"'`/=]+)>/gi,
    (_t, dentro: string) => {
      const destino = /^(?:https?|mailto):/i.test(dentro) ? dentro : `mailto:${dentro}`;
      return apartar(`<a href="${escaparAtributo(destino)}">${escaparTexto(dentro)}</a>`);
    }
  );

  // Cada etiqueta, reconstruida desde la lista blanca.
  html = html.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_todo, cierre: string, nombreCrudo: string, resto: string) => {
      const nombre = nombreCrudo.toLowerCase();
      if (!ETIQUETAS.has(nombre)) return "";
      if (cierre) return apartar(`</${nombre}>`);
      const autocierre = /\/\s*$/.test(resto);
      return apartar(
        `<${nombre}${atributosLimpios(resto.replace(/\/\s*$/, ""))}${autocierre ? " /" : ""}>`
      );
    }
  );

  // Un `<` que sigue abriendo algo (etiqueta sin `>`) se neutraliza.
  html = html.replace(/<(?=[a-zA-Z/!?])/g, "&lt;");

  return html.replace(RE_APARTADO, (_t, i: string) => apartados[Number(i)] ?? "");
}

/**
 * Markdown: el HTML que lleve dentro, saneado, y además los destinos de enlace
 * e imagen con un esquema que no sea de la lista blanca, anulados.
 *
 * `marked` no sanea los destinos: `[x](javascript:alert(1))` sale como `<a>`.
 */
export function sanearMarkdown(entrada: unknown): string {
  if (typeof entrada !== "string") return "";
  return (
    sanearHtml(entrada)
      // [texto](destino …) e ![alt](destino …)
      .replace(/(\]\(\s*<?)([^)\s>]*)/g, (todo, pre: string, destino: string) =>
        destinoPeligroso(destino) ? `${pre}#` : todo
      )
      // Definiciones de referencia: [id]: destino
      .replace(/^(\s{0,3}\[[^\]]+\]:\s*<?)(\S*)/gm, (todo, pre: string, destino: string) =>
        destinoPeligroso(destino) ? `${pre}#` : todo
      )
  );
}

/** Código → carácter; fuera de rango (que haría lanzar a `fromCodePoint`), un blanco. */
function caracter(codigo: number): string {
  return Number.isInteger(codigo) && codigo > 0 && codigo <= 0x10ffff
    ? String.fromCodePoint(codigo)
    : " ";
}

/** ¿Lleva esquema y no es uno de los permitidos? (entidades y blancos incluidos) */
function destinoPeligroso(destino: string): boolean {
  const normal = sinControlesNiBlancos(
    destino
      .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => caracter(parseInt(h, 16)))
      .replace(/&#([0-9]+);?/g, (_, d: string) => caracter(Number(d)))
      .replace(/&colon;/gi, ":")
      .replace(/&tab;|&newline;/gi, "")
  ).toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:/.test(normal)) return false; // relativo: no ejecuta
  return !/^(https?|mailto|tel):/.test(normal);
}

/**
 * Recorre un valor de bloque y anula las URL peligrosas en claves que son URL
 * (`url`, `ctaUrl`, `href`, `linkUrl`, `src`, `image`…). La web pinta esos
 * campos como `href`/`src` sin pasar por el renderizador compartido.
 */
const CLAVE_URL = /(url|href|src|link)$/i;

function sanearUrlsDe(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 20) return valor;
  if (Array.isArray(valor)) return valor.map((v) => sanearUrlsDe(v, profundidad + 1));
  if (!valor || typeof valor !== "object") return valor;
  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof v === "string" && CLAVE_URL.test(clave) && destinoPeligroso(v.trim())) {
      salida[clave] = "";
    } else {
      salida[clave] = sanearUrlsDe(v, profundidad + 1);
    }
  }
  return salida;
}
// ── FIN DE LA COPIA ──────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// LO PROPIO DE LAS PÁGINAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hosts cuyos `<iframe>` se aceptan en un bloque `embed`. Un incrustado es
 * HTML a propósito, pero lo que se incrusta de verdad son reproductores; un
 * `<script>` o un iframe de cualquier sitio no lo son.
 */
const HOSTS_INCRUSTABLES = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.vimeo.com",
  "player.twitch.tv",
  "clips.twitch.tv",
  "open.spotify.com",
  "www.google.com",
  "maps.google.com",
  "docs.google.com",
  "w.soundcloud.com",
]);

const ATRIBUTOS_IFRAME = new Set([
  "width",
  "height",
  "title",
  "allow",
  "allowfullscreen",
  "loading",
  "referrerpolicy",
  "frameborder",
]);

/** `embed.code`: solo iframes de los hosts de arriba; el resto, como HTML saneado. */
const MARCA_IFRAME = String.fromCharCode(1);
const RE_IFRAME = new RegExp(`${MARCA_IFRAME}(\\d+)${MARCA_IFRAME}`, "g");

export function sanearIncrustado(codigo: unknown): string {
  if (typeof codigo !== "string") return "";
  const iframes: string[] = [];
  // `\u0001` es la marca de abajo: fuera de la entrada para que no se pueda forjar.
  const sinIframes = codigo
    .replaceAll(MARCA_IFRAME, "")
    .replace(
      /<iframe\b((?:[^>"']|"[^"]*"|'[^']*')*)>(?:[\s\S]*?<\/iframe\s*>)?/gi,
      (_t, attrs: string) => {
        let src = "";
        let resto = "";
        for (const m of attrs.matchAll(RE_ATRIBUTO)) {
          const nombre = m[1]!.toLowerCase();
          const valor = m[2] ?? m[3] ?? m[4];
          if (nombre === "src") src = valor ?? "";
          else if (ATRIBUTOS_IFRAME.has(nombre)) {
            resto += valor === undefined ? ` ${nombre}` : ` ${nombre}="${escaparAtributo(valor)}"`;
          }
        }
        let host = "";
        try {
          const u = new URL(src);
          if (u.protocol === "https:") host = u.hostname.toLowerCase();
        } catch {
          host = "";
        }
        if (!HOSTS_INCRUSTABLES.has(host)) return "";
        iframes.push(`<iframe src="${escaparAtributo(src)}"${resto}></iframe>`);
        return `\u0001${iframes.length - 1}\u0001`;
      }
    );
  return sanearHtml(sinIframes).replace(RE_IFRAME, (_t, i: string) => iframes[Number(i)] ?? "");
}

/**
 * El `content` de un bloque de página, listo para guardar o servir.
 *
 *   · `text`/`richtext`: `text`/`content` según su `format` (html, markdown;
 *     `plain` se deja, el frontend lo escapa).
 *   · `embed`: `code` con `sanearIncrustado`.
 *   · Cualquier bloque: las URL en claves de URL (`url`, `buttonUrl`,
 *     `linkUrl`, `embedUrl`…) con esquema peligroso, vaciadas.
 */
export function sanearContenidoDeBloque(tipo: unknown, contenido: unknown): unknown {
  if (!contenido || typeof contenido !== "object" || Array.isArray(contenido)) {
    return sanearUrlsDe(contenido);
  }
  const c = sanearUrlsDe(contenido) as Record<string, unknown>;
  const formato = c.format;
  for (const clave of ["text", "content", "html", "body"]) {
    const v = c[clave];
    if (typeof v !== "string") continue;
    if (tipo === "embed") continue;
    if (formato === "plain") continue;
    c[clave] = formato === "html" || clave === "html" ? sanearHtml(v) : sanearMarkdown(v);
  }
  if (tipo === "embed" && typeof c.code === "string") c.code = sanearIncrustado(c.code);
  return c;
}

/**
 * Clases y colores de un bloque o página: van a `class="…"` y `style="…"` en
 * el frontend. Se admite lo que escribe Tailwind (`md:p-4`, `bg-[#111]`,
 * `w-1/2`) y colores CSS; nada de comillas, `<`, `;` ni `{`.
 */
const RE_CLASES = /^[\w\s:/.\-[\]#%()!,]*$/;
const RE_COLOR = /^[#\w\s(),.%-]*$/;

export function estiloInvalido(campos: Record<string, unknown>): string | null {
  for (const clave of ["cssClass"]) {
    const v = campos[clave];
    if (
      v !== undefined &&
      v !== null &&
      (typeof v !== "string" || !RE_CLASES.test(v) || v.length > 200)
    ) {
      return `\`${clave}\` solo admite clases`;
    }
  }
  for (const clave of ["backgroundColor", "textColor", "padding"]) {
    const v = campos[clave];
    if (
      v !== undefined &&
      v !== null &&
      (typeof v !== "string" || !RE_COLOR.test(v) || v.length > 50)
    ) {
      return `\`${clave}\` no es un valor válido`;
    }
  }
  return null;
}

/**
 * `customCss` de una página: CSS, no una vía para cerrar el `<style>` y abrir
 * un `<script>` (`</style><script>…`), ni para cargar hojas o comportamientos
 * de fuera.
 */
export function cssInvalido(css: unknown): string | null {
  if (css === undefined || css === null) return null;
  if (typeof css !== "string") return "`customCss` tiene que ser texto";
  if (css.length > 50_000) return "`customCss` es demasiado largo";
  if (/<|@import|javascript:|expression\s*\(|behavior\s*:|-moz-binding/i.test(css)) {
    return "`customCss` lleva algo que no es CSS de presentación (`<`, `@import`, `javascript:`…)";
  }
  return null;
}
