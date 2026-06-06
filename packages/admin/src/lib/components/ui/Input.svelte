<script lang="ts">
  let {
    value = $bindable(),
    class: className = "",
    ...rest
  }: { value?: string; class?: string; [key: string]: any } = $props();
</script>

<input
  bind:value
  class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none {className}"
  {...rest}
/>
