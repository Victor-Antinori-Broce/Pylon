/**
 * Grimoire Loader v2 — Zero Config Edition
 *
 * Consumes /api/admin/registry for auto-discovered grimoire configurations.
 * Falls back to DataExplorer for any grimoire without custom views.
 *
 * Flow:
 * 1. Fetch registry from API (auto-scanned from grimoire.json files)
 * 2. Check GRIMOIRE_VIEW_REGISTRY for hardcoded custom views (legacy support)
 * 3. If custom view exists → load it
 * 4. If no custom view → use DataExplorer with auto-generated config
 */
import type { Component } from "svelte";
import type { AdminConfig } from "./types/admin";
export declare const GRIMOIRE_VIEW_REGISTRY: Record<string, () => Promise<{
    default: Component<any>;
}>>;
export interface GrimoireAdminConfig {
    id: string;
    name: string;
    icon?: string;
    category: "core" | "content" | "data" | "system" | "esports";
    hasCustomView: boolean;
    tables: AdminTableConfig[];
    views: AdminViewConfig[];
    defaultView: string;
    /** Custom API base path (e.g., /api/directory) - if not set, uses /api/explorer */
    apiBase?: string;
}
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
export interface AdminViewConfig {
    id: string;
    type: "grid" | "kanban" | "calendar" | "custom";
    title: string;
    table?: string;
    component?: string;
}
export interface SidebarItem {
    path: string;
    label: string;
    icon: string;
    category: string;
    subItems?: {
        path: string;
        label: string;
        viewId: string;
    }[];
}
/**
 * Fetch admin registry from API (auto-discovered grimoires)
 */
export declare function fetchAdminRegistry(): Promise<GrimoireAdminConfig[]>;
/**
 * Get config for a specific grimoire
 */
export declare function getGrimoireConfig(grimoireId: string): Promise<GrimoireAdminConfig | null>;
/**
 * Check if grimoire has a custom view (legacy registry OR auto-detected)
 *
 * Hybrid Rendering support:
 * - If viewId is provided, checks for `{grimoireId}-{viewId}` in registry
 * - Falls back to legacy grimoire-level registry entry
 */
export declare function hasCustomView(grimoireId: string, viewId?: string): boolean;
/**
 * Load custom view component for a grimoire
 *
 * Hybrid Rendering support:
 * - If viewId is provided, tries `{grimoireId}-{viewId}` first
 * - Falls back to legacy grimoire-level registry entry
 */
export declare function loadCustomView(grimoireId: string, viewId?: string): Promise<Component | null>;
/**
 * Generate AdminConfig from grimoire registry for DataExplorer
 *
 * @param grimoire - Grimoire config from registry
 * @param viewId - Optional: generate config for a single view only (hybrid rendering)
 */
export declare function generateExplorerConfig(grimoire: GrimoireAdminConfig, viewId?: string): AdminConfig;
/**
 * Generate default config for grimoires not in registry
 * (Fallback for when API is unavailable)
 */
export declare function generateDefaultConfig(grimoireId: string): Promise<AdminConfig>;
/**
 * Generate sidebar items from registry
 */
export declare function generateSidebarItems(): Promise<SidebarItem[]>;
export declare function getGrimoireIcon(grimoireId: string): string;
/**
 * Clear registry cache (call after grimoire changes)
 */
export declare function clearRegistryCache(): void;
/**
 * Alias for getGrimoireConfig - kept for backward compatibility
 * @deprecated Use fetchGrimoireConfig or getGrimoireConfig instead
 */
export declare const loadGrimoireConfig: typeof getGrimoireConfig;
/**
 * Alias for fetchAdminRegistry - kept for naming consistency
 */
export declare const fetchGrimoireConfig: typeof getGrimoireConfig;
//# sourceMappingURL=grimoire-loader.d.ts.map