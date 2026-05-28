/**
 * Academy LMS - Schema
 *
 * Modela un sistema completo de gestión de aprendizaje con:
 * - Cursos, módulos y temas
 * - Sistema de quizzes y evaluaciones
 * - Tracking de progreso
 * - Grupos de asignación
 * - Learning Paths
 * - Encuestas de satisfacción
 */
import { pgTable, text, timestamp, decimal, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
// ============================================
// ENUMS
// ============================================
export const rolCapacitacionesEnum = pgEnum("rol_capacitaciones", [
    "administrador",
    "supervisor",
    "estudiante",
]);
export const tipoCursoEnum = pgEnum("tipo_curso", [
    "INDUCCION",
    "GESTION",
    "TECNICO",
    "HERRAMIENTAS",
    "DESARROLLO",
]);
export const metodoAsignacionEnum = pgEnum("metodo_asignacion", [
    "manual",
    "grupo",
    "automatico",
]);
export const departamentoEnum = pgEnum("departamento", [
    "CONTABILIDAD",
    "COBROS",
    "COMPUTO",
    "EXPERIENCIA_AL_CLIENTE",
    "FINANZAS",
    "GERENCIA",
    "ITICO",
    "LEGAL",
    "NEGOCIOS",
    "PROCESOS",
    "RECURSOS_HUMANOS",
    "SERVICIOS_GENERALES",
    "TRAMITE",
]);
export const cargoEnum = pgEnum("cargo", [
    "Asistente",
    "Analista",
    "Oficial_Profesional",
    "Coordinador",
    "Encargada_Supervisor",
    "Jefe",
    "Gerente",
]);
export const lugarEnum = pgEnum("lugar", [
    "OFICINA",
    "CASA",
    "TRANSPORTE",
]);
export const rolEncuestaEnum = pgEnum("rol_encuesta", [
    "Participante",
    "Expositor",
    "Organizador",
    "Otro",
]);
// ============================================
// TABLAS PRINCIPALES
// ============================================
/**
 * Perfil de usuario específico para el sistema de capacitaciones
 * Extiende el usuario base de Gremius con roles específicos
 */
export const perfilUsuarioTable = pgTable("perfil_usuario_capacitaciones", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull().unique(), // Referencia a gremius-core-users
    rolCapacitaciones: rolCapacitacionesEnum("rol_capacitaciones").notNull().default("estudiante"),
    activo: boolean("activo").notNull().default(true),
    fechaAsignacionRol: timestamp("fecha_asignacion_rol").defaultNow(),
    notas: text("notas"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Cursos disponibles en el sistema
 */
export const cursoTable = pgTable("cursos", {
    id: text("id").primaryKey().$defaultFn(createId),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion").notNull(),
    fechaInicio: timestamp("fecha_inicio"),
    fechaFin: timestamp("fecha_fin"),
    duracionHoras: decimal("duracion_horas", { precision: 5, scale: 1 }),
    mediaId: text("media_id"), // Referencia a grimoire-media (para portada del curso)
    colorPortada: text("color_portada").notNull().default("#009c3c"),
    tipoCurso: tipoCursoEnum("tipo_curso"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Grupos de asignación para organizar estudiantes
 */
export const grupoAsignacionTable = pgTable("grupos_asignacion", {
    id: text("id").primaryKey().$defaultFn(createId),
    nombre: text("nombre").notNull(),
    supervisorPrincipalId: text("supervisor_principal_id"), // Referencia a perfilUsuarioTable
    descripcion: text("descripcion"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Relación muchos-a-muchos: Grupos - Usuarios
 */
export const grupoUsuarioTable = pgTable("grupo_usuarios", {
    id: text("id").primaryKey().$defaultFn(createId),
    grupoId: text("grupo_id").notNull().references(() => grupoAsignacionTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    fechaAsignacion: timestamp("fecha_asignacion").defaultNow(),
});
/**
 * Relación muchos-a-muchos: Grupos - Supervisores adicionales
 */
export const grupoSupervisorTable = pgTable("grupo_supervisores", {
    id: text("id").primaryKey().$defaultFn(createId),
    grupoId: text("grupo_id").notNull().references(() => grupoAsignacionTable.id, { onDelete: "cascade" }),
    supervisorId: text("supervisor_id").notNull(), // Referencia a perfilUsuarioTable
    fechaAsignacion: timestamp("fecha_asignacion").defaultNow(),
});
/**
 * Módulos dentro de un curso
 */
export const moduloTable = pgTable("modulos", {
    id: text("id").primaryKey().$defaultFn(createId),
    cursoId: text("curso_id").notNull().references(() => cursoTable.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion"),
    orden: integer("orden").notNull().default(1),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Temas dentro de un módulo
 */
export const temaTable = pgTable("temas", {
    id: text("id").primaryKey().$defaultFn(createId),
    moduloId: text("modulo_id").notNull().references(() => moduloTable.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    contenido: text("contenido").notNull(),
    orden: integer("orden").notNull().default(1),
    // Multimedia
    videoLocal: text("video_local"), // Referencia a grimoire-media
    videoYoutube: text("video_youtube"), // URL embed de YouTube
    videoExterno: text("video_externo"), // iframe o link externo
    imagenId: text("imagen_id"), // Referencia a grimoire-media
    documentoId: text("documento_id"), // Referencia a grimoire-media
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Archivos adicionales adjuntos a temas
 */
export const archivoAdicionalTable = pgTable("archivos_adicionales", {
    id: text("id").primaryKey().$defaultFn(createId),
    temaId: text("tema_id").notNull().references(() => temaTable.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    archivo: text("archivo").notNull(), // Referencia a grimoire-media
    orden: integer("orden").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
});
// ============================================
// SISTEMA DE QUIZZES
// ============================================
/**
 * Quiz asociado a un módulo
 */
export const quizTable = pgTable("quizzes", {
    id: text("id").primaryKey().$defaultFn(createId),
    moduloId: text("modulo_id").notNull().unique().references(() => moduloTable.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    instrucciones: text("instrucciones"),
    mediaId: text("media_id"), // Referencia a grimoire-media (para portada del quiz)
    puntajeMinimoAprobacion: integer("puntaje_minimo_aprobacion").notNull().default(70), // Porcentaje
    tiempoLimiteMinutos: integer("tiempo_limite_minutos"), // Opcional
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Preguntas de un quiz
 */
export const preguntaTable = pgTable("preguntas", {
    id: text("id").primaryKey().$defaultFn(createId),
    quizId: text("quiz_id").notNull().references(() => quizTable.id, { onDelete: "cascade" }),
    texto: text("texto").notNull(),
    puntaje: integer("puntaje").notNull().default(10),
    orden: integer("orden").notNull().default(1),
    archivoId: text("archivo_id"), // Referencia a grimoire-media (imagen/audio)
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
});
/**
 * Opciones de respuesta para preguntas
 */
export const opcionTable = pgTable("opciones", {
    id: text("id").primaryKey().$defaultFn(createId),
    preguntaId: text("pregunta_id").notNull().references(() => preguntaTable.id, { onDelete: "cascade" }),
    texto: text("texto").notNull(),
    esCorrecta: boolean("es_correcta").notNull().default(false),
    orden: integer("orden").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
});
// ============================================
// TRACKING DE PROGRESO
// ============================================
/**
 * Progreso de un usuario en un curso
 */
export const progresoCursoTable = pgTable("progreso_cursos", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    cursoId: text("curso_id").notNull().references(() => cursoTable.id, { onDelete: "cascade" }),
    completado: boolean("completado").notNull().default(false),
    fechaCompletado: timestamp("fecha_completado"),
    encuestaCompletada: boolean("encuesta_completada").notNull().default(false),
    certificadoDescargado: boolean("certificado_descargado").notNull().default(false),
    fechaDescargaCertificado: timestamp("fecha_descarga_certificado"),
    porcentajeProgreso: integer("porcentaje_progreso").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Relación: Módulos completados por usuario en un curso
 */
export const progresoModuloTable = pgTable("progreso_modulos", {
    id: text("id").primaryKey().$defaultFn(createId),
    progresoCursoId: text("progreso_curso_id").notNull().references(() => progresoCursoTable.id, { onDelete: "cascade" }),
    moduloId: text("modulo_id").notNull().references(() => moduloTable.id, { onDelete: "cascade" }),
    fechaCompletado: timestamp("fecha_completado").defaultNow(),
});
/**
 * Progreso de un usuario en un tema específico
 */
export const progresoTemaTable = pgTable("progreso_temas", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    temaId: text("tema_id").notNull().references(() => temaTable.id, { onDelete: "cascade" }),
    completado: boolean("completado").notNull().default(false),
    fechaCompletado: timestamp("fecha_completado"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Respuestas de usuarios a preguntas de quiz
 */
export const respuestaUsuarioTable = pgTable("respuestas_usuario", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    preguntaId: text("pregunta_id").notNull().references(() => preguntaTable.id, { onDelete: "cascade" }),
    opcionSeleccionadaId: text("opcion_seleccionada_id").notNull().references(() => opcionTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
});
/**
 * Resultados finales de quizzes por usuario
 */
export const resultadoQuizTable = pgTable("resultados_quiz", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    quizId: text("quiz_id").notNull().references(() => quizTable.id, { onDelete: "cascade" }),
    puntaje: integer("puntaje").notNull(),
    puntajePorcentaje: integer("puntaje_porcentaje").notNull(),
    aprobado: boolean("aprobado").notNull().default(false),
    respuestasJson: jsonb("respuestas_json"), // { preguntaId: opcionId, ... }
    fechaRealizacion: timestamp("fecha_realizacion").defaultNow(),
    tiempoEmpleadoSegundos: integer("tiempo_empleado_segundos"),
});
// ============================================
// LEARNING PATHS (RUTAS DE APRENDIZAJE)
// ============================================
/**
 * Learning Paths - Rutas de aprendizaje predefinidas
 * Permiten agrupar múltiples cursos en una secuencia ordenada
 */
export const learningPathTable = pgTable("learning_paths", {
    id: text("id").primaryKey().$defaultFn(createId),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    categoria: text("categoria"), // ej: "Inducción", "Desarrollo", "Técnico"
    duracionEstimadaHoras: decimal("duracion_estimada_horas", { precision: 6, scale: 1 }),
    mediaId: text("media_id"), // Referencia a grimoire-media (para imagen del learning path)
    activo: boolean("activo").notNull().default(true),
    requiereAprobacionSecuencial: boolean("requiere_aprobacion_secuencial").notNull().default(false), // true = debe completar curso N para acceder a N+1
    createdById: text("created_by_id"), // Usuario que creó el path
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Relación: Cursos dentro de un Learning Path
 * Define el orden secuencial de los cursos
 */
export const learningPathCursoTable = pgTable("learning_path_cursos", {
    id: text("id").primaryKey().$defaultFn(createId),
    learningPathId: text("learning_path_id").notNull().references(() => learningPathTable.id, { onDelete: "cascade" }),
    cursoId: text("curso_id").notNull().references(() => cursoTable.id, { onDelete: "cascade" }),
    orden: integer("orden").notNull().default(1),
    obligatorio: boolean("obligatorio").notNull().default(true), // true = debe completarse para terminar el path
    duracionEstimadaDias: integer("duracion_estimada_dias"), // Días sugeridos para completar
    createdAt: timestamp("created_at").defaultNow(),
});
/**
 * Progreso de un usuario en un Learning Path completo
 */
export const progresoLearningPathTable = pgTable("progreso_learning_paths", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    learningPathId: text("learning_path_id").notNull().references(() => learningPathTable.id, { onDelete: "cascade" }),
    porcentajeCompletado: integer("porcentaje_completado").notNull().default(0),
    cursosCompletados: integer("cursos_completados").notNull().default(0),
    totalCursos: integer("total_cursos").notNull().default(0),
    completado: boolean("completado").notNull().default(false),
    fechaCompletado: timestamp("fecha_completado"),
    fechaInicio: timestamp("fecha_inicio").defaultNow(),
    fechaLimite: timestamp("fecha_limite"), // Fecha límite para completar todo el path
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
/**
 * Asignaciones de Learning Paths
 * Registra quién asignó el path completo
 */
export const asignacionLearningPathTable = pgTable("asignaciones_learning_path", {
    id: text("id").primaryKey().$defaultFn(createId),
    learningPathId: text("learning_path_id").notNull().references(() => learningPathTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    asignadoPorId: text("asignado_por_id"), // Quién hizo la asignación
    fechaLimite: timestamp("fecha_limite"), // Fecha límite personalizada
    prioridad: text("prioridad").default("normal"), // baja, normal, alta, urgente
    notas: text("notas"),
    fecha: timestamp("fecha").defaultNow(),
});
// ============================================
// ASIGNACIONES
// ============================================
/**
 * Historial de asignaciones de cursos a usuarios/grupos
 */
export const asignacionTable = pgTable("asignaciones", {
    id: text("id").primaryKey().$defaultFn(createId),
    cursoId: text("curso_id").notNull().references(() => cursoTable.id, { onDelete: "cascade" }),
    userId: text("user_id"), // Referencia a gremius-core-users (nullable si es asignación a grupo)
    grupoId: text("grupo_id").references(() => grupoAsignacionTable.id, { onDelete: "cascade" }),
    metodo: metodoAsignacionEnum("metodo").notNull().default("manual"),
    asignadoPorId: text("asignado_por_id"), // Referencia a gremius-core-users
    fecha: timestamp("fecha").defaultNow(),
    notas: text("notas"),
});
// ============================================
// FEEDBACK Y ENCUESTAS
// ============================================
/**
 * Feedback de usuarios sobre temas
 */
export const feedbackTable = pgTable("feedback", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    temaId: text("tema_id").notNull().references(() => temaTable.id, { onDelete: "cascade" }),
    puntuacion: integer("puntuacion").notNull(), // 1-5 estrellas
    comentario: text("comentario"),
    createdAt: timestamp("created_at").defaultNow(),
});
/**
 * Encuestas de satisfacción post-curso
 */
export const encuestaSatisfaccionTable = pgTable("encuestas_satisfaccion", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id"), // Referencia a gremius-core-users
    cursoId: text("curso_id").references(() => cursoTable.id, { onDelete: "set null" }),
    // Información demográfica
    departamento: departamentoEnum("departamento").notNull(),
    cargo: cargoEnum("cargo").notNull(),
    // Evaluación del curso
    expositor: integer("expositor").notNull(), // 1-5
    utilidad: boolean("utilidad").notNull(), // true=si, false=no
    satisfaccion: integer("satisfaccion").notNull(), // 1-5
    aprendido: text("aprendido").notNull(), // Máx 300 chars
    lugar: lugarEnum("lugar").notNull(),
    rol: rolEncuestaEnum("rol").notNull(),
    recomendacion: text("recomendacion"), // Máx 200 chars
    comentariosCurso: text("comentarios_curso").notNull(), // Máx 500 chars
    fecha: timestamp("fecha").defaultNow(),
});
// ============================================
// CERTIFICADOS
// ============================================
/**
 * Certificados generados para usuarios
 */
export const certificadoTable = pgTable("certificados", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id").notNull(), // Referencia a gremius-core-users
    cursoId: text("curso_id").notNull().references(() => cursoTable.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull().unique(), // Código único de verificación
    archivo: text("archivo"), // Referencia a grimoire-media (PDF generado)
    fechaGeneracion: timestamp("fecha_generacion").defaultNow(),
    fechaDescarga: timestamp("fecha_descarga"),
    datosJson: jsonb("datos_json"), // { nombreUsuario, nombreCurso, fechaCompletado, etc. }
});
// ============================================
// NOTIFICACIONES Y ACTIVIDAD
// ============================================
/**
 * Log de actividad del sistema
 */
export const actividadLogTable = pgTable("actividad_log", {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id"), // Referencia a gremius-core-users
    tipo: text("tipo").notNull(), // curso_completado, quiz_aprobado, certificado_descargado, etc.
    entidadTipo: text("entidad_tipo"), // curso, modulo, tema, quiz, etc.
    entidadId: text("entidad_id"),
    descripcion: text("descripcion").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
});
//# sourceMappingURL=academy-lms.schema.js.map