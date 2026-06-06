<!--
  Button Component
  Botón reutilizable con variantes y estados
-->
<script lang="ts">
  import { Loader2 } from "lucide-svelte";

  import { cn } from "$lib/utils";

  interface Props {
    variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
    size?: "sm" | "md" | "lg" | "icon";
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    loading?: boolean;
    class?: string;
    href?: string;
    children?: import("svelte").Snippet;
    onclick?: (e: MouseEvent) => void;
  }

  const {
    variant = "primary",
    size = "md",
    type = "button",
    disabled = false,
    loading = false,
    class: className = "",
    href,
    children,
    onclick,
  }: Props = $props();

  const baseClasses =
    "inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed";

  const variantClasses = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-indigo-500 active:bg-indigo-700",
    secondary:
      "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 focus:ring-zinc-500 border border-zinc-700",
    danger: "bg-red-600 text-white hover:bg-red-500 focus:ring-red-500 active:bg-red-700",
    ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 focus:ring-zinc-500",
    outline:
      "bg-transparent border border-zinc-600 text-zinc-200 hover:bg-zinc-800 focus:ring-zinc-500",
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2",
    icon: "p-2",
  };

  const classes = $derived(cn(baseClasses, variantClasses[variant], sizeClasses[size], className));
</script>

{#if href}
  <a {href} class={classes} aria-disabled={disabled || loading}>
    {#if loading}
      <Loader2 size={size === "sm" ? 14 : size === "lg" ? 20 : 16} class="animate-spin" />
    {/if}
    {@render children?.()}
  </a>
{:else}
  <button {type} class={classes} disabled={disabled || loading} {onclick}>
    {#if loading}
      <Loader2 size={size === "sm" ? 14 : size === "lg" ? 20 : 16} class="animate-spin" />
    {/if}
    {@render children?.()}
  </button>
{/if}
