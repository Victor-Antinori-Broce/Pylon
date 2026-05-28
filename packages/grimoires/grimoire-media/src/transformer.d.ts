import sharp, { type OutputInfo } from 'sharp';
export interface TransformOptions {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    position?: 'center' | 'top' | 'right' | 'bottom' | 'left' | 'entropy' | 'attention';
    format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'auto';
    quality?: number;
    progressive?: boolean;
    focalPoint?: {
        x: number;
        y: number;
    };
}
export interface TransformResult {
    buffer: Buffer;
    info: OutputInfo;
    format: string;
}
/**
 * Image transformation service using Sharp
 */
export declare class ImageTransformer {
    private inputPath;
    private sharpInstance;
    private originalMetadata;
    constructor(inputPath: string);
    init(): Promise<void>;
    transform(options: TransformOptions): Promise<TransformResult>;
    private applyResize;
    private calculateFocalCrop;
    private applyFormat;
    getMetadata(): Promise<sharp.Metadata>;
    destroy(): void;
    /**
     * Generate cache key for transform
     */
    static generateKey(options: TransformOptions): string;
}
/**
 * Default transform presets
 */
export declare const transformPresets: Record<string, TransformOptions>;
//# sourceMappingURL=transformer.d.ts.map