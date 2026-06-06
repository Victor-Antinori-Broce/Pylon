<script lang="ts">
  const { children, class: className = '' }: { children?: import('svelte').Snippet; class?: string } = $props();
</script>
<th class="h-12 px-4 text-left align-middle font-medium text-gremius-subtle [&:has([role=checkbox])]:pr-0 {className}">
  {@render children?.()}
</th>
