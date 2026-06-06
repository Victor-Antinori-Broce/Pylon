<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<td class="p-4 align-middle [&:has([role=checkbox])]:pr-0 {className}">
  {@render children?.()}
</td>
