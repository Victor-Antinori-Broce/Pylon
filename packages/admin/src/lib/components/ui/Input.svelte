<script lang="ts">
  let {
    value = $bindable(),
    class: className = "",
    ...rest
  }: { value?: string; class?: string; [key: string]: any } = $props();
</script>

<input
  bind:value
  class="w-full bg-kitsuden-bg text-kitsuden-text placeholder-kitsuden-text-dim border border-kitsuden-border rounded-lg px-3 py-2 text-sm focus:border-kitsuden-accent/50 focus:outline-none {className}"
  {...rest}
/>
