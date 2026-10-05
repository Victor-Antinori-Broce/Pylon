<script lang="ts">
  let { checked = $bindable(false), class: className = "" }: { checked?: boolean; class?: string } =
    $props();
</script>

<input
  type="checkbox"
  bind:checked
  class="w-4 h-4 rounded border border-kitsuden-border bg-kitsuden-bg text-kitsuden-accent focus:ring-kitsuden-accent {className}"
/>
