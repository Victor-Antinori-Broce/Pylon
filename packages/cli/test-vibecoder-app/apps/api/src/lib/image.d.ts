/**
 * GremiusCMS — Image Optimization Pipeline
 *
 * Converts uploaded images (JPEG, PNG, GIF, TIFF) to WebP for optimal
 * delivery. Extracts dimensions. Non-image files pass through unchanged.
 *
 * Uses `sharp` — the fastest Node.js image processing library.
 */
export interface OptimizedImage {
    buffer: Buffer;
    mimeType: string;
    width: number;
    height: number;
    originalSize: number;
    optimizedSize: number;
}
/**
 * Optimize an image buffer → WebP.
 * Returns the optimized buffer + metadata.
 * Non-image or unsupported types return null (caller should use original).
 */
export declare function optimizeImage(buffer: Buffer, mimeType: string): Promise<OptimizedImage | null>;
/**
 * Extract image dimensions without conversion.
 * Works for any image type sharp supports (JPEG, PNG, WebP, AVIF, etc).
 */
export declare function getImageDimensions(buffer: Buffer): Promise<{
    width: number;
    height: number;
} | null>;
//# sourceMappingURL=image.d.ts.map