/**
 * GremiusCMS — Component Registry (Svelte Edition)
 *
 * Sistema de registro dinámico de componentes para extensibilidad.
 * Reemplaza el PluginRegistry de Vue con una implementación nativa de Svelte.
 *
 * Features:
 * - Registro de widgets en slots nombrados
 * - Registro de rutas dinámicas
 * - Registro de bloques para el editor
 * - Registro de acciones de toolbar
 * - Soporte para módulos habilitados/deshabilitados
 */

import type { Component } from "svelte";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface RegistryWidget {
  /** Identificador único */
  id: string;
  /** Slot donde se renderiza (ej: "dashboard:top", "sidebar:bottom") */
  slot: string;
  /** Componente Svelte a renderizar */
  component: Component;
  /** Orden de renderizado (mayor = primero) */
  order: number;
  /** Módulo al que pertenece (para filtrado) */
  module?: string;
  /** Props iniciales para el componente */
  props?: Record<string, unknown>;
  /** Metadata adicional */
  meta?: Record<string, unknown>;
}

export interface RegistryRoute {
  /** Módulo propietario */
  module: string;
  /** Patrón de ruta (ej: "/tournaments/:id") */
  path: string;
  /** Componente a renderizar */
  component: Component;
  /** Requiere autenticación */
  requiresAuth?: boolean;
  /** Layout a usar (opcional) */
  layout?: Component;
}

export interface RegistryBlock {
  /** Tipo de bloque (identificador único) */
  type: string;
  /** Nombre visible */
  name: string;
  /** Icono (componente Lucide) */
  icon?: Component;
  /** Componente de edición */
  editorComponent: Component;
  /** Componente de preview/renderizado */
  renderComponent: Component;
  /** Schema de props para el bloque */
  propsSchema?: Record<string, {
    type: "string" | "number" | "boolean" | "select" | "media";
    label: string;
    default?: unknown;
    options?: { label: string; value: string }[];
  }>;
  /** Módulo al que pertenece */
  module?: string;
}

export interface RegistryAction {
  id: string;
  label: string;
  /** Icono opcional */
  icon?: Component;
  /** Handler cuando se ejecuta la acción */
  handler: () => void | Promise<void>;
  /** Ubicación: toolbar, context-menu, bulk-actions */
  location: "toolbar" | "context-menu" | "bulk-actions";
  /** Módulo al que pertenece */
  module?: string;
  /** Orden de aparición */
  order?: number;
  /** Condición para mostrar la acción */
  condition?: () => boolean;
}

// ═══════════════════════════════════════════════════════════════
// Registry Implementation
// ═══════════════════════════════════════════════════════════════

class ComponentRegistry {
  private widgets = new Map<string, RegistryWidget[]>();
  private routes: RegistryRoute[] = [];
  private blocks: RegistryBlock[] = [];
  private actions: RegistryAction[] = [];
  private enabledModules = new Set<string>();

  // ═══════════════════════════════════════════════════════════
  // Module Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Sincronizar módulos habilitados desde el backend
   */
  setEnabledModules(modules: string[] | Set<string>): void {
    this.enabledModules = new Set(modules);
  }

  /**
   * Verificar si un módulo está activo
   */
  isModuleActive(module?: string): boolean {
    if (!module) return true;
    return this.enabledModules.has(module);
  }

  /**
   * Obtener lista de módulos habilitados
   */
  getEnabledModules(): string[] {
    return Array.from(this.enabledModules);
  }

  // ═══════════════════════════════════════════════════════════
  // Widgets
  // ═══════════════════════════════════════════════════════════

  /**
   * Registrar un widget en un slot específico
   */
  registerWidget(widget: RegistryWidget): void {
    const { slot } = widget;
    
    if (!this.widgets.has(slot)) {
      this.widgets.set(slot, []);
    }
    
    const slotWidgets = this.widgets.get(slot)!;
    
    // Evitar duplicados por ID
    const existingIndex = slotWidgets.findIndex((w) => w.id === widget.id);
    if (existingIndex >= 0) {
      slotWidgets[existingIndex] = widget;
    } else {
      slotWidgets.push(widget);
    }
    
    // Ordenar por orden descendente
    slotWidgets.sort((a, b) => b.order - a.order);
  }

  /**
   * Obtener widgets para un slot específico
   */
  getWidgets(slot: string): RegistryWidget[] {
    const allWidgets = this.widgets.get(slot) || [];
    return allWidgets.filter((w) => this.isModuleActive(w.module));
  }

  /**
   * Obtener todos los slots disponibles
   */
  getSlots(): string[] {
    return Array.from(this.widgets.keys());
  }

  /**
   * Eliminar un widget por ID
   */
  unregisterWidget(slot: string, id: string): void {
    const slotWidgets = this.widgets.get(slot);
    if (slotWidgets) {
      this.widgets.set(
        slot,
        slotWidgets.filter((w) => w.id !== id)
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Routes
  // ═══════════════════════════════════════════════════════════

  /**
   * Registrar una ruta dinámica
   */
  registerRoute(route: RegistryRoute): void {
    // Evitar duplicados
    const exists = this.routes.some(
      (r) => r.path === route.path && r.module === route.module
    );
    
    if (!exists) {
      this.routes.push(route);
    }
  }

  /**
   * Obtener rutas filtradas por módulos activos
   */
  getRoutes(): RegistryRoute[] {
    return this.routes.filter((r) => this.isModuleActive(r.module));
  }

  /**
   * Obtener una ruta por path
   */
  getRouteByPath(path: string): RegistryRoute | undefined {
    return this.routes.find(
      (r) => this.isModuleActive(r.module) && r.path === path
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Blocks
  // ═══════════════════════════════════════════════════════════

  /**
   * Registrar un tipo de bloque
   */
  registerBlock(block: RegistryBlock): void {
    const existingIndex = this.blocks.findIndex((b) => b.type === block.type);
    
    if (existingIndex >= 0) {
      this.blocks[existingIndex] = block;
    } else {
      this.blocks.push(block);
    }
  }

  /**
   * Obtener todos los bloques disponibles
   */
  getBlocks(): RegistryBlock[] {
    return this.blocks.filter((b) => this.isModuleActive(b.module));
  }

  /**
   * Obtener un bloque por tipo
   */
  getBlock(type: string): RegistryBlock | undefined {
    return this.blocks.find(
      (b) => b.type === type && this.isModuleActive(b.module)
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  /**
   * Registrar una acción
   */
  registerAction(action: RegistryAction): void {
    const existingIndex = this.actions.findIndex((a) => a.id === action.id);
    
    if (existingIndex >= 0) {
      this.actions[existingIndex] = action;
    } else {
      this.actions.push(action);
    }
    
    // Ordenar por orden descendente
    this.actions.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  }

  /**
   * Obtener acciones por ubicación
   */
  getActions(location: RegistryAction["location"]): RegistryAction[] {
    return this.actions
      .filter((a) => a.location === location)
      .filter((a) => this.isModuleActive(a.module))
      .filter((a) => (a.condition ? a.condition() : true));
  }

  // ═══════════════════════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════════════════════

  /**
   * Eliminar todos los registros de un módulo
   */
  unregisterModule(moduleKey: string): void {
    // Widgets
    for (const [slot, widgets] of this.widgets) {
      this.widgets.set(
        slot,
        widgets.filter((w) => w.module !== moduleKey)
      );
    }
    
    // Routes
    this.routes = this.routes.filter((r) => r.module !== moduleKey);
    
    // Blocks
    this.blocks = this.blocks.filter((b) => b.module !== moduleKey);
    
    // Actions
    this.actions = this.actions.filter((a) => a.module !== moduleKey);
    
    // Remove from enabled modules
    this.enabledModules.delete(moduleKey);
  }

  /**
   * Limpiar todo el registro
   */
  clear(): void {
    this.widgets.clear();
    this.routes = [];
    this.blocks = [];
    this.actions = [];
    this.enabledModules.clear();
  }
}

// Singleton export
export const componentRegistry = new ComponentRegistry();

// Hook helper para acceder al registro
export function useRegistry() {
  return componentRegistry;
}
