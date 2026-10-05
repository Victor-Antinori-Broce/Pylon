<script lang="ts">
  import type { FieldComponentProps } from "$lib/data-explorer/fieldRegistry";
  import { calculatedHelpers } from "$lib/data-explorer/fieldRegistry";

  const { value, row, config }: FieldComponentProps = $props();

  // Evaluar el cálculo si viene como función
  const calculatedValue = $derived.by(() => {
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

  /**
   * ── `$derived.by(fn)` DEVUELVE EL VALOR, NO UN GETTER ────────────────────
   *
   * Aquí se leía `calculatedValue()`, con paréntesis, y eso lanza
   *
   *     TypeError: calculatedValue is not a function
   *
   * que en el paquete minificado sale como «e(...) is not a function» y tumba
   * el renderizado de la fila entera: la tabla se queda con el girador puesto
   * y «0 records», sin más pista.
   *
   * La confusión tiene una razón: `$derived(() => …)` guarda LA FUNCIÓN —y
   * entonces sí se llama—, mientras que `$derived.by(() => …)` la ejecuta y
   * guarda el RESULTADO. Los dos se leen casi igual y hacen lo contrario.
   */
  const displayValue = $derived.by(() => {
    const val = calculatedValue;
    if (val === null || val === undefined) return "—";

    const format = config.options?.format;

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

  const isBadge = $derived(config.options?.format === "badge");
</script>

{#if isBadge}
  <span
    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-kitsuden-accent/10 text-kitsuden-accent"
  >
    {displayValue}
  </span>
{:else}
  <span class="text-kitsuden-text-dim tabular-nums">
    {displayValue}
  </span>
{/if}
