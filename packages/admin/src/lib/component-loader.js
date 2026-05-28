/**
 * Dynamic Component Loader
 *
 * Loads custom Svelte components from grimoires for "custom" admin type.
 * Falls back to DataExplorer if component not found.
 */
// Cache for loaded components
const componentCache = new Map();
/**
 * Load a custom component from a grimoire
 */
export async function loadCustomComponent(grimoireId, componentName) {
    const cacheKey = `${grimoireId}/${componentName}`;
    // Check cache first
    if (componentCache.has(cacheKey)) {
        return componentCache.get(cacheKey);
    }
    try {
        // Map grimoire ID to package name
        const packageMap = {
            "academy": "grimoire-academy-lms",
            "booking": "grimoire-booking",
            "directory": "grimoire-directory",
            "dms": "grimoire-dms",
            "crm": "grimoire-crm",
            "esports": "grimoire-esports",
            "gremius-crm": "grimoire-crm",
        };
        const packageName = packageMap[grimoireId] || `grimoire-${grimoireId}`;
        // Try to load from grimoire's admin module
        const mod = await import(`../../../packages/grimoires/${packageName}/admin.svelte`);
        const component = mod[componentName] || mod.default;
        if (component) {
            componentCache.set(cacheKey, component);
            return component;
        }
        return null;
    }
    catch (e) {
        console.warn(`Custom component not found: ${cacheKey}`, e);
        return null;
    }
}
/**
 * Load admin configuration from a grimoire
 */
export async function loadGrimoireAdminModule(grimoireId) {
    const packageMap = {
        "academy": "grimoire-academy-lms",
        "booking": "grimoire-booking",
        "directory": "grimoire-directory",
        "dms": "grimoire-dms",
        "crm": "grimoire-crm",
        "esports": "grimoire-esports",
        "gremius-crm": "grimoire-crm",
    };
    const packageName = packageMap[grimoireId] || `grimoire-${grimoireId}`;
    try {
        // Try to load the admin module
        const mod = await import(`../../../packages/grimoires/${packageName}/admin.ts`);
        return {
            config: mod.adminConfig,
            components: mod.components
        };
    }
    catch {
        // Try .js extension
        try {
            const mod = await import(`../../../packages/grimoires/${packageName}/admin.js`);
            return {
                config: mod.adminConfig,
                components: mod.components
            };
        }
        catch {
            return null;
        }
    }
}
/**
 * Check if a grimoire has custom admin components
 */
export async function hasCustomAdmin(grimoireId) {
    const mod = await loadGrimoireAdminModule(grimoireId);
    return mod?.components !== undefined || mod?.config?.components !== undefined;
}
//# sourceMappingURL=component-loader.js.map