<script lang="ts">
  const {
    children,
    class: className = "",
    onclick,
  }: { children?: import("svelte").Snippet; class?: string; onclick?: () => void } = $props();
</script>

<button
  type="button"
  {onclick}
  class="block w-full px-4 py-2 text-left text-sm hover:bg-kitsuden-bg hover:text-kitsuden-accent {className}"
>
  {@render children?.()}
</button>
