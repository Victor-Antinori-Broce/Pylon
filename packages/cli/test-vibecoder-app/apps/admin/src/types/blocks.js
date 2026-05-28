/**
 * Page Block System — Shared Types
 * Used by Admin (builder) and Web (renderer)
 */
export const BLOCK_REGISTRY = [
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
        },
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
        defaultData: { content: "", format: "markdown" },
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
        defaultData: { images: [], layout: "grid", columns: 3 },
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
        defaultData: { mapImageUrl: "", mapTitle: "Map", markers: [], categories: [] },
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
        defaultData: { channelName: "", platform: "twitch", showChat: false, autoplay: false },
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
        defaultData: { url: "", caption: "", aspectRatio: "16:9" },
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
        defaultData: { title: "", content: "", variant: "info" },
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
        defaultData: { style: "gradient" },
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
        defaultData: { source: "games", sortBy: "date", limit: 8, autoplay: false },
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
        defaultData: { enableGenreFilter: true, enablePlatformFilter: true, enableScoreSlider: false },
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
        defaultData: { beforeImageUrl: "", afterImageUrl: "", beforeLabel: "Before", afterLabel: "After" },
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
        defaultData: { datasetId: "", columns: [], initialSort: "", initialFilter: {}, enableGrouping: false, groupByField: "" },
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
export function createBlock(type, order) {
    const def = BLOCK_REGISTRY.find((b) => b.type === type);
    return {
        id: `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        data: structuredClone(def?.defaultData || {}),
        order,
    };
}
export function getBlockDef(type) {
    return BLOCK_REGISTRY.find((b) => b.type === type);
}
//# sourceMappingURL=blocks.js.map