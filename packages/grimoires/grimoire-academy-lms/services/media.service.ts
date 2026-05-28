// @ts-nocheck
/**
 * Academy LMS - Media Service
 * 
 * Servicio para integración con Media Library de Gremius.
 * Maneja subida, procesamiento y gestión de archivos multimedia.
 */

import { z } from "zod";

// ============================================
// TIPOS Y ENUMS
// ============================================

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
  duration?: number; // Para videos
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface UploadResult {
  success: boolean;
  file?: MediaFile;
  error?: string;
}

export interface MediaValidation {
  maxSize?: number; // en bytes
  allowedTypes?: string[]; // mime types
  maxWidth?: number; // para imágenes
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

export type MediaType = "image" | "video" | "document" | "audio" | "any";

// ============================================
// SCHEMAS DE VALIDACIÓN
// ============================================

export const mediaFileSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().positive(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  duration: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export const uploadOptionsSchema = z.object({
  tipo: z.enum(["image", "video", "document", "audio", "any"]).default("any"),
  maxSize: z.number().positive().default(10 * 1024 * 1024), // 10MB default
  allowedTypes: z.array(z.string()).optional(),
  generarThumbnail: z.boolean().default(true),
  optimizarImagen: z.boolean().default(true),
  carpeta: z.string().default("academy"),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================
// CONFIGURACIONES POR TIPO
// ============================================

export const validacionesPorTipo: Record<MediaType, MediaValidation> = {
  image: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ],
    maxWidth: 4096,
    maxHeight: 4096,
  },
  video: {
    maxSize: 500 * 1024 * 1024, // 500MB
    allowedTypes: [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
    ],
  },
  document: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ],
  },
  audio: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"],
  },
  any: {
    maxSize: 100 * 1024 * 1024, // 100MB
  },
};

// ============================================
// FUNCIONES DE VALIDACIÓN
// ============================================

/**
 * Valida un archivo según el tipo
 */
export function validarArchivo(
  file: File | { size: number; type: string; name: string },
  tipo: MediaType = "any"
): { valido: true } | { valido: false; errores: string[] } {
  const validacion = validacionesPorTipo[tipo];
  const errores: string[] = [];

  // Validar tamaño
  if (validacion.maxSize && file.size > validacion.maxSize) {
    errores.push(
      `Tamaño máximo permitido: ${formatBytes(validacion.maxSize)}`
    );
  }

  // Validar tipo MIME
  if (validacion.allowedTypes && !validacion.allowedTypes.includes(file.type)) {
    errores.push(
      `Tipo de archivo no permitido. Permitidos: ${validacion.allowedTypes.join(", ")}`
    );
  }

  return errores.length === 0 ? { valido: true } : { valido: false, errores };
}

/**
 * Determina el tipo de media según el MIME type
 */
export function determinarTipoMedia(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Formatea bytes a formato legible
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// ============================================
// FUNCIONES DE PROCESAMIENTO
// ============================================

/**
 * Extrae información de un archivo de video de YouTube
 */
export function extraerInfoYoutube(url: string): {
  valido: boolean;
  videoId?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
} {
  // Patrones de URL de YouTube
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        valido: true,
        videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      };
    }
  }

  return { valido: false };
}

/**
 * Normaliza una URL de video (YouTube, Vimeo, etc.)
 */
export function normalizarVideoUrl(url: string): {
  tipo: "youtube" | "vimeo" | "directo" | "embed";
  url: string;
  thumbnailUrl?: string;
} {
  // YouTube
  const youtubeInfo = extraerInfoYoutube(url);
  if (youtubeInfo.valido) {
    return {
      tipo: "youtube",
      url: youtubeInfo.embedUrl!,
      thumbnailUrl: youtubeInfo.thumbnailUrl,
    };
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    return {
      tipo: "vimeo",
      url: `https://player.vimeo.com/video/${videoId}`,
      thumbnailUrl: `https://vumbnail.com/${videoId}.jpg`,
    };
  }

  // URL directa o embed
  if (url.includes("<iframe") || url.includes("</iframe>")) {
    return { tipo: "embed", url };
  }

  return { tipo: "directo", url };
}

