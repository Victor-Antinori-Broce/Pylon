<script lang="ts">
  import type { FieldComponentProps } from "$lib/data-explorer/fieldRegistry";

  const { value, config, mode, onChange }: FieldComponentProps = $props();
  
  const displayValue = $derived(
    value !== null && value !== undefined ? Number(value).toLocaleString() : "—"
  );
</script>

{#if mode === "view" || mode === "inline"}
  <span class="text-gremius-text tabular-nums">
    {displayValue}
  </span>
{:else}
  <input
    type="number"
    value={value ?? ""}
    min={config.options?.min}
    max={config.options?.max}
    step={config.options?.step}
    placeholder={config.options?.placeholder}
    class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
    oninput={(e) => onChange?.(e.currentTarget.valueAsNumber)}
  />
{/if}
