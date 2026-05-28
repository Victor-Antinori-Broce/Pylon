import sharp from 'sharp';
/**
 * Image transformation service using Sharp
 */
export class ImageTransformer {
    inputPath;
    sharpInstance = null;
    originalMetadata = null;
    constructor(inputPath) {
        this.inputPath = inputPath;
    }
    async init() {
        this.sharpInstance = sharp(this.inputPath);
        this.originalMetadata = await this.sharpInstance.metadata();
    }
    async transform(options) {
        if (!this.sharpInstance) {
            await this.init();
        }
        let pipeline = this.sharpInstance.clone();
        // Apply resize
        if (options.width || options.height) {
            pipeline = this.applyResize(pipeline, options);
        }
        // Apply format conversion
        if (options.format && options.format !== 'auto') {
            pipeline = this.applyFormat(pipeline, options);
        }
        // Generate output
        const buffer = await pipeline.toBuffer();
        const info = await sharp(buffer).metadata();
        return {
            buffer,
            info: info,
            format: info.format || 'unknown',
        };
    }
    applyResize(pipeline, options) {
        const resizeOptions = {
            width: options.width,
            height: options.height,
            fit: options.fit,
            position: options.position,
            withoutEnlargement: true,
        };
        // Handle focal point for smart cropping
        if (options.focalPoint && options.fit === 'cover') {
            const cropRegion = this.calculateFocalCrop(this.originalMetadata.width, this.originalMetadata.height, options.width, options.height, options.focalPoint);
            pipeline = pipeline.extract(cropRegion);
            resizeOptions.fit = 'fill';
            delete resizeOptions.position;
        }
        return pipeline.resize(resizeOptions);
    }
    calculateFocalCrop(srcWidth, srcHeight, targetWidth, targetHeight, focalPoint) {
        const srcAspect = srcWidth / srcHeight;
        const targetAspect = targetWidth / targetHeight;
        let cropWidth;
        let cropHeight;
        if (srcAspect > targetAspect) {
            cropHeight = srcHeight;
            cropWidth = Math.round(srcHeight * targetAspect);
        }
        else {
            cropWidth = srcWidth;
            cropHeight = Math.round(srcWidth / targetAspect);
        }
        let left = Math.round(focalPoint.x * srcWidth - cropWidth / 2);
        let top = Math.round(focalPoint.y * srcHeight - cropHeight / 2);
        left = Math.max(0, Math.min(left, srcWidth - cropWidth));
        top = Math.max(0, Math.min(top, srcHeight - cropHeight));
        return { left, top, width: cropWidth, height: cropHeight };
    }
    applyFormat(pipeline, options) {
        const format = options.format;
        const quality = options.quality ?? 80;
        switch (format) {
            case 'jpeg':
                return pipeline.jpeg({
                    quality,
                    progressive: options.progressive ?? true,
                    mozjpeg: true,
                });
            case 'png':
                return pipeline.png({ progressive: options.progressive ?? true });
            case 'webp':
                return pipeline.webp({ quality, effort: 4 });
            case 'avif':
                return pipeline.avif({ quality, effort: 4 });
            case 'gif':
                return pipeline.gif();
            default:
                return pipeline;
        }
    }
    async getMetadata() {
        if (!this.originalMetadata) {
            await this.init();
        }
        return this.originalMetadata;
    }
    destroy() {
        this.sharpInstance = null;
        this.originalMetadata = null;
    }
    /**
     * Generate cache key for transform
     */
    static generateKey(options) {
        const parts = [];
        if (options.width)
            parts.push(`w${options.width}`);
        if (options.height)
            parts.push(`h${options.height}`);
        if (options.fit)
            parts.push(options.fit);
        if (options.format)
            parts.push(options.format);
        if (options.quality)
            parts.push(`q${options.quality}`);
        if (options.focalPoint) {
            parts.push(`fp${Math.round(options.focalPoint.x * 100)}_${Math.round(options.focalPoint.y * 100)}`);
        }
        return parts.join('_') || 'original';
    }
}
/**
 * Default transform presets
 */
export const transformPresets = {
    thumbnail: { width: 150, height: 150, fit: 'cover', format: 'webp', quality: 80 },
    small: { width: 400, height: 300, fit: 'inside', format: 'webp', quality: 85 },
    medium: { width: 800, height: 600, fit: 'inside', format: 'webp', quality: 85 },
    large: { width: 1200, height: 800, fit: 'inside', format: 'webp', quality: 90 },
    hero: { width: 1920, height: 1080, fit: 'cover', position: 'attention', format: 'webp', quality: 90 },
};
//# sourceMappingURL=transformer.js.map