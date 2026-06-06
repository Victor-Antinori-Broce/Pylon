<script lang="ts">
  const { children, class: className = '', align }: { children?: import('svelte').Snippet; class?: string; align?: string } = $props();
</script>
<div class="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-gremius-card border border-gremius-border shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 {className}">
  <div class="py-1">
    {@render children?.()}
  </div>
</div>
