<script lang="ts">
  /**
   * RelationCell.svelte
   * 
   * Celda para mostrar relaciones entre datasets.
   * Muestra badges con los elementos relacionados.
   */
  import { Link2, ExternalLink } from "lucide-svelte";
  
  interface RelatedItem {
    id: string;
    label: string;
    href?: string;
  }
  
  interface Props {
    /** Items relacionados */
    items?: RelatedItem[];
    /** Máximo a mostrar antes de "+N more" */
    maxItems?: number;
    /** Tipo de relación para el icono */
    type?: "one" | "many";
    /** Click handler */
    onClick?: (item: RelatedItem) => void;
  }
  
  let {
    items = [],
    maxItems = 2,
    type = "many",
    onClick
  }: Props = $props();
  
  const visibleItems = $derived(items.slice(0, maxItems));
  const remainingCount = $derived(items.length - maxItems);
  
  function handleClick(item: RelatedItem) {
    if (onClick) {
      onClick(item);
    }
  }
</script>

<div class="flex items-center gap-2">
  <Link2 class="w-3.5 h-3.5 text-gremius-subtle shrink-0" />
  
  {#if items.length === 0}
    <span class="text-xs text-gremius-subtle italic">—</span>
  {:else}
    <div class="flex items-center gap-1 flex-wrap">
      {#each visibleItems as item}
        {#if item.href}
          <a
            href={item.href}
            class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-gremius-cyan-10 text-gremius-cyan border border-gremius-cyan-20 hover:bg-gremius-cyan-20 transition-colors"
            onclick={(e) => {
              e.stopPropagation();
              handleClick(item);
            }}
          >
            {item.label}
            <ExternalLink class="w-3 h-3 opacity-50" />
          </a>
        {:else}
          <button
            class="inline-flex items-center px-2 py-0.5 text-xs rounded-md bg-gremius-cyan-10 text-gremius-cyan border border-gremius-cyan-20 hover:bg-gremius-cyan-20 transition-colors"
            onclick={() => handleClick(item)}
          >
            {item.label}
          </button>
        {/if}
      {/each}
      
      {#if remainingCount > 0}
        <span class="text-xs text-gremius-subtle">
          +{remainingCount} more
        </span>
      {/if}
    </div>
  {/if}
</div>

