/**
 * Bloques → HTML. UN renderizador, dos consumidores.
 * ============================================================================
 *
 * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────────────
 *
 * `blog_posts.blocks` se editaba, se guardaba y la API lo servía… y NADIE lo
 * pintaba. Buscando `PageBlock` en todo el árbol solo aparecía en componentes
 * del panel: el constructor de bloques producía datos que ninguna página podía
 * mostrar. Desde el editor se veía así:
 *
 *   · añades una galería en la pestaña «Bloques»
 *   · miras la vista previa
 *   · sale exactamente igual que un post sin bloques
 *
 * Que no se lee como «la vista previa no los soporta» sino como «no se ha
 * guardado».
 *
 * ── POR QUE VIVE EN `shared` ───────────────────────────────────────────────
 *
 * Porque tiene que haber UNO SOLO. Si el panel pinta la vista previa con su
 * renderizador y el sitio público con otro, la vista previa deja de ser una
 * vista previa: enseña algo que nadie va a publicar. `@kitsuden/shared` es el
 * único paquete del que dependen a la vez el panel y `kon-blog`.
 *
 * ── LO QUE NO SE PUEDE RENDERIZAR ESTATICAMENTE ────────────────────────────
 *
 * Seis de los trece bloques son interactivos o consultan datos en vivo: un
 * mapa con miles de marcadores, una rejilla sobre un dataset, un carrusel que
 * pregunta por los juegos más recientes. Eso NO se resuelve con HTML estático,
 * y fingir que sí es peor que no hacerlo: se maquetaría sobre un resultado
 * falso.
 *
 * Para esos se emite un contenedor con `data-kitsuden-block` y su configuración
 * en JSON, para que el sitio lo hidrate, más un contenido de reserva legible.
 * Cada uno declara `interactivo: true` para que quien renderice sepa que lo que
 * ve es un hueco y no el resultado.
 *
 * ── SEGURIDAD ──────────────────────────────────────────────────────────────
 *
 * Todo dato de usuario se escapa. El único punto por donde puede entrar HTML es
 * un bloque `richtext` con `format: "html"`, y ahí hace falta un saneador
 * INYECTADO: sin él el HTML se escapa y se ve como texto. Se falla del lado
 * seguro a propósito — el que olvide pasar el saneador obtiene contenido feo,
 * no un XSS almacenado en todas las páginas del blog.
 */

import { Marked } from "marked";

/** Un bloque tal y como lo guarda el editor en la columna `blocks`. */
export interface BloqueDeContenido {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  order?: number;
}

export interface OpcionesDeRender {
  /**
   * Markdown → HTML. **No hace falta pasarla**: hay un valor por defecto.
   *
   * ── POR QUE HAY DEFECTO Y NO SE EXIGE AL LLAMANTE ────────────────────────
   *
   * Porque cuando cada llamante traía el suyo, cada uno se dejó una mitad
   * distinta y el resultado divergió EN SILENCIO. Medido:
   *
   *     API   : <div class="ks-richtext"><pre># Hola</pre></div>
   *     Panel : <div class="ks-richtext"><h1>Hola</h1></div>
   *
   * La vista previa enseñaba un encabezado y el sitio publicaba el markdown en
   * crudo. Nada falla, nada avisa, y el editor toma decisiones sobre algo que
   * no se va a publicar — que es exactamente lo que este módulo existía para
   * impedir.
   *
   * Un defecto compartido convierte «acordarse de pasar lo mismo en los dos
   * sitios» en «no hay nada que pasar».
   */
  markdownAHtml?: (md: string) => string;

