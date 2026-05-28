// @ts-nocheck
/**
 * Academy LMS - Excel Service
 *
 * Servicio para exportación de datos a Excel.
 * Usa exceljs para generar archivos xlsx.
 */
// ExcelJS is lazy-loaded to avoid issues when the optional dependency is not installed
let ExcelJSModule = null;
async function getExcelJS() {
    if (!ExcelJSModule) {
        ExcelJSModule = await import("exceljs");
    }
    return ExcelJSModule;
}
/**
 * Genera un archivo Excel con el historial de asignaciones
 */
export async function generarExcelAsignaciones(data, titulo) {
    const ExcelJS = await getExcelJS();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Asignaciones");
    // Título
    worksheet.mergeCells("A1:K1");
    worksheet.getCell("A1").value = titulo || "Historial de Asignaciones";
    worksheet.getCell("A1").font = { size: 16, bold: true };
    worksheet.getCell("A1").alignment = { horizontal: "center" };
    worksheet.getRow(1).height = 30;
    // Headers
    const headers = [
        "Fecha",
        "Curso",
        "Tipo",
        "Duración (hrs)",
        "Usuario",
        "N° Colaborador",
        "Grupo",
        "Método",
        "Progreso (%)",
        "Fecha Finalización",
        "Estado",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "009C3C" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 25;
    // Data rows
    data.forEach((row) => {
        const dataRow = worksheet.addRow([
            row.fecha,
            row.curso,
            row.tipoCurso,
            row.duracionHoras,
            row.usuario,
            row.numeroColaborador || "N/A",
            row.grupo || "Individual",
            row.metodo,
            row.progreso,
            row.fechaFinalizacion || "-",
            row.estado,
        ]);
        // Formato condicional para progreso
        const progresoCell = dataRow.getCell(9);
        if (row.progreso === 100) {
            progresoCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "C6EFCE" },
            };
            progresoCell.font = { color: { argb: "006100" } };
        }
        else if (row.progreso > 0) {
            progresoCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFEB9C" },
            };
            progresoCell.font = { color: { argb: "9C5700" } };
        }
        // Formato para estado
        const estadoCell = dataRow.getCell(11);
        if (row.estado === "Completado") {
            estadoCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "C6EFCE" },
            };
            estadoCell.font = { color: { argb: "006100" } };
        }
        else if (row.estado === "En Progreso") {
            estadoCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFEB9C" },
            };
            estadoCell.font = { color: { argb: "9C5700" } };
        }
        else {
            estadoCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFC7CE" },
            };
            estadoCell.font = { color: { argb: "9C0006" } };
        }
    });
    // Formato de columnas
    worksheet.getColumn(1).width = 15; // Fecha
    worksheet.getColumn(2).width = 35; // Curso
    worksheet.getColumn(3).width = 15; // Tipo
    worksheet.getColumn(4).width = 12; // Duración
    worksheet.getColumn(5).width = 25; // Usuario
    worksheet.getColumn(6).width = 15; // N° Colaborador
    worksheet.getColumn(7).width = 20; // Grupo
    worksheet.getColumn(8).width = 12; // Método
    worksheet.getColumn(9).width = 12; // Progreso
    worksheet.getColumn(10).width = 18; // Fecha Finalización
    worksheet.getColumn(11).width = 15; // Estado
    // Formato de fecha
    worksheet.getColumn(1).numFmt = "DD/MM/YYYY HH:mm";
    worksheet.getColumn(10).numFmt = "DD/MM/YYYY";
    // Filtros
    worksheet.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: 11 },
    };
    // Congelar paneles
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];
    return workbook.xlsx.writeBuffer();
}
/**
 * Genera un archivo Excel con reporte de progreso
 */
export async function generarExcelProgreso(data, titulo) {
    const ExcelJS = await getExcelJS();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Progreso");
    // Título
    worksheet.mergeCells("A1:L1");
    worksheet.getCell("A1").value = titulo || "Reporte de Progreso";
    worksheet.getCell("A1").font = { size: 16, bold: true };
    worksheet.getCell("A1").alignment = { horizontal: "center" };
    worksheet.getRow(1).height = 30;
    // Headers
    const headers = [
        "Usuario",
        "Email",
        "Curso",
        "Módulo",
        "Temas Completados",
        "Total Temas",
        "Quizzes Aprobados",
        "Total Quizzes",
        "Progreso (%)",
        "Estado",
        "Fecha Inicio",
        "Fecha Completado",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "009C3C" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 25;
    // Data rows
    data.forEach((row) => {
        const dataRow = worksheet.addRow([
            row.usuario,
            row.email || "-",
            row.curso,
            row.modulo || "-",
            row.temasCompletados,
            row.totalTemas,
            row.quizzesAprobados,
            row.totalQuizzes,
            row.progresoPercent,
            row.estado,
            row.fechaInicio || "-",
            row.fechaCompletado || "-",
        ]);
        // Formato condicional para progreso
        const progresoCell = dataRow.getCell(9);
        progresoCell.fill = getProgresoFill(row.progresoPercent);
    });
    // Formato de columnas
    worksheet.getColumn(1).width = 25;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 35;
    worksheet.getColumn(4).width = 25;
    worksheet.getColumn(5).width = 12;
    worksheet.getColumn(6).width = 12;
    worksheet.getColumn(7).width = 12;
    worksheet.getColumn(8).width = 12;
    worksheet.getColumn(9).width = 12;
    worksheet.getColumn(10).width = 15;
    worksheet.getColumn(11).width = 15;
    worksheet.getColumn(12).width = 18;
    // Formato de fecha
    worksheet.getColumn(11).numFmt = "DD/MM/YYYY";
    worksheet.getColumn(12).numFmt = "DD/MM/YYYY";
    // Filtros
    worksheet.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: 12 },
    };
    // Congelar paneles
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];
    return workbook.xlsx.writeBuffer();
}
/**
 * Genera un archivo Excel con resultados de encuestas
 */
export async function generarExcelEncuestas(data, titulo) {
    const ExcelJS = await getExcelJS();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Encuestas");
    // Título
    worksheet.mergeCells("A1:M1");
    worksheet.getCell("A1").value = titulo || "Resultados de Encuestas";
    worksheet.getCell("A1").font = { size: 16, bold: true };
    worksheet.getCell("A1").alignment = { horizontal: "center" };
    worksheet.getRow(1).height = 30;
    // Headers
    const headers = [
        "Fecha",
        "Curso",
        "Usuario",
        "Departamento",
        "Cargo",
        "Expositor",
        "Utilidad",
        "Satisfacción",
        "Aprendido",
        "Lugar",
        "Rol",
        "Recomendación",
        "Comentarios",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "009C3C" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 25;
    // Data rows
    data.forEach((row) => {
        const dataRow = worksheet.addRow([
            row.fecha,
            row.curso,
            row.usuario,
            row.departamento,
            row.cargo,
            row.expositor,
            row.utilidad,
            row.satisfaccion,
            row.aprendido,
            row.lugar,
            row.rol,
            row.recomendacion || "-",
            row.comentarios,
        ]);
        // Formato condicional para satisfacción
        const satisfaccionCell = dataRow.getCell(8);
        satisfaccionCell.fill = getSatisfaccionFill(row.satisfaccion);
    });
    // Formato de columnas
    worksheet.getColumn(1).width = 15;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 25;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 10;
    worksheet.getColumn(7).width = 10;
    worksheet.getColumn(8).width = 12;
    worksheet.getColumn(9).width = 40;
    worksheet.getColumn(10).width = 12;
    worksheet.getColumn(11).width = 12;
    worksheet.getColumn(12).width = 30;
    worksheet.getColumn(13).width = 40;
    // Formato de fecha
    worksheet.getColumn(1).numFmt = "DD/MM/YYYY";
    // Ajustar texto
    worksheet.getColumn(9).alignment = { wrapText: true };
    worksheet.getColumn(12).alignment = { wrapText: true };
    worksheet.getColumn(13).alignment = { wrapText: true };
    // Filtros
    worksheet.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: 13 },
    };
    // Congelar paneles
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];
    return workbook.xlsx.writeBuffer();
}
/**
 * Obtiene el color de fill según el progreso
 */
function getProgresoFill(progreso) {
    if (progreso === 100) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "C6EFCE" },
        };
    }
    else if (progreso >= 75) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "D4EDDA" },
        };
    }
    else if (progreso >= 50) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3CD" },
        };
    }
    else if (progreso >= 25) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE5CC" },
        };
    }
    else {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "F8D7DA" },
        };
    }
}
/**
 * Obtiene el color de fill según la satisfacción
 */
function getSatisfaccionFill(satisfaccion) {
    if (satisfaccion >= 5) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "C6EFCE" },
        };
    }
    else if (satisfaccion >= 4) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "D4EDDA" },
        };
    }
    else if (satisfaccion >= 3) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3CD" },
        };
    }
    else if (satisfaccion >= 2) {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE5CC" },
        };
    }
    else {
        return {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "F8D7DA" },
        };
    }
}
//# sourceMappingURL=excel.service.js.map