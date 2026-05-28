/**
 * Shared Module State (Svelte 5 Runes)
 *
 * Single source of truth for which grimoires/modules are enabled.
 * Used by both SidebarLayout (for nav filtering) and Grimoires.svelte (for toggling).
 * When a grimoire is toggled in the Grimoires view, the sidebar updates instantly.
 */
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
        tables: Array<{
            name: string;
            rows: number;
        }>;
    };
    canRecover: boolean;
    canDelete: boolean;
    actions: string[];
}
export interface ModulesResponse {
    activeTheme?: string;
    categories: {
        core?: {
            modules: ModuleInfo[];
        };
        "grimoire-core"?: {
            modules: ModuleInfo[];
        };
        optional?: {
            modules: ModuleInfo[];
        };
        theme?: {
            modules: ModuleInfo[];
        };
        uninstalled?: {
            label: string;
            description: string;
            modules: UninstalledGrimoire[];
        };
    };
    docs: ModuleInfo[];
}
declare class ModuleStore {
    modules: ModuleInfo[];
    uninstalled: UninstalledGrimoire[];
    loading: boolean;
    error: string | null;
    activeTheme: string | null;
    /**
     * Set of enabled module keys — derived reactively.
     * SidebarLayout uses this to filter nav items.
     */
    enabledKeys: Set<string>;
    /**
     * Fetch all modules from the API.
     */
    fetchModules(): Promise<void>;
    /**
     * Toggle a module's enabled state and update the API.
     * Returns true if successful.
     */
    toggleModule(key: string): Promise<boolean>;
    /**
     * Uninstall a grimoire but preserve its data.
     * The grimoire will move to "Uninstalled (Data Preserved)" section.
     */
    uninstallModule(key: string): Promise<{
        success: boolean;
        dataPreserved?: {
            totalRows: number;
            tables: any[];
        };
        message?: string;
    }>;
    /**
     * Recover/Reinstall an uninstalled grimoire with its data.
     */
    recoverModule(key: string): Promise<{
        success: boolean;
        dataRestored?: {
            totalRows: number;
        };
        message?: string;
    }>;
    /**
     * Permanently delete a grimoire and optionally its data.
     * @param purge - If true, also drops the tables and data
     */
    deleteModule(key: string, purge?: boolean): Promise<{
        success: boolean;
        dataDeleted?: {
            tablesDropped: number;
            totalRows: number;
        };
        message?: string;
    }>;
    /**
     * Check if a module is enabled by key.
     */
    isEnabled(key: string): boolean;
}
export declare const moduleStore: ModuleStore;
export {};
//# sourceMappingURL=modules.svelte.d.ts.map