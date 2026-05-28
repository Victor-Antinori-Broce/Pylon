<script lang="ts">
  let { children, class: className = '' }: { children?: import('svelte').Snippet; class?: string } = $props();
</script>
<h3 class="text-lg font-semibold leading-none tracking-tight {className}">
  {@render children?.()}
</h3>
