<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<tr
  class="border-b border-gremius-border transition-colors hover:bg-gremius-bg/50 data-[state=selected]:bg-gremius-bg {className}"
>
  {@render children?.()}
</tr>
