/**
 * Direcciones del sitio público
 * ============================================================================
 *
 * TODO va en ruta, dentro del dominio de su web:
 *
 *   1. Un juego vive en el primer segmento: `<dominio>/<juego>/`, y todo lo
 *      suyo cuelga de ahí, su wiki incluida (`/<juego>/wiki/`).
 *   2. Las secciones del sitio también: `/esports/`, `/torneos`, `/wikis`…
 *
 * Hasta el 2026-09-21 cada wiki (`<wiki>.<dominio>`) y esports
 * (`esports.<dominio>`) tenían subdominio propio. Un subdominio es otro origen:
 * no comparte sesión ni `localStorage`, hay que darlo de alta en CORS y el
 * buscador lo trata casi como otro sitio. Se quitaron para que todo sume a un
 * mismo dominio.
 *
 * Por eso lo que queda aquí es sobre RUTAS: qué primer segmento no puede ser
 * un juego, cómo es un slug válido y qué URL pública manda. kon-games lo usa
 * al crear un juego y el frontend al servirlo; con una copia en cada lado,
 * el panel acabaría aceptando un juego que el sitio no puede abrir.
 *
 * Todo es puro: sin red, sin entorno. Quien llama pasa la URL pública.
 */

// ─── Wikis ────────────────────────────────────────────────────────────────

/** Slug de wiki: minúsculas y dígitos separados por guiones sueltos. */
const SLUG_DE_WIKI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Por qué un slug NO sirve para una wiki, o `null` si sirve.
 *
 * El slug de una wiki ya no es una dirección (la dirección sale de su juego:
 * `/<juego>/wiki/`), sino su nombre en la API: `/api/wiki/wikis/<slug>`. Por
 * eso basta con que sea un slug limpio. Devuelve el motivo en vez de un
 * booleano porque el creador de wikis lo enseña tal cual.
 */
export function motivoDeSlugDeWikiInvalido(slug: string): string | null {
  if (typeof slug !== "string" || slug.length === 0) return "El slug está vacío.";
  if (slug.length > 63) return "El slug no puede pasar de 63 caracteres.";
  if (!SLUG_DE_WIKI.test(slug)) {
    return "Solo minúsculas, números y guiones sueltos, sin guion al principio ni al final.";
  }
  return null;
}

// ─── Juegos en el primer segmento ─────────────────────────────────────────

/**
 * Primeros segmentos de ruta que un juego no puede ocupar.
 *
 * El frontend sirve cada juego en `/<slug>/`, y las rutas fijas ganan a las
 * dinámicas: un juego con slug `blog` NO daría error — simplemente nadie
 * llegaría nunca a él, porque `/blog/` es el blog. Por eso se impide al crear
 * el juego, que es el único momento en que alguien puede hacer algo al
 * respecto.
 *
 * Aquí solo van las rutas que tiene CUALQUIER sitio hecho con Kitsuden (las
 * de los starters, las de Astro y las convenciones de la web). Las páginas
 * propias de cada sitio (`/torneos`, `/tienda`…) son de ese sitio: se
 * declaran en la API con `KITSUDEN_SEGMENTOS_RESERVADOS` (lista separada por
 * comas, ver `leerSegmentosReservados`) y el frontend pasa las suyas a
 * `motivoDeSlugDeJuegoInvalido`.
 */
export const SEGMENTOS_RESERVADOS_DEL_SITIO: ReadonlySet<string> = new Set([
  "academy",
  "api",
  "blog",
  "data",
  "games",
  "share",
  "wiki",
  "admin",
  "login",
  "logout",
  "register",
  "search",
  "feed",
  "rss",
  "sitemap",
  "robots",
  "favicon",
  "_astro",
  "_image",
  "_app",
  "_actions",
  "_server-islands",
  // Imágenes y medios servidos por el propio sitio (kitsuden-starter-basic)
  "img",
  "media",
  /**
   * `/legal` y sus documentos: un juego llamado `legal` taparía el aviso legal
   * y la política de privacidad, las páginas que la ley exige poder encontrar.
   */
  "legal",
  /**
   * El mapa del sitio y `robots.txt`. `sitemap` ocupa segmento de verdad
   * (`/sitemap/<seccion>.xml`), así que un juego con ese slug lo taparía; los
   * otros dos llevan punto y no podrían ser un slug, pero se reservan igual
   * para que la comprobación de «toda página de primer nivel» sea completa.
   */
  "sitemap-index.xml",
  "robots.txt",
]);

/**
 * Segmentos reservados de UN sitio, desde una lista separada por comas (la
 * variable `KITSUDEN_SEGMENTOS_RESERVADOS` de la API). Ignora espacios,
 * mayúsculas y entradas vacías.
 */