  /**
   * Sanea HTML ajeno. Sin ella, el HTML se ESCAPA.
   *
   * No es una comodidad: `richtext` con `format: "html"` es texto que alguien
   * escribió y que va a acabar en una página pública. Emitirlo crudo es un XSS
   * almacenado.
   *
   * NINGUN llamante pasa una hoy, y es deliberado: el saneador del blog
   * (`sanitizeHTML`) necesita `DOMParser`, que en el runtime de la API NO
   * EXISTE —comprobado en el contenedor: `typeof DOMParser === "undefined"`—,
   * así que allí caía a arrancar todas las etiquetas mientras el panel las
   * escapaba. Dos comportamientos para el mismo dato.
   *
   * Hasta que haya un saneador que funcione igual en servidor y navegador, el
   * HTML se escapa en los dos sitios. Se ve feo y se ve IGUAL.
   */
  sanearHtml?: (html: string) => string;

  /**
   * Prefijo de las clases CSS. El sitio y el panel maquetan distinto y así no
   * se pisan.
   */
  prefijo?: string;
}

export interface ResultadoDeRender {
  html: string;
  /** Tipos que se han emitido como hueco a hidratar, sin repetir. */
  interactivos: string[];
  /** Tipos que no conoce este renderizador. */
  desconocidos: string[];
}

/** Escapa para texto y para atributos. */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Una URL que se pueda poner en `href`/`src` sin abrir un agujero.
 *
 * `javascript:`, `data:` y `vbscript:` en un `href` ejecutan código al pulsar.
 * Las relativas y las de esquema conocido pasan; el resto se descarta y deja el
 * atributo vacío.
 */
