<script lang="ts">
  /**
   * DynamicComponent.svelte
   * 
   * Renderiza componentes dinámicamente usando <svelte:component>.
   * Permite inyectar componentes registrados externamente.
   */
  import type { Component } from "svelte";
  
  interface Props {
    /** Componente a renderizar */
    component: Component;
    /** Props a pasar al componente */
    props?: Record<string, any>;
    /** Clases CSS adicionales */
    class?: string;
    /** Callback cuando el componente se monta */
    onMount?: () => void;
  }
  
  let { component, props = {}, class: className = "", onMount }: Props = $props();
  
  // Referencia al componente instanciado
  let componentRef: any = $state(null);
  
  // Ejecutar callback cuando se monta
  $effect(() => {
    if (componentRef && onMount) {
      onMount();
    }
  });
</script>

<div class="dynamic-component {className}" data-testid="dynamic-component">
  <svelte:component 
    this={component} 
    {...props}
    bind:this={componentRef}
  />
</div>

<style>
  .dynamic-component {
    /* Contenedor flexible para el componente dinámico */
    display: contents;
  }
</style>
