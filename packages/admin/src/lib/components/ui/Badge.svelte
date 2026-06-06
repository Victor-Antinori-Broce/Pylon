<!--
  Titanio Design System - Badge
  Etiquetas de estado y categorías
-->
<script lang="ts">
  import { cn } from "$lib/utils";

  type Variant = "default" | "success" | "warning" | "error" | "info" | "purple" | "secondary";
  type Size = "sm" | "md";

  interface Props {
    variant?: Variant;
    size?: Size;
    class?: string;
    children: import("svelte").Snippet;
  }

  const { variant = "default", size = "sm", class: className = "", children }: Props = $props();

  const variants: Record<Variant, string> = {
    default: "bg-zinc-800 text-zinc-300 border-zinc-700",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    error: "bg-red-500/10 text-red-400 border-red-500/20",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    secondary: "bg-zinc-700 text-zinc-200 border-zinc-600",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
  };
</script>

<span
  class={cn(
    "inline-flex items-center gap-1 font-medium rounded-full border",
    variants[variant],
    sizes[size],
    className
  )}
>
  {@render children()}
</span>
