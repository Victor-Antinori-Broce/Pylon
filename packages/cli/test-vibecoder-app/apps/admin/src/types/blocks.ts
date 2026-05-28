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
  | "streamer-widget"
  | "embed"
  | "callout"
  | "divider"
  | "dynamic-carousel"
  | "smart-filter"
  | "comparison-slider"
  | "smart-grid";

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
  content: string;        // Markdown or HTML
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
  columns: string[];              // visible column keys (empty = show all)
  initialSort?: string;           // field key to sort by default
  initialFilter?: Record<string, any>;  // e.g. { type: "Sword" }
  enableGrouping: boolean;
  groupByField?: string;          // field key to group by
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
  type: "text" | "textarea" | "url" | "select" | "number" | "boolean" | "json" | "image";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
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
      { key: "title", label: "Title", type: "text", required: true, placeholder: "Hero headline..." },
      { key: "subtitle", label: "Subtitle", type: "textarea", placeholder: "Supporting text..." },
      { key: "imageUrl", label: "Background Image", type: "url", placeholder: "https://..." },
      { key: "ctaLabel", label: "CTA Button Text", type: "text", placeholder: "Get Started" },
      { key: "ctaUrl", label: "CTA Button URL", type: "url", placeholder: "/games" },
      { key: "ctaSecondaryLabel", label: "Secondary CTA Text", type: "text", placeholder: "Learn More" },
      { key: "ctaSecondaryUrl", label: "Secondary CTA URL", type: "url" },
      {
        key: "overlay", label: "Overlay Style", type: "select", options: [
          { label: "Dark", value: "dark" },
          { label: "Gradient", value: "gradient" },
          { label: "None", value: "none" },
        ]
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
      { key: "content", label: "Content", type: "textarea", required: true, placeholder: "Write in Markdown..." },
      {
        key: "format", label: "Format", type: "select", options: [
          { label: "Markdown", value: "markdown" },
          { label: "HTML", value: "html" },
        ]
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
      { key: "images", label: "Images (JSON)", type: "json", required: true, helpText: '[{"url":"...","alt":"...","caption":"..."}]' },
      {
        key: "layout", label: "Layout", type: "select", options: [
          { label: "Grid", value: "grid" },
          { label: "Masonry", value: "masonry" },
          { label: "Carousel", value: "carousel" },
        ]
      },
      { key: "columns", label: "Columns", type: "number" },
    ],
  },
  {
    type: "game-map",
    label: "Game Map",
    icon: "Map",
    description: "Interactive pannable map with markers",
    color: "#76FF03",
    category: "interactive",
    defaultData: { mapImageUrl: "", mapTitle: "Map", markers: [], categories: [] } satisfies GameMapBlockData as any,
    fields: [
      { key: "mapImageUrl", label: "Map Image URL", type: "url", required: true, placeholder: "https://..." },
      { key: "mapTitle", label: "Map Title", type: "text", placeholder: "World Map" },
      { key: "markers", label: "Markers (JSON)", type: "json", helpText: '[{"id":"1","label":"Town","x":50,"y":30}]' },
      { key: "categories", label: "Categories (JSON)", type: "json", helpText: '[{"name":"Towns","color":"#00E5FF","icon":"🏘️"}]' },
    ],
  },
  {
    type: "streamer-widget",
    label: "Streamer Widget",
    icon: "Tv",
    description: "Live stream embed with chat option",
    color: "#FF2A6D",
    category: "interactive",
    defaultData: { channelName: "", platform: "twitch", showChat: false, autoplay: false } satisfies StreamerWidgetBlockData as any,
    fields: [
      { key: "channelName", label: "Channel Name", type: "text", required: true, placeholder: "ninja" },
      {
        key: "platform", label: "Platform", type: "select", options: [
          { label: "Twitch", value: "twitch" },
          { label: "YouTube", value: "youtube" },
          { label: "Kick", value: "kick" },
        ]
      },
      { key: "showChat", label: "Show Chat", type: "boolean" },
      { key: "autoplay", label: "Autoplay", type: "boolean" },
    ],
  },
  {
    type: "embed",
    label: "Embed",
    icon: "Code2",
    description: "YouTube, Twitter, or any oEmbed URL",
    color: "#40C4FF",
    category: "media",
    defaultData: { url: "", caption: "", aspectRatio: "16:9" } satisfies EmbedBlockData as any,
    fields: [
      { key: "url", label: "Embed URL", type: "url", required: true, placeholder: "https://youtube.com/watch?v=..." },
      { key: "caption", label: "Caption", type: "text" },
      {
        key: "aspectRatio", label: "Aspect Ratio", type: "select", options: [
          { label: "16:9", value: "16:9" },
          { label: "4:3", value: "4:3" },
          { label: "1:1", value: "1:1" },
        ]
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
        key: "variant", label: "Variant", type: "select", options: [
          { label: "Info", value: "info" },
          { label: "Warning", value: "warning" },
          { label: "Success", value: "success" },
          { label: "Danger", value: "danger" },
          { label: "Tip", value: "tip" },
        ]
      },
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
        key: "style", label: "Style", type: "select", options: [
          { label: "Line", value: "line" },
          { label: "Gradient", value: "gradient" },
          { label: "Dots", value: "dots" },
          { label: "Space", value: "space" },
        ]
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
    defaultData: { source: "games", sortBy: "date", limit: 8, autoplay: false } satisfies DynamicCarouselBlockData as any,
    fields: [
      {
        key: "source", label: "Data Source", type: "select", required: true, options: [
          { label: "Games", value: "games" },
          { label: "Streamers", value: "streamers" },
        ]
      },
      {
        key: "sortBy", label: "Sort By", type: "select", options: [
          { label: "Release Date", value: "date" },
          { label: "Score", value: "score" },
          { label: "Name", value: "name" },
        ]
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
    defaultData: { enableGenreFilter: true, enablePlatformFilter: true, enableScoreSlider: false } satisfies SmartFilterBlockData as any,
    fields: [
      { key: "enableGenreFilter", label: "Enable Genre Filter", type: "boolean" },
      { key: "enablePlatformFilter", label: "Enable Platform Filter", type: "boolean" },
      { key: "enableScoreSlider", label: "Enable Score Slider", type: "boolean" },
      { key: "targetDatasetId", label: "Target Dataset ID (optional)", type: "text", helpText: "Leave empty to filter Games" },
    ],
  },
  {
    type: "comparison-slider",
    label: "Comparison Slider",
    icon: "Columns",
    description: "Before/After image comparison with draggable handle",
    color: "#B388FF",
    category: "media",
    defaultData: { beforeImageUrl: "", afterImageUrl: "", beforeLabel: "Before", afterLabel: "After" } satisfies ComparisonSliderBlockData as any,
    fields: [
      { key: "beforeImageUrl", label: "Before Image", type: "image", required: true, placeholder: "https://..." },
      { key: "afterImageUrl", label: "After Image", type: "image", required: true, placeholder: "https://..." },
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
    defaultData: { datasetId: "", columns: [], initialSort: "", initialFilter: {}, enableGrouping: false, groupByField: "" } satisfies SmartGridBlockData as any,
    fields: [
      { key: "datasetId", label: "Dataset ID", type: "text", required: true, placeholder: "Paste dataset UUID..." },
      { key: "columns", label: "Visible Columns (JSON)", type: "json", helpText: '["name", "damage", "rarity"] — empty array shows all' },
      { key: "initialSort", label: "Default Sort Field", type: "text", placeholder: "e.g. name" },
      { key: "initialFilter", label: "Initial Filter (JSON)", type: "json", helpText: '{"rarity": "Legendary"}' },
      { key: "enableGrouping", label: "Enable Grouping", type: "boolean" },
      { key: "groupByField", label: "Group By Field", type: "text", placeholder: "e.g. rarity" },
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