// ============================================
// INTEGRACIÓN CON GRIMOIRE MEDIA
// ============================================

export interface MediaLibraryClient {
  upload: (
    file: File | Buffer,
    options: {
      folder?: string;
      filename?: string;
      metadata?: Record<string, unknown>;
    }
  ) => Promise<MediaFile>;
  delete: (fileId: string) => Promise<boolean>;
  getUrl: (fileId: string) => Promise<string>;
  optimizeImage: (
    fileId: string,
    options: { width?: number; height?: number; quality?: number }
  ) => Promise<MediaFile>;
}

// ============================================
// GENERACIÓN DE URLS DE MEDIA (GRIMOIRE-MEDIA)
// ============================================

/**
 * Genera URL para obtener imagen con preset de transformación
 * Usa los endpoints de grimoire-media
 */
export function getMediaPresetUrl(mediaId: string, preset: "thumbnail" | "medium" | "large" | "original" = "original"): string {
  return `/api/media/preset/${mediaId}/${preset}`;
}

/**
 * Genera URL para portada de curso (usa preset large)
 * @param mediaId - ID del media en grimoire-media
 */
export function getCursoCoverUrl(mediaId: string | null | undefined): string | null {
  if (!mediaId) return null;
  return getMediaPresetUrl(mediaId, "large");
}

/**
 * Genera URL para thumbnail de quiz (usa preset thumbnail)
 * @param mediaId - ID del media en grimoire-media
 */
export function getQuizThumbnailUrl(mediaId: string | null | undefined): string | null {
  if (!mediaId) return null;
  return getMediaPresetUrl(mediaId, "thumbnail");
}

/**
 * Genera URL para imagen de learning path (usa preset large)
 * @param mediaId - ID del media en grimoire-media
 */
export function getLearningPathImageUrl(mediaId: string | null | undefined): string | null {
  if (!mediaId) return null;
  return getMediaPresetUrl(mediaId, "large");
}

/**
 * Genera URL para imagen de tema (usa preset medium)
 * @param mediaId - ID del media en grimoire-media
 */
export function getTemaImageUrl(mediaId: string | null | undefined): string | null {
  if (!mediaId) return null;
  return getMediaPresetUrl(mediaId, "medium");
}

/**
 * Genera URL para archivo de pregunta (usa preset original)
 * @param mediaId - ID del media en grimoire-media
 */
export function getPreguntaArchivoUrl(mediaId: string | null | undefined): string | null {
  if (!mediaId) return null;
  return getMediaPresetUrl(mediaId, "original");
}

/**
 * Genera URL para documento (usa preset original)
 * @param mediaId - ID del media en grimoire-media
 */
export function getDocumentoUrl(mediaId: string | null | undefined): string | null {
  if (!mediaId) return null;
  return getMediaPresetUrl(mediaId, "original");
}

/**
 * Servicio de media que integra con Media Library de Gremius
 */
export class MediaService {
  private client: MediaLibraryClient;

  constructor(client: MediaLibraryClient) {
    this.client = client;
  }

  /**
   * Sube un archivo al Media Library
   */
  async subirArchivo(
    file: File | Buffer,
    options: z.infer<typeof uploadOptionsSchema>
  ): Promise<UploadResult> {
    try {
      const opts = uploadOptionsSchema.parse(options);

      // Validar archivo
      const fileInfo =
        file instanceof File
          ? { size: file.size, type: file.type, name: file.name }
          : { size: (file as Buffer).length, type: "application/octet-stream", name: "file" };

      const validacion = validarArchivo(fileInfo, opts.tipo);
      if (!validacion.valido) {
        return {
          success: false,
          error: validacion.errores.join(", "),
        };
      }

      // Subir archivo
      const mediaFile = await this.client.upload(file, {
        folder: opts.carpeta,
        metadata: {
          ...opts.metadata,
          uploadedBy: "academy-lms",
          tipo: opts.tipo,
        },
      });

      return {
        success: true,
        file: mediaFile,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error al subir archivo",
      };
    }
  }

