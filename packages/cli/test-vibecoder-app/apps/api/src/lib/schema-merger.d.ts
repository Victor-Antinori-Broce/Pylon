/**
 * GremiusCMS — Dynamic Schema Merger (The Arcane Schema Weaver)
 *
 * Reads realm.json manifests and dynamically imports each grimoire's
 * Drizzle schema file, merging all exports into a single object
 * alongside the core schema.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Schema sources:
 *   1. Core schema: ./src/db/schema.ts
 *   2. Grimoire schemas: packages/grimoires/{grimoire}/{grimoire}.schema.ts
 *   3. Legacy theme modules: packages/realms/{realm}/grimoires/... (fallback)
 *
 * Used by db/index.ts to pass a complete schema to drizzle().
 * NOTE: schema-all.ts (static) is kept for drizzle-kit code generation.
 */
/**
 * Dynamically build a merged schema object from core + active grimoires + realm grimoires.
 * Uses Bun's native dynamic import().
 */
export declare function buildMergedSchema(): Promise<Record<string, unknown>>;
/**
 * @deprecated Use buildMergedSchema instead
 */
export declare const buildDynamicSchema: typeof buildMergedSchema;
//# sourceMappingURL=schema-merger.d.ts.map