/**
 * Page Block System — Shared Types
 * Used by Admin (builder) and Web (renderer)
 */

// ─── Core Block Interface ─────────────────────────────────────
export interface PageBlock {
  id: string;
  type: BlockType;
  data: Record<string, any>;
  order: number;
}

export type BlockType =
  | "hero"
  | "richtext"
  | "image-gallery"
  | "game-map"
  | "tier-list"
  | "character-builder"
  | "comments"
  | "streamer-widget"
  | "embed"
  | "callout"
  | "facebook-group"
  | "divider"
  | "dynamic-carousel"
  | "smart-filter"
  | "comparison-slider"
  | "smart-grid"
  | "habitat-map"
  | "stat-compare"
  | "dex"
  | "affinity"
  | "event-search"
  | "race-planner"
  | "card-browser"
  | "deck-builder"
  | "deck-showcase"
  | "deck"
  | "set-searcher";

// ─── Block Data Shapes ────────────────────────────────────────
export interface HeroBlockData {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctaSecondaryLabel?: string;
  ctaSecondaryUrl?: string;
  overlay?: "dark" | "gradient" | "none";
}

export interface RichtextBlockData {
  content: string; // Markdown or HTML
  format: "markdown" | "html";
}

export interface ImageGalleryBlockData {
  images: Array<{
    url: string;
    alt?: string;
    caption?: string;
  }>;
  layout: "grid" | "masonry" | "carousel";
  columns?: number;
}

/**
 * Tier list incrustada.
 *
 * Solo REFERENCIA: el bloque apunta a una plantilla de `kon-tierlist` por su
 * slug y no lleva datos propios. Es la lección del bloque `game-map`, que
 * nació con sus marcadores dentro y por eso cada página acabó con una copia
 * divergente del mismo mapa.
 *
 * Una tier list se actualiza cada parche. Si viviera en el bloque, actualizarla
 * sería editar todas las páginas donde aparece — y alguna se quedaría vieja.
 */
/**
 * Hilo de comentarios incrustado.
 *
 * Igual que la tier list, solo REFERENCIA: apunta a un sujeto de
 * `kon-comments` por `(subjectType, subjectId)` y no guarda ni un comentario.
 * Los comentarios de una página no pueden vivir dentro del bloque — se
 * escriben después de publicarla.
 *
 * `subjectId` vacío significa «el de esta página», que es el caso normal: el
 * artículo pone el suyo al pintar. Rellenarlo sirve para el caso raro de
 * enseñar en una página el hilo de OTRA cosa.
 */
/**
 * Character builder incrustado.
 *
 * Igual que la tier list, solo REFERENCIA: apunta a una definición de
 * `kon-character-builder` por su slug. La definición —slots, fórmulas, catálogos— vive
 * allí y se publica una vez; las páginas que la incrustan se actualizan solas.
 *
 * Es una APLICACION, no un documento: el lector configura, el motor calcula
 * stats y devuelve un código compartible. Por eso el bloque se marca como
 * interactivo y el sitio lo hidrata, igual que el mapa o la rejilla dinámica.
 */
export interface CharacterBuilderBlockData {
  /** Slug de una definición de `kon-character-builder`. */
  definitionSlug: string;
  /** Deja guardar la build y compartirla por código. */
  allowSave?: boolean;
  /** Build inicial, como código. Vacío = se empieza de cero. */
  initialCode?: string;
}

export interface CommentsBlockData {
  /** Tipo de sujeto del vocabulario de `@kitsuden/shared`. */
  subjectType: string;
  /** Vacío = el sujeto de la página donde está el bloque. */
  subjectId?: string;
  /** "mejores" | "nuevos" | "antiguos". Lo resuelve la API. */
  orden?: string;
  /** Enseña el formulario de respuesta. Apagado = hilo de solo lectura. */
  allowReplies?: boolean;
}

export interface TierListBlockData {
  /** Slug de una plantilla de `kon-tierlist`. */
  templateSlug: string;
  /** Enseña el pool de elementos sin ranquear bajo las filas. */
  showUnranked?: boolean;
  /**
   * Deja que el lector monte la SUYA a partir de esta.
   *
   * Es lo que convierte una tier list editorial en una herramienta tipo
   * TierMaker sin duplicar nada: la plantilla es la misma, la copia es del
   * lector.
   */
  allowFork?: boolean;
  /** Texto bajo el título: de dónde sale la clasificación */
  note?: string;
  /** Id de otra versión para pintar el diff ("qué cambió este parche"). */
  compareWith?: string;
}

/**
 * Mapa interactivo. Dos modos, y el orden importa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `mapSlug` — REFERENCIA a un mapa de `kon-maps`. Es el modo recomendado.
 *
 * El mapa vive en su tabla, con capas, categorías validadas, coordenadas
 * normalizadas y miles de marcadores importables en bloque. Se reutiliza en
 * veinte páginas y se corrige en un sitio.
 *
 * `mapImageUrl` + `markers` — modo SUELTO, heredado. Los marcadores viven en
 * el bloque, pegados a mano como JSON. Sirve para "un mapita en un post" y
 * nada más: no se reutiliza, no se valida y corregir una coordenada obliga a
 * editar cada página donde esté.
 *
 * Los dos conviven porque el modo suelto ya está publicado en contenido real y
 * romperlo sería reescribir posts. Pero un mapa de juego de verdad va en
 * `kon-maps` — si no, cada página tiene su propia copia divergente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface GameMapBlockData {
  /** Slug de un mapa de `kon-maps`. Si está, manda sobre todo lo demás. */
  mapSlug?: string;
  /** Capa inicial. Sin ella se abre la primera del mapa. */
  layerId?: string;
  /**
   * Tamaño de celda para agrupar marcadores, en coordenadas normalizadas.
   * `0` desactiva la agrupación. Con miles de marcadores es lo que evita una
   * mancha ilegible a zoom bajo.
   */
  cluster?: number;

  /** @deprecated Modo suelto: usa `mapSlug` y un mapa de `kon-maps`. */
  mapImageUrl?: string;
  mapTitle?: string;
  /** @deprecated Los marcadores de un mapa reutilizable viven en `kon-maps`. */
  markers?: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    category?: string;
    description?: string;
    icon?: string;
  }>;
  /** @deprecated Ver `markers`. */
  categories?: Array<{
    name: string;
    color: string;
    icon: string;
  }>;
}

