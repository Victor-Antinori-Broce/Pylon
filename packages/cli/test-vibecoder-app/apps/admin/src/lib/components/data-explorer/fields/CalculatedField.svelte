<script lang="ts">
  import type { FieldComponentProps } from "$lib/data-explorer/fieldRegistry";
  import { calculatedHelpers } from "$lib/data-explorer/fieldRegistry";

  let { value, row, config }: FieldComponentProps = $props();
  
  // Evaluar el cálculo si viene como función
  let calculatedValue = $derived.by(() => {
    if (config.options?.calculate && typeof config.options.calculate === "function") {
      try {
        return config.options.calculate(row);
      } catch (err) {
        console.error("Error calculating field:", err);
        return null;
      }
    }
    return value;
  });
  
  // Formatear según el tipo
  let displayValue = $derived.by(() => {
    const val = calculatedValue();
    if (val === null || val === undefined) return "—";
    
    const format = config.options?.format || config.format;
    
    switch (format) {
      case "currency":
        return calculatedHelpers.currency(Number(val));
      case "percentage":
        return `${Number(val).toFixed(1)}%`;
      case "datetime":
        return calculatedHelpers.dateFormat(val, "YYYY-MM-DD HH:mm");
      case "badge":
        return val; // Se renderiza abajo
      default:
        return String(val);
    }
  });
  
  let isBadge = $derived(
    config.options?.format === "badge" || config.format === "badge"
  );
</script>

{#if isBadge}
  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gremius-cyan/10 text-gremius-cyan">
    {displayValue()}
  </span>
{:else}
  <span class="text-gremius-text-dim tabular-nums">
    {displayValue()}
  </span>
{/if}
