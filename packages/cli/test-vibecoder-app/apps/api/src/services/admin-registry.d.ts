/**
 * Admin Registry Service — Zero Config Grimoire Registration
 *
 * Auto-discovers admin configuration from grimoires and realms:
 * 1. Scans grimoire.json for admin.tables[]
 * 2. Scans realm.json for realm-specific grimoires (DYNAMIC)
 * 3. Detects custom views by checking for .svelte files
 * 4. Generates default DataExplorer config for tables without custom UI
 * 5. Exposes unified registry at /api/admin/registry
 */
/** Admin table configuration */
export interface AdminTableConfig {
    name: string;
    label: string;
    icon?: string;
    description?: string;
    primaryKey?: string;
    searchableFields?: string[];
    filterableFields?: string[];
    readonly?: boolean;
}
/** Admin view configuration */
export interface AdminViewConfig {
    id: string;
    type: "grid" | "kanban" | "calendar" | "custom";
    title: string;
    table?: string;
    component?: string;
}
/** Grimoire admin configuration */
export interface GrimoireAdminConfig {
    id: string;
    name: string;
    icon?: string;
    category: "core" | "content" | "data" | "esports";
    hasCustomView: boolean;
    tables: AdminTableConfig[];
    views: AdminViewConfig[];
    defaultView: string;
    /** Custom API base path (e.g., /api/directory) - if not set, uses /api/explorer */
    apiBase?: string;
}
/**
 * Scan all grimoires and build admin registry
 */
export declare function buildAdminRegistry(): Promise<GrimoireAdminConfig[]>;
/**
 * Clear registry cache (useful after grimoire installation)
 */
export declare function clearAdminRegistryCache(): void;
/**
 * Get admin config for a specific grimoire
 */
export declare function getGrimoireAdminConfig(grimoireId: string): Promise<GrimoireAdminConfig | null>;
//# sourceMappingURL=admin-registry.d.ts.map