<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<div class="flex flex-col space-y-1.5 text-center sm:text-left {className}">
  {@render children?.()}
</div>
