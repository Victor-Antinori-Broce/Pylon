/**
 * Page Block System — Shared Types
 * Used by Admin (builder) and Web (renderer)
 */
export interface PageBlock {
    id: string;
    type: BlockType;
    data: Record<string, any>;
    order: number;
}
export type BlockType = "hero" | "richtext" | "image-gallery" | "game-map" | "streamer-widget" | "embed" | "callout" | "divider" | "dynamic-carousel" | "smart-filter" | "comparison-slider" | "smart-grid";
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
    content: string;
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
export interface GameMapBlockData {
    mapImageUrl: string;
    mapTitle?: string;
    markers: Array<{
        id: string;
        label: string;
        x: number;
        y: number;
        category?: string;
        description?: string;
        icon?: string;
    }>;
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
    columns: string[];
    initialSort?: string;
    initialFilter?: Record<string, any>;
    enableGrouping: boolean;
    groupByField?: string;
}
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
    type: "text" | "textarea" | "url" | "select" | "number" | "boolean" | "json" | "image";
    placeholder?: string;
    required?: boolean;
    options?: {
        label: string;
        value: string;
    }[];
    helpText?: string;
}
export declare const BLOCK_REGISTRY: BlockDefinition[];
export declare function createBlock(type: BlockType, order: number): PageBlock;
export declare function getBlockDef(type: BlockType): BlockDefinition | undefined;
//# sourceMappingURL=blocks.d.ts.map