export interface StreamerWidgetBlockData {
  channelName: string;
  platform: "twitch" | "youtube" | "kick";
  showChat?: boolean;
  autoplay?: boolean;
}

export interface EmbedBlockData {
  url: string;
  caption?: string;
  aspectRatio?: "16:9" | "4:3" | "1:1";
}

export interface CalloutBlockData {
  title?: string;
  content: string;
  variant: "info" | "warning" | "success" | "danger" | "tip";
  icon?: string;
}

export interface FacebookGroupBlockData {
  /** Enlace del grupo: https://facebook.com/groups/… */
  url: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
}

export interface DividerBlockData {
  style: "line" | "gradient" | "dots" | "space";
}

export interface DynamicCarouselBlockData {
  source: "games" | "streamers";
  sortBy: "date" | "score" | "name";
  limit: number;
  autoplay: boolean;
}

export interface SmartFilterBlockData {
  enableGenreFilter: boolean;
  enablePlatformFilter: boolean;
  enableScoreSlider: boolean;
  targetDatasetId?: string;
}

export interface ComparisonSliderBlockData {
  beforeImageUrl: string;
  afterImageUrl: string;
  beforeLabel: string;
  afterLabel: string;
}

export interface SmartGridBlockData {
  datasetId: string;
  columns: string[]; // visible column keys (empty = show all)
  initialSort?: string; // field key to sort by default
  initialFilter?: Record<string, any>; // e.g. { type: "Sword" }
  enableGrouping: boolean;
  groupByField?: string; // field key to group by
}

/**
 * Dónde vive cada fila de un dataset, agrupada por región.
 *
 * El «mapa» que se puede publicar sin coordenadas: si la fuente dice en qué
 * región aparece algo pero no dónde exactamente, esto lo enseña tal cual en
 * vez de inventar marcadores.
 */
export interface HabitatMapBlockData {
  datasetId: string;
  /** Campo con la lista de regiones de cada fila */
  groupField: string;
  nameField?: string;
  imageField?: string;
  /** Campo con etiquetas para filtrar (elementos, rareza…) */
  tagField?: string;
  filterField?: string;
  filterValue?: unknown;
  title?: string;
  note?: string;
}

/** Comparar hasta tres filas de un dataset, stat a stat. */
export interface StatCompareBlockData {
  datasetId: string;
  stats: Array<{ key: string; label: string }>;
  nameField?: string;
  imageField?: string;
  tagField?: string;
  filterField?: string;
  filterValue?: unknown;
  max?: number;
  title?: string;
  note?: string;
}

/** Un dataset leído por el índice: dónde está y qué campo casa con qué. */
interface DatasetDeFicha {
  datasetId: string;
  [campo: string]: unknown;
}

/**
 * Índice con fichas («Aniidex»): las filas de un dataset como índice filtrable
 * en `/<juego>/<segmento>` y una ficha por fila en `/<juego>/<segmento>/<fila>`.
 *
 * La ficha se COMPONE con otros datasets (facetas con icono, habilidades,
 * rasgo, línea evolutiva): nada de eso se copia dentro de la fila.
 */
export interface DexBlockData {
  datasetId: string;
  titulo: string;
  /** Segmento de la dirección; por defecto `dex` */
  segmento?: string;
  descripcion?: string;
  /** Qué campo de la fila es cada cosa: clave (dirección), nombre, imagen, número… */
  campos: Record<string, string>;
  facetas?: Array<{ campo: string; etiqueta: string; datasetId?: string }>;
  stats?: Array<{ key: string; label: string }>;
  habilidades?: DatasetDeFicha;
  rasgo?: DatasetDeFicha;
  evolucion?: DatasetDeFicha;
  chips?: Array<{ campo: string; etiqueta: string; herramienta?: string }>;
  noticias?: DatasetDeFicha;
  nota?: string;
}

/**
 * Calculadora de afinidad: lee un dataset de personajes y el campo con sus
 * grupos de parentesco, y deja al lector armar el árbol (entrenada, dos
 * progenitores y cuatro abuelos) para sumar los puntos que comparten.
 */
export interface AffinityBlockData {
  datasetId: string;
  titulo: string;
  descripcion?: string;
  /** Campos de la fila: clave, nombre, imagen y el de los grupos de parentesco */
  campos: { clave: string; nombre: string; imagen?: string; grupos: string };
  /** Cómo se llama cada pieza del árbol en este juego */
  etiquetas?: { hija?: string; progenitor?: string; abuelo?: string };
  nota?: string;
}

/** Buscador sobre un dataset de eventos: nombre, de dónde sale y sus opciones */
export interface SetSearcherBlockData {
  titulo?: string;
  descripcion?: string;
  gameSlug: string;
}

