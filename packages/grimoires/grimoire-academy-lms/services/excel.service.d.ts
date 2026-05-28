/**
 * Academy LMS - Excel Service
 *
 * Servicio para exportación de datos a Excel.
 * Usa exceljs para generar archivos xlsx.
 */
import { Buffer } from "buffer";
export interface AsignacionExcelRow {
    fecha: Date;
    curso: string;
    tipoCurso: string;
    duracionHoras: string | number;
    usuario: string;
    numeroColaborador?: string;
    grupo?: string;
    metodo: string;
    progreso: number;
    fechaFinalizacion?: Date | null;
    estado: string;
}
export interface ProgresoExcelRow {
    usuario: string;
    email?: string;
    curso: string;
    modulo?: string;
    temasCompletados: number;
    totalTemas: number;
    quizzesAprobados: number;
    totalQuizzes: number;
    progresoPercent: number;
    estado: string;
    fechaInicio?: Date;
    fechaCompletado?: Date;
}
export interface EncuestaExcelRow {
    fecha: Date;
    curso: string;
    usuario: string;
    departamento: string;
    cargo: string;
    expositor: number;
    utilidad: string;
    satisfaccion: number;
    aprendido: string;
    lugar: string;
    rol: string;
    recomendacion?: string;
    comentarios: string;
}
/**
 * Genera un archivo Excel con el historial de asignaciones
 */
export declare function generarExcelAsignaciones(data: AsignacionExcelRow[], titulo?: string): Promise<Buffer>;
/**
 * Genera un archivo Excel con reporte de progreso
 */
export declare function generarExcelProgreso(data: ProgresoExcelRow[], titulo?: string): Promise<Buffer>;
/**
 * Genera un archivo Excel con resultados de encuestas
 */
export declare function generarExcelEncuestas(data: EncuestaExcelRow[], titulo?: string): Promise<Buffer>;
//# sourceMappingURL=excel.service.d.ts.map