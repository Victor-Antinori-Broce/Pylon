/**
 * Grimoire: Page Builder (Core)
 *
 * Lego-style block system for dynamic page layouts with drag & drop.
 * Toggleable Core Grimoire.
 *
 * @version 1.0.0
 */
import type { GrimoireDefinition } from "@gremius/shared";
import { createBlocksRouter } from "./blocks.routes";
export { pages, blocks, blockTemplates, } from "./blocks.schema";
export type { Page, NewPage, Block, NewBlock, BlockTemplate, NewBlockTemplate, BlockContent, HeroBlockContent, TextBlockContent, ImageBlockContent, VideoBlockContent, GridBlockContent, CardsBlockContent, QuoteBlockContent, CtaBlockContent, EmbedBlockContent, DividerBlockContent, SpacerBlockContent, CustomBlockContent, } from "./blocks.schema";
export declare const grimoire: GrimoireDefinition;
export default grimoire;
export declare const pageBuilderRoutes: typeof createBlocksRouter;
//# sourceMappingURL=index.d.ts.map