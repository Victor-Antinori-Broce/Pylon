<script lang="ts">
  let { open = $bindable(false), children }: { open?: boolean; children?: import('svelte').Snippet } = $props();
</script>
<div class="relative inline-block text-left">
  {@render children?.()}
</div>
