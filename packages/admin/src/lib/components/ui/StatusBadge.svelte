<script lang="ts">
  /**
   * StatusBadge.svelte
   * 
   * Badge reutilizable para mostrar estados.
   * Soporta múltiples variantes de color y tamaños.
   */
  
  type StatusVariant = 
    | "default" | "success" | "error" | "warning" | "info" 
    | "active" | "inactive" | "pending" | "archived";
  
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
  
  let {
    variant = "default",
    size = "md",
    label,
    dot = true,
    class: className = ""
  }: Props = $props();
  
  // Mapeo de variantes a clases Tailwind
  const variantStyles: Record<StatusVariant, string> = {
    default: "bg-gray-500/10 text-gremius-subtle border-gray-500/20",
    success: "bg-gremius-green-10 text-gremius-green border-gremius-green-20",
    error: "bg-gremius-pink-10 text-gremius-pink border-gremius-pink-20",
    warning: "bg-gremius-amber-10 text-gremius-amber border-gremius-amber-20",
    info: "bg-gremius-cyan-10 text-gremius-cyan border-gremius-cyan-20",
    active: "bg-gremius-green-10 text-gremius-green border-gremius-green-20",
    inactive: "bg-gremius-muted/20 text-gremius-subtle border-gremius-border",
    pending: "bg-gremius-amber-10 text-gremius-amber border-gremius-amber-20",
    archived: "bg-gremius-muted/20 text-gremius-text-dim border-gremius-border"
  };
  
  const sizeStyles: Record<StatusSize, string> = {
    sm: "text-[10px] px-1.5 py-0.5 gap-1",
    md: "text-xs px-2.5 py-0.5 gap-1.5",
    lg: "text-sm px-3 py-1 gap-2"
  };
  
  const dotSizes: Record<StatusSize, string> = {
    sm: "w-1 h-1",
    md: "w-1.5 h-1.5",
    lg: "w-2 h-2"
  };
  
  const dotColors: Record<StatusVariant, string> = {
    default: "bg-gray-400",
    success: "bg-gremius-green",
    error: "bg-gremius-pink",
    warning: "bg-gremius-amber",
    info: "bg-gremius-cyan",
    active: "bg-gremius-green animate-pulse",
    inactive: "bg-gremius-subtle",
    pending: "bg-gremius-amber animate-pulse",
    archived: "bg-gremius-text-dim"
  };
</script>

<span 
  class="inline-flex items-center rounded-full border font-medium uppercase tracking-wider {variantStyles[variant]} {sizeStyles[size]} {className}"
>
  {#if dot}
    <span class="rounded-full {dotSizes[size]} {dotColors[variant]}"></span>
  {/if}
  {#if label}
    {label}
  {/if}
  <slot />
</span>

