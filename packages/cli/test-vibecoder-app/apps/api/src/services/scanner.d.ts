/**
 * Filesystem Scanner Service (The Lore Refactor Edition)
 *
 * Scans /packages/grimoires, /packages/realms, and node_modules for manifests.
 * Uses Bun's native optimized I/O APIs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GRIMOIRES: Individual magical code blocks (formerly "modules")
 *   Location: packages/grimoires/
 *   Manifest: grimoire.json or gremius.json
 *
 * REALMS: Business ecosystems grouping grimoires (formerly "themes")
 *   Location: packages/realms/
 *   Manifest: realm.json or gremius.json
 *
 * INSTALLED: Grimoires installed via npm/marketplace
 *   Location: node_modules/
 *   Registry: installed_grimoires table
 */
/** Grimoire/Realm manifest structure */
export interface GremiusManifest {
    id: string;
    name: string;
    description?: string;
    version: string;
    type: "grimoire" | "realm" | "module" | "theme";
    icon?: string;
    author?: string;
    admin_route?: string;
    category?: "core" | "grimoire-core" | "optional" | "realm" | string;
    realmId?: string;
    css_entry?: string;
    preview_image?: string;
    grimoires?: string[];
    requires_modules?: string[];
    optional_modules?: string[];
    optional_grimoires?: string[];
    realm_type?: string;
    theme_type?: string;
    components?: Record<string, string>;
    source?: "filesystem" | "npm" | "marketplace" | "local";
    hasMigrations?: boolean;
    installed?: boolean;
    enabled?: boolean;
    installPath?: string;
    tables?: (string | TableConfig)[];
}
/** Table configuration in grimoire manifest */
interface TableConfig {
    name: string;
    table?: string;
    label?: string;
    icon?: string;
    description?: string;
    primaryKey?: string;
    searchableFields?: string[];
    filterableFields?: string[];
    readonly?: boolean;
}
/**
 * Scan grimoires from node_modules (installed via npm)
 */
export declare function scanInstalledGrimoires(): Promise<GremiusManifest[]>;
/**
 * Scan grimoires or realms directories
 * @param type "grimoires" | "realms" (legacy: "modules" | "themes")
 */
export declare function scanPackages(type: "grimoires" | "realms" | "modules" | "themes"): Promise<GremiusManifest[]>;
/**
 * Get all available grimoires (local + installed)
 */
export declare function getAllGrimoires(): Promise<GremiusManifest[]>;
export declare function runGrimoireMigrations(grimoireId: string): Promise<void>;
/**
 * @deprecated Use runGrimoireMigrations instead
 */
export declare const runModuleMigrations: typeof runGrimoireMigrations;
/**
 * @deprecated Use scanPackages("grimoires") instead
 */
export declare function scanModules(): Promise<GremiusManifest[]>;
/**
 * @deprecated Use scanPackages("realms") instead
 */
export declare function scanThemes(): Promise<GremiusManifest[]>;
export {};
//# sourceMappingURL=scanner.d.ts.map