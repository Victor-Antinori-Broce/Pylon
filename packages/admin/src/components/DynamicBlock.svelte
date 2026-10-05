<script lang="ts">
  /**
   * DynamicBlock.svelte
   *
   * Componente de ejemplo que demuestra el renderizado dinámico.
   * Renderiza bloques de contenido basados en su tipo.
   */
  import type { Component as SvelteComponent } from "svelte";

  import DynamicComponent from "../lib/DynamicComponent.svelte";
  import { componentRegistry } from "../lib/registry.svelte";

  interface Props {
    /** Tipo de bloque a renderizar */
    type: string;
    /** Props específicas del bloque */
    props?: Record<string, any>;
    /** Modo: editor o preview */
    mode?: "editor" | "preview" | "render";
    /** Callback cuando cambia el contenido (en modo editor) */
    onChange?: (data: any) => void;
  }

  const { type, props = {}, mode = "render", onChange }: Props = $props();

  // Obtener definición del bloque
  const block = $derived(componentRegistry.getBlock(type));

  // Seleccionar componente según modo
  const BlockComponent = $derived.by<SvelteComponent | null>(() => {
    if (!block) return null;

    switch (mode) {
      case "editor":
        return block.editorComponent;
      case "preview":
      case "render":
      default:
        return block.renderComponent;
    }
  });

  // Manejar cambios en modo editor
  function handleChange(data: any) {
    if (onChange) {
      onChange(data);
    }
  }
</script>

{#if !block}
  <div
    class="p-4 bg-kitsuden-accent-2/10 border border-kitsuden-accent-2/20 rounded-lg text-kitsuden-accent-2"
  >
    <p class="text-sm font-medium">Block type "{type}" not found</p>
    <p class="text-xs mt-1">Make sure the module is registered and enabled.</p>
  </div>
{:else if !BlockComponent}
  <div
    class="p-4 bg-kitsuden-amber/10 border border-kitsuden-amber/20 rounded-lg text-kitsuden-amber"
  >
    <p class="text-sm">Component not available for mode: {mode}</p>
  </div>
{:else}
  <div class="dynamic-block" data-block-type={type} data-block-mode={mode}>
    <DynamicComponent
      component={BlockComponent}
      props={{
        ...props,
        ...(mode === "editor" ? { onChange: handleChange } : {}),
      }}
    />
  </div>
{/if}

<style>
  .dynamic-block {
    position: relative;
  }
</style>
