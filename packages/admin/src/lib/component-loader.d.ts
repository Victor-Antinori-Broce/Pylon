/**
 * Dynamic Component Loader
 *
 * Loads custom Svelte components from grimoires for "custom" admin type.
 * Falls back to DataExplorer if component not found.
 */
import { type Component } from "svelte";
/**
 * Load a custom component from a grimoire
 */
export declare function loadCustomComponent(grimoireId: string, componentName: string): Promise<Component | null>;
/**
 * Load admin configuration from a grimoire
 */
export declare function loadGrimoireAdminModule(grimoireId: string): Promise<{
    config?: any;
    components?: Record<string, Component>;
} | null>;
/**
 * Check if a grimoire has custom admin components
 */
export declare function hasCustomAdmin(grimoireId: string): Promise<boolean>;
//# sourceMappingURL=component-loader.d.ts.map