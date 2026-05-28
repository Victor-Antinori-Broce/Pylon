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
// ═══════════════════════════════════════════════════════════════
// Registry Implementation
// ═══════════════════════════════════════════════════════════════
class ComponentRegistry {
    widgets = new Map();
    routes = [];
    blocks = [];
    actions = [];
    enabledModules = new Set();
    // ═══════════════════════════════════════════════════════════
    // Module Management
    // ═══════════════════════════════════════════════════════════
    /**
     * Sincronizar módulos habilitados desde el backend
     */
    setEnabledModules(modules) {
        this.enabledModules = new Set(modules);
    }
    /**
     * Verificar si un módulo está activo
     */
    isModuleActive(module) {
        if (!module)
            return true;
        return this.enabledModules.has(module);
    }
    /**
     * Obtener lista de módulos habilitados
     */
    getEnabledModules() {
        return Array.from(this.enabledModules);
    }
    // ═══════════════════════════════════════════════════════════
    // Widgets
    // ═══════════════════════════════════════════════════════════
    /**
     * Registrar un widget en un slot específico
     */
    registerWidget(widget) {
        const { slot } = widget;
        if (!this.widgets.has(slot)) {
            this.widgets.set(slot, []);
        }
        const slotWidgets = this.widgets.get(slot);
        // Evitar duplicados por ID
        const existingIndex = slotWidgets.findIndex((w) => w.id === widget.id);
        if (existingIndex >= 0) {
            slotWidgets[existingIndex] = widget;
        }
        else {
            slotWidgets.push(widget);
        }
        // Ordenar por orden descendente
        slotWidgets.sort((a, b) => b.order - a.order);
    }
    /**
     * Obtener widgets para un slot específico
     */
    getWidgets(slot) {
        const allWidgets = this.widgets.get(slot) || [];
        return allWidgets.filter((w) => this.isModuleActive(w.module));
    }
    /**
     * Obtener todos los slots disponibles
     */
    getSlots() {
        return Array.from(this.widgets.keys());
    }
    /**
     * Eliminar un widget por ID
     */
    unregisterWidget(slot, id) {
        const slotWidgets = this.widgets.get(slot);
        if (slotWidgets) {
            this.widgets.set(slot, slotWidgets.filter((w) => w.id !== id));
        }
    }
    // ═══════════════════════════════════════════════════════════
    // Routes
    // ═══════════════════════════════════════════════════════════
    /**
     * Registrar una ruta dinámica
     */
    registerRoute(route) {
        // Evitar duplicados
        const exists = this.routes.some((r) => r.path === route.path && r.module === route.module);
        if (!exists) {
            this.routes.push(route);
        }
    }
    /**
     * Obtener rutas filtradas por módulos activos
     */
    getRoutes() {
        return this.routes.filter((r) => this.isModuleActive(r.module));
    }
    /**
     * Obtener una ruta por path
     */
    getRouteByPath(path) {
        return this.routes.find((r) => this.isModuleActive(r.module) && r.path === path);
    }
    // ═══════════════════════════════════════════════════════════
    // Blocks
    // ═══════════════════════════════════════════════════════════
    /**
     * Registrar un tipo de bloque
     */
    registerBlock(block) {
        const existingIndex = this.blocks.findIndex((b) => b.type === block.type);
        if (existingIndex >= 0) {
            this.blocks[existingIndex] = block;
        }
        else {
            this.blocks.push(block);
        }
    }
    /**
     * Obtener todos los bloques disponibles
     */
    getBlocks() {
        return this.blocks.filter((b) => this.isModuleActive(b.module));
    }
    /**
     * Obtener un bloque por tipo
     */
    getBlock(type) {
        return this.blocks.find((b) => b.type === type && this.isModuleActive(b.module));
    }
    // ═══════════════════════════════════════════════════════════
    // Actions
    // ═══════════════════════════════════════════════════════════
    /**
     * Registrar una acción
     */
    registerAction(action) {
        const existingIndex = this.actions.findIndex((a) => a.id === action.id);
        if (existingIndex >= 0) {
            this.actions[existingIndex] = action;
        }
        else {
            this.actions.push(action);
        }
        // Ordenar por orden descendente
        this.actions.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
    }
    /**
     * Obtener acciones por ubicación
     */
    getActions(location) {
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
    unregisterModule(moduleKey) {
        // Widgets
        for (const [slot, widgets] of this.widgets) {
            this.widgets.set(slot, widgets.filter((w) => w.module !== moduleKey));
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
    clear() {
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
//# sourceMappingURL=registry.svelte.js.map