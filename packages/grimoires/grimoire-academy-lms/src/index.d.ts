/**
 * @gremius/grimoire-academy-lms — Academy LMS (Modern Grimoire)
 *
 * Learning Management System completo con cursos, módulos,
 * quizzes, progreso, learning paths y certificados.
 */
import { perfilUsuarioTable, cursoTable, grupoAsignacionTable, grupoUsuarioTable, grupoSupervisorTable, moduloTable, temaTable, archivoAdicionalTable, quizTable, preguntaTable, opcionTable, progresoCursoTable, progresoModuloTable, progresoTemaTable, respuestaUsuarioTable, resultadoQuizTable, asignacionTable, feedbackTable, encuestaSatisfaccionTable, certificadoTable, actividadLogTable, learningPathTable, learningPathCursoTable, progresoLearningPathTable, asignacionLearningPathTable, rolCapacitacionesEnum, tipoCursoEnum, metodoAsignacionEnum, departamentoEnum, cargoEnum, lugarEnum, rolEncuestaEnum } from "../academy-lms.schema";
/**
 * Definición del grimoire Academy LMS (Modern)
 */
export declare const grimoire: import("@gremius/shared").GrimoireDefinition;
export { perfilUsuarioTable, cursoTable, grupoAsignacionTable, grupoUsuarioTable, grupoSupervisorTable, moduloTable, temaTable, archivoAdicionalTable, quizTable, preguntaTable, opcionTable, progresoCursoTable, progresoModuloTable, progresoTemaTable, respuestaUsuarioTable, resultadoQuizTable, asignacionTable, feedbackTable, encuestaSatisfaccionTable, certificadoTable, actividadLogTable, learningPathTable, learningPathCursoTable, progresoLearningPathTable, asignacionLearningPathTable, rolCapacitacionesEnum, tipoCursoEnum, metodoAsignacionEnum, departamentoEnum, cargoEnum, lugarEnum, rolEncuestaEnum, };
export { generarCertificadoPDF, generarCertificadoOverlay, generarCertificadoConPlantilla, generarVistaPreviaCertificado, validarCodigoCertificado, extraerInfoCodigo, type CertificadoData, type PlantillaCertificado, type OverlayConfig, } from "../services/pdf.service";
export { generarExcelAsignaciones, generarExcelProgreso, generarExcelEncuestas, type AsignacionExcelRow, type ProgresoExcelRow, type EncuestaExcelRow, } from "../services/excel.service";
export { MediaService, validarArchivo, determinarTipoMedia, formatBytes, extraerInfoYoutube, normalizarVideoUrl, procesarPortadaCurso, procesarVideoTema, procesarDocumento, procesarImagenPregunta, procesarCertificadoPDF, getMediaPresetUrl, getCursoCoverUrl, getQuizThumbnailUrl, getLearningPathImageUrl, getTemaImageUrl, getPreguntaArchivoUrl, getDocumentoUrl, type MediaFile, type UploadResult, type MediaValidation, type MediaType, } from "../services/media.service";
export { validarUsuarioExterno, validarUsuariosExternos, parsearCSV, sincronizarUsuarios, mapearRol, mapearDepartamento, mapearCargo, mapeoRolesPacifico, mapeoDepartamentos, mapeoCargos, normalizarUsuarioExterno, generarResumenSync, type UsuarioExterno, type SyncResult, type SyncConfig, type RolMapping, } from "../services/user-sync.service";
export type { PerfilUsuario, Curso, GrupoAsignacion, GrupoUsuario, GrupoSupervisor, Modulo, Tema, ArchivoAdicional, Quiz, Pregunta, Opcion, ProgresoCurso, ProgresoModulo, ProgresoTema, RespuestaUsuario, ResultadoQuiz, Asignacion, Feedback, EncuestaSatisfaccion, Certificado, ActividadLog, LearningPath, LearningPathCurso, ProgresoLearningPath, AsignacionLearningPath, RolCapacitaciones, TipoCurso, MetodoAsignacion, Departamento, Cargo, Lugar, RolEncuesta, } from "../academy-lms.schema";
export default grimoire;
//# sourceMappingURL=index.d.ts.map