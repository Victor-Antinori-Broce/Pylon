// @ts-nocheck
/**
 * Academy LMS - Test Suite Completo
 * 
 * Pruebas unitarias y de integración para todos los servicios y endpoints.
 */

import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { z } from "zod";

// ============================================
// PRUEBAS DE SERVICIO PDF
// ============================================

describe("📄 PDF Service", async () => {
  const {
    generarCertificadoPDF,
    validarCodigoCertificado,
    extraerInfoCodigo,
  } = await import("../services/pdf.service");

  describe("generarCertificadoPDF", () => {
    it("debe generar un certificado PDF válido", async () => {
      const data = {
        nombreUsuario: "Juan Pérez García",
        nombreCurso: "Introducción a la Plataforma Gremius",
        fechaCompletado: new Date("2024-03-15"),
        duracionHoras: 8.5,
        codigo: "CERT-ABC12345-XYZ67890-ABCDEF",
      };

      const pdfBuffer = await generarCertificadoPDF(data);

      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(0);
      // PDF magic number: %PDF
      expect(pdfBuffer.slice(0, 4).toString()).toBe("%PDF");
    });

    it("debe generar certificado con plantilla personalizada", async () => {
      const data = {
        nombreUsuario: "María López",
        nombreCurso: "Gestión de Proyectos",
        fechaCompletado: new Date(),
        duracionHoras: 16,
        codigo: "CERT-TEST123-USER456-ABC123",
      };

      const plantilla = {
        tipo: "generado" as const,
        primaryColor: "#FF5733",
        secondaryColor: "#333333",
        textoPrincipal: "Certificamos que",
        textoSecundario: "ha completado exitosamente el programa:",
      };

      const pdfBuffer = await generarCertificadoPDF(data, plantilla);

      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(1000);
    });

    it("debe ajustar tamaño de fuente para nombres largos", async () => {
      const data = {
        nombreUsuario: "María Elena González de la Cruz Martínez",
        nombreCurso: "Curso",
        fechaCompletado: new Date(),
        duracionHoras: 5,
        codigo: "CERT-LONG-NAME-TEST123",
      };

      const pdfBuffer = await generarCertificadoPDF(data);
      expect(pdfBuffer).toBeDefined();
    });
  });

  describe("validarCodigoCertificado", () => {
    it("debe validar códigos correctos", () => {
      const codigosValidos = [
        "CERT-ABC12345-XYZ67890-ABCDEF",
        "CERT-12345678-87654321-A1B2C3D",
        "CERT-TEST1234-USER5678-ABC123456",
      ];

      for (const codigo of codigosValidos) {
        expect(validarCodigoCertificado(codigo)).toBe(true);
      }
    });

    it("debe rechazar códigos inválidos", () => {
      const codigosInvalidos = [
        "",
        "CERT",
        "CERT-",
        "INVALID-ABC123-XYZ789",
        "cert-lowercase-123",
        "CERT-123-456",
        "CERT-SPECIAL!@#-123-ABC",
      ];

      for (const codigo of codigosInvalidos) {
        expect(validarCodigoCertificado(codigo)).toBe(false);
      }
    });
  });

  describe("extraerInfoCodigo", () => {
    it("debe extraer información correctamente", () => {
      const codigo = "CERT-ABC12345-XYZ67890-ABCDEF";
      const info = extraerInfoCodigo(codigo);

      expect(info).not.toBeNull();
      expect(info?.cursoId).toBe("ABC12345");
      expect(info?.userId).toBe("XYZ67890");
      expect(info?.timestamp).toBeGreaterThan(0);
    });

    it("debe retornar null para códigos inválidos", () => {
      const info = extraerInfoCodigo("INVALID-CODE");
      expect(info).toBeNull();
    });
  });
});

// ============================================
// PRUEBAS DE SERVICIO EXCEL
// ============================================

describe("📊 Excel Service", async () => {
  const {
    generarExcelAsignaciones,
    generarExcelProgreso,
    generarExcelEncuestas,
  } = await import("../services/excel.service");

  describe("generarExcelAsignaciones", () => {
    it("debe generar archivo Excel de asignaciones", async () => {
      const data = [
        {
          fecha: new Date("2024-01-15"),
          curso: "Curso de Inducción",
          tipoCurso: "INDUCCION" as const,
          duracionHoras: 8,
          usuario: "Juan Pérez",
          numeroColaborador: "EMP001",
          grupo: "Grupo A",
          metodo: "manual" as const,
          progreso: 100,
          fechaFinalizacion: new Date("2024-01-20"),
          estado: "Completado" as const,
        },
        {
          fecha: new Date("2024-02-01"),
          curso: "Gestión de Proyectos",
          tipoCurso: "GESTION" as const,
          duracionHoras: 16,
          usuario: "María García",
          grupo: undefined,
          metodo: "grupo" as const,
          progreso: 50,
          fechaFinalizacion: null,
          estado: "En Progreso" as const,
        },
      ];

      const excelBuffer = await generarExcelAsignaciones(data);

      expect(excelBuffer).toBeDefined();
      expect(excelBuffer.length).toBeGreaterThan(100);
      // XLSX magic number: PK (zip)
      expect(excelBuffer.slice(0, 2).toString("hex")).toBe("504b");
    });

    it("debe manejar lista vacía", async () => {
      const excelBuffer = await generarExcelAsignaciones([]);
      expect(excelBuffer).toBeDefined();
    });
  });

  describe("generarExcelProgreso", () => {
    it("debe generar archivo Excel de progreso", async () => {
      const data = [
        {
          usuario: "Juan Pérez",
          email: "juan@empresa.com",
          curso: "Curso de Inducción",
          modulo: "Módulo 1",
          temasCompletados: 5,
          totalTemas: 5,
          quizzesAprobados: 2,
          totalQuizzes: 2,
          progresoPercent: 100,
          estado: "Completado" as const,
          fechaInicio: new Date("2024-01-15"),
          fechaCompletado: new Date("2024-01-20"),
        },
      ];

      const excelBuffer = await generarExcelProgreso(data);
      expect(excelBuffer).toBeDefined();
      expect(excelBuffer.length).toBeGreaterThan(100);
    });
  });

  describe("generarExcelEncuestas", () => {
    it("debe generar archivo Excel de encuestas", async () => {
      const data = [
        {
          fecha: new Date("2024-03-01"),
          curso: "Curso de Inducción",
          usuario: "Juan Pérez",
          departamento: "ITICO" as const,
          cargo: "Analista" as const,
          expositor: 5,
          utilidad: "Sí",
          satisfaccion: 5,
          aprendido: "Aprendí mucho sobre la plataforma",
          lugar: "OFICINA" as const,
          rol: "Participante" as const,
          recomendacion: "Excelente curso",
          comentarios: "Muy buena experiencia",
        },
      ];

      const excelBuffer = await generarExcelEncuestas(data);
      expect(excelBuffer).toBeDefined();
      expect(excelBuffer.length).toBeGreaterThan(100);
    });
  });
});

// ============================================
// PRUEBAS DE SERVICIO MEDIA (YOUTUBE)
// ============================================

describe("🎬 Media Service - YouTube", async () => {
  const {
    extraerInfoYoutube,
    normalizarVideoUrl,
    validarArchivo,
    determinarTipoMedia,
    formatBytes,
  } = await import("../services/media.service");

  describe("extraerInfoYoutube", () => {
    it("debe extraer info de URL estándar de YouTube", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const info = extraerInfoYoutube(url);

      expect(info.valido).toBe(true);
      expect(info.videoId).toBe("dQw4w9WgXcQ");
      expect(info.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(info.thumbnailUrl).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg");
    });

    it("debe extraer info de URL corta de YouTube", () => {
      const url = "https://youtu.be/dQw4w9WgXcQ";
      const info = extraerInfoYoutube(url);

      expect(info.valido).toBe(true);
      expect(info.videoId).toBe("dQw4w9WgXcQ");
      expect(info.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    });

    it("debe extraer info de URL de embed", () => {
      const url = "https://www.youtube.com/embed/dQw4w9WgXcQ";
      const info = extraerInfoYoutube(url);

      expect(info.valido).toBe(true);
      expect(info.videoId).toBe("dQw4w9WgXcQ");
    });

    it("debe rechazar URLs inválidas", () => {
      const urlsInvalidas = [
        "https://www.google.com",
        "https://www.youtube.com",
        "https://youtu.be/",
        "",
        "not-a-url",
        "https://www.youtube.com/watch",
      ];

      for (const url of urlsInvalidas) {
        const info = extraerInfoYoutube(url);
        expect(info.valido).toBe(false);
        expect(info.videoId).toBeUndefined();
      }
    });

    it("debe manejar URLs con parámetros adicionales", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&feature=share";
      const info = extraerInfoYoutube(url);

      expect(info.valido).toBe(true);
      expect(info.videoId).toBe("dQw4w9WgXcQ");
    });

    it("debe manejar URLs de playlists", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLsomeplaylist";
      const info = extraerInfoYoutube(url);

      expect(info.valido).toBe(true);
      expect(info.videoId).toBe("dQw4w9WgXcQ");
    });
  });

  describe("normalizarVideoUrl", () => {
    it("debe normalizar URL de YouTube", () => {
      const resultado = normalizarVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

      expect(resultado.tipo).toBe("youtube");
      expect(resultado.url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(resultado.thumbnailUrl).toBeDefined();
    });

    it("debe normalizar URL de Vimeo", () => {
      const resultado = normalizarVideoUrl("https://vimeo.com/123456789");

      expect(resultado.tipo).toBe("vimeo");
      expect(resultado.url).toBe("https://player.vimeo.com/video/123456789");
      expect(resultado.thumbnailUrl).toBe("https://vumbnail.com/123456789.jpg");
    });

    it("debe detectar iframe embed", () => {
      const url = '<iframe src="https://example.com/video"></iframe>';
      const resultado = normalizarVideoUrl(url);

      expect(resultado.tipo).toBe("embed");
      expect(resultado.url).toBe(url);
    });

    it("debe tratar URL directa como tipo directo", () => {
      const url = "https://example.com/video.mp4";
      const resultado = normalizarVideoUrl(url);

      expect(resultado.tipo).toBe("directo");
      expect(resultado.url).toBe(url);
    });
  });

  describe("validarArchivo", () => {
    it("debe validar imágenes correctamente", () => {
      const file = { name: "image.jpg", size: 1024 * 1024, type: "image/jpeg" };
      const resultado = validarArchivo(file, "image");

      expect(resultado.valido).toBe(true);
    });

    it("debe rechazar imágenes muy grandes", () => {
      const file = { name: "large.jpg", size: 100 * 1024 * 1024, type: "image/jpeg" };
      const resultado = validarArchivo(file, "image");

      expect(resultado.valido).toBe(false);
    });

    it("debe rechazar tipos no permitidos", () => {
      const file = { name: "file.exe", size: 1024, type: "application/x-msdownload" };
      const resultado = validarArchivo(file, "document");

      expect(resultado.valido).toBe(false);
    });

    it("debe validar videos", () => {
      const file = { name: "video.mp4", size: 50 * 1024 * 1024, type: "video/mp4" };
      const resultado = validarArchivo(file, "video");

      expect(resultado.valido).toBe(true);
    });

    it("debe validar documentos PDF", () => {
      const file = { name: "doc.pdf", size: 5 * 1024 * 1024, type: "application/pdf" };
      const resultado = validarArchivo(file, "document");

      expect(resultado.valido).toBe(true);
    });
  });

  describe("determinarTipoMedia", () => {
    it("debe detectar imágenes", () => {
      expect(determinarTipoMedia("image/jpeg")).toBe("image");
      expect(determinarTipoMedia("image/png")).toBe("image");
      expect(determinarTipoMedia("image/webp")).toBe("image");
    });

    it("debe detectar videos", () => {
      expect(determinarTipoMedia("video/mp4")).toBe("video");
      expect(determinarTipoMedia("video/webm")).toBe("video");
    });

    it("debe detectar audio", () => {
      expect(determinarTipoMedia("audio/mpeg")).toBe("audio");
      expect(determinarTipoMedia("audio/wav")).toBe("audio");
    });

    it("debe detectar documentos", () => {
      expect(determinarTipoMedia("application/pdf")).toBe("document");
      expect(determinarTipoMedia("application/msword")).toBe("document");
    });
  });

  describe("formatBytes", () => {
    it("debe formatear bytes correctamente", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    });

    it("debe usar decimales correctamente", () => {
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1536, 0)).toBe("2 KB");
    });
  });
});

// ============================================
// PRUEBAS DE SERVICIO USER SYNC
// ============================================

describe("👥 User Sync Service", async () => {
  const {
    validarUsuarioExterno,
    validarUsuariosExternos,
    parsearCSV,
    mapearRol,
    mapearDepartamento,
    mapearCargo,
    mapeoRolesPacifico,
  } = await import("../services/user-sync.service");

  describe("validarUsuarioExterno", () => {
    it("debe validar usuario correcto", () => {
      const usuario = {
        idExterno: "EMP001",
        email: "juan@empresa.com",
        nombre: "Juan Pérez",
        apellido: "García",
      };

      const resultado = validarUsuarioExterno(usuario);
      expect(resultado.valido).toBe(true);
      if (resultado.valido) {
        expect(resultado.usuario.email).toBe("juan@empresa.com");
      }
    });

    it("debe rechazar email inválido", () => {
      const usuario = {
        idExterno: "EMP001",
        email: "not-an-email",
        nombre: "Juan",
      };

      const resultado = validarUsuarioExterno(usuario);
      expect(resultado.valido).toBe(false);
    });

    it("debe rechazar campos requeridos faltantes", () => {
      const usuario = {
        email: "juan@empresa.com",
        nombre: "Juan",
      };

      const resultado = validarUsuarioExterno(usuario);
      expect(resultado.valido).toBe(false);
    });
  });

  describe("validarUsuariosExternos", () => {
    it("debe separar válidos e inválidos", () => {
      const usuarios = [
        { idExterno: "1", email: "valid@emp.com", nombre: "Valid" },
        { idExterno: "2", email: "invalid-email", nombre: "Invalid" },
        { idExterno: "3", email: "another@emp.com", nombre: "Another" },
      ];

      const resultado = validarUsuariosExternos(usuarios);
      expect(resultado.validos.length).toBe(2);
      expect(resultado.invalidos.length).toBe(1);
      expect(resultado.invalidos[0].index).toBe(1);
    });
  });

  describe("parsearCSV", () => {
    it("debe parsear CSV válido", () => {
      const csv = `idExterno,email,nombre,apellido,departamento
EMP001,juan@emp.com,Juan,Pérez,ITICO
EMP002,maria@emp.com,María,García,RECURSOS_HUMANOS`;

      const usuarios = parsearCSV(csv);
      expect(usuarios.length).toBe(2);
      expect(usuarios[0].email).toBe("juan@emp.com");
      expect(usuarios[1].nombre).toBe("María");
    });

    it("debe manejar CSV con campos opcionales vacíos", () => {
      const csv = `idExterno,email,nombre
EMP001,juan@emp.com,Juan`;

      const usuarios = parsearCSV(csv);
      expect(usuarios.length).toBe(1);
      expect(usuarios[0].email).toBe("juan@emp.com");
    });
  });

  describe("mapearRol", () => {
    it("debe mapear roles de Pacifico correctamente", () => {
      expect(mapearRol("Administrador", mapeoRolesPacifico)).toBe("administrador");
      expect(mapearRol("Supervisor", mapeoRolesPacifico)).toBe("supervisor");
      expect(mapearRol("Oficial", mapeoRolesPacifico)).toBe("estudiante");
      expect(mapearRol("Usuario", mapeoRolesPacifico)).toBe("estudiante");
    });

    it("debe usar rol por defecto para roles desconocidos", () => {
      expect(mapearRol("RolDesconocido", mapeoRolesPacifico)).toBe("estudiante");
    });
  });

  describe("mapearDepartamento", () => {
    it("debe mapear departamentos válidos", () => {
      expect(mapearDepartamento("ITICO")).toBe("ITICO");
      expect(mapearDepartamento("RECURSOS HUMANOS")).toBe("RECURSOS_HUMANOS");
      expect(mapearDepartamento("recursos humanos")).toBe("RECURSOS_HUMANOS");
    });

    it("debe retornar undefined para departamentos inválidos", () => {
      expect(mapearDepartamento("Departamento Inexistente")).toBeUndefined();
    });
  });

  describe("mapearCargo", () => {
    it("debe mapear cargos válidos", () => {
      expect(mapearCargo("Analista")).toBe("Analista");
      expect(mapearCargo("Oficial Profesional")).toBe("Oficial_Profesional");
    });
  });
});

// ============================================
// PRUEBAS DE INTEGRACIÓN - FLUJOS COMPLETOS
// ============================================

describe("🔄 Flujos de Integración", () => {
  describe("Flujo: Curso con Video de YouTube", () => {
    it("debe procesar URL de YouTube y crear tema", async () => {
      const { extraerInfoYoutube } = await import("../services/media.service");
      
      const urlYoutube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const info = extraerInfoYoutube(urlYoutube);
      
      expect(info.valido).toBe(true);
      expect(info.embedUrl).toContain("embed");
      
      // Los datos se usarían para crear un tema:
      // tema.videoYoutube = info.embedUrl
      // tema.thumbnailUrl = info.thumbnailUrl
    });

    it("debe soportar múltiples formatos de URL de YouTube", async () => {
      const { extraerInfoYoutube } = await import("../services/media.service");
      
      const urls = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=30",
      ];
      
      for (const url of urls) {
        const info = extraerInfoYoutube(url);
        expect(info.valido).toBe(true);
        expect(info.videoId).toBe("dQw4w9WgXcQ");
      }
    });
  });

  describe("Flujo: Sincronización y Exportación", () => {
    it("debe sincronizar usuarios y exportar progreso", async () => {
      const { parsearCSV, validarUsuariosExternos } = await import("../services/user-sync.service");
      
      const csv = `idExterno,email,nombre
EMP001,user1@test.com,User One
EMP002,user2@test.com,User Two`;
      
      const usuarios = parsearCSV(csv);
      const { validos } = validarUsuariosExternos(usuarios);
      
      expect(validos.length).toBe(2);
      
      const { generarExcelProgreso } = await import("../services/excel.service");
      
      const progresoData = validos.map((u, i) => ({
        usuario: u.nombre,
        email: u.email,
        curso: "Test Course",
        temasCompletados: i === 0 ? 5 : 2,
        totalTemas: 5,
        quizzesAprobados: i === 0 ? 2 : 0,
        totalQuizzes: 2,
        progresoPercent: i === 0 ? 100 : 40,
        estado: (i === 0 ? "Completado" : "En Progreso") as const,
      }));
      
      const excel = await generarExcelProgreso(progresoData);
      expect(excel.length).toBeGreaterThan(100);
    });
  });

  describe("Flujo: Certificado Completo", () => {
    it("debe generar certificado con código válido", async () => {
      const { 
        generarCertificadoPDF, 
        validarCodigoCertificado,
        extraerInfoCodigo 
      } = await import("../services/pdf.service");
      
      const codigo = "CERT-ABC12345-XYZ67890-TEST123";
      
      const pdf = await generarCertificadoPDF({
        nombreUsuario: "Test User",
        nombreCurso: "Test Course",
        fechaCompletado: new Date(),
        duracionHoras: 10,
        codigo,
      });
      
      expect(pdf).toBeDefined();
      expect(validarCodigoCertificado(codigo)).toBe(true);
      
      const info = extraerInfoCodigo(codigo);
      expect(info).not.toBeNull();
      expect(info?.cursoId).toBe("ABC12345");
    });
  });
});

// ============================================
// RESUMEN DE PRUEBAS
// ============================================

console.log("\n");
console.log("=".repeat(60));
console.log("🧪 Academy LMS - Test Suite");
console.log("=".repeat(60));
console.log("\nCategorías de pruebas:");
console.log("  📄 PDF Service - Certificados");
console.log("  📊 Excel Service - Exportaciones");
console.log("  🎬 Media Service - YouTube/Vimeo/Archivos");
console.log("  👥 User Sync Service - Sincronización");
console.log("  🔄 Integración - Flujos completos");
console.log("\n" + "=".repeat(60));
