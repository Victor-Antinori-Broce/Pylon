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
        options?: {
            label: string;
            value: string;
        }[];
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
declare class ComponentRegistry {
    private widgets;
    private routes;
    private blocks;
    private actions;
    private enabledModules;
    /**
     * Sincronizar módulos habilitados desde el backend
     */
    setEnabledModules(modules: string[] | Set<string>): void;
    /**
     * Verificar si un módulo está activo
     */
    isModuleActive(module?: string): boolean;
    /**
     * Obtener lista de módulos habilitados
     */
    getEnabledModules(): string[];
    /**
     * Registrar un widget en un slot específico
     */
    registerWidget(widget: RegistryWidget): void;
    /**
     * Obtener widgets para un slot específico
     */
    getWidgets(slot: string): RegistryWidget[];
    /**
     * Obtener todos los slots disponibles
     */
    getSlots(): string[];
    /**
     * Eliminar un widget por ID
     */
    unregisterWidget(slot: string, id: string): void;
    /**
     * Registrar una ruta dinámica
     */
    registerRoute(route: RegistryRoute): void;
    /**
     * Obtener rutas filtradas por módulos activos
     */
    getRoutes(): RegistryRoute[];
    /**
     * Obtener una ruta por path
     */
    getRouteByPath(path: string): RegistryRoute | undefined;
    /**
     * Registrar un tipo de bloque
     */
    registerBlock(block: RegistryBlock): void;
    /**
     * Obtener todos los bloques disponibles
     */
    getBlocks(): RegistryBlock[];
    /**
     * Obtener un bloque por tipo
     */
    getBlock(type: string): RegistryBlock | undefined;
    /**
     * Registrar una acción
     */
    registerAction(action: RegistryAction): void;
    /**
     * Obtener acciones por ubicación
     */
    getActions(location: RegistryAction["location"]): RegistryAction[];
    /**
     * Eliminar todos los registros de un módulo
     */
    unregisterModule(moduleKey: string): void;
    /**
     * Limpiar todo el registro
     */
    clear(): void;
}
export declare const componentRegistry: ComponentRegistry;
export declare function useRegistry(): ComponentRegistry;
export {};
//# sourceMappingURL=registry.svelte.d.ts.map