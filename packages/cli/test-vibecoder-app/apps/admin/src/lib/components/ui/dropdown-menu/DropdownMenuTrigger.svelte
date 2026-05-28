<script lang="ts">
  let { children, class: className = '', asChild, size }: { children?: import('svelte').Snippet; class?: string; asChild?: boolean; size?: string } = $props();
</script>
<div class="inline-flex {className}">
  {@render children?.()}
</div>
