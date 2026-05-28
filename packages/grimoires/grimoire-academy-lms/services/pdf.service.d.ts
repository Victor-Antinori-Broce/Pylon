/**
 * Academy LMS - PDF Service
 *
 * Servicio para generación de certificados en PDF.
 * Soporta dos modos:
 *   1. GENERADO: Crea certificado profesional desde cero con PDFKit
 *   2. TEMPLATE: Hace overlay sobre un PDF base existente (como la app Django)
 *
 * Dependencias opcionales (lazy-loaded):
 *   - pdfkit: ^0.14.0    (modo generado)
 *   - pdf-lib: ^1.17.1   (modo template/overlay)
 */
import { Buffer } from "buffer";
export interface CertificadoData {
    nombreUsuario: string;
    nombreCurso: string;
    fechaCompletado: Date;
    duracionHoras: string | number;
    codigo: string;
}
export interface PlantillaCertificado {
    tipo: "template" | "generado";
    /** Ruta local o URL pública al PDF base (requiere pdf-lib) */
    backgroundPdf?: string;
    /** Imagen de fondo (requiere pdfkit + que la imagen sea accesible) */
    backgroundImage?: string;
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
    firmaUrl?: string;
    textoPrincipal?: string;
    textoSecundario?: string;
}
/** Configuración de posiciones para overlay en modo template */
export interface OverlayConfig {
    nombreUsuario: {
        x: number;
        y: number;
        fontSize?: number;
        color?: string;
    };
    nombreCurso: {
        x: number;
        y: number;
        fontSize?: number;
        color?: string;
    };
    fecha: {
        x: number;
        y: number;
        fontSize?: number;
        color?: string;
    };
    duracion?: {
        x: number;
        y: number;
        fontSize?: number;
        color?: string;
    };
    codigo?: {
        x: number;
        y: number;
        fontSize?: number;
        color?: string;
    };
}
/**
 * Genera un certificado haciendo overlay sobre un PDF plantilla existente.
 * Equivalente a la lógica de Django: plantilla.pdf + canvas overlay.
 *
 * @param data - Datos del certificado
 * @param templatePath - Ruta/URL al PDF base
 * @param overlay - Posiciones de cada campo en el PDF
 * @returns Buffer del PDF resultante
 */
export declare function generarCertificadoOverlay(data: CertificadoData, templatePath: string, overlay: OverlayConfig): Promise<Buffer>;
/**
 * Genera un certificado con plantilla PDF base usando coordenadas por defecto
 * similares a la app Django original.
 *
 * Coordenadas por defecto (página landscape letter: 792x612 pts):
 *   - Nombre: centrado en Y=282
 *   - Curso:  Y=224
 *   - Fecha:  Y=60
 */
export declare function generarCertificadoConPlantilla(data: CertificadoData, templatePath: string): Promise<Buffer>;
/**
 * Genera un certificado en PDF desde cero con diseño profesional.
 * Usa PDFKit. No requiere plantilla base.
 */
export declare function generarCertificadoPDF(data: CertificadoData, plantilla?: PlantillaCertificado): Promise<Buffer>;
/**
 * Genera una vista previa del certificado (versión simplificada)
 */
export declare function generarVistaPreviaCertificado(data: CertificadoData): Promise<Buffer>;
/**
 * Valida un código de certificado
 */
export declare function validarCodigoCertificado(codigo: string): boolean;
/**
 * Extrae información del código de certificado
 */
export declare function extraerInfoCodigo(codigo: string): {
    cursoId: string;
    userId: string;
    timestamp: number;
} | null;
//# sourceMappingURL=pdf.service.d.ts.map