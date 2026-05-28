/**
 * Shared Module State (Svelte 5 Runes)
 *
 * Single source of truth for which grimoires/modules are enabled.
 * Used by both SidebarLayout (for nav filtering) and Grimoires.svelte (for toggling).
 * When a grimoire is toggled in the Grimoires view, the sidebar updates instantly.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface ModuleInfo {
    key: string;
    name: string;
    description: string;
    category: string;
    enabled: boolean;
    icon?: string;
    color?: string;
    canToggle?: boolean;
    isRealmActive?: boolean;
    realmId?: string;
    source?: string;
    tables?: string[];
    dependsOn?: string[];
    enabledByRealm?: boolean;
    sidebarBadge?: string;
}

export interface UninstalledGrimoire {
    key: string;
    name: string;
    status: "uninstalled";
    hasPreservedData: boolean;
    dataSummary: {
        totalRows: number;
        tables: Array<{ name: string; rows: number }>;
    };
    canRecover: boolean;
    canDelete: boolean;
    actions: string[];
}

export interface ModulesResponse {
    activeTheme?: string;
    categories: {
        core?: { modules: ModuleInfo[] };
        "grimoire-core"?: { modules: ModuleInfo[] };
        optional?: { modules: ModuleInfo[] };
        theme?: { modules: ModuleInfo[] };
        uninstalled?: { 
            label: string;
            description: string;
            modules: UninstalledGrimoire[];
        };
    };
    docs: ModuleInfo[];
}

class ModuleStore {
    modules = $state<ModuleInfo[]>([]);
    uninstalled = $state<UninstalledGrimoire[]>([]);
    loading = $state(true);
    error = $state<string | null>(null);
    activeTheme = $state<string | null>(null);

    /**
     * Set of enabled module keys — derived reactively.
     * SidebarLayout uses this to filter nav items.
     */
    enabledKeys = $derived(
        new Set(this.modules.filter(m => m.enabled).map(m => m.key))
    );

    /**
     * Fetch all modules from the API.
     */
    async fetchModules() {
        this.loading = true;
        this.error = null;
        try {
            const res = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
            if (res.ok) {
                const data: ModulesResponse = await res.json();
                this.activeTheme = data.activeTheme || null;
                this.modules = data.docs || [];
                this.uninstalled = data.categories?.uninstalled?.modules || [];
            } else {
                this.error = "Failed to fetch modules";
            }
        } catch (e) {
            this.error = "Network error";
            // Fallback: show all nav items
        } finally {
            this.loading = false;
        }
    }

    /**
     * Toggle a module's enabled state and update the API.
     * Returns true if successful.
     */
    async toggleModule(key: string): Promise<boolean> {
        const mod = this.modules.find(m => m.key === key);
        if (!mod || mod.canToggle === false) return false;

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
                this.modules = this.modules.map(m =>
                    m.key === key ? { ...m, enabled: newEnabled } : m
                );
                return true;
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to toggle grimoire");
                return false;
            }
        } catch {
            alert("Network error toggling grimoire");
            return false;
        }
    }

    /**
     * Uninstall a grimoire but preserve its data.
     * The grimoire will move to "Uninstalled (Data Preserved)" section.
     */
    async uninstallModule(key: string): Promise<{ success: boolean; dataPreserved?: { totalRows: number; tables: any[] }; message?: string }> {
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
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to uninstall grimoire");
                return { success: false };
            }
        } catch {
            alert("Network error uninstalling grimoire");
            return { success: false };
        }
    }

    /**
     * Recover/Reinstall an uninstalled grimoire with its data.
     */
    async recoverModule(key: string): Promise<{ success: boolean; dataRestored?: { totalRows: number }; message?: string }> {
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
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to recover grimoire");
                return { success: false };
            }
        } catch {
            alert("Network error recovering grimoire");
            return { success: false };
        }
    }

    /**
     * Permanently delete a grimoire and optionally its data.
     * @param purge - If true, also drops the tables and data
     */
    async deleteModule(key: string, purge: boolean = false): Promise<{ success: boolean; dataDeleted?: { tablesDropped: number; totalRows: number }; message?: string }> {
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
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || err.message || "Failed to delete grimoire");
                return { success: false };
            }
        } catch {
            alert("Network error deleting grimoire");
            return { success: false };
        }
    }

    /**
     * Check if a module is enabled by key.
     */
    isEnabled(key: string): boolean {
        return this.enabledKeys.has(key);
    }
}

export const moduleStore = new ModuleStore();
