<script lang="ts">
  /**
   * WidgetSlot.svelte
   *
   * Renderiza widgets registrados en un slot específico.
   * Usa svelte:component para montar componentes dinámicamente.
   */
  import { fade } from "svelte/transition";

  import DynamicComponent from "./DynamicComponent.svelte";
  import { componentRegistry, type RegistryWidget } from "./registry.svelte";

  interface Props {
    /** Nombre del slot (ej: "dashboard:top", "sidebar:bottom") */
    name: string;
    /** Clases CSS para el contenedor */
    class?: string;
    /** Mostrar animaciones de entrada */
    animated?: boolean;
    /** Wrapper para cada widget */
    wrapper?: "none" | "card" | "border";
  }

  const {
    name,
    class: className = "",
    animated = true,
    wrapper = "none",
    empty,
  }: Props & { empty?: () => any } = $props();

  // Obtener widgets reactivamente
  let widgets = $state<RegistryWidget[]>([]);

  // Actualizar widgets cuando cambien
  $effect(() => {
    widgets = componentRegistry.getWidgets(name);
  });

  // Configuración de wrappers
  const wrapperClasses = {
    none: "",
    card: "bg-kitsuden-card border border-kitsuden-border rounded-xl p-4",
    border: "border-b border-kitsuden-border last:border-b-0 py-4",
  };
</script>

<div class="widget-slot widget-slot--{name.replace(/:/g, '-')} {className}" data-slot={name}>
  {#if widgets.length === 0}
    <!-- Slot vacío - opcionalmente mostrar placeholder -->
    {#if empty}
      {@render empty()}
    {/if}
  {:else}
    {#each widgets as widget (widget.id)}
      {@const Component = widget.component}
      <div
        class="widget-slot__item {wrapperClasses[wrapper]}"
        data-widget-id={widget.id}
        data-widget-module={widget.module}
      >
        {#if animated}
          <div transition:fade={{ duration: 200 }}>
            <DynamicComponent component={Component} props={widget.props} />
          </div>
        {:else}
          <DynamicComponent component={Component} props={widget.props} />
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .widget-slot {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .widget-slot__item {
    position: relative;
  }

  /* Variantes específicas de slots */
  .widget-slot--dashboard-top {
    margin-bottom: 1.5rem;
  }

  .widget-slot--dashboard-bottom {
    margin-top: 1.5rem;
  }

  .widget-slot--sidebar-bottom {
    margin-top: auto;
  }
</style>
