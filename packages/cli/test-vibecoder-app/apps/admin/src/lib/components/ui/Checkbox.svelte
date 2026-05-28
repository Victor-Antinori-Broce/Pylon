<script lang="ts">
  let { checked = $bindable(false), class: className = '' }: { checked?: boolean; class?: string } = $props();
</script>
<input type="checkbox" bind:checked class="w-4 h-4 rounded border border-gremius-border bg-gremius-bg text-gremius-cyan focus:ring-gremius-cyan {className}" />
