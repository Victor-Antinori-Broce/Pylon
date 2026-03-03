/**
 * GremiusCMS — Component Registry Store
 *
 * Manages the registry of content blocks available in the editor.
 * Combines built-in blocks (BLOCK_REGISTRY) with module-registered blocks
 * from the PluginRegistry.
 *
 * This is the single source of truth for "what blocks can be inserted".
 */

import { defineStore } from "pinia";
import { computed } from "vue";
import { BLOCK_REGISTRY, type BlockDefinition, type BlockFieldDef, type PageBlock } from "../types/blocks";
import { pluginRegistry, type PluginBlockDefinition } from "../registries/PluginRegistry";

export const useComponentRegistry = defineStore("componentRegistry", () => {
  /**
   * All available blocks = built-in + plugin-registered.
   * Plugin blocks override built-in blocks with the same type.
   */
  const allBlocks = computed<BlockDefinition[]>(() => {
    const pluginBlocks = pluginRegistry.getBlocks();

    // Start with built-in blocks
    const merged = new Map<string, BlockDefinition>();
    for (const block of BLOCK_REGISTRY) {
      merged.set(block.type, block);
    }

    // Plugin blocks override or add
    for (const block of pluginBlocks) {
      merged.set(block.type, block);
    }

    return Array.from(merged.values());
  });

  /**
   * Blocks grouped by category for the "Add Block" panel.
   */
  const blocksByCategory = computed(() => {
    const categories = new Map<string, BlockDefinition[]>();

    for (const block of allBlocks.value) {
      const cat = block.category || "other";
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat)!.push(block);
    }

    return categories;
  });

  /**
   * Search blocks by label or description.
   */
  function searchBlocks(query: string): BlockDefinition[] {
    if (!query.trim()) return allBlocks.value;
    const q = query.toLowerCase();
    return allBlocks.value.filter(
      (b) =>
        b.label.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q)
    );
  }

  /**
   * Get a block definition by type.
   */
  function getBlockDef(type: string): BlockDefinition | undefined {
    return allBlocks.value.find((b) => b.type === type);
  }

  /**
   * Create a new block instance with default data.
   */
  function createBlock(type: string, order: number): PageBlock {
    const def = getBlockDef(type);
    return {
      id: `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: type as any,
      data: structuredClone(def?.defaultData || {}),
      order,
    };
  }

  /**
   * Validate block data against its field definitions.
   */
  function validateBlock(block: PageBlock): { valid: boolean; errors: string[] } {
    const def = getBlockDef(block.type);
    if (!def) return { valid: false, errors: [`Unknown block type: ${block.type}`] };

    const errors: string[] = [];
    for (const field of def.fields) {
      if (field.required && !block.data[field.key]) {
        errors.push(`${field.label} is required`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  return {
    allBlocks,
    blocksByCategory,
    searchBlocks,
    getBlockDef,
    createBlock,
    validateBlock,
  };
});
