<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<tbody class="[&_tr:last-child]:border-0 {className}">
  {@render children?.()}
</tbody>
