// @ts-ignore
import sharp, { type Sharp, type OutputInfo } from 'sharp';

export interface TransformOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: 'center' | 'top' | 'right' | 'bottom' | 'left' | 'entropy' | 'attention';
  format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'auto';
  quality?: number;
  progressive?: boolean;
  focalPoint?: { x: number; y: number }; // 0-1
}

export interface TransformResult {
  buffer: Buffer;
  info: OutputInfo;
  format: string;
}

/**
 * Image transformation service using Sharp
 */
export class ImageTransformer {
  private inputPath: string;
  private sharpInstance: Sharp | null = null;
  private originalMetadata: sharp.Metadata | null = null;

  constructor(inputPath: string) {
    this.inputPath = inputPath;
  }

  async init(): Promise<void> {
    this.sharpInstance = sharp(this.inputPath);
    this.originalMetadata = await this.sharpInstance.metadata();
  }

  async transform(options: TransformOptions): Promise<TransformResult> {
    if (!this.sharpInstance) {
      await this.init();
    }

    let pipeline = this.sharpInstance!.clone();

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
      info: info as OutputInfo,
      format: info.format || 'unknown',
    };
  }

  private applyResize(pipeline: Sharp, options: TransformOptions): Sharp {
    const resizeOptions: sharp.ResizeOptions = {
      width: options.width,
      height: options.height,
      fit: options.fit,
      position: options.position,
      withoutEnlargement: true,
    };

    // Handle focal point for smart cropping
    if (options.focalPoint && options.fit === 'cover') {
      const cropRegion = this.calculateFocalCrop(
        this.originalMetadata!.width!,
        this.originalMetadata!.height!,
        options.width!,
        options.height!,
        options.focalPoint
      );

      pipeline = pipeline.extract(cropRegion);
      resizeOptions.fit = 'fill';
      delete resizeOptions.position;
    }

    return pipeline.resize(resizeOptions);
  }

  private calculateFocalCrop(
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number,
    focalPoint: { x: number; y: number }
  ): { left: number; top: number; width: number; height: number } {
    const srcAspect = srcWidth / srcHeight;
    const targetAspect = targetWidth / targetHeight;

    let cropWidth: number;
    let cropHeight: number;

    if (srcAspect > targetAspect) {
      cropHeight = srcHeight;
      cropWidth = Math.round(srcHeight * targetAspect);
    } else {
      cropWidth = srcWidth;
      cropHeight = Math.round(srcWidth / targetAspect);
    }

    let left = Math.round(focalPoint.x * srcWidth - cropWidth / 2);
    let top = Math.round(focalPoint.y * srcHeight - cropHeight / 2);

    left = Math.max(0, Math.min(left, srcWidth - cropWidth));
    top = Math.max(0, Math.min(top, srcHeight - cropHeight));

    return { left, top, width: cropWidth, height: cropHeight };
  }

  private applyFormat(pipeline: Sharp, options: TransformOptions): Sharp {
    const format = options.format!;
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

  async getMetadata(): Promise<sharp.Metadata> {
    if (!this.originalMetadata) {
      await this.init();
    }
    return this.originalMetadata!;
  }

  destroy(): void {
    this.sharpInstance = null;
    this.originalMetadata = null;
  }

  /**
   * Generate cache key for transform
   */
  static generateKey(options: TransformOptions): string {
    const parts: string[] = [];
    if (options.width) parts.push(`w${options.width}`);
    if (options.height) parts.push(`h${options.height}`);
    if (options.fit) parts.push(options.fit);
    if (options.format) parts.push(options.format);
    if (options.quality) parts.push(`q${options.quality}`);
    if (options.focalPoint) {
      parts.push(`fp${Math.round(options.focalPoint.x * 100)}_${Math.round(options.focalPoint.y * 100)}`);
    }
    return parts.join('_') || 'original';
  }
}

/**
 * Default transform presets
 */
export const transformPresets: Record<string, TransformOptions> = {
  thumbnail: { width: 150, height: 150, fit: 'cover', format: 'webp', quality: 80 },
  small: { width: 400, height: 300, fit: 'inside', format: 'webp', quality: 85 },
  medium: { width: 800, height: 600, fit: 'inside', format: 'webp', quality: 85 },
  large: { width: 1200, height: 800, fit: 'inside', format: 'webp', quality: 90 },
  hero: { width: 1920, height: 1080, fit: 'cover', position: 'attention', format: 'webp', quality: 90 },
};
