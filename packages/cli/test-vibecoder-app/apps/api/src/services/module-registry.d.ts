/**
 * GremiusCMS — Grimoire Classification System (La Jerarquía Mágica)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE:
 *
 *   ENGINE (invisible, always active, NOT grimoires):
 *     Schema Engine, Auth Manager, API Gateway, Valkey, Grimoire Loader
 *     Media Hub ← Infrastructure, not a grimoire
 *     Data Sets ← NOW A CORE GRIMOIRE (grimoire-datasets), toggleable
 *
 *   CORE GRIMOIRES (shown, toggleable, realm-agnostic):
 *     Blog, Webhooks, Connectors, Blocks, Formulas KPI
 *
 *   OPTIONAL GRIMOIRES (shown, toggleable, vertical features):
 *     Academy, DMS, Booking, Directory, CRM, Blog
 *
 *   REALM GRIMOIRES (shown in OPTIONAL section with "Enabled by Realm" badge):
 *     Games, Streamers, Platforms, Tags, Collections (when Realm Esports active)
 */
export type GrimoireCategory = "core" | "grimoire-core" | "optional" | "realm";
export interface GrimoireDef {
    key: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    category: GrimoireCategory;
    tables: string[];
    dependsOn: string[];
    realmId?: string;
    referencedBy: Array<{
        grimoire: string;
        table: string;
        column: string;
        label: string;
    }>;
}
export declare const GRIMOIRE_REGISTRY: GrimoireDef[];
export declare const GRIMOIRE_KEYS: string[];
export declare function getCoreGrimoires(): GrimoireDef[];
export declare function getGrimoireCoreGrimoires(): GrimoireDef[];
export declare function getOptionalGrimoires(): GrimoireDef[];
export declare function getRealmGrimoires(realmId?: string): GrimoireDef[];
export declare function getGrimoiresByRealm(realmId: string): GrimoireDef[];
/** @deprecated Use GrimoireDef instead */
export type CoreModuleDef = GrimoireDef;
/** @deprecated Use GRIMOIRE_REGISTRY instead */
export declare const CORE_MODULES: GrimoireDef[];
/** @deprecated Use GRIMOIRE_KEYS instead */
export declare const CORE_MODULE_KEYS: string[];
/** @deprecated Use getCoreGrimoires instead */
export declare const getCoreModules: typeof getCoreGrimoires;
/** @deprecated Use getOptionalGrimoires instead */
export declare const getOptionalModules: typeof getOptionalGrimoires;
/** @deprecated Use getRealmGrimoires instead */
export declare const getThemeModules: typeof getRealmGrimoires;
/** @deprecated Use getGrimoiresByRealm instead */
export declare const getModulesByTheme: typeof getGrimoiresByRealm;
export interface DisableCheckResult {
    canDisable: boolean;
    blockers: Array<{
        grimoire: string;
        grimoireName: string;
        table: string;
        column: string;
        label: string;
        rowCount: number;
    }>;
    warnings: string[];
}
export declare function checkCanDisable(grimoireKey: string, enabledGrimoireKeys: Set<string>): Promise<DisableCheckResult>;
//# sourceMappingURL=module-registry.d.ts.map