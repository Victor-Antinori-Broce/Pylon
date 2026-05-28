/**
 * S3 Storage Library
 * Unified storage service for MinIO / S3.
 * Supports upload, delete, signed URLs, and file access.
 */
export declare const s3: any;
export declare const BUCKET: string;
export declare const PUBLIC_URL: string;
export declare function generateS3Key(filename: string, prefix?: string): string;
export declare function uploadFile(file: File | Blob, filename: string, mimeType: string, prefix?: string): Promise<{
    s3Key: string;
    url: string;
    size: number;
}>;
/**
 * Upload a raw buffer to S3 (used by image optimization pipeline).
 */
export declare function uploadBuffer(buffer: Buffer, s3Key: string, mimeType: string): Promise<{
    s3Key: string;
    url: string;
    size: number;
}>;
export declare function deleteFile(s3Key: string): Promise<void>;
export declare function fileExists(s3Key: string): Promise<boolean>;
export declare function getFile(s3Key: string): Promise<ReadableStream | null>;
/**
 * Generate a time-limited signed URL for secure file access.
 * @param s3Key     The S3 object key
 * @param expiresIn TTL in seconds (default 3600 = 1 hour, max 86400 = 24h)
 */
export declare function generateSignedDownloadUrl(s3Key: string, expiresIn?: number): Promise<string>;
//# sourceMappingURL=storage.d.ts.map