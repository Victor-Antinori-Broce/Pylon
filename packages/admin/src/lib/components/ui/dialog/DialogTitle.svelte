<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<h2 class="text-lg font-semibold leading-none tracking-tight {className}">
  {@render children?.()}
</h2>
