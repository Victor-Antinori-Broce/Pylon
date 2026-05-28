/**
 * @gremius/grimoire-blog — Blog Posts (Grimoire Core)
 *
 * Publishing platform with rich text editor, scheduling,
 * tags, and SEO overrides.
 *
 * Layer: Grimoire Core (Nivel 3 — loaded via module-loader)
 * Mount: /api/blog
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTE: This grimoire is now self-contained and uses dependency injection.
 * It does NOT import from apps/api/src/ anymore.
 * ═══════════════════════════════════════════════════════════════════════════
 */
// Re-export desde src/
export * from "./src/index";
export { default } from "./src/index";
//# sourceMappingURL=index.js.map