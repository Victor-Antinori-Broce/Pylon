import { t } from "$lib/i18n";
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
  campos: {
    nombre: string;
    turnos: string;
    grado?: string;
    superficie?: string;
    distancia?: string;
    sede?: string;
  };
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
    label: t("blocks.heroSection"),
    icon: "Sparkles",
    description: t("blocks.fullWidthHeroWithTitle"),
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
        label: t("common.title"),
        type: "text",
        required: true,
        placeholder: t("blocks.heroHeadline"),
      },
      { key: "subtitle", label: t("blocks.subtitle"), type: "textarea", placeholder: t("blocks.supportingText") },
      { key: "imageUrl", label: t("blocks.backgroundImage"), type: "url", placeholder: "https://..." },
      { key: "ctaLabel", label: t("blocks.ctaButtonText"), type: "text", placeholder: t("blocks.getStarted") },
      { key: "ctaUrl", label: t("blocks.ctaButtonUrl"), type: "url", placeholder: "/games" },
      {
        key: "ctaSecondaryLabel",
        label: t("blocks.secondaryCtaText"),
        type: "text",
        placeholder: t("blocks.learnMore"),
      },
      { key: "ctaSecondaryUrl", label: t("blocks.secondaryCtaUrl"), type: "url" },
      {
        key: "overlay",
        label: t("blocks.overlayStyle"),
        type: "select",
        options: [
          { label: t("blocks.dark"), value: "dark" },
          { label: t("blocks.gradient"), value: "gradient" },
          { label: t("blocks.none"), value: "none" },
        ],
      },
    ],
  },
  {
    type: "richtext",
    label: t("blocks.richText"),
    icon: "FileText",
    description: t("blocks.formattedTextContentBlockWith"),
    color: "#E040FB",
    category: "content",
    defaultData: { content: "", format: "markdown" } satisfies RichtextBlockData as any,
    fields: [
      {
        key: "content",
        label: t("common.content"),
        type: "textarea",
        required: true,
        placeholder: t("blocks.writeInMarkdown"),
      },
      {
        key: "format",
        label: t("blocks.format"),
        type: "select",
        options: [
          { label: t("common.markdown"), value: "markdown" },
          { label: "HTML", value: "html" },
        ],
      },
    ],
  },
  {
    type: "image-gallery",
    label: t("blocks.imageGallery"),
    icon: "Images",
    description: t("blocks.gridMasonryOrCarouselOf"),
    color: "#FF6E40",
    category: "media",
    defaultData: { images: [], layout: "grid", columns: 3 } satisfies ImageGalleryBlockData as any,
    fields: [
      {
        key: "images",
        label: t("blocks.imagenes"),
        type: "gallery",
        required: true,
        helpText: "[{\"url\":\"...\",\"alt\":\"...\",\"caption\":\"...\"}]",
      },
      {
        key: "layout",
        label: t("blocks.layout"),
        type: "select",
        options: [
          { label: t("blocks.grid"), value: "grid" },
          { label: t("blocks.masonry"), value: "masonry" },
          { label: t("blocks.carousel"), value: "carousel" },
        ],
      },
      { key: "columns", label: t("blocks.columns"), type: "number" },
    ],
  },
  {
    type: "character-builder",
    label: t("blocks.characterBuilder"),
    icon: "Hammer",
    description: t("blocks.builderDeKonCharacterBuilder"),
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
        label: t("blocks.builder"),
        type: "remote-select",
        required: true,
        source: {
          endpoint: "/builder/definitions",
          listKey: "data",
          valueKey: "slug",
          labelKey: "name",
        },
        helpText:
          t("blocks.ayudaDefinicionesPublicadas"),
      },
      {
        key: "allowSave",
        label: t("blocks.permitirGuardarYCompartir"),
        type: "boolean",
        helpText: t("blocks.anadeElBotonDeGuardar"),
      },
      {
        key: "initialCode",
        label: t("blocks.buildInicialCodigo"),
        type: "text",
        placeholder: "",
        helpText: t("blocks.arrancaConUnaBuildYa"),
      },
    ],
  },
  {
    type: "comments",
    label: t("blocks.comentarios"),
    icon: "MessageSquare",
    description: t("blocks.hiloDeKonCommentsSobre"),
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
        label: t("blocks.tipoDeSujeto"),
        type: "select",
        required: true,
        options: [
          { label: t("blocks.articuloDelBlog"), value: "blog_post" },
          { label: t("blocks.paginaDelConstructor"), value: "block_page" },
          { label: t("blocks.paginaDeWiki"), value: "wiki_page" },
        ],
        helpText:
          t("blocks.ayudaVocabularioSujetos"),
      },
      {
        key: "subjectId",
        label: t("blocks.idDelSujetoOpcional"),
        type: "text",
        placeholder: "",
        helpText: t("blocks.vacioElDeEstaPagina"),
      },
      {
        key: "orden",
        label: t("blocks.orden"),
        type: "select",
        options: [
          { label: t("blocks.mejores"), value: "mejores" },
          { label: t("blocks.nuevos"), value: "nuevos" },
          { label: t("blocks.antiguos"), value: "antiguos" },
        ],
      },
      {
        key: "allowReplies",
        label: t("blocks.permitirResponder"),
        type: "boolean",
        helpText: t("blocks.apagadoDejaElHiloEn"),
      },
    ],
  },
  {
    type: "tier-list",
    label: t("blocks.tierList"),
    icon: "ListOrdered",
    description: t("blocks.tierListDeKonTierlist"),
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
        label: t("blocks.tierList2"),
        type: "remote-select",
        required: true,
        source: {
          endpoint: "/tierlist/templates",
          listKey: "data",
          valueKey: "slug",
          labelKey: "title",
        },
        helpText:
          t("blocks.ayudaPlantillaTierList"),
      },
      {
        key: "showUnranked",
        label: t("blocks.mostrarSinRanquear"),
        type: "boolean",
        helpText: t("blocks.elPoolDeLoQue"),
      },
      {
        key: "allowFork",
        label: t("blocks.permitirQueElLectorHaga"),
        type: "boolean",
        helpText: t("blocks.anadeUnBotonParaBifurcar"),
      },
      {
        key: "note",
        label: t("blocks.nota"),
        type: "text",
        helpText: t("blocks.bajoElTituloDeDonde"),
      },
      {
        key: "compareWith",
        label: t("blocks.compararConIdDeVersion"),
        type: "text",
        placeholder: "",
        helpText: t("blocks.pintaElDiffQuienSubio"),
      },
    ],
  },
  {
    type: "game-map",
    label: t("blocks.gameMap"),
    icon: "Map",
    description: t("blocks.mapaInteractivoReferenciaUnMapa"),
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
        label: t("blocks.mapaSlugDeKonMaps"),
        type: "text",
        placeholder: "acto-1",
        helpText:
          t("blocks.ayudaMapaRecomendado"),
      },
      {
        key: "layerId",
        label: t("blocks.capaInicial"),
        type: "text",
        placeholder: "surface",
        helpText: t("blocks.vacioLaPrimeraCapaDel"),
      },
      {
        key: "cluster",
        label: t("blocks.agruparMarcadores"),
        type: "number",
        helpText:
          t("blocks.ayudaTamanoCelda"),
      },
      {
        key: "mapImageUrl",
        label: t("blocks.imagenDelMapaModoSuelto"),
        type: "url",
        placeholder: "https://...",
        helpText: t("blocks.heredadoSoloSiNoUsas"),
      },
      { key: "mapTitle", label: t("blocks.mapTitle"), type: "text", placeholder: t("blocks.worldMap") },
      {
        key: "markers",
        label: t("blocks.markersJson"),
        type: "json",
        helpText: "[{\"id\":\"1\",\"label\":\"Town\",\"x\":50,\"y\":30}]",
      },
      {
        key: "categories",
        label: t("blocks.categoriesJson"),
        type: "json",
        helpText: "[{\"name\":\"Towns\",\"color\":\"#00E5FF\",\"icon\":\"🏘️\"}]",
      },
    ],
  },
  {
    type: "streamer-widget",
    label: t("blocks.streamerWidget"),
    icon: "Tv",
    description: t("blocks.liveStreamEmbedWithChat"),
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
        label: t("blocks.channelName"),
        type: "text",
        required: true,
        placeholder: "ninja",
      },
      {
        key: "platform",
        label: t("common.platform"),
        type: "select",
        options: [
          { label: t("blocks.twitch"), value: "twitch" },
          { label: t("blocks.youtube"), value: "youtube" },
          { label: t("blocks.kick"), value: "kick" },
        ],
      },
      { key: "showChat", label: t("blocks.showChat"), type: "boolean" },
      { key: "autoplay", label: t("blocks.autoplay"), type: "boolean" },
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
    label: t("blocks.videoOIncrustado"),
    icon: "Code2",
    description: t("blocks.pegaElEnlaceDeYoutube"),
    color: "#40C4FF",
    category: "media",
    defaultData: { url: "", caption: "", aspectRatio: "16:9" } satisfies EmbedBlockData as any,
    fields: [
      {
        key: "url",
        label: t("blocks.enlaceDelVideo"),
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
          t("blocks.ayudaEnlaceVideo"),
      },
      { key: "caption", label: t("blocks.pie"), type: "text" },
      {
        key: "aspectRatio",
        label: t("blocks.aspectRatio"),
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
    label: t("blocks.calloutBox"),
    icon: "AlertTriangle",
    description: t("blocks.highlightedInfoWarningOrTip"),
    color: "#FFD600",
    category: "content",
    defaultData: { title: "", content: "", variant: "info" } satisfies CalloutBlockData as any,
    fields: [
      { key: "title", label: t("common.title"), type: "text", placeholder: t("blocks.note") },
      { key: "content", label: t("common.content"), type: "textarea", required: true },
      {
        key: "variant",
        label: t("blocks.variant"),
        type: "select",
        options: [
          { label: t("blocks.info"), value: "info" },
          { label: t("blocks.warning"), value: "warning" },
          { label: t("blocks.success"), value: "success" },
          { label: t("blocks.danger"), value: "danger" },
          { label: t("blocks.tip"), value: "tip" },
        ],
      },
    ],
  },
  {
    type: "facebook-group",
    label: t("blocks.grupoDeFacebook"),
    icon: "Users",
    description: t("blocks.tarjetaQueInvitaAUnirse"),
    color: "#1877F2",
    category: "content",
    defaultData: {
      url: "",
      title: "",
      description: "",
      ctaLabel: "",
    } satisfies FacebookGroupBlockData as any,
    fields: [
      {
        key: "url",
        label: t("blocks.enlaceDelGrupo"),
        type: "text",
        required: true,
        placeholder: "https://facebook.com/groups/…",
      },
      {
        key: "title",
        label: t("blocks.tituloOpcional"),
        type: "text",
        placeholder: t("blocks.uneteANuestroGrupoDe"),
      },
      { key: "description", label: t("blocks.textoOpcional"), type: "textarea" },
      {
        key: "ctaLabel",
        label: t("blocks.textoDelBotonOpcional"),
        type: "text",
        placeholder: t("blocks.unirmeAlGrupo"),
      },
    ],
  },
  {
    type: "divider",
    label: t("blocks.divider"),
    icon: "Minus",
    description: t("blocks.visualSeparatorBetweenContentSections"),
    color: "#9E9E9E",
    category: "layout",
    defaultData: { style: "gradient" } satisfies DividerBlockData as any,
    fields: [
      {
        key: "style",
        label: t("blocks.style"),
        type: "select",
        options: [
          { label: t("blocks.line"), value: "line" },
          { label: t("blocks.gradient"), value: "gradient" },
          { label: t("blocks.dots"), value: "dots" },
          { label: t("blocks.space"), value: "space" },
        ],
      },
    ],
  },
  // ── Smart Blocks ──
  {
    type: "dynamic-carousel",
    label: t("blocks.dynamicCarousel"),
    icon: "Clapperboard",
    description: t("blocks.autoPopulatedCarouselOfGames"),
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
        label: t("blocks.dataSource"),
        type: "select",
        required: true,
        options: [
          { label: t("common.games"), value: "games" },
          { label: t("common.streamers"), value: "streamers" },
        ],
      },
      {
        key: "sortBy",
        label: t("blocks.sortBy"),
        type: "select",
        options: [
          { label: t("blocks.releaseDate"), value: "date" },
          { label: t("common.score"), value: "score" },
          { label: t("common.name"), value: "name" },
        ],
      },
      { key: "limit", label: t("blocks.maxItems"), type: "number" },
      { key: "autoplay", label: t("blocks.autoplay"), type: "boolean" },
    ],
  },
  {
    type: "smart-filter",
    label: t("blocks.smartFilter"),
    icon: "SlidersHorizontal",
    description: t("blocks.dynamicGenrePlatformAndScore"),
    color: "#69F0AE",
    category: "interactive",
    defaultData: {
      enableGenreFilter: true,
      enablePlatformFilter: true,
      enableScoreSlider: false,
    } satisfies SmartFilterBlockData as any,
    fields: [
      { key: "enableGenreFilter", label: t("blocks.enableGenreFilter"), type: "boolean" },
      { key: "enablePlatformFilter", label: t("blocks.enablePlatformFilter"), type: "boolean" },
      { key: "enableScoreSlider", label: t("blocks.enableScoreSlider"), type: "boolean" },
      {
        key: "targetDatasetId",
        label: t("blocks.targetDatasetIdOptional"),
        type: "text",
        helpText: t("blocks.leaveEmptyToFilterGames"),
      },
    ],
  },
  {
    type: "comparison-slider",
    label: t("blocks.comparisonSlider"),
    icon: "Columns",
    description: t("blocks.beforeAfterImageComparisonWith"),
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
        label: t("blocks.beforeImage"),
        type: "image",
        required: true,
        placeholder: "https://...",
      },
      {
        key: "afterImageUrl",
        label: t("blocks.afterImage"),
        type: "image",
        required: true,
        placeholder: "https://...",
      },
      { key: "beforeLabel", label: t("blocks.beforeLabel"), type: "text", placeholder: t("blocks.before") },
      { key: "afterLabel", label: t("blocks.afterLabel"), type: "text", placeholder: t("blocks.after") },
    ],
  },
  {
    type: "smart-grid",
    label: t("blocks.smartDataGrid"),
    icon: "Table2",
    description: t("blocks.airtableStyleDataGridWith"),
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
        label: t("blocks.datasetId"),
        type: "text",
        required: true,
        placeholder: t("blocks.pasteDatasetUuid"),
      },
      {
        key: "columns",
        label: t("blocks.visibleColumnsJson"),
        type: "json",
        helpText: t("blocks.nameDamageRarityEmptyArray"),
      },
      { key: "initialSort", label: t("blocks.defaultSortField"), type: "text", placeholder: t("blocks.eGName") },
      {
        key: "initialFilter",
        label: t("blocks.initialFilterJson"),
        type: "json",
        helpText: "{\"rarity\": \"Legendary\"}",
      },
      { key: "enableGrouping", label: t("blocks.enableGrouping"), type: "boolean" },
      { key: "groupByField", label: t("blocks.groupByField"), type: "text", placeholder: t("blocks.eGRarity") },
    ],
  },
  {
    type: "habitat-map",
    label: t("blocks.habitatMap"),
    icon: "MapPin",
    description:
      t("blocks.queHayEnCadaRegion"),
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
        label: t("blocks.dataset"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      {
        key: "groupField",
        label: t("blocks.campoDeRegiones"),
        type: "text",
        required: true,
        placeholder: "habitats",
      },
      { key: "nameField", label: t("blocks.campoDeNombre"), type: "text", placeholder: "name" },
      { key: "imageField", label: t("blocks.campoDeImagen"), type: "text", placeholder: "image" },
      { key: "tagField", label: t("blocks.campoParaFiltrar"), type: "text", placeholder: "elements" },
      {
        key: "filterField",
        label: t("blocks.soloFilasConElCampo"),
        type: "text",
        placeholder: "in_index",
      },
      {
        key: "filterValue",
        label: t("blocks.igualAJson"),
        type: "json",
        helpText: t("blocks.trueBasicForm"),
      },
      { key: "title", label: t("blocks.titulo"), type: "text" },
      {
        key: "note",
        label: t("blocks.nota"),
        type: "text",
        helpText: t("blocks.deDondeSaleElDato"),
      },
    ],
  },
  {
    type: "stat-compare",
    label: t("blocks.statCompare"),
    icon: "Scale",
    description: t("blocks.comparaHastaTresFilasDe"),
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
        label: t("blocks.dataset"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      {
        key: "stats",
        label: t("blocks.statsJson"),
        type: "json",
        required: true,
        helpText: t("blocks.camposNumericosDelDataset"),
      },
      { key: "nameField", label: t("blocks.campoDeNombre"), type: "text", placeholder: "name" },
      { key: "imageField", label: t("blocks.campoDeImagen"), type: "text", placeholder: "image" },
      { key: "tagField", label: t("blocks.campoDeEtiquetas"), type: "text", placeholder: "elements" },
      { key: "filterField", label: t("blocks.soloFilasConElCampo"), type: "text" },
      { key: "filterValue", label: t("blocks.igualAJson"), type: "json" },
      { key: "title", label: t("blocks.titulo"), type: "text" },
      { key: "note", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "event-search",
    label: t("blocks.buscadorDeEventos"),
    icon: "Search",
    description: t("blocks.buscaEnUnDatasetDe"),
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
        label: t("blocks.datasetDeEventos"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text", required: true },
      { key: "descripcion", label: t("common.descripcion"), type: "textarea" },
      { key: "campos", label: t("blocks.camposJson"), type: "json" },
      { key: "nota", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "race-planner",
    label: t("blocks.calendarioDeCarreras"),
    icon: "CalendarRange",
    description: t("blocks.lasFilasDeUnDataset"),
    color: "#38BDF8",
    category: "interactive",
    defaultData: {
      datasetId: "",
      titulo: "",
      campos: {
        nombre: "name",
        turnos: "turns",
        grado: "grade",
        superficie: "surface",
        distancia: "distance",
        sede: "venue",
      },
      nota: "",
    } satisfies RacePlannerBlockData as any,
    fields: [
      {
        key: "datasetId",
        label: t("blocks.datasetDeCarreras"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text", required: true },
      { key: "descripcion", label: t("common.descripcion"), type: "textarea" },
      { key: "campos", label: t("blocks.camposJson"), type: "json" },
      { key: "nota", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "card-browser",
    label: t("blocks.catalogoDeCartas"),
    icon: "LayoutGrid",
    description: t("blocks.lasCartasDeUnJuego"),
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
        label: t("blocks.juegoDeCartas"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/cardsim/games", listKey: "data", valueKey: "slug", labelKey: "name" },
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text", required: true },
      { key: "descripcion", label: t("common.descripcion"), type: "textarea" },
      { key: "facetas", label: t("blocks.facetasJson"), type: "json" },
      { key: "nota", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "deck-builder",
    label: t("blocks.constructorDeMazos"),
    icon: "Layers",
    description:
      t("blocks.construyeUnMazoContraLas"),
    color: "#F59E0B",
    category: "interactive",
    defaultData: {
      juegoDeCartas: "",
      titulo: "Constructor de mazos",
    } satisfies DeckBuilderBlockData as any,
    fields: [
      {
        key: "juegoDeCartas",
        label: t("blocks.juegoDeCartas"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/cardsim/games", listKey: "data", valueKey: "slug", labelKey: "name" },
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text", required: true },
      { key: "descripcion", label: t("common.descripcion"), type: "textarea" },
      { key: "nota", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "deck-showcase",
    label: t("blocks.escaparateDeMazos"),
    icon: "Trophy",
    description: t("blocks.losMazosPublicadosDeUn"),
    color: "#F59E0B",
    category: "interactive",
    defaultData: {
      juegoDeCartas: "",
      titulo: "Mazos de la comunidad",
    } satisfies DeckShowcaseBlockData as any,
    fields: [
      {
        key: "juegoDeCartas",
        label: t("blocks.juegoDeCartas"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/cardsim/games", listKey: "data", valueKey: "slug", labelKey: "name" },
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text", required: true },
      { key: "descripcion", label: t("common.descripcion"), type: "textarea" },
      { key: "nota", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "deck",
    label: t("blocks.mazoDelMeta"),
    icon: "Layers",
    description:
      t("blocks.unArquetipoDelMetaO"),
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
        label: t("blocks.juego"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/games", listKey: "docs", valueKey: "slug", labelKey: "title" },
      },
      {
        key: "arquetipo",
        label: t("blocks.arquetipo"),
        type: "text",
        helpText:
          t("blocks.elIdDelArquetipoEl"),
      },
      {
        key: "mazo",
        label: t("blocks.listaConcretaOpcional"),
        type: "text",
        helpText:
          t("blocks.elIdDeUnaLista"),
      },
      {
        key: "vista",
        label: t("blocks.queEnsenar"),
        type: "select",
        options: [
          { value: "resumen", label: t("blocks.fichaResumidaCifrasYCartas") },
          { value: "lista", label: t("blocks.soloLaListaDeCartas") },
        ],
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text" },
      { key: "nota", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "affinity",
    label: t("blocks.calculadoraDeAfinidad"),
    icon: "GitMerge",
    description:
      t("blocks.arbolDeHerenciaEntrenadaProgenitores"),
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
        label: t("blocks.datasetDePersonajes"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text", required: true },
      { key: "descripcion", label: t("common.descripcion"), type: "textarea" },
      { key: "campos", label: t("blocks.camposJson"), type: "json" },
      { key: "etiquetas", label: t("blocks.nombresDelArbolJson"), type: "json" },
      { key: "nota", label: t("blocks.nota"), type: "text" },
    ],
  },
  {
    type: "dex",
    label: t("blocks.indiceConFichas"),
    icon: "Library",
    description:
      t("blocks.indiceFiltrableDeUnDataset"),
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
        label: t("blocks.dataset"),
        type: "remote-select",
        required: true,
        source: { endpoint: "/data-sets", listKey: "docs", valueKey: "id", labelKey: "name" },
      },
      { key: "titulo", label: t("blocks.titulo"), type: "text", required: true, placeholder: t("blocks.aniidex") },
      {
        key: "segmento",
        label: t("blocks.direccion"),
        type: "text",
        placeholder: "aniidex",
        helpText: "/<juego>/<dirección>. Letras, números y guiones.",
      },
      { key: "descripcion", label: t("common.descripcion"), type: "text" },
      {
        key: "campos",
        label: t("blocks.camposJson"),
        type: "json",
        required: true,
        helpText:
          "{\"clave\": \"slug\", \"nombre\": \"name\", \"imagen\": \"image\", \"numero\": \"entry\", \"total\": \"total\"}",
      },
      {
        key: "facetas",
        label: t("blocks.filtrosJson"),
        type: "json",
        helpText:
          t("blocks.text6"),
      },
      {
        key: "stats",
        label: t("blocks.statsJson"),
        type: "json",
        helpText: "[{\"key\": \"hp\", \"label\": \"Vida\"}]",
      },
      {
        key: "habilidades",
        label: t("blocks.habilidadesJson"),
        type: "json",
        helpText: t("blocks.datasetClaveYGruposDe"),
      },
      { key: "rasgo", label: t("blocks.rasgoJson"), type: "json" },
      { key: "evolucion", label: t("blocks.lineaEvolutivaJson"), type: "json" },
      {
        key: "chips",
        label: t("blocks.listasJson"),
        type: "json",
        helpText: t("blocks.text8"),
      },
      { key: "noticias", label: t("blocks.noticiasJson"), type: "json" },
      { key: "nota", label: t("blocks.nota"), type: "text", helpText: t("blocks.deDondeSalenLosDatos") },
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
