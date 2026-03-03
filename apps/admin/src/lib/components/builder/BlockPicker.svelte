<script lang="ts">
  /**
   * BlockPicker.svelte — Grid of available blocks to add
   */
  import { X, Sparkles, FileText, Images, Map, Tv, Code2, AlertTriangle, Minus, Clapperboard, SlidersHorizontal, Columns, Table2 } from "lucide-svelte";
  import { BLOCK_REGISTRY, type BlockType } from "../../../types/blocks";

  interface Props {
    onAdd?: (type: BlockType) => void;
    onClose?: () => void;
  }
  
  let { onAdd, onClose }: Props = $props();

  const iconMap: Record<string, typeof Sparkles> = {
    Sparkles, FileText, Images, Map, Tv, Code2, AlertTriangle, Minus,
    Clapperboard, SlidersHorizontal, Columns, Table2,
  };

  const categories = [
    { id: "content", label: "Content" },
    { id: "media", label: "Media" },
    { id: "interactive", label: "Interactive" },
    { id: "layout", label: "Layout" },
  ];

  function getBlockIcon(iconName: string): typeof Sparkles {
    return iconMap[iconName] || FileText;
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="p-4 border-b border-gremius-border flex items-center justify-between">
    <h3 class="text-sm font-semibold text-gremius-text">Add Block</h3>
    <button onclick={onClose} class="btn-icon p-1"><X class="w-4 h-4" /></button>
  </div>

  <!-- Block Categories -->
  <div class="flex-1 overflow-y-auto p-4 space-y-6">
    {#each categories as cat}
      {@const catBlocks = BLOCK_REGISTRY.filter((b) => b.category === cat.id)}
      {#if catBlocks.length > 0}
        <div>
          <h4 class="text-[10px] font-semibold uppercase tracking-wider text-gremius-subtle mb-3">{cat.label}</h4>
          <div class="grid grid-cols-2 gap-2">
            {#each catBlocks as block}
              <button
                draggable="true"
                ondragstart={(e) => { if (e.dataTransfer) e.dataTransfer.setData("block-type", block.type); }}
                onclick={() => onAdd?.(block.type)}
                class="group flex flex-col items-center gap-2 p-3 rounded-xl border border-gremius-border hover:border-gremius-cyan/50 hover:bg-gremius-cyan/[0.03] transition-all text-center"
              >
                {#if true}
                  {@const BlockIcon = getBlockIcon(block.icon)}
                  <div
                    class="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                    style="background: {block.color}15; border: 1px solid {block.color}25"
                  >
                    <BlockIcon class="w-5 h-5" style="color: {block.color}" />
                  </div>
                {/if}
                <div>
                  <p class="text-xs font-medium text-gremius-text group-hover:text-gremius-text transition-colors">{block.label}</p>
                  <p class="text-[9px] text-gremius-subtle mt-0.5 line-clamp-2">{block.description}</p>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Footer tip -->
  <div class="p-3 border-t border-gremius-border bg-gremius-bg/50">
    <p class="text-[10px] text-gremius-subtle text-center">Tip: You can also drag blocks to the canvas</p>
  </div>
</div>