export function urlSegura(valor: unknown): string {
  const url = String(valor ?? "").trim();
  if (!url) return "";
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  // Relativas y anclas: no pueden llevar esquema, así que no ejecutan nada.
  if (/^[/#?]/.test(url)) return url;
  return "";
}

/**
 * Markdown → HTML por defecto. La usan la API y el panel, así que es la misma.
 *
 * ── POR QUE SE ESCAPA EL `<` ANTES DE CONVERTIR ────────────────────────────
 *
 * `marked` NO sanea: desde la versión 5 no tiene opción `sanitize`, y markdown
 * admite HTML en línea, así que un `<script>` escrito en el cuerpo saldría tal
 * cual en todas las páginas donde aparezca el bloque.
 *
 * Se escapa SOLO el `<`. Es lo justo para que ninguna etiqueta llegue a
 * formarse, y deja intacto el resto de la sintaxis — en particular el `>` de
 * las citas, que escapándolo también dejarían de funcionar.
 */
function markdownPorDefecto(md: string): string {
  return markdownSeguro(md);
}

/**
 * ── Y LOS ENLACES TAMBIÉN ──────────────────────────────────────────────────
 *
 * Escapar el `<` impide que se forme una etiqueta, pero no toca la sintaxis
 * de markdown: `[pulsa](javascript:alert(1))` salía como un `<a>` con ese href
 * y ejecutaba al hacer clic. Aquí los `href`/`src` pasan por `urlSegura`: lo
 * que no es http(s), mailto, tel o relativo se queda en texto, sin enlace.
 *
 * Importa más en la wiki que en los bloques: un bloque lo escribe un editor,
 * una página de wiki cualquier sesión.
 */
const markdownConEnlacesSeguros = new Marked({
  renderer: {
    link({ href, title, tokens }) {
      const texto = this.parser.parseInline(tokens);
      const seguro = urlSegura(href);
      if (!seguro) return texto;
      const titulo = title ? ` title="${escaparHtml(title)}"` : "";
      return `<a href="${escaparHtml(seguro)}"${titulo}>${texto}</a>`;
    },
    image({ href, title, text }) {
      const seguro = urlSegura(href);
      if (!seguro) return escaparHtml(text);
      const titulo = title ? ` title="${escaparHtml(title)}"` : "";
      return `<img src="${escaparHtml(seguro)}" alt="${escaparHtml(text)}"${titulo}>`;
    },
  },
});

/** Markdown → HTML sin etiquetas colables ni enlaces que ejecuten código. */
export function markdownSeguro(md: string): string {
  return markdownConEnlacesSeguros.parse(md.replace(/</g, "&lt;"), { async: false }) as string;
}

const RELACION_ASPECTO: Record<string, string> = {
  "16:9": "56.25%",
  "4:3": "75%",
  "1:1": "100%",
};

/**
 * Bloques que NO se pueden pintar estáticamente.
 * ============================================================================
 *
 * Cada uno declara DOS textos, y la distinción es el arreglo de un fallo real:
 *
 *   · `etiqueta` — lo que ve una PERSONA. Sale en la página pública cuando el
 *     sitio todavía no ha hidratado el bloque, y lo leen también los
 *     buscadores y los lectores de pantalla.
 *   · `porque` — lo que lee quien PROGRAMA el frontend. Explica por qué esto
 *     no puede servirse como HTML estático.
 *
 * ── EL FALLO ───────────────────────────────────────────────────────────────
 *
 * Antes había un solo texto y se pintaba el de programador, en el sitio donde
 * lo lee el visitante:
 *
 *     tier-list — Referencia una plantilla de kon-tierlist; sus filas viven en
 *     esa tabla.
 *
 * Eso salía en medio de un artículo publicado, con el identificador del bloque
 * en negrita y una frase sobre tablas de base de datos. Quien no hidrate —o a
 * quien le falle el script— publica jerga interna a sus lectores.
 *
 * La nota no se pierde: viaja como comentario HTML, que es donde la busca
 * quien está mirando el código fuente para implementar la hidratación.
 */
interface BloqueInteractivo {
  /** Para el lector. Corto, humano, sin identificadores. */
  etiqueta: string;
  /** Para quien programa el frontend. No se pinta. */
  porque: string;
}

const INTERACTIVOS: Record<string, BloqueInteractivo> = {
  "tier-list": {
    etiqueta: "Tier list",
    porque: "Referencia una plantilla de kon-tierlist; sus filas viven en esa tabla.",
  },
  "character-builder": {
    etiqueta: "Character builder",
    porque:
      "Aplicación de kon-builder: el lector configura, el motor calcula y devuelve un código.",
  },
  comments: {
    etiqueta: "Comentarios",
    porque: "Hilo de kon-comments: se lee con la sesión del lector y cambia al responder.",
  },
  "game-map": {
    etiqueta: "Mapa",
    porque: "Mapa con marcadores: necesita zoom, capas y agrupación en el cliente.",
  },
  "dynamic-carousel": {
    etiqueta: "Carrusel",
    porque: "Consulta juegos o streamers en vivo cada vez que se pinta.",
  },
  "smart-filter": {
    etiqueta: "Filtros",
    porque: "Filtros que el lector maneja; sin JavaScript no filtran nada.",
  },
  "smart-grid": {
    etiqueta: "Rejilla",
    porque: "Rejilla sobre un dataset, con orden y agrupación en el cliente.",
  },
  "comparison-slider": {
    etiqueta: "Comparación de imágenes",
    porque: "El deslizador es interacción; sin él son dos imágenes sueltas.",
  },
  "habitat-map": {
    etiqueta: "Mapa de hábitats",
    porque: "Lee un dataset y agrupa sus filas por región; el lector filtra y cambia de región.",
  },
  "stat-compare": {
    etiqueta: "Comparador",
    porque: "El lector elige qué filas del dataset comparar; los stats se leen en vivo.",
  },
  "event-search": {
    etiqueta: "Buscador de eventos",
    porque:
      "El lector escribe y la lista se filtra en el cliente sobre las filas que ya trae la página.",
  },
  "race-planner": {
    etiqueta: "Calendario de carreras",
    porque:
      "El lector elige turno y filtros; el calendario se arma en el cliente con las filas del dataset.",
  },
  affinity: {
    etiqueta: "Calculadora de afinidad",
    porque:
      "El lector elige entrenada, progenitores y abuelos; los puntos de parentesco se suman en el cliente.",
  },
  dex: {
    etiqueta: "Índice con fichas",
    porque:
      "Filtra y ordena las filas de un dataset en el cliente; cada ficha compone varios datasets.",
  },
  "card-browser": {
    etiqueta: "Catálogo de cartas",
    porque:
      "El lector busca y filtra; un catálogo de miles de cartas se pagina contra la API, no cabe en la página.",
  },
  "deck-builder": {
    etiqueta: "Constructor de mazos",
    porque:
      "Cada cambio del mazo se valida contra las reglas del juego, y la mano de prueba se reparte al pulsar.",
  },
  "deck-showcase": {
    etiqueta: "Escaparate de mazos",
    porque: "La galería se ordena y se filtra en vivo, y el «me gusta» escribe.",
  },
  deck: {
    etiqueta: "Mazo del meta",
    porque:
      "Solo referencia un arquetipo o una lista por su id: sus cartas y su cuota se leen al pintar, para que el artículo no envejezca con una copia dentro.",
  },
};

/**
 * Texto seguro dentro de un comentario HTML.
 *
 * Un `--` cierra el comentario antes de tiempo y el resto de la nota se
 * convertiría en marcado. Las notas son literales nuestros y hoy no llevan
 * ninguno, pero eso es una propiedad de este fichero hoy, no una garantía.
 */
function notaSegura(texto: string): string {
  return texto.replace(/-{2,}/g, "-").replace(/>/g, "");
}

/** Contenedor para que el sitio hidrate lo que aquí no se puede resolver. */
function hueco(
  tipo: string,
  datos: Record<string, unknown>,
  prefijo: string,
  interior: string
): string {
  const config = escaparHtml(JSON.stringify(datos ?? {}));
  return (
    `<div class="${prefijo}block ${prefijo}block--${escaparHtml(tipo)}" ` +
    `data-kitsuden-block="${escaparHtml(tipo)}" data-kitsuden-config="${config}">` +
    interior +
    `</div>`
  );
}

/**
 * Segundos a partir de un `t=` de YouTube: `90`, `1m30s`, `1h2m3s`.
 *
 * Se admiten las tres formas porque las tres salen del propio YouTube según
 * dónde pulses «compartir», y quien pega un enlace con marca de tiempo espera
 * que el vídeo empiece ahí.
 */
function segundosDe(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);

  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;

  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * La URL que SÍ se puede meter en un `<iframe>`.
 *
 * ── POR QUE HACE FALTA ─────────────────────────────────────────────────────
 *
 * Un enlace normal de YouTube NO se puede incrustar. Comprobado con `curl`:
 *
 *     GET https://www.youtube.com/watch?v=…    X-Frame-Options: SAMEORIGIN
 *     GET https://www.youtube.com/embed/…      (sin X-Frame-Options)
 *
 * Es decir: el bloque «Embed» aceptaba la URL que cualquiera copia de la barra
 * del navegador —su propio marcador de posición decía `youtube.com/watch?v=…`—
 * y el resultado era un MARCO EN BLANCO. Ni error, ni aviso: el bloque se
 * guardaba bien y en la página no había vídeo.
 *
 * Arreglarlo aquí y no en el editor tiene una razón: así también funcionan los
 * bloques YA GUARDADOS con la URL mala, sin tocarlos uno por uno.
 *
 * Lo que no reconoce se devuelve tal cual: hay servicios que sí admiten su URL
 * normal, y adivinar de más rompería los que hoy funcionan.
 */
export function urlDeIncrustacion(valor: unknown): string {
  const url = urlSegura(valor);
  if (!url) return "";

  let u: URL;
  try {
    u = new URL(url, "https://example.invalid");
  } catch {
    return url;
  }

  const host = u.hostname.replace(/^www\./, "");

  // ── YouTube ───────────────────────────────────────────────────────────────
  const esYouTube = host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  const esNoCookie = host === "youtube-nocookie.com";

  if (esYouTube || esNoCookie) {
    let id: string | null = null;

    if (host === "youtu.be") {
      id = u.pathname.slice(1).split("/")[0] || null;
    } else if (u.pathname === "/watch") {
      id = u.searchParams.get("v");
    } else {
      // `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID`
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }

    if (!id || !/^[\w-]{6,20}$/.test(id)) return url;

    // El dominio se conserva: quien puso `-nocookie` a propósito no quiere que
    // se lo cambiemos por el normal.
    const dominio = esNoCookie ? "www.youtube-nocookie.com" : "www.youtube.com";
    const destino = new URL(`https://${dominio}/embed/${id}`);

    const inicio = segundosDe(u.searchParams.get("t") ?? u.searchParams.get("start"));
    if (inicio) destino.searchParams.set("start", String(inicio));

    // Una lista de reproducción sigue siendo válida en el embed.
    const lista = u.searchParams.get("list");
    if (lista) destino.searchParams.set("list", lista);

    return destino.toString();
  }

  // ── Vimeo ─────────────────────────────────────────────────────────────────
  if (host === "vimeo.com") {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }

  /**
   * Twitch se queda fuera A PROPOSITO: su reproductor exige un parametro
   * `parent` con el dominio desde el que se sirve, y eso aqui no se sabe —el
   * mismo contenido puede publicarse en varios dominios—. Ponerlo mal da un
   * marco en blanco, que es justo lo que esto viene a evitar. Lo resuelve el
   * sitio al hidratar, como los demas bloques interactivos.
   */

  return url;
}

/** El embed de directo de cada plataforma. `null` si no se reconoce. */
function urlDeStreamer(plataforma: string, canal: string): string | null {
  const c = encodeURIComponent(canal);
  switch (plataforma) {
    case "twitch":
      // Twitch exige `parent`; lo pone el sitio al hidratar, aquí se deja el
      // canal identificado y el contenedor listo.
      return `https://player.twitch.tv/?channel=${c}`;
    case "youtube":
      return `https://www.youtube.com/embed/live_stream?channel=${c}`;
    case "kick":
      return `https://player.kick.com/${c}`;
    default:
      return null;
  }
}

/**
 * Pinta una lista de bloques.
 *
 * Ordena por `order` porque el array puede venir en cualquier orden: es jsonb,
 * y quien lo escriba por API no tiene por qué respetar la posición.
 */
export function renderizarBloques(
  bloques: BloqueDeContenido[] | null | undefined,
  opciones: OpcionesDeRender = {}
): ResultadoDeRender {
  const prefijo = opciones.prefijo ?? "ks-";
  const interactivos = new Set<string>();
  const desconocidos = new Set<string>();

  if (!Array.isArray(bloques) || bloques.length === 0) {
    return { html: "", interactivos: [], desconocidos: [] };
  }

  const ordenados = [...bloques].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));

  const partes = ordenados.map((bloque) => {
    const tipo = String(bloque?.type ?? "");
    const d = (bloque?.data ?? {}) as Record<string, any>;

    switch (tipo) {
      // ── Estáticos de verdad ────────────────────────────────────────────────
      case "hero": {
        const fondo = urlSegura(d.imageUrl);
        const capa =
          d.overlay === "none" ? "" : ` ${prefijo}hero--${escaparHtml(d.overlay ?? "dark")}`;
        const botones = [
          d.ctaLabel && urlSegura(d.ctaUrl)
            ? `<a class="${prefijo}cta" href="${escaparHtml(urlSegura(d.ctaUrl))}">${escaparHtml(d.ctaLabel)}</a>`
            : "",
          d.ctaSecondaryLabel && urlSegura(d.ctaSecondaryUrl)
            ? `<a class="${prefijo}cta ${prefijo}cta--sec" href="${escaparHtml(urlSegura(d.ctaSecondaryUrl))}">${escaparHtml(d.ctaSecondaryLabel)}</a>`
            : "",
        ].join("");

        return (
          `<section class="${prefijo}hero${capa}"` +
          (fondo ? ` style="background-image:url('${escaparHtml(fondo)}')"` : "") +
          `>` +
          `<h2>${escaparHtml(d.title)}</h2>` +
          (d.subtitle ? `<p>${escaparHtml(d.subtitle)}</p>` : "") +
          (botones ? `<div class="${prefijo}hero-ctas">${botones}</div>` : "") +
          `</section>`
        );
      }

      case "richtext": {
        const texto = String(d.content ?? "");
        if (!texto) return "";

        if (d.format === "html") {
          // Sin saneador NO se emite HTML. Ver la nota de seguridad de arriba.
          const seguro = opciones.sanearHtml
            ? opciones.sanearHtml(texto)
            : `<pre>${escaparHtml(texto)}</pre>`;
          return `<div class="${prefijo}richtext">${seguro}</div>`;
        }

        const html = (opciones.markdownAHtml ?? markdownPorDefecto)(texto);
        return `<div class="${prefijo}richtext">${html}</div>`;
      }

      case "image-gallery": {
        const imagenes = Array.isArray(d.images) ? d.images : [];
        if (imagenes.length === 0) {
          return `<div class="${prefijo}gallery ${prefijo}vacio">Galería sin imágenes</div>`;
        }
        const columnas = Number(d.columns) > 0 ? Number(d.columns) : 3;
        const celdas = imagenes
          .map((img: any) => {
            const src = urlSegura(img?.url);
            if (!src) return "";
            return (
              `<figure>` +
              `<img src="${escaparHtml(src)}" alt="${escaparHtml(img?.alt ?? "")}" loading="lazy">` +
              (img?.caption ? `<figcaption>${escaparHtml(img.caption)}</figcaption>` : "") +
              `</figure>`
            );
          })
          .join("");

        return (
          `<div class="${prefijo}gallery ${prefijo}gallery--${escaparHtml(d.layout ?? "grid")}" ` +
          `style="--ks-cols:${columnas}">${celdas}</div>`
        );
      }

      case "embed": {
        // `urlDeIncrustacion` y no `urlSegura` a secas: un enlace normal de
        // YouTube no se puede meter en un iframe y sale en blanco.
        const src = urlDeIncrustacion(d.url);
        if (!src) return "";
        const alto = RELACION_ASPECTO[String(d.aspectRatio ?? "16:9")] ?? "56.25%";
        return (
          `<figure class="${prefijo}embed">` +
          `<div style="position:relative;padding-bottom:${alto};height:0;overflow:hidden">` +
          `<iframe src="${escaparHtml(src)}" loading="lazy" allowfullscreen ` +
          `style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>` +
          `</div>` +
          (d.caption ? `<figcaption>${escaparHtml(d.caption)}</figcaption>` : "") +
          `</figure>`
        );
      }

      case "callout": {
        const variante = escaparHtml(d.variant ?? "info");
        return (
          `<aside class="${prefijo}callout ${prefijo}callout--${variante}">` +
          (d.title ? `<p class="${prefijo}callout-titulo">${escaparHtml(d.title)}</p>` : "") +
          `<p>${escaparHtml(d.content)}</p>` +
          `</aside>`
        );
      }

      case "facebook-group": {
        // Una tarjeta con enlace, no un iframe: Facebook ya no deja incrustar grupos y su
        // script cargaría cookies y seguimiento sin que nadie lo pulse. Solo enlaces de facebook.com.
        const href = urlSegura(d.url);
        if (!/^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^\s"'<>]+$/i.test(href)) return "";
        const titulo = String(d.title ?? "").trim() || "Únete a nuestro grupo de Facebook";
        const texto =
          String(d.description ?? "").trim() ||
          "Comparte tus builds, resuelve dudas y charla con la comunidad.";
        const boton = String(d.ctaLabel ?? "").trim() || "Unirme al grupo";
        return (
          `<aside class="${prefijo}facebook-group" style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;` +
          `margin:24px 0;padding:18px 20px;border-radius:16px;border:1px solid rgba(24,119,242,.35);background:rgba(24,119,242,.08)">` +
          `<span aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;` +
          `border-radius:999px;background:#1877f2;color:#fff;flex:none">` +
          `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg></span>` +
          `<div style="flex:1 1 240px;min-width:0">` +
          `<p style="margin:0;font-weight:700;font-size:1.05rem">${escaparHtml(titulo)}</p>` +
          `<p style="margin:4px 0 0;opacity:.75;font-size:.9rem;line-height:1.5">${escaparHtml(texto)}</p></div>` +
          `<a href="${escaparHtml(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 20px;` +
          `border-radius:6px;background:#1877f2;color:#fff;font-weight:600;font-size:.9rem;text-decoration:none">${escaparHtml(boton)}</a>` +
          `</aside>`
        );
      }

      case "divider": {
        const estilo = escaparHtml(d.style ?? "line");
        return estilo === "space"
          ? `<div class="${prefijo}espacio"></div>`
          : `<hr class="${prefijo}divider ${prefijo}divider--${estilo}">`;
      }

      case "streamer-widget": {
        // Este SI se puede pintar: es un iframe de la plataforma.
        const src = urlDeStreamer(String(d.platform ?? ""), String(d.channelName ?? ""));
        if (!src) {
          desconocidos.add(`streamer-widget:${d.platform}`);
          return "";
        }
        return (
          `<div class="${prefijo}streamer" data-kitsuden-block="streamer-widget" ` +
          `data-kitsuden-config="${escaparHtml(JSON.stringify(d))}">` +
          `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden">` +
          `<iframe src="${escaparHtml(src)}" allowfullscreen ` +
          `style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>` +
          `</div></div>`
        );
      }

      // ── Los que necesitan hidratarse ──────────────────────────────────────
      default: {
        if (tipo in INTERACTIVOS) {
          interactivos.add(tipo);

          /**
           * Lo que ve quien no hidrata: buscadores, lectores de pantalla, un
           * `curl` — y el lector, si el script falla. Se nombra el bloque en
           * humano; un div vacío se lee como un fallo de maquetación, y el
           * identificador con una frase sobre tablas se lee como una fuga de
           * jerga interna, que es lo que era.
           */
          const reserva =
            `<p class="${prefijo}reserva">${escaparHtml(INTERACTIVOS[tipo].etiqueta)}</p>` +
            // La explicación técnica sigue disponible donde la busca quien va a
            // implementar la hidratación: el código fuente.
            `<!-- kitsuden: ${notaSegura(INTERACTIVOS[tipo].porque)} -->`;

          // El de comparación al menos puede enseñar sus dos imágenes.
          if (tipo === "comparison-slider") {
            const antes = urlSegura(d.beforeImageUrl);
            const despues = urlSegura(d.afterImageUrl);
            const figuras =
              antes && despues
                ? `<figure><img src="${escaparHtml(antes)}" alt="${escaparHtml(d.beforeLabel ?? "antes")}" loading="lazy"><figcaption>${escaparHtml(d.beforeLabel ?? "Antes")}</figcaption></figure>` +
                  `<figure><img src="${escaparHtml(despues)}" alt="${escaparHtml(d.afterLabel ?? "después")}" loading="lazy"><figcaption>${escaparHtml(d.afterLabel ?? "Después")}</figcaption></figure>`
                : reserva;
            return hueco(tipo, d, prefijo, figuras);
          }

          return hueco(tipo, d, prefijo, reserva);
        }

        desconocidos.add(tipo);
        return "";
      }
    }
  });

  return {
    html: partes.filter(Boolean).join("\n"),
    interactivos: [...interactivos],
    desconocidos: [...desconocidos],
  };
}

/** Los tipos que este renderizador sabe pintar del todo. */
export const TIPOS_ESTATICOS = [
  "hero",
  "richtext",
  "image-gallery",
  "embed",
  "callout",
  "facebook-group",
  "divider",
  "streamer-widget",
] as const;

/** Los que se emiten como hueco para hidratar. */
export const TIPOS_INTERACTIVOS = Object.keys(INTERACTIVOS);