export interface EventSearchBlockData {
  datasetId: string;
  titulo: string;
  descripcion?: string;
  campos: { nombre: string; opciones: string; fuente?: string; ficha?: string; clase?: string };
  nota?: string;
}

/** Calendario: un dataset cuyas filas ocurren en turnos del juego (año, mes, mitad) */
export interface RacePlannerBlockData {
  datasetId: string;
  titulo: string;
  descripcion?: string;
  campos: { nombre: string; turnos: string; grado?: string; superficie?: string; distancia?: string; sede?: string };
  nota?: string;
}

/**
 * Los tres bloques de juegos de cartas no llevan `datasetId`: su catálogo NO
 * vive en un dataset del CMS sino en `cardsim_cards`, y duplicarlo crearía dos
 * verdades sobre qué es una carta. Lo que guardan es el SLUG del juego de
 * cartas, que es la clave con la que kon-deckshow sirve todo lo demás.
 */
export interface CardBrowserBlockData {
  juegoDeCartas: string;
  titulo: string;
  descripcion?: string;
  /** Propiedades de `data` que se ofrecen como filtro, en orden */
  facetas?: Array<{ campo: string; etiqueta: string }>;
  nota?: string;
}

export interface DeckBuilderBlockData {
  juegoDeCartas: string;
  titulo: string;
  descripcion?: string;
  nota?: string;
}

export interface DeckShowcaseBlockData {
  juegoDeCartas: string;
  titulo: string;
  descripcion?: string;
  nota?: string;
}

/**
 * Un mazo del meta, incrustado en un artículo.
 *
 * Solo REFERENCIA, por la misma razón que la tier list: apunta al arquetipo
 * (o a una lista concreta) por su id y no copia ni una carta. Un mazo del meta
 * cambia cada semana; si la lista viviera dentro del bloque, cada artículo
 * tendría su propia copia envejeciendo por separado.
 */
export interface DeckBlockData {
  /** Slug del juego, tal y como sale en su dirección */
  juego: string;
  /** `archetype_id` del arquetipo. Vacío si se incrusta una lista concreta. */
  arquetipo?: string;
  /** `deck_id` de una lista real, para incrustar ESA y no el arquetipo */
  mazo?: string;
  /** Qué enseñar: la ficha resumida o solo la lista de cartas */
  vista?: "resumen" | "lista";
  titulo?: string;
  nota?: string;
}

// ─── Block Registry ───────────────────────────────────────────
export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  description: string;
  color: string;
  category: "content" | "media" | "interactive" | "layout";
  defaultData: Record<string, any>;
  fields: BlockFieldDef[];
}

export interface BlockFieldDef {
  key: string;
  label: string;
  /**
   * `gallery` es una LISTA de imágenes elegidas de la biblioteca, con su alt y
   * su pie. Existe porque el bloque de galería pedía un `json` —una caja de
   * texto donde escribir el array a mano— teniendo la biblioteca al lado.
   */
  type:
    | "text"
    | "textarea"
    | "url"
    | "select"
    | "number"
    | "boolean"
    | "json"
    | "image"
    | "gallery"
    /**
     * Un desplegable cuyas opciones se PIDEN a la API.
     *
     * ── POR QUE HACIA FALTA UN TIPO NUEVO ──────────────────────────────────
     *
     * `select` lleva sus opciones escritas en el registro, y eso vale cuando
     * son dos valores fijos. Pero elegir «qué tier list incrusto» es elegir
     * entre DATOS: la lista vive en la base y cambia cada parche.
     *
     * Sin esto, el bloque pedía el slug en un campo de texto libre, con
     * `placeholder: "meta-5-4"`. Escribirlo mal no da ningún error: la página
     * se guarda tan tranquila y sale sin la tier list. Es la misma familia que
     * `post` frente a `blog_post` en los comentarios, y la que produjo
     * «Agregar All Gam»: una cadena tecleada a mano en vez de elegida.
     */
    | "remote-select";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  /** Solo para `remote-select`: de dónde salen las opciones. */
  source?: {
    /** Ruta relativa a la API, p. ej. `/tierlist/templates`. */
    endpoint: string;
    /** Clave del array dentro de la respuesta (`data`, `docs`…). */
    listKey: string;
    /** Campo que se guarda en el bloque. */
    valueKey: string;
    /** Campo que se enseña. */
    labelKey: string;
  };
  helpText?: string;
}

