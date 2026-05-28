<script lang="ts">
  /**
   * DynamicBlock.svelte
   * 
   * Componente de ejemplo que demuestra el renderizado dinámico.
   * Renderiza bloques de contenido basados en su tipo.
   */
  import type { Component } from "svelte";
  import { componentRegistry } from "../lib/registry.svelte";
  import DynamicComponent from "../lib/DynamicComponent.svelte";
  
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
  
  let { 
    type, 
    props = {}, 
    mode = "render",
    onChange
  }: Props = $props();
  
  // Obtener definición del bloque
  let block = $derived(componentRegistry.getBlock(type));
  
  // Seleccionar componente según modo
  let Component = $derived<Component | null>(() => {
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
  <div class="p-4 bg-gremius-pink/10 border border-gremius-pink/20 rounded-lg text-gremius-pink">
    <p class="text-sm font-medium">Block type "{type}" not found</p>
    <p class="text-xs mt-1">Make sure the module is registered and enabled.</p>
  </div>
{:else if !Component}
  <div class="p-4 bg-gremius-amber/10 border border-gremius-amber/20 rounded-lg text-gremius-amber">
    <p class="text-sm">Component not available for mode: {mode}</p>
  </div>
{:else}
  <div class="dynamic-block" data-block-type={type} data-block-mode={mode}>
    <DynamicComponent 
      component={Component} 
      props={{
        ...props,
        ...(mode === "editor" ? { onChange: handleChange } : {})
      }}
    />
  </div>
{/if}

<style>
  .dynamic-block {
    position: relative;
  }
</style>
