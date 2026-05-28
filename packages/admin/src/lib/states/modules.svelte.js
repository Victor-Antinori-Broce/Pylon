/**
 * Shared Module State (Svelte 5 Runes)
 *
 * Single source of truth for which grimoires/modules are enabled.
 * Used by both SidebarLayout (for nav filtering) and Grimoires.svelte (for toggling).
 * When a grimoire is toggled in the Grimoires view, the sidebar updates instantly.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "";
class ModuleStore {
    modules = $state([]);
    uninstalled = $state([]);
    loading = $state(true);
    error = $state(null);
    activeTheme = $state(null);
    /**
     * Set of enabled module keys — derived reactively.
     * SidebarLayout uses this to filter nav items.
     */
    enabledKeys = $derived(new Set(this.modules.filter(m => m.enabled).map(m => m.key)));
    /**
     * Fetch all modules from the API.
     */
    async fetchModules() {
        this.loading = true;
        this.error = null;
        try {
            const res = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                this.activeTheme = data.activeTheme || null;
                this.modules = data.docs || [];
                this.uninstalled = data.categories?.uninstalled?.modules || [];
            }
            else {
                this.error = "Failed to fetch modules";
            }
        }
        catch (e) {
            this.error = "Network error";
            // Fallback: show all nav items
        }
        finally {
            this.loading = false;
        }
    }
    /**
     * Toggle a module's enabled state and update the API.
     * Returns true if successful.
     */
    async toggleModule(key) {
        const mod = this.modules.find(m => m.key === key);
        if (!mod || mod.canToggle === false)
            return false;
        const newEnabled = !mod.enabled;
        try {
            const res = await fetch(`${API_URL}/api/modules/${key}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ enabled: newEnabled }),
            });
            if (res.ok) {
                // Update local state immediately — sidebar reacts instantly
                this.modules = this.modules.map(m => m.key === key ? { ...m, enabled: newEnabled } : m);
                return true;
            }
            else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to toggle grimoire");
                return false;
            }
        }
        catch {
            alert("Network error toggling grimoire");
            return false;
        }
    }
    /**
     * Uninstall a grimoire but preserve its data.
     * The grimoire will move to "Uninstalled (Data Preserved)" section.
     */
    async uninstallModule(key) {
        try {
            const res = await fetch(`${API_URL}/api/modules/${key}/uninstall`, {
                method: "POST",
                credentials: "include",
            });
            if (res.ok) {
                const result = await res.json();
                // Refresh modules to update the list
                await this.fetchModules();
                return {
                    success: true,
                    dataPreserved: result.dataPreserved,
                    message: result.message
                };
            }
            else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to uninstall grimoire");
                return { success: false };
            }
        }
        catch {
            alert("Network error uninstalling grimoire");
            return { success: false };
        }
    }
    /**
     * Recover/Reinstall an uninstalled grimoire with its data.
     */
    async recoverModule(key) {
        try {
            const res = await fetch(`${API_URL}/api/modules/${key}/recover`, {
                method: "POST",
                credentials: "include",
            });
            if (res.ok) {
                const result = await res.json();
                // Refresh modules to update the list
                await this.fetchModules();
                return {
                    success: true,
                    dataRestored: result.dataRestored,
                    message: result.message
                };
            }
            else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to recover grimoire");
                return { success: false };
            }
        }
        catch {
            alert("Network error recovering grimoire");
            return { success: false };
        }
    }
    /**
     * Permanently delete a grimoire and optionally its data.
     * @param purge - If true, also drops the tables and data
     */
    async deleteModule(key, purge = false) {
        try {
            const res = await fetch(`${API_URL}/api/modules/${key}?purge=${purge}&force=true`, {
                method: "DELETE",
                credentials: "include",
            });
            if (res.ok) {
                const result = await res.json();
                // Refresh modules to update the list
                await this.fetchModules();
                return {
                    success: true,
                    dataDeleted: result.dataDeleted,
                    message: result.message
                };
            }
            else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to delete grimoire");
                return { success: false };
            }
        }
        catch {
            alert("Network error deleting grimoire");
            return { success: false };
        }
    }
    /**
     * Check if a module is enabled by key.
     */
    isEnabled(key) {
        return this.enabledKeys.has(key);
    }
}
export const moduleStore = new ModuleStore();
//# sourceMappingURL=modules.svelte.js.map