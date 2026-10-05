<script lang="ts">
  /**
   * StatusBadge.svelte
   *
   * Badge reutilizable para mostrar estados.
   * Soporta múltiples variantes de color y tamaños.
   */

  type StatusVariant =
    | "default"
    | "success"
    | "error"
    | "warning"
    | "info"
    | "active"
    | "inactive"
    | "pending"
    | "archived";

  type StatusSize = "sm" | "md" | "lg";

  interface Props {
    /** Variante de color del badge */
    variant?: StatusVariant;
    /** Tamaño del badge */
    size?: StatusSize;
    /** Texto a mostrar */
    label?: string;
    /** Mostrar dot indicator */
    dot?: boolean;
    /** Clases adicionales */
    class?: string;
  }

  const {
    variant = "default",
    size = "md",
    label,
    dot = true,
    class: className = "",
  }: Props = $props();

  // Mapeo de variantes a clases Tailwind
  const variantStyles: Record<StatusVariant, string> = {
    default: "bg-gray-500/10 text-kitsuden-subtle border-gray-500/20",
    success: "bg-kitsuden-green-10 text-kitsuden-green border-kitsuden-green-20",
    error: "bg-kitsuden-accent-2-10 text-kitsuden-accent-2 border-kitsuden-accent-2-20",
    warning: "bg-kitsuden-amber-10 text-kitsuden-amber border-kitsuden-amber-20",
    info: "bg-kitsuden-accent-10 text-kitsuden-accent border-kitsuden-accent-20",
    active: "bg-kitsuden-green-10 text-kitsuden-green border-kitsuden-green-20",
    inactive: "bg-kitsuden-muted/20 text-kitsuden-subtle border-kitsuden-border",
    pending: "bg-kitsuden-amber-10 text-kitsuden-amber border-kitsuden-amber-20",
    archived: "bg-kitsuden-muted/20 text-kitsuden-text-dim border-kitsuden-border",
  };

  const sizeStyles: Record<StatusSize, string> = {
    sm: "text-[10px] px-1.5 py-0.5 gap-1",
    md: "text-xs px-2.5 py-0.5 gap-1.5",
    lg: "text-sm px-3 py-1 gap-2",
  };

  const dotSizes: Record<StatusSize, string> = {
    sm: "w-1 h-1",
    md: "w-1.5 h-1.5",
    lg: "w-2 h-2",
  };

  const dotColors: Record<StatusVariant, string> = {
    default: "bg-gray-400",
    success: "bg-kitsuden-green",
    error: "bg-kitsuden-accent-2",
    warning: "bg-kitsuden-amber",
    info: "bg-kitsuden-accent",
    active: "bg-kitsuden-green animate-pulse",
    inactive: "bg-kitsuden-subtle",
    pending: "bg-kitsuden-amber animate-pulse",
    archived: "bg-kitsuden-text-dim",
  };
</script>

<span
  class="inline-flex items-center rounded-full border font-medium uppercase tracking-wider {variantStyles[
    variant
  ]} {sizeStyles[size]} {className}"
>
  {#if dot}
    <span class="rounded-full {dotSizes[size]} {dotColors[variant]}"></span>
  {/if}
  {#if label}
    {label}
  {/if}
  <slot />
</span>