  /**
   * Sube múltiples archivos
   */
  async subirArchivos(
    files: (File | Buffer)[],
    options: z.infer<typeof uploadOptionsSchema>
  ): Promise<{ exitosos: MediaFile[]; fallidos: Array<{ index: number; error: string }> }> {
    const exitosos: MediaFile[] = [];
    const fallidos: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const result = await this.subirArchivo(files[i], options);
      if (result.success && result.file) {
        exitosos.push(result.file);
      } else {
        fallidos.push({ index: i, error: result.error || "Error desconocido" });
      }
    }

    return { exitosos, fallidos };
  }

  /**
   * Elimina un archivo
   */
  async eliminarArchivo(fileId: string): Promise<boolean> {
    return this.client.delete(fileId);
  }

  /**
   * Obtiene URL de un archivo
   */
  async obtenerUrl(fileId: string): Promise<string> {
    return this.client.getUrl(fileId);
  }

  /**
   * Optimiza una imagen
   */
  async optimizarImagen(
    fileId: string,
    options: { width?: number; height?: number; quality?: number }
  ): Promise<MediaFile> {
    return this.client.optimizeImage(fileId, options);
  }
}

// ============================================
// UTILIDADES ESPECÍFICAS DE ACADEMY LMS
// ============================================

/**
 * Valida y procesa portada de curso
 */
export async function procesarPortadaCurso(
  mediaService: MediaService,
  file: File | Buffer
): Promise<UploadResult> {
  return mediaService.subirArchivo(file, {
    tipo: "image",
    maxSize: 5 * 1024 * 1024, // 5MB
    carpeta: "academy/cursos/portadas",
    optimizarImagen: true,
    generarThumbnail: true,
    metadata: { tipoContenido: "portada-curso" },
  });
}

/**
 * Valida y procesa video de tema
 */
export async function procesarVideoTema(
  mediaService: MediaService,
  file: File | Buffer
): Promise<UploadResult> {
  return mediaService.subirArchivo(file, {
    tipo: "video",
    maxSize: 500 * 1024 * 1024, // 500MB
    carpeta: "academy/temas/videos",
    metadata: { tipoContenido: "video-tema" },
  });
}

/**
 * Valida y procesa documento adjunto
 */
export async function procesarDocumento(
  mediaService: MediaService,
  file: File | Buffer
): Promise<UploadResult> {
  return mediaService.subirArchivo(file, {
    tipo: "document",
    maxSize: 50 * 1024 * 1024, // 50MB
    carpeta: "academy/documentos",
    metadata: { tipoContenido: "documento-adicional" },
  });
}

/**
 * Valida y procesa imagen de pregunta de quiz
 */
export async function procesarImagenPregunta(
  mediaService: MediaService,
  file: File | Buffer
): Promise<UploadResult> {
  return mediaService.subirArchivo(file, {
    tipo: "image",
    maxSize: 5 * 1024 * 1024, // 5MB
    carpeta: "academy/quizzes/imagenes",
    optimizarImagen: true,
    metadata: { tipoContenido: "imagen-pregunta" },
  });
}

/**
 * Procesa certificado PDF para almacenamiento
 */
export async function procesarCertificadoPDF(
  mediaService: MediaService,
  pdfBuffer: Buffer,
  nombreArchivo: string
): Promise<UploadResult> {
  return mediaService.subirArchivo(pdfBuffer, {
    tipo: "document",
    maxSize: 10 * 1024 * 1024, // 10MB
    carpeta: "academy/certificados",
    metadata: { tipoContenido: "certificado-pdf" },
  });
}
