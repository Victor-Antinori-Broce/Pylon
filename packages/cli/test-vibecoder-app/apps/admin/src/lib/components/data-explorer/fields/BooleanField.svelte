<script lang="ts">
  import type { FieldComponentProps } from "$lib/data-explorer/fieldRegistry";
  import { Check, X } from "lucide-svelte";

  const { value, mode, onChange }: FieldComponentProps = $props();
  
  const isTrue = $derived(!!value);
</script>

{#if mode === "view" || mode === "inline"}
  <span class="inline-flex items-center gap-1.5">
    {#if isTrue}
      <Check class="w-4 h-4 text-gremius-green" />
      <span class="text-gremius-green text-sm">Yes</span>
    {:else}
      <X class="w-4 h-4 text-gremius-subtle" />
      <span class="text-gremius-subtle text-sm">No</span>
    {/if}
  </span>
{:else}
  <label class="flex items-center gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={isTrue}
      class="w-5 h-5 rounded border-gremius-border bg-gremius-bg text-gremius-cyan focus:ring-gremius-cyan"
      onchange={(e) => onChange?.(e.currentTarget.checked)}
    />
    <span class="text-sm text-gremius-text">{isTrue ? "Enabled" : "Disabled"}</span>
  </label>
{/if}
