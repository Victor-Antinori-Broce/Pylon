<script lang="ts">
  let { children, class: className = '' }: { children?: import('svelte').Snippet; class?: string } = $props();
</script>
<span class="flex h-full w-full items-center justify-center rounded-full bg-muted {className}">
  {@render children?.()}
</span>
