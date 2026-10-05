/**
 * Register Default Widgets
 *
 * Ejemplo de cómo registrar widgets y componentes dinámicos.
 * En una implementación real, esto podría venir de:
 * - Módulos cargados dinámicamente
 * - Apps externas a través de un API
 * - Plugins instalados
 */

// @ts-ignore - Unused imports preserved for future widget registration
import { componentRegistry } from "./registry.svelte";

// Widgets de ejemplo - documentación para implementación futura
void {
  // GameStatsWidget
  id: "kitsuden-game-stats",
  slot: "dashboard:stats",
  component: null, // (await import("../components/widgets/GameStatsWidget.svelte")).default,
  order: 10,
  module: "games",
  props: { title: "Game Statistics", showChart: true },
};

void {
  // RecentActivityWidget
  id: "kitsuden-recent-activity",
  slot: "dashboard:sidebar",
  component: null, // (await import("../components/widgets/RecentActivityWidget.svelte")).default,
  order: 10,
  module: "core",
  props: { limit: 5 },
};

/**
 * Registrar todos los widgets por defecto
 */
export async function registerDefaultWidgets() {
  // En una implementación real, cargaríamos esto desde la API
  // o desde módulos dinámicos
  // Por ahora, simulamos el registro
  // Ejemplo de cómo registrar un widget:
  // componentRegistry.registerWidget(GameStatsWidget);
  // Nota: La carga dinámica real requeriría import() dinámicos
  // que se resuelvan en tiempo de ejecución
}

/**
 * Registrar widgets desde una API externa
 */
export async function registerWidgetsFromAPI() {
  try {
    const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const res = await fetch(`${API}/api/admin/widgets`, {
      credentials: "include",
    });

    if (!res.ok) return;

    const { widgets, modules } = await res.json();

    // Actualizar módulos habilitados
    componentRegistry.setEnabledModules(modules);

    // Registrar widgets
    for (const _widget of widgets) {
      // En producción, aquí cargaríamos el componente dinámicamente
      // const component = await import(widget.componentUrl);
      // componentRegistry.registerWidget({ ...widget, component: component.default });
    }
  } catch (e) {
    console.warn("Failed to load widgets from API:", e);
  }
}
