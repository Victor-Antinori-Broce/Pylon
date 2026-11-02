/**
 * Kitsuden — Schema AGREGADO (AUTO-GENERADO)
 * ============================================================================
 * ⚠️ NO EDITAR A MANO. Regenerar con:  kitsuden sync-schema
 *
 * Fuente: bloque `schema` de cada kon.json con strategy "drizzle".
 * Los kons con strategy "sql" (auto-migración propia) se excluyen a
 * propósito para evitar colisiones de enums globales de Postgres.
 *
 * Reexporta schema-core primero; los `export {}` explícitos de un kon
 * AUTORITATIVO sobreescriben al `export *` de core (regla de TS
 * explícito-gana-estrella), resolviendo colisiones sin ambigüedad.
 */

// Core primero: los kons autoritativos (p.ej. media) sobreescriben sus
// símbolos vía export explícito más abajo.
export * from "./schema-core";

// ── kon-media ──
export {
  media,
  mediaFolders,
} from "../../../../packages/core/media/media.schema";
export type {
  Media,
  MediaFolder,
  NewMedia,
  NewMediaFolder,
  ThumbnailInfo,
  ThumbnailsMap,
} from "../../../../packages/core/media/media.schema";

// ── kon-blocks ──
export {
  blocks,
  blocksRelations,
  blockTemplates,
  pages,
  pagesRelations,
  pageStatusEnum,
  TIPOS_DE_BLOQUE,
} from "../../../../packages/core/blocks/blocks.schema";
export type {
  Block,
  BlockContent,
  BlockTemplate,
  CardItem,
  CardsBlockContent,
  CtaBlockContent,
  CustomBlockContent,
  DividerBlockContent,
  EmbedBlockContent,
  GridBlockContent,
  GridItem,
  HeroBlockContent,
  ImageBlockContent,
  NewBlock,
  NewBlockTemplate,
  NewPage,
  Page,
  QuoteBlockContent,
  SpacerBlockContent,
  TextBlockContent,
  TipoDeBloque,
  VideoBlockContent,
} from "../../../../packages/core/blocks/blocks.schema";