export const BLOCK_REGISTRY: BlockDefinition[] = [
  {
    type: "hero",
    label: "Hero Section",
    icon: "Sparkles",
    description: "Full-width hero with title, image, and call-to-action",
    color: "#00E5FF",
    category: "content",
    defaultData: {
      title: "",
      subtitle: "",
      imageUrl: "",
      ctaLabel: "",
      ctaUrl: "",
      overlay: "gradient",
    } satisfies HeroBlockData as any,
    fields: [
      {
        key: "title",
        label: "Title",
        type: "text",
        required: true,
        placeholder: "Hero headline...",
      },
      { key: "subtitle", label: "Subtitle", type: "textarea", placeholder: "Supporting text..." },
      { key: "imageUrl", label: "Background Image", type: "url", placeholder: "https://..." },
      { key: "ctaLabel", label: "CTA Button Text", type: "text", placeholder: "Get Started" },
      { key: "ctaUrl", label: "CTA Button URL", type: "url", placeholder: "/games" },
      {
        key: "ctaSecondaryLabel",
        label: "Secondary CTA Text",
        type: "text",
        placeholder: "Learn More",
      },
      { key: "ctaSecondaryUrl", label: "Secondary CTA URL", type: "url" },
      {
        key: "overlay",
        label: "Overlay Style",
        type: "select",
        options: [
          { label: "Dark", value: "dark" },
          { label: "Gradient", value: "gradient" },
          { label: "None", value: "none" },
        ],
      },
    ],
  },
  {
    type: "richtext",
    label: "Rich Text",
    icon: "FileText",
    description: "Formatted text content block with Markdown support",
    color: "#E040FB",
    category: "content",
    defaultData: { content: "", format: "markdown" } satisfies RichtextBlockData as any,
    fields: [
      {
        key: "content",
        label: "Content",
        type: "textarea",
        required: true,
        placeholder: "Write in Markdown...",
      },
      {
        key: "format",
        label: "Format",
        type: "select",
        options: [
          { label: "Markdown", value: "markdown" },
          { label: "HTML", value: "html" },
        ],
      },
    ],
  },
  {
    type: "image-gallery",
    label: "Image Gallery",
    icon: "Images",
    description: "Grid, masonry, or carousel of images",
    color: "#FF6E40",
    category: "media",
    defaultData: { images: [], layout: "grid", columns: 3 } satisfies ImageGalleryBlockData as any,
    fields: [
      {
        key: "images",
        label: "Imágenes",
        type: "gallery",
        required: true,
        helpText: '[{"url":"...","alt":"...","caption":"..."}]',
      },
      {
        key: "layout",
        label: "Layout",
        type: "select",
        options: [
          { label: "Grid", value: "grid" },
          { label: "Masonry", value: "masonry" },
          { label: "Carousel", value: "carousel" },
        ],
      },
      { key: "columns", label: "Columns", type: "number" },
    ],
  },
  {
    type: "character-builder",
    label: "Character Builder",
    icon: "Hammer",
    description: "Builder de kon-character-builder. El lector configura y comparte su build.",
    color: "#26A69A",
    category: "interactive",
    defaultData: {
      definitionSlug: "",
      allowSave: true,
      initialCode: "",
    } satisfies CharacterBuilderBlockData as any,
    fields: [
      {
        key: "definitionSlug",
        label: "Builder",
        type: "remote-select",
        required: true,
        source: {
          endpoint: "/builder/definitions",
          listKey: "data",
          valueKey: "slug",
          labelKey: "name",
        },
        helpText:
          "Solo salen las definiciones publicadas. Una en borrador no se puede " +
          "incrustar: la página quedaría vacía para el lector.",
      },
      {
        key: "allowSave",
        label: "Permitir guardar y compartir",
        type: "boolean",
        helpText: "Añade el botón de guardar la build y obtener su código.",
      },
      {
        key: "initialCode",
        label: "Build inicial (código)",
        type: "text",
        placeholder: "",
        helpText: "Arranca con una build ya montada. Vacío = desde cero.",
      },
    ],
  },
  {
    type: "comments",
    label: "Comentarios",
    icon: "MessageSquare",
    description: "Hilo de kon-comments sobre el sujeto de esta página.",
    color: "#7E57C2",
    category: "interactive",
    defaultData: {
      subjectType: "blog_post",
      subjectId: "",
      orden: "mejores",
      allowReplies: true,
    } satisfies CommentsBlockData as any,
    fields: [
      {
        key: "subjectType",
        label: "Tipo de sujeto",
        type: "select",
        required: true,
        options: [
          { label: "Artículo del blog", value: "blog_post" },
          { label: "Página del constructor", value: "block_page" },
          { label: "Página de wiki", value: "wiki_page" },
        ],
        helpText:
          "El vocabulario vive en @kitsuden/shared. Es un desplegable y no " +
          "texto libre a propósito: con texto, «post» y «blog_post» abren dos " +
          "hilos distintos sobre el mismo artículo sin dar ningún error.",
      },
      {
        key: "subjectId",
        label: "Id del sujeto (opcional)",
        type: "text",
        placeholder: "",
        helpText: "Vacío = el de esta página. Rellénalo solo para enseñar el hilo de otra cosa.",
      },
      {
        key: "orden",
        label: "Orden",
        type: "select",
        options: [
          { label: "Mejores", value: "mejores" },
          { label: "Nuevos", value: "nuevos" },
          { label: "Antiguos", value: "antiguos" },
        ],
      },
      {
        key: "allowReplies",
        label: "Permitir responder",
        type: "boolean",
        helpText: "Apagado deja el hilo en solo lectura sin borrar lo que ya hay.",
      },
    ],
  },
  {
    type: "tier-list",
    label: "Tier List",
    icon: "ListOrdered",
    description: "Tier list de kon-tierlist. Opcionalmente el lector monta la suya.",
    color: "#FFB300",
    category: "interactive",
    defaultData: {
      templateSlug: "",
      showUnranked: true,
      allowFork: false,
    } satisfies TierListBlockData as any,
    fields: [
      {
        key: "templateSlug",
        label: "Tier list",
        type: "remote-select",
        required: true,
        source: {
          endpoint: "/tierlist/templates",
          listKey: "data",
          valueKey: "slug",
          labelKey: "title",
        },
        helpText:
          "Se elige, no se teclea: un slug mal escrito no da error, guarda la " +
          "página y sale sin la tier list. Al republicar la plantilla cada " +
          "parche, todas las páginas que la incrusten se actualizan solas.",
      },
      {
        key: "showUnranked",
        label: "Mostrar sin ranquear",
        type: "boolean",
        helpText: "El pool de lo que aún no tiene tier. Útil tras un parche.",
      },
      {
        key: "allowFork",
        label: "Permitir que el lector haga la suya",
        type: "boolean",
        helpText: "Añade un botón para bifurcar la lista y compartirla por código.",
      },
      {
        key: "note",
        label: "Nota",
        type: "text",
        helpText: "Bajo el título: de dónde sale la clasificación (cálculo, opinión, parche…).",
      },
      {
        key: "compareWith",
        label: "Comparar con (id de versión)",
        type: "text",
        placeholder: "",
        helpText: "Pinta el diff: quién subió y quién bajó respecto a esa versión.",
      },
    ],
  },
  {
    type: "game-map",
    label: "Game Map",
    icon: "Map",
    description: "Mapa interactivo. Referencia un mapa de kon-maps por su slug.",
    color: "#76FF03",
    category: "interactive",
    // El default apunta al modo REFERENCIA: un bloque nuevo debe nacer
    // apuntando a un mapa reutilizable, no con su propia copia de marcadores.
    defaultData: {
      mapSlug: "",
      layerId: "",
      cluster: 0,
    } satisfies GameMapBlockData as any,
    fields: [
      {
        key: "mapSlug",
        label: "Mapa (slug de kon-maps)",
        type: "text",
        placeholder: "acto-1",
        helpText:
          "Recomendado. El mapa vive en kon-maps con sus capas y marcadores, " +
          "y se reutiliza en todas las páginas que lo referencien.",
      },
      {
        key: "layerId",
        label: "Capa inicial",
        type: "text",
        placeholder: "surface",
        helpText: "Vacío = la primera capa del mapa.",
      },
      {
        key: "cluster",
        label: "Agrupar marcadores",
        type: "number",
        helpText:
          "Tamaño de celda en coordenadas normalizadas (0.05 agrupa bastante). " +
          "0 los pinta todos — con miles queda ilegible.",
      },
      {
        key: "mapImageUrl",
        label: "Imagen del mapa (modo suelto)",
        type: "url",
        placeholder: "https://...",
        helpText: "Heredado. Solo si no usas un mapa de kon-maps.",
      },
      { key: "mapTitle", label: "Map Title", type: "text", placeholder: "World Map" },
      {
        key: "markers",
        label: "Markers (JSON)",
        type: "json",
        helpText: '[{"id":"1","label":"Town","x":50,"y":30}]',
      },
      {
        key: "categories",
        label: "Categories (JSON)",
        type: "json",
        helpText: '[{"name":"Towns","color":"#00E5FF","icon":"🏘️"}]',
      },
    ],
  },
  {
    type: "streamer-widget",
    label: "Streamer Widget",
    icon: "Tv",
    description: "Live stream embed with chat option",
    color: "#FF2A6D",
    category: "interactive",
    defaultData: {
      channelName: "",
      platform: "twitch",
      showChat: false,
      autoplay: false,
    } satisfies StreamerWidgetBlockData as any,
    fields: [
      {
        key: "channelName",
        label: "Channel Name",
        type: "text",
        required: true,
        placeholder: "ninja",
      },
      {
        key: "platform",
        label: "Platform",
        type: "select",
        options: [
          { label: "Twitch", value: "twitch" },
          { label: "YouTube", value: "youtube" },
          { label: "Kick", value: "kick" },
        ],
      },
      { key: "showChat", label: "Show Chat", type: "boolean" },
      { key: "autoplay", label: "Autoplay", type: "boolean" },
    ],
  },
  {
    type: "embed",
    /**
     * ── POR QUE SE LLAMA «VIDEO» Y NO «EMBED» ──────────────────────────────
     *
     * Nadie busca «Embed» cuando lo que quiere es meter un vídeo de YouTube.
     * El nombre técnico describe el mecanismo, no la intención, y en una lista
     * de trece bloques eso es la diferencia entre encontrarlo y no encontrarlo.
     *
     * El tipo interno sigue siendo `embed`: cambiarlo rompería los bloques ya
     * guardados. Lo que cambia es cómo se presenta.
     */
    label: "Vídeo o incrustado",
    icon: "Code2",
    description: "Pega el enlace de YouTube, Vimeo u otro servicio. Se convierte solo.",
    color: "#40C4FF",
    category: "media",
    defaultData: { url: "", caption: "", aspectRatio: "16:9" } satisfies EmbedBlockData as any,
    fields: [
      {
        key: "url",
        label: "Enlace del vídeo",
        type: "url",
        required: true,
        placeholder: "https://www.youtube.com/watch?v=...",
        /**
         * El marcador de posición SIGUE siendo la URL de la barra del
         * navegador, y ahora eso es verdad: antes prometía algo que producía
         * un marco en blanco, porque YouTube no deja incrustar `/watch`
         * (`X-Frame-Options: SAMEORIGIN`). La conversión la hace el
         * renderizador, así que pegar lo que copias funciona.
         */
        helpText:
          "Pega el enlace tal cual lo copias: /watch, youtu.be, Shorts o en directo. " +
          "Si lleva minuto (?t=90) el vídeo empieza ahí.",
      },
      { key: "caption", label: "Pie", type: "text" },
      {
        key: "aspectRatio",
        label: "Aspect Ratio",
        type: "select",
        options: [
          { label: "16:9", value: "16:9" },
          { label: "4:3", value: "4:3" },
          { label: "1:1", value: "1:1" },
        ],
      },
    ],
  },
  {
    type: "callout",
    label: "Callout Box",
    icon: "AlertTriangle",
    description: "Highlighted info, warning, or tip box",
    color: "#FFD600",
    category: "content",
    defaultData: { title: "", content: "", variant: "info" } satisfies CalloutBlockData as any,
    fields: [
      { key: "title", label: "Title", type: "text", placeholder: "Note" },
      { key: "content", label: "Content", type: "textarea", required: true },
      {
        key: "variant",
        label: "Variant",
        type: "select",
        options: [
          { label: "Info", value: "info" },
          { label: "Warning", value: "warning" },
          { label: "Success", value: "success" },
          { label: "Danger", value: "danger" },
          { label: "Tip", value: "tip" },
        ],
      },
    ],
  },
  {
    type: "facebook-group",
    label: "Grupo de Facebook",
    icon: "Users",
    description: "Tarjeta que invita a unirse a un grupo de Facebook",
    color: "#1877F2",
    category: "content",
    defaultData: { url: "", title: "", description: "", ctaLabel: "" } satisfies FacebookGroupBlockData as any,
    fields: [
      { key: "url", label: "Enlace del grupo", type: "text", required: true, placeholder: "https://facebook.com/groups/…" },
      { key: "title", label: "Título (opcional)", type: "text", placeholder: "Únete a nuestro grupo de Facebook" },
      { key: "description", label: "Texto (opcional)", type: "textarea" },
      { key: "ctaLabel", label: "Texto del botón (opcional)", type: "text", placeholder: "Unirme al grupo" },
    ],
  },
  {
    type: "divider",
    label: "Divider",
    icon: "Minus",
    description: "Visual separator between content sections",
    color: "#9E9E9E",
    category: "layout",
    defaultData: { style: "gradient" } satisfies DividerBlockData as any,
    fields: [
      {
        key: "style",
        label: "Style",
        type: "select",
        options: [
          { label: "Line", value: "line" },
          { label: "Gradient", value: "gradient" },
          { label: "Dots", value: "dots" },
          { label: "Space", value: "space" },
        ],
      },
    ],
  },
  // ── Smart Blocks ──
  {
    type: "dynamic-carousel",
    label: "Dynamic Carousel",
    icon: "Clapperboard",
    description: "Auto-populated carousel of Games or Streamers",
    color: "#FF6E40",
    category: "interactive",
    defaultData: {
      source: "games",
      sortBy: "date",
      limit: 8,
      autoplay: false,
    } satisfies DynamicCarouselBlockData as any,
    fields: [
      {
        key: "source",
        label: "Data Source",
        type: "select",
        required: true,
        options: [
          { label: "Games", value: "games" },
          { label: "Streamers", value: "streamers" },
        ],
      },
      {
        key: "sortBy",
        label: "Sort By",
        type: "select",
        options: [
          { label: "Release Date", value: "date" },
          { label: "Score", value: "score" },
          { label: "Name", value: "name" },
        ],
      },
      { key: "limit", label: "Max Items", type: "number" },
      { key: "autoplay", label: "Autoplay", type: "boolean" },
    ],
  },
  {
    type: "smart-filter",
    label: "Smart Filter",
    icon: "SlidersHorizontal",
    description: "Dynamic genre, platform, and score filters for the grid",
    color: "#69F0AE",
    category: "interactive",
    defaultData: {
      enableGenreFilter: true,
      enablePlatformFilter: true,
      enableScoreSlider: false,
    } satisfies SmartFilterBlockData as any,
    fields: [
      { key: "enableGenreFilter", label: "Enable Genre Filter", type: "boolean" },
      { key: "enablePlatformFilter", label: "Enable Platform Filter", type: "boolean" },
      { key: "enableScoreSlider", label: "Enable Score Slider", type: "boolean" },
      {
        key: "targetDatasetId",
        label: "Target Dataset ID (optional)",
        type: "text",
        helpText: "Leave empty to filter Games",
      },
    ],
  },
  {
    type: "comparison-slider",
    label: "Comparison Slider",
    icon: "Columns",
    description: "Before/After image comparison with draggable handle",
    color: "#B388FF",
    category: "media",
    defaultData: {
      beforeImageUrl: "",
      afterImageUrl: "",
      beforeLabel: "Before",
      afterLabel: "After",
    } satisfies ComparisonSliderBlockData as any,
    fields: [
      {
        key: "beforeImageUrl",
        label: "Before Image",
        type: "image",
        required: true,
        placeholder: "https://...",
      },
      {
        key: "afterImageUrl",
        label: "After Image",
        type: "image",
        required: true,
        placeholder: "https://...",
      },
      { key: "beforeLabel", label: "Before Label", type: "text", placeholder: "Before" },
      { key: "afterLabel", label: "After Label", type: "text", placeholder: "After" },
    ],
  },
  {
    type: "smart-grid",
    label: "Smart Data Grid",
    icon: "Table2",
    description: "AirTable-style data grid with sort, search, and grouping",
    color: "#00BFA5",
    category: "interactive",
    defaultData: {
      datasetId: "",
      columns: [],
      initialSort: "",
      initialFilter: {},
      enableGrouping: false,
      groupByField: "",
    } satisfies SmartGridBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: "Dataset ID",
        type: "text",
        required: true,
        placeholder: "Paste dataset UUID...",
      },
      {
        key: "columns",
        label: "Visible Columns (JSON)",
        type: "json",
        helpText: '["name", "damage", "rarity"] — empty array shows all',
      },
      { key: "initialSort", label: "Default Sort Field", type: "text", placeholder: "e.g. name" },
      {
        key: "initialFilter",
        label: "Initial Filter (JSON)",
        type: "json",
        helpText: '{"rarity": "Legendary"}',
      },
      { key: "enableGrouping", label: "Enable Grouping", type: "boolean" },
      { key: "groupByField", label: "Group By Field", type: "text", placeholder: "e.g. rarity" },
    ],
  },
  {
    type: "habitat-map",
    label: "Habitat Map",
    icon: "MapPin",
    description: "Qué hay en cada región, desde un dataset. Sin coordenadas: no inventa marcadores.",
    color: "#26A69A",
    category: "interactive",
    defaultData: {
      datasetId: "",
      groupField: "habitats",
      nameField: "name",
      imageField: "image",
      tagField: "",
      title: "",
      note: "",
    } satisfies HabitatMapBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: "Dataset",
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "groupField", label: "Campo de regiones", type: "text", required: true, placeholder: "habitats" },
      { key: "nameField", label: "Campo de nombre", type: "text", placeholder: "name" },
      { key: "imageField", label: "Campo de imagen", type: "text", placeholder: "image" },
      { key: "tagField", label: "Campo para filtrar", type: "text", placeholder: "elements" },
      { key: "filterField", label: "Solo filas con el campo…", type: "text", placeholder: "in_index" },
      { key: "filterValue", label: "…igual a (JSON)", type: "json", helpText: "true, \"Basic Form\"…" },
      { key: "title", label: "Título", type: "text" },
      { key: "note", label: "Nota", type: "text", helpText: "De dónde sale el dato y qué NO incluye." },
    ],
  },
  {
    type: "stat-compare",
    label: "Stat Compare",
    icon: "Scale",
    description: "Compara hasta tres filas de un dataset, stat a stat.",
    color: "#7E57C2",
    category: "interactive",
    defaultData: {
      datasetId: "",
      stats: [],
      nameField: "name",
      imageField: "image",
      max: 3,
      title: "",
      note: "",
    } satisfies StatCompareBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: "Dataset",
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      {
        key: "stats",
        label: "Stats (JSON)",
        type: "json",
        required: true,
        helpText: '[{"key": "hp", "label": "Vida"}] — campos numéricos del dataset',
      },
      { key: "nameField", label: "Campo de nombre", type: "text", placeholder: "name" },
      { key: "imageField", label: "Campo de imagen", type: "text", placeholder: "image" },
      { key: "tagField", label: "Campo de etiquetas", type: "text", placeholder: "elements" },
      { key: "filterField", label: "Solo filas con el campo…", type: "text" },
      { key: "filterValue", label: "…igual a (JSON)", type: "json" },
      { key: "title", label: "Título", type: "text" },
      { key: "note", label: "Nota", type: "text" },
    ],
  },
  {
    type: "event-search",
    label: "Buscador de eventos",
    icon: "Search",
    description: "Busca en un dataset de eventos y enseña qué da cada opción.",
    color: "#A3E635",
    category: "interactive",
    defaultData: {
      datasetId: "",
      titulo: "",
      campos: { nombre: "name", opciones: "options", fuente: "character", clase: "kind" },
      nota: "",
    } satisfies EventSearchBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: "Dataset de eventos",
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: "Título", type: "text", required: true },
      { key: "descripcion", label: "Descripción", type: "textarea" },
      { key: "campos", label: "Campos (JSON)", type: "json" },
      { key: "nota", label: "Nota", type: "text" },
    ],
  },
  {
    type: "race-planner",
    label: "Calendario de carreras",
    icon: "CalendarRange",
    description: "Las filas de un dataset repartidas por turno del juego, con filtros.",
    color: "#38BDF8",
    category: "interactive",
    defaultData: {
      datasetId: "",
      titulo: "",
      campos: { nombre: "name", turnos: "turns", grado: "grade", superficie: "surface", distancia: "distance", sede: "venue" },
      nota: "",
    } satisfies RacePlannerBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: "Dataset de carreras",
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: "Título", type: "text", required: true },
      { key: "descripcion", label: "Descripción", type: "textarea" },
      { key: "campos", label: "Campos (JSON)", type: "json" },
      { key: "nota", label: "Nota", type: "text" },
    ],
  },
  {
    type: "card-browser",
    label: "Catálogo de cartas",
    icon: "LayoutGrid",
    description: "Las cartas de un juego de cartas, con buscador y filtros por sus propiedades.",
    color: "#F59E0B",
    category: "interactive",
    defaultData: {
      juegoDeCartas: "",
      titulo: "Cartas",
      facetas: [],
    } satisfies CardBrowserBlockData as any,
    fields: [
      {
        key: "juegoDeCartas",
        label: "Juego de cartas",
        type: "remote-select",
        required: true,
        source: { endpoint: "/cardsim/games", listKey: "data", valueKey: "slug", labelKey: "name" },
      },
      { key: "titulo", label: "Título", type: "text", required: true },
      { key: "descripcion", label: "Descripción", type: "textarea" },
      { key: "facetas", label: "Facetas (JSON)", type: "json" },
      { key: "nota", label: "Nota", type: "text" },
    ],
  },
  {
    type: "deck-builder",
    label: "Constructor de mazos",
    icon: "Layers",
    description: "Construye un mazo contra las reglas del juego, con validación en vivo y mano de prueba.",
    color: "#F59E0B",
    category: "interactive",
    defaultData: {
      juegoDeCartas: "",
      titulo: "Constructor de mazos",
    } satisfies DeckBuilderBlockData as any,
    fields: [
      {
        key: "juegoDeCartas",
        label: "Juego de cartas",
        type: "remote-select",
        required: true,
        source: { endpoint: "/cardsim/games", listKey: "data", valueKey: "slug", labelKey: "name" },
      },
      { key: "titulo", label: "Título", type: "text", required: true },
      { key: "descripcion", label: "Descripción", type: "textarea" },
      { key: "nota", label: "Nota", type: "text" },
    ],
  },
  {
    type: "deck-showcase",
    label: "Escaparate de mazos",
    icon: "Trophy",
    description: "Los mazos publicados de un juego, con su autor y sus «me gusta».",
    color: "#F59E0B",
    category: "interactive",
    defaultData: {
      juegoDeCartas: "",
      titulo: "Mazos de la comunidad",
    } satisfies DeckShowcaseBlockData as any,
    fields: [
      {
        key: "juegoDeCartas",
        label: "Juego de cartas",
        type: "remote-select",
        required: true,
        source: { endpoint: "/cardsim/games", listKey: "data", valueKey: "slug", labelKey: "name" },
      },
      { key: "titulo", label: "Título", type: "text", required: true },
      { key: "descripcion", label: "Descripción", type: "textarea" },
      { key: "nota", label: "Nota", type: "text" },
    ],
  },
  {
    type: "deck",
    label: "Mazo del meta",
    icon: "Layers",
    description:
      "Un arquetipo del meta (o una lista concreta) incrustado en el artículo, con su cuota y sus cartas. Solo lo referencia: se actualiza solo.",
    color: "#F59E0B",
    category: "interactive",
    defaultData: {
      juego: "",
      arquetipo: "",
      vista: "resumen",
    } satisfies DeckBlockData as any,
    fields: [
      {
        key: "juego",
        label: "Juego",
        type: "remote-select",
        required: true,
        source: { endpoint: "/games", listKey: "docs", valueKey: "slug", labelKey: "title" },
      },
      {
        key: "arquetipo",
        label: "Arquetipo",
        type: "text",
        helpText:
          "El id del arquetipo, el que sale en su dirección: /<juego>/meta/<esto>. Déjalo vacío si vas a incrustar una lista concreta.",
      },
      {
        key: "mazo",
        label: "Lista concreta (opcional)",
        type: "text",
        helpText: "El id de una lista real (/<juego>/decks/<esto>). Si lo pones, manda sobre el arquetipo.",
      },
      {
        key: "vista",
        label: "Qué enseñar",
        type: "select",
        options: [
          { value: "resumen", label: "Ficha resumida (cifras y cartas clave)" },
          { value: "lista", label: "Solo la lista de cartas" },
        ],
      },
      { key: "titulo", label: "Título", type: "text" },
      { key: "nota", label: "Nota", type: "text" },
    ],
  },
  {
    type: "affinity",
    label: "Calculadora de afinidad",
    icon: "GitMerge",
    description: "Árbol de herencia (entrenada, progenitores y abuelos) con los puntos de parentesco que comparten.",
    color: "#22D3EE",
    category: "interactive",
    defaultData: {
      datasetId: "",
      titulo: "",
      campos: { clave: "slug", nombre: "name", imagen: "image", grupos: "relations" },
      nota: "",
    } satisfies AffinityBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: "Dataset de personajes",
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: "Título", type: "text", required: true },
      { key: "descripcion", label: "Descripción", type: "textarea" },
      { key: "campos", label: "Campos (JSON)", type: "json" },
      { key: "etiquetas", label: "Nombres del árbol (JSON)", type: "json" },
      { key: "nota", label: "Nota", type: "text" },
    ],
  },
  {
    type: "dex",
    label: "Índice con fichas",
    icon: "Library",
    description: "Índice filtrable de un dataset con una ficha por fila (como un Aniidex o un bestiario).",
    color: "#EF5350",
    category: "interactive",
    defaultData: {
      datasetId: "",
      titulo: "",
      segmento: "",
      campos: { clave: "slug", nombre: "name", imagen: "image", numero: "", total: "" },
      facetas: [],
      stats: [],
      nota: "",
    } satisfies DexBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: "Dataset",
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: "Título", type: "text", required: true, placeholder: "Aniidex" },
      { key: "segmento", label: "Dirección", type: "text", placeholder: "aniidex", helpText: "/<juego>/<dirección>. Letras, números y guiones." },
      { key: "descripcion", label: "Descripción", type: "text" },
      {
        key: "campos",
        label: "Campos (JSON)",
        type: "json",
        required: true,
        helpText: '{"clave": "slug", "nombre": "name", "imagen": "image", "numero": "entry", "total": "total"}',
      },
      {
        key: "facetas",
        label: "Filtros (JSON)",
        type: "json",
        helpText: '[{"campo": "elements", "etiqueta": "Elemento", "datasetId": "<dataset con color e icono>"}]',
      },
      { key: "stats", label: "Stats (JSON)", type: "json", helpText: '[{"key": "hp", "label": "Vida"}]' },
      { key: "habilidades", label: "Habilidades (JSON)", type: "json", helpText: "Dataset, clave y grupos de ids de la fila." },
      { key: "rasgo", label: "Rasgo (JSON)", type: "json" },
      { key: "evolucion", label: "Línea evolutiva (JSON)", type: "json" },
      { key: "chips", label: "Listas (JSON)", type: "json", helpText: '[{"campo": "habitats", "etiqueta": "Hábitats", "herramienta": "map"}]' },
      { key: "noticias", label: "Noticias (JSON)", type: "json" },
      { key: "nota", label: "Nota", type: "text", helpText: "De dónde salen los datos." },
    ],
  },
];

// ─── Utility ──────────────────────────────────────────────────
export function createBlock(type: BlockType, order: number): PageBlock {
  const def = BLOCK_REGISTRY.find((b) => b.type === type);
  return {
    id: `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    data: structuredClone(def?.defaultData || {}),
    order,
  };
}

export function getBlockDef(type: BlockType): BlockDefinition | undefined {
  return BLOCK_REGISTRY.find((b) => b.type === type);
}
