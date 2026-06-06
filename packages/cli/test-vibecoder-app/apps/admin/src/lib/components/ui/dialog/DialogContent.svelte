<script lang="ts">
  const { children, class: className = '' }: { children?: import('svelte').Snippet; class?: string } = $props();
</script>
<div class="p-6 {className}">
  {@render children?.()}
</div>