export function leerSegmentosReservados(valor: string | null | undefined): ReadonlySet<string> {
  return new Set(
    (valor ?? "")
      .split(",")
      .map((segmento) => segmento.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Slug de juego: minúsculas y dígitos separados por guiones sueltos. */
const SLUG_DE_JUEGO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Por qué un slug NO sirve para un juego, o `null` si sirve.
 *
 * `propios` son los segmentos reservados del sitio concreto (además de
 * `SEGMENTOS_RESERVADOS_DEL_SITIO`, que valen para todos).
 */
export function motivoDeSlugDeJuegoInvalido(
  slug: string,
  propios: Iterable<string> = []
): string | null {
  if (typeof slug !== "string" || slug.length === 0) return "El slug está vacío.";
  if (slug.length > 120) return "El slug no puede pasar de 120 caracteres.";
  if (!SLUG_DE_JUEGO.test(slug)) {
    return "El slug solo admite minúsculas, números y guiones sueltos entre palabras.";
  }
  if (SEGMENTOS_RESERVADOS_DEL_SITIO.has(slug) || new Set(propios).has(slug)) {
    return `«${slug}» es una ruta del sitio: el juego quedaría inaccesible en /${slug}/.`;
  }
  return null;
}

/**
 * Slug de juego a partir de un título.
 *
 * El que había (`toLowerCase().replace(/[^a-z0-9]+/g, "-")`) dejaba guiones en
 * los extremos y borraba las letras con tilde: «¡Pokémon!» daba `-pok-mon-`.
 */
export function slugDeJuego(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

// ─── Qué URL pública manda ────────────────────────────────────────────────

/**
 * El valor por defecto de `site_settings.site_url`. Existe en TODAS las
 * instalaciones aunque nadie lo haya escrito, así que no puede tratarse como
 * una decisión de quien administra.
 */
export const URL_PUBLICA_POR_DEFECTO = "http://localhost:4321";

/**
 * La URL pública efectiva: la del panel (Configuración general → Site URL) si
 * alguien la escribió, si no la del entorno, y si no la de desarrollo.
 *
 * El panel manda porque es donde la gente la cambia. Pero la columna nace con
 * `http://localhost:4321` en todas las bases: si ese valor ganara siempre, un
 * despliegue con `SITE_URL` bien puesto y el panel sin tocar anunciaría el
 * sitio en `localhost`. Por eso el valor por defecto NO cuenta como elegido,
 * y tampoco lo que no sea una URL http(s): un error de tecleo en el panel no
 * puede tumbar las direcciones.
 *
 * La usan la API y el frontend. Si cada lado priorizara distinto, cambiar el
 * dominio en el panel dejaría a uno de los dos con el viejo.
 */
export function urlPublicaEfectiva(
  delPanel: string | null | undefined,
  delEntorno: string | null | undefined
): string {
  const valida = (valor: string | null | undefined): string | null => {
    const limpio = valor?.trim();
    if (!limpio) return null;
    try {
      const url = new URL(limpio);
      return url.protocol === "http:" || url.protocol === "https:"
        ? limpio.replace(/\/+$/, "")
        : null;
    } catch {
      return null;
    }
  };

  const panel = valida(delPanel);
  if (panel && panel !== URL_PUBLICA_POR_DEFECTO) return panel;

  return valida(delEntorno) ?? URL_PUBLICA_POR_DEFECTO;
}

// ─── Nombre del sitio público ─────────────────────────────────────────────

/**
 * Valores con los que nace `site_settings.site_name` (el de la columna y el que
 * escribía el formulario del panel cuando se dejaba vacío). Igual que con la
 * URL: estar en la base no significa que alguien lo haya elegido.
 */
export const NOMBRES_DEL_SITIO_POR_DEFECTO: ReadonlySet<string> = new Set([
  "Kitsuden",
  "Kitsuden CMS",
]);

/**
 * El nombre que ve el visitante: el del panel (Configuración general → Site
 * Name) si alguien lo escribió; si no, el que traiga el despliegue.
 *
 * «Kitsuden» es el CMS, no el sitio. Si el valor por defecto ganara, un sitio
 * recién instalado se presentaría a sus visitantes con el nombre del software
 * que lo hace funcionar.
 */
export function nombreDelSitioEfectivo(
  delPanel: string | null | undefined,
  delEntorno: string | null | undefined
): string {
  const panel = delPanel?.trim();
  if (panel && !NOMBRES_DEL_SITIO_POR_DEFECTO.has(panel)) return panel;

  const entorno = delEntorno?.trim();
  return entorno || "Kitsuden";
}
