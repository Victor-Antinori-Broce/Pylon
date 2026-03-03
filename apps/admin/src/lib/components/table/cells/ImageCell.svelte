<script lang="ts">
  /**
   * ImageCell.svelte
   * 
   * Celda de tabla para mostrar imágenes con preview.
   */
  import { ImageIcon } from "lucide-svelte";
  
  interface Props {
    /** URL de la imagen */
    src?: string | null;
    /** Texto alternativo */
    alt?: string;
    /** Tamaño de la imagen */
    size?: "sm" | "md" | "lg";
    /** Mostrar en círculo */
    rounded?: boolean;
    /** Fallback si no hay imagen */
    fallback?: "icon" | "initials" | "none";
  }
  
  let {
    src,
    alt = "",
    size = "md",
    rounded = true,
    fallback = "icon"
  }: Props = $props();
  
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12"
  };
  
  let isError = $state(false);
  let isLoading = $state(true);
  
  function handleError() {
    isError = true;
    isLoading = false;
  }
  
  function handleLoad() {
    isLoading = false;
  }
  
  // Obtener iniciales del alt text
  const initials = $derived(
    alt
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  );
</script>

<div class="flex items-center gap-3">
  <div 
    class="relative overflow-hidden bg-gremius-card border border-gremius-border flex items-center justify-center {sizeClasses[size]}"
    class:rounded-lg={!rounded}
    class:rounded-full={rounded}
  >
    {#if src && !isError}
      <img
        {src}
        {alt}
        class="w-full h-full object-cover"
        class:opacity-0={isLoading}
        class:opacity-100={!isLoading}
        on:error={handleError}
        on:load={handleLoad}
      />
      {#if isLoading}
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-4 h-4 border-2 border-gremius-border border-t-gremius-cyan rounded-full animate-spin"></div>
        </div>
      {/if}
    {:else if fallback === "icon"}
      <ImageIcon class="w-4 h-4 text-gremius-subtle" />
    {:else if fallback === "initials" && alt}
      <span class="text-xs font-medium text-gremius-text-dim">{initials}</span>
    {/if}
  </div>
  
  {#if alt}
    <span class="text-sm text-gremius-text truncate">{alt}</span>
  {/if}
</div>

