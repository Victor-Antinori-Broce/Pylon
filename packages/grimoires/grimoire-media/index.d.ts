/**
 * Grimoire: Media Library (Core)
 *
 * Media file management with pluggable storage (MinIO, S3, Local, R2).
 * Toggleable Core Grimoire - can be disabled but storage service remains.
 */
import type { GrimoireDefinition } from "@gremius/shared";
export type { StorageConfig, MinioStorageConfig, S3StorageConfig, LocalStorageConfig, R2StorageConfig, MediaFeaturesConfig, MediaGrimoireConfig, } from "./config.schema";
export { defaultMediaConfig, validateMediaConfig, storageProviders } from "./config.schema";
export { createStorageAdapter, testStorageConnection } from "./storage.adapter";
export declare const grimoire: GrimoireDefinition;
export default grimoire;
//# sourceMappingURL=index.d.ts.map