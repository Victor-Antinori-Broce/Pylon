<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<div
  class="inline-flex items-center justify-center rounded-full bg-kitsuden-border text-kitsuden-text text-xs font-medium overflow-hidden {className}"
>
  {@render children?.()}
</div>
