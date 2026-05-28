import type { StorageConfig } from "./config.schema";
export declare function testStorageConnection(config: StorageConfig): Promise<{
    success: boolean;
    message: string;
}>;
export interface StorageAdapter {
    upload(key: string, data: Buffer | string, contentType?: string): Promise<void>;
    download(key: string): Promise<Buffer>;
    delete(key: string): Promise<void>;
    getSignedUploadUrl(key: string, expiresIn?: number): Promise<string>;
    getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
    getPublicUrl(key: string): string | null;
}
export declare function createStorageAdapter(config: StorageConfig): Promise<StorageAdapter>;
//# sourceMappingURL=storage.adapter.d.ts.map