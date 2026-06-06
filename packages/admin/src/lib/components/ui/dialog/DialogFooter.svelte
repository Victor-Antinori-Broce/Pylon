<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4 {className}">
  {@render children?.()}
</div>
