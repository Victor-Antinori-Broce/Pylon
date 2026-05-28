/**
 * Academy LMS - Media Service
 *
 * Servicio para integración con Media Library de Gremius.
 * Maneja subida, procesamiento y gestión de archivos multimedia.
 */
import { z } from "zod";
export interface MediaFile {
    id: string;
    url: string;
    thumbnailUrl?: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    duration?: number;
    metadata?: Record<string, unknown>;
    createdAt: Date;
}
export interface UploadResult {
    success: boolean;
    file?: MediaFile;
    error?: string;
}
export interface MediaValidation {
    maxSize?: number;
    allowedTypes?: string[];
    maxWidth?: number;
    maxHeight?: number;
    minWidth?: number;
    minHeight?: number;
}
export type MediaType = "image" | "video" | "document" | "audio" | "any";
export declare const mediaFileSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    thumbnailUrl: z.ZodOptional<z.ZodString>;
    filename: z.ZodString;
    originalName: z.ZodString;
    mimeType: z.ZodString;
    size: z.ZodNumber;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
    duration: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    url: string;
    size: number;
    filename: string;
    mimeType: string;
    originalName: string;
    duration?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
    width?: number | undefined;
    height?: number | undefined;
    thumbnailUrl?: string | undefined;
}, {
    id: string;
    createdAt: Date;
    url: string;
    size: number;
    filename: string;
    mimeType: string;
    originalName: string;
    duration?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
    width?: number | undefined;
    height?: number | undefined;
    thumbnailUrl?: string | undefined;
}>;
export declare const uploadOptionsSchema: z.ZodObject<{
    tipo: z.ZodDefault<z.ZodEnum<["image", "video", "document", "audio", "any"]>>;
    maxSize: z.ZodDefault<z.ZodNumber>;
    allowedTypes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    generarThumbnail: z.ZodDefault<z.ZodBoolean>;
    optimizarImagen: z.ZodDefault<z.ZodBoolean>;
    carpeta: z.ZodDefault<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    tipo: "video" | "image" | "any" | "audio" | "document";
    maxSize: number;
    generarThumbnail: boolean;
    optimizarImagen: boolean;
    carpeta: string;
    metadata?: Record<string, unknown> | undefined;
    allowedTypes?: string[] | undefined;
}, {
    metadata?: Record<string, unknown> | undefined;
    tipo?: "video" | "image" | "any" | "audio" | "document" | undefined;
    allowedTypes?: string[] | undefined;
    maxSize?: number | undefined;
    generarThumbnail?: boolean | undefined;
    optimizarImagen?: boolean | undefined;
    carpeta?: string | undefined;
}>;
export declare const validacionesPorTipo: Record<MediaType, MediaValidation>;
/**
 * Valida un archivo según el tipo
 */
export declare function validarArchivo(file: File | {
    size: number;
    type: string;
    name: string;
}, tipo?: MediaType): {
    valido: true;
} | {
    valido: false;
    errores: string[];
};
/**
 * Determina el tipo de media según el MIME type
 */
export declare function determinarTipoMedia(mimeType: string): MediaType;
/**
 * Formatea bytes a formato legible
 */
export declare function formatBytes(bytes: number, decimals?: number): string;
/**
 * Extrae información de un archivo de video de YouTube
 */
export declare function extraerInfoYoutube(url: string): {
    valido: boolean;
    videoId?: string;
    embedUrl?: string;
    thumbnailUrl?: string;
};
/**
 * Normaliza una URL de video (YouTube, Vimeo, etc.)
 */
export declare function normalizarVideoUrl(url: string): {
    tipo: "youtube" | "vimeo" | "directo" | "embed";
    url: string;
    thumbnailUrl?: string;
};
export interface MediaLibraryClient {
    upload: (file: File | Buffer, options: {
        folder?: string;
        filename?: string;
        metadata?: Record<string, unknown>;
    }) => Promise<MediaFile>;
    delete: (fileId: string) => Promise<boolean>;
    getUrl: (fileId: string) => Promise<string>;
    optimizeImage: (fileId: string, options: {
        width?: number;
        height?: number;
        quality?: number;
    }) => Promise<MediaFile>;
}
/**
 * Genera URL para obtener imagen con preset de transformación
 * Usa los endpoints de grimoire-media
 */
export declare function getMediaPresetUrl(mediaId: string, preset?: "thumbnail" | "medium" | "large" | "original"): string;
/**
 * Genera URL para portada de curso (usa preset large)
 * @param mediaId - ID del media en grimoire-media
 */
export declare function getCursoCoverUrl(mediaId: string | null | undefined): string | null;
/**
 * Genera URL para thumbnail de quiz (usa preset thumbnail)
 * @param mediaId - ID del media en grimoire-media
 */
export declare function getQuizThumbnailUrl(mediaId: string | null | undefined): string | null;
/**
 * Genera URL para imagen de learning path (usa preset large)
 * @param mediaId - ID del media en grimoire-media
 */
export declare function getLearningPathImageUrl(mediaId: string | null | undefined): string | null;
/**
 * Genera URL para imagen de tema (usa preset medium)
 * @param mediaId - ID del media en grimoire-media
 */
export declare function getTemaImageUrl(mediaId: string | null | undefined): string | null;
/**
 * Genera URL para archivo de pregunta (usa preset original)
 * @param mediaId - ID del media en grimoire-media
 */
export declare function getPreguntaArchivoUrl(mediaId: string | null | undefined): string | null;
/**
 * Genera URL para documento (usa preset original)
 * @param mediaId - ID del media en grimoire-media
 */
export declare function getDocumentoUrl(mediaId: string | null | undefined): string | null;
/**
 * Servicio de media que integra con Media Library de Gremius
 */
export declare class MediaService {
    private client;
    constructor(client: MediaLibraryClient);
    /**
     * Sube un archivo al Media Library
     */
    subirArchivo(file: File | Buffer, options: z.infer<typeof uploadOptionsSchema>): Promise<UploadResult>;
    /**
     * Sube múltiples archivos
     */
    subirArchivos(files: (File | Buffer)[], options: z.infer<typeof uploadOptionsSchema>): Promise<{
        exitosos: MediaFile[];
        fallidos: Array<{
            index: number;
            error: string;
        }>;
    }>;
    /**
     * Elimina un archivo
     */
    eliminarArchivo(fileId: string): Promise<boolean>;
    /**
     * Obtiene URL de un archivo
     */
    obtenerUrl(fileId: string): Promise<string>;
    /**
     * Optimiza una imagen
     */
    optimizarImagen(fileId: string, options: {
        width?: number;
        height?: number;
        quality?: number;
    }): Promise<MediaFile>;
}
/**
 * Valida y procesa portada de curso
 */
export declare function procesarPortadaCurso(mediaService: MediaService, file: File | Buffer): Promise<UploadResult>;
/**
 * Valida y procesa video de tema
 */
export declare function procesarVideoTema(mediaService: MediaService, file: File | Buffer): Promise<UploadResult>;
/**
 * Valida y procesa documento adjunto
 */
export declare function procesarDocumento(mediaService: MediaService, file: File | Buffer): Promise<UploadResult>;
/**
 * Valida y procesa imagen de pregunta de quiz
 */
export declare function procesarImagenPregunta(mediaService: MediaService, file: File | Buffer): Promise<UploadResult>;
/**
 * Procesa certificado PDF para almacenamiento
 */
export declare function procesarCertificadoPDF(mediaService: MediaService, pdfBuffer: Buffer, nombreArchivo: string): Promise<UploadResult>;
//# sourceMappingURL=media.service.d.ts.map