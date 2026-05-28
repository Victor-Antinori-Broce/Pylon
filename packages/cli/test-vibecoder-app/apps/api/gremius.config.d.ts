/**
 * GremiusCMS — Central Configuration (Auto-Discovery Edition)
 *
 * Este config se auto-genera escaneando packages/grimoires/ automáticamente.
 * Los grimoires detectados en filesystem se añaden a 'features' con enabled: false.
 *
 * Para forzar un grimoire como core, añádelo manualmente a CORE_GRIMOIRES.
 * Para excluir un grimoire, añádelo a EXCLUDED_GRIMOIRES.
 */
export interface GrimoireRef {
    id: string;
    enabled: boolean;
    core?: boolean;
    priority?: number;
}
export interface GremiusConfig {
    core: GrimoireRef[];
    features: GrimoireRef[];
    realm?: string[];
    grimoires?: string[];
    modules?: string[];
}
export declare function getConfig(): Promise<GremiusConfig>;
export declare const staticConfig: GremiusConfig;
declare const config: GremiusConfig;
export declare function isGrimoireEnabled(id: string): boolean;
export declare function getGrimoireConfig(id: string): GrimoireRef | undefined;
export default config;
//# sourceMappingURL=gremius.config.d.ts.map