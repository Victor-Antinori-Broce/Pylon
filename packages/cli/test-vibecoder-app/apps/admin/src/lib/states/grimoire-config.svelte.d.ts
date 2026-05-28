/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRIMOIRE CONFIG STORE - Svelte 5 Runes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestiona la configuración de cada grimoire individualmente.
 * Cada grimoire tiene su propia sección de settings accesible desde su UI.
 */
export type StorageProvider = "minio" | "s3" | "local" | "r2";
export interface MinioStorageConfig {
    provider: "minio";
    endpoint: string;
    bucket: string;
    accessKey?: string;
    secretKey?: string;
    publicUrl?: string;
    useSSL?: boolean;
}
export interface S3StorageConfig {
    provider: "s3";
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
}
export interface LocalStorageConfig {
    provider: "local";
    path: string;
    publicUrl: string;
}
export interface R2StorageConfig {
    provider: "r2";
    accountId: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
}
export type StorageConfig = MinioStorageConfig | S3StorageConfig | LocalStorageConfig | R2StorageConfig;
export interface MediaFeaturesConfig {
    thumbnails: boolean;
    imageOptimization: boolean;
    signedUrls: boolean;
    maxFileSize: number;
    allowedTypes: string[];
}
export interface MediaGrimoireConfig {
    storage: StorageConfig;
    features: MediaFeaturesConfig;
    [key: string]: unknown;
}
export interface GrimoireConfig {
    [key: string]: unknown;
}
export declare class GrimoireConfigStore {
    configs: Record<string, GrimoireConfig>;
    isLoading: Record<string, boolean>;
    isSaving: Record<string, boolean>;
    errors: Record<string, string | null>;
    saveSuccess: Record<string, boolean>;
    /**
     * Carga la configuración de un grimoire
     */
    loadConfig(grimoireId: string): Promise<GrimoireConfig | null>;
    /**
     * Guarda la configuración de un grimoire
     */
    saveConfig(grimoireId: string, config: GrimoireConfig): Promise<boolean>;
    /**
     * Testea la conexión de storage
     */
    testStorageConnection(grimoireId: string, storageConfig: StorageConfig): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Resetea la configuración a defaults
     */
    resetConfig(grimoireId: string): Promise<boolean>;
    getConfig(grimoireId: string): GrimoireConfig | null;
    isConfigLoading(grimoireId: string): boolean;
    isConfigSaving(grimoireId: string): boolean;
    getConfigError(grimoireId: string): string | null;
    getConfigSaveSuccess(grimoireId: string): boolean;
    getDefaultConfig(grimoireId: string): GrimoireConfig;
    getDefaultMediaConfig(): MediaGrimoireConfig;
    getStorageProviderLabel(provider: StorageProvider): string;
    getStorageProviderDescription(provider: StorageProvider): string;
    clearError(grimoireId: string): void;
    clearSuccess(grimoireId: string): void;
}
export declare const grimoireConfigStore: GrimoireConfigStore;
//# sourceMappingURL=grimoire-config.svelte.d.ts.map