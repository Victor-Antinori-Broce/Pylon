<!--
  Card Component
  Contenedor estilizado para contenido
-->
<script lang="ts">
  import { cn } from "$lib/utils";

  interface Props {
    class?: string;
    children?: import("svelte").Snippet;
  }

  const { class: className = "", children }: Props = $props();
</script>

<div class={cn("bg-zinc-900/50 border border-zinc-800 rounded-xl", className)}>
  {@render children?.()}
</div>
