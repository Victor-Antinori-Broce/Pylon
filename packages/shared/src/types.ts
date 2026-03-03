/**
 * GremiusCMS Shared Types
 * These types mirror the Drizzle schema for frontend use
 */

// ─── Page Block System ("Lego" Architecture) ──────────────────
export interface PageBlock {
  id: string;
  type: string;
  data: Record<string, any>;
  order: number;
}

// ─── Media ────────────────────────────────────────────────────
export interface SEOMeta {
  title?: string;
  description?: string;
  image?: MediaItem;
  canonicalUrl?: string;
  noIndex?: boolean;
}

export interface MediaItem {
  id: string;
  url: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  sizes?: {
    thumbnail?: { url: string; width: number; height: number };
    card?: { url: string; width: number; height: number };
    hero?: { url: string; width: number; height: number };
    og?: { url: string; width: number; height: number };
  };
}

// ─── Core Entities ────────────────────────────────────────────
export interface Platform {
  id: string;
  name: string;
  slug: string;
  shortName?: string;
  manufacturer?: string;
  icon?: MediaItem;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color?: string;
  category?: "genre" | "feature" | "topic" | "series";
}

export interface Game {
  id: string;
  title: string;
  slug: string;
  subtitle?: string;
  description?: unknown; // Lexical JSON
  excerpt?: string;
  releaseDate?: string;
  status: "draft" | "published" | "archived";
  platforms?: Platform[];
  tags?: Tag[];
  developer?: string;
  publisher?: string;
  metacriticScore?: number;
  userRating?: number;
  coverArt?: MediaItem;
  screenshots?: Array<{ image: MediaItem; caption?: string }>;
  externalIds?: {
    igdbId?: number;
    steamAppId?: number;
    twitchGameId?: string;
  };
  trailerUrl?: string;
  streamers?: Streamer[];
  blocks?: PageBlock[];
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: unknown; // Lexical JSON
  excerpt?: string;
  status: "draft" | "published" | "scheduled";
  publishedAt?: string;
  author: {
    id: string;
    displayName: string;
    avatar?: MediaItem;
  };
  tags?: Tag[];
  relatedGames?: Game[];
  featuredImage?: MediaItem;
  readingTime?: number;
  seoOverrides?: {
    canonicalUrl?: string;
    noIndex?: boolean;
    structuredDataType?: string;
  };
  meta?: SEOMeta;
  blocks?: PageBlock[];
}

/**
 * Define la estructura de una Vertical (App) que se instala sobre el Gremius Core.
 * @example
 * export default defineApp({ id: 'gremio-cms', name: 'Gaming CMS' ... })
 */
export interface AppManifest {
  /** El identificador único de la app (slug). Se usará para montar las rutas en /api/apps/:id */
  id: string;

  /**
   * Los esquemas dinámicos que esta app inyectará en la base de datos core.
   * Estos esquemas se guardarán dentro del JSONB de `data_entries`.
   */
  schemas: SchemaDefinition[];

  /**
   * Bloques visuales específicos de esta vertical que se expondrán a Inti.js.
   * Ej: 'tournament-bracket', 'twitch-player'.
   */
  blocks?: any[];
}

/**
 * Define la estructura dinámica de una tabla o colección inyectada por una Vertical.
 * Le dice al AppRegistry cómo validar y estructurar los datos en el JSONB.
 */
export interface SchemaDefinition {
  /** El nombre interno del campo que se usará como clave en el JSONB */
  fieldName: string;
  /** El tipo de dato visual y estructural (string, number, relation, boolean, etc.) */
  fieldType: string;
  /** Determina si el campo es estricto y requerido al guardar */
  required?: boolean;
  /** Configuraciones extra como selectores de opciones, referencias a otras tablas, etc. */
  options?: string;
  /** Valor inicial por defecto al instanciar un nuevo registro */
  defaultValue?: string;
}

export interface DataSet {
  id: string;
  name: string;
  slug: string;
  description?: string;
  game: Game;
  icon?: string;
  schema: SchemaDefinition[];
  displayConfig?: {
    titleField?: string;
    sortField?: string;
    sortDirection?: "asc" | "desc";
  };
}

/**
 * Contrato Maestro de Persistencia (DataEntry).
 * Representa un registro de datos dinámico proveniente de una Vertical
 * serializado y almacenado globalmente en formato JSONB.
 */
export interface DataEntry {
  /** ID único del registro (UUID) */
  id: string;
  /** Título representativo del registro para el panel de administración */
  title: string;
  /** El esquema/dataset al que pertenece esta entrada, indicando qué Vertical lo controla */
  dataSet: DataSet;
  /** Payload dinámico en JSONB con la información real de la estructura de la Vertical */
  data: Record<string, unknown>;
  /** Imagen miniatura opcional para mostrar en grids/listas */
  thumbnail?: MediaItem;
  /** Posición de ordenamiento relativo del registro */
  sortOrder?: number;
  /** Estado de publicación (Borrador o Publicado) */
  status: "draft" | "published";
}

export interface Streamer {
  id: string;
  displayName: string;
  slug: string;
  platform: "twitch" | "youtube" | "kick";
  channelId: string;
  channelUrl?: string;
  isLive?: boolean;
  currentStreamTitle?: string;
  viewerCount?: number;
  followerCount?: number;
  avatar?: MediaItem;
  thumbnailUrl?: string;
  games?: Game[];
  lastSyncedAt?: string;
}

export interface SiteSettings {
  siteName: string;
  siteDescription?: string;
  siteUrl: string;
  branding?: {
    logo?: MediaItem;
    favicon?: MediaItem;
    ogImage?: MediaItem;
    primaryColor?: string;
    accentColor?: string;
  };
  mainNav?: Array<{
    label: string;
    url: string;
    openInNewTab?: boolean;
  }>;
  social?: {
    twitter?: string;
    discord?: string;
    youtube?: string;
    twitch?: string;
    github?: string;
  };
  analytics?: {
    googleAnalyticsId?: string;
    plausibleDomain?: string;
  };
  footerText?: string;
}

export interface PaginatedResponse<T> {
  docs: T[];
  totalDocs: number;
  totalPages: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
