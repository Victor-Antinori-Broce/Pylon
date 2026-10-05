<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<tr
  class="border-b border-kitsuden-border transition-colors hover:bg-kitsuden-bg/50 data-[state=selected]:bg-kitsuden-bg {className}"
>
  {@render children?.()}
</tr>
