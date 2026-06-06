<script lang="ts">
  const { children, class: className = '' }: { children?: import('svelte').Snippet; class?: string } = $props();
</script>
<div class="w-full overflow-auto">
  <table class="w-full caption-bottom text-sm {className}">
    {@render children?.()}
  </table>
</div>
