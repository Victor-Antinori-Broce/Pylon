<script lang="ts">
  const { children, class: className = '', for: htmlFor }: { children?: import('svelte').Snippet; class?: string; for?: string } = $props();
</script>
<label for={htmlFor} class="block text-sm font-medium text-gremius-text mb-1.5 {className}">
  {@render children?.()}
</label>
