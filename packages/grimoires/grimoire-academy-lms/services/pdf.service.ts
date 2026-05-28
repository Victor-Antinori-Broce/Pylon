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
import type PDFDocumentType from "pdfkit";

// ═══════════════════════════════════════════════════════════════════════════
// LAZY LOADING DE DEPENDENCIAS OPCIONALES
// ═══════════════════════════════════════════════════════════════════════════

let PDFKitModule: any = null;
let PDFLibModule: any = null;

async function getPDFDocument(): Promise<any> {
  if (!PDFKitModule) {
    const mod = await import("pdfkit");
    PDFKitModule = mod.default || mod;
  }
  return PDFKitModule;
}

async function getPDFLib(): Promise<any> {
  if (!PDFLibModule) {
    const mod = await import("pdf-lib");
    PDFLibModule = mod.default || mod;
  }
  return PDFLibModule;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

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
  nombreUsuario: { x: number; y: number; fontSize?: number; color?: string };
  nombreCurso: { x: number; y: number; fontSize?: number; color?: string };
  fecha: { x: number; y: number; fontSize?: number; color?: string };
  duracion?: { x: number; y: number; fontSize?: number; color?: string };
  codigo?: { x: number; y: number; fontSize?: number; color?: string };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODO TEMPLATE — Overlay sobre PDF base (igual que app Django)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera un certificado haciendo overlay sobre un PDF plantilla existente.
 * Equivalente a la lógica de Django: plantilla.pdf + canvas overlay.
 *
 * @param data - Datos del certificado
 * @param templatePath - Ruta/URL al PDF base
 * @param overlay - Posiciones de cada campo en el PDF
 * @returns Buffer del PDF resultante
 */
export async function generarCertificadoOverlay(
  data: CertificadoData,
  templatePath: string,
  overlay: OverlayConfig
): Promise<Buffer> {
  const { PDFDocument, rgb, StandardFonts } = await getPDFLib();

  // Cargar PDF base
  let templateBytes: Uint8Array;

  if (templatePath.startsWith("http://") || templatePath.startsWith("https://")) {
    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`);
    }
    templateBytes = new Uint8Array(await response.arrayBuffer());
  } else {
    // Ruta local — leer con Bun/Node
    const file = await import("node:fs/promises");
    templateBytes = await file.readFile(templatePath);
  }

  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    throw new Error("Template PDF has no pages");
  }

  const page = pages[0];
  const { width, height } = page.getSize();

  // Font estándar
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Helper para dibujar texto centrado o en coordenadas
  function drawText(
    text: string,
    cfg: { x: number; y: number; fontSize?: number; color?: string; font?: typeof font },
    options?: { align?: "left" | "center" | "right"; maxWidth?: number }
  ) {
    const size = cfg.fontSize ?? 16;
    const f = cfg.font ?? font;
    const align = options?.align ?? "left";
    const maxW = options?.maxWidth ?? width - 100;

    // Calcular tamaño de fuente dinámico si el texto es muy largo
    let currentSize = size;
    let textWidth = f.widthOfTextAtSize(text, currentSize);

    while (textWidth > maxW && currentSize > 10) {
      currentSize -= 1;
      textWidth = f.widthOfTextAtSize(text, currentSize);
    }

    let x = cfg.x;
    if (align === "center") {
      x = cfg.x - textWidth / 2;
    } else if (align === "right") {
      x = cfg.x - textWidth;
    }

    // Parsear color hex a rgb
    const color = cfg.color ? hexToRgb(cfg.color) : { r: 0, g: 0, b: 0 };

    page.drawText(text, {
      x,
      y: cfg.y,
      size: currentSize,
      font: f,
      color: rgb(color.r, color.g, color.b),
    });

    return { width: textWidth, size: currentSize };
  }

  // Nombre del estudiante (con auto-ajuste)
  if (overlay.nombreUsuario) {
    const nombre = data.nombreUsuario || "Estudiante";
    drawText(nombre, {
      ...overlay.nombreUsuario,
      font: fontBold,
    }, { align: "center", maxWidth: width - 80 });
  }

  // Nombre del curso
  if (overlay.nombreCurso) {
    drawText(data.nombreCurso || "", {
      ...overlay.nombreCurso,
      font: fontBold,
    }, { align: "center", maxWidth: width - 80 });
  }

  // Fecha
  if (overlay.fecha) {
    const fechaStr = new Date(data.fechaCompletado).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    drawText(fechaStr, overlay.fecha, { align: "center" });
  }

  // Duración
  if (overlay.duracion && data.duracionHoras) {
    drawText(`${data.duracionHoras} horas`, overlay.duracion, { align: "center" });
  }

  // Código de verificación
  if (overlay.codigo) {
    drawText(`Código: ${data.codigo}`, overlay.codigo, { align: "center" });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Genera un certificado con plantilla PDF base usando coordenadas por defecto
 * similares a la app Django original.
 *
 * Coordenadas por defecto (página landscape letter: 792x612 pts):
 *   - Nombre: centrado en Y=282
 *   - Curso:  Y=224
 *   - Fecha:  Y=60
 */
export async function generarCertificadoConPlantilla(
  data: CertificadoData,
  templatePath: string
): Promise<Buffer> {
  const defaultOverlay: OverlayConfig = {
    nombreUsuario: { x: 396, y: 282, fontSize: 36, color: "#1a1a2e" },
    nombreCurso: { x: 186, y: 224, fontSize: 16, color: "#333333" },
    fecha: { x: 100, y: 60, fontSize: 14, color: "#333333" },
    duracion: { x: 396, y: 420, fontSize: 12, color: "#666666" },
    codigo: { x: 396, y: 490, fontSize: 10, color: "#999999" },
  };

  return generarCertificadoOverlay(data, templatePath, defaultOverlay);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODO GENERADO — Desde cero con PDFKit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera un certificado en PDF desde cero con diseño profesional.
 * Usa PDFKit. No requiere plantilla base.
 */
export async function generarCertificadoPDF(
  data: CertificadoData,
  plantilla?: PlantillaCertificado
): Promise<Buffer> {
  // Si se especifica backgroundPdf, usar modo template
  if (plantilla?.backgroundPdf) {
    return generarCertificadoConPlantilla(data, plantilla.backgroundPdf);
  }

  const PDFDocument = await getPDFDocument();

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 50,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const primaryColor = plantilla?.primaryColor || "#009c3c";
      const secondaryColor = plantilla?.secondaryColor || "#1a1a2e";

      // Fondo
      if (plantilla?.backgroundImage) {
        try {
          doc.image(plantilla.backgroundImage, 0, 0, {
            width: doc.page.width,
            height: doc.page.height,
          });
        } catch {
          drawDefaultBackground(doc, primaryColor);
        }
      } else {
        drawDefaultBackground(doc, primaryColor);
      }

      const centerX = doc.page.width / 2;

      // Título
      doc
        .fontSize(42)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text("CERTIFICADO", centerX, 80, { align: "center" });

      doc
        .fontSize(16)
        .font("Helvetica")
        .fillColor("#666")
        .text("DE FINALIZACIÓN", centerX, 130, { align: "center" });

      // Línea decorativa
      doc
        .moveTo(centerX - 100, 170)
        .lineTo(centerX + 100, 170)
        .lineWidth(2)
        .strokeColor(primaryColor)
        .stroke();

      // Texto principal
      doc
        .fontSize(14)
        .font("Helvetica")
        .fillColor("#333")
        .text(
          plantilla?.textoPrincipal || "Se certifica que",
          centerX,
          200,
          { align: "center" }
        );

      // Nombre del estudiante (auto-ajuste de tamaño)
      const nombreSize = Math.min(
        36,
        Math.max(24, 600 / Math.max(data.nombreUsuario.length, 1))
      );
      doc
        .fontSize(nombreSize)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text(data.nombreUsuario, centerX, 240, { align: "center" });

      // Texto secundario
      doc
        .fontSize(14)
        .font("Helvetica")
        .fillColor("#333")
        .text(
          plantilla?.textoSecundario || "ha completado satisfactoriamente el curso:",
          centerX,
          310,
          { align: "center" }
        );

      // Nombre del curso
      doc
        .fontSize(28)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text(data.nombreCurso, centerX, 350, { align: "center" });

      // Detalles
      doc
        .fontSize(12)
        .font("Helvetica")
        .fillColor("#666")
        .text(
          `Duración: ${data.duracionHoras} horas`,
          centerX,
          420,
          { align: "center" }
        );

      doc
        .fontSize(12)
        .fillColor("#666")
        .text(
          `Fecha de finalización: ${new Date(data.fechaCompletado).toLocaleDateString("es-ES", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`,
          centerX,
          445,
          { align: "center" }
        );

      // Código de verificación
      doc
        .fontSize(10)
        .font("Helvetica-Oblique")
        .fillColor("#999")
        .text(`Código de verificación: ${data.codigo}`, centerX, 490, {
          align: "center",
        });

      // Línea inferior
      doc
        .moveTo(centerX - 150, 530)
        .lineTo(centerX + 150, 530)
        .lineWidth(1)
        .strokeColor("#ccc")
        .stroke();

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#999")
        .text("Documento generado electrónicamente", centerX, 540, {
          align: "center",
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Dibuja un fondo por defecto para el certificado
 */
function drawDefaultBackground(doc: PDFDocumentType, color: string): void {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff");

  doc
    .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
    .lineWidth(3)
    .strokeColor(color)
    .stroke();

  doc
    .rect(30, 30, doc.page.width - 60, doc.page.height - 60)
    .lineWidth(1)
    .strokeColor(color)
    .stroke();

  const cornerSize = 40;
  const corners = [
    { x: 30, y: 30 },
    { x: doc.page.width - 30 - cornerSize, y: 30 },
    { x: 30, y: doc.page.height - 30 - cornerSize },
    { x: doc.page.width - 30 - cornerSize, y: doc.page.height - 30 - cornerSize },
  ];

  corners.forEach((corner) => {
    doc.rect(corner.x, corner.y, cornerSize, cornerSize).fillColor(color).fill();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// VISTA PREVIA Y UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera una vista previa del certificado (versión simplificada)
 */
export async function generarVistaPreviaCertificado(
  data: CertificadoData
): Promise<Buffer> {
  return generarCertificadoPDF(data, {
    tipo: "generado",
    primaryColor: "#009c3c",
    secondaryColor: "#1a1a2e",
    textoPrincipal: "Vista previa - Se certifica que",
  });
}

/**
 * Valida un código de certificado
 */
export function validarCodigoCertificado(codigo: string): boolean {
  const regex = /^CERT-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]+$/;
  return regex.test(codigo);
}

/**
 * Extrae información del código de certificado
 */
export function extraerInfoCodigo(codigo: string): {
  cursoId: string;
  userId: string;
  timestamp: number;
} | null {
  if (!validarCodigoCertificado(codigo)) return null;

  const parts = codigo.split("-");
  if (parts.length < 4) return null;

  return {
    cursoId: parts[1],
    userId: parts[2],
    timestamp: parseInt(parts[3], 36),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return { r, g, b };
}
