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
export declare const rolCapacitacionesEnum: import("drizzle-orm/pg-core").PgEnum<["administrador", "supervisor", "estudiante"]>;
export declare const tipoCursoEnum: import("drizzle-orm/pg-core").PgEnum<["INDUCCION", "GESTION", "TECNICO", "HERRAMIENTAS", "DESARROLLO"]>;
export declare const metodoAsignacionEnum: import("drizzle-orm/pg-core").PgEnum<["manual", "grupo", "automatico"]>;
export declare const departamentoEnum: import("drizzle-orm/pg-core").PgEnum<["CONTABILIDAD", "COBROS", "COMPUTO", "EXPERIENCIA_AL_CLIENTE", "FINANZAS", "GERENCIA", "ITICO", "LEGAL", "NEGOCIOS", "PROCESOS", "RECURSOS_HUMANOS", "SERVICIOS_GENERALES", "TRAMITE"]>;
export declare const cargoEnum: import("drizzle-orm/pg-core").PgEnum<["Asistente", "Analista", "Oficial_Profesional", "Coordinador", "Encargada_Supervisor", "Jefe", "Gerente"]>;
export declare const lugarEnum: import("drizzle-orm/pg-core").PgEnum<["OFICINA", "CASA", "TRANSPORTE"]>;
export declare const rolEncuestaEnum: import("drizzle-orm/pg-core").PgEnum<["Participante", "Expositor", "Organizador", "Otro"]>;
/**
 * Perfil de usuario específico para el sistema de capacitaciones
 * Extiende el usuario base de Gremius con roles específicos
 */
export declare const perfilUsuarioTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "perfil_usuario_capacitaciones";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        rolCapacitaciones: import("drizzle-orm/pg-core").PgColumn<{
            name: "rol_capacitaciones";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "administrador" | "supervisor" | "estudiante";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["administrador", "supervisor", "estudiante"];
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaAsignacionRol: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_asignacion_rol";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        notas: import("drizzle-orm/pg-core").PgColumn<{
            name: "notas";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "perfil_usuario_capacitaciones";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Cursos disponibles en el sistema
 */
export declare const cursoTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "cursos";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        titulo: import("drizzle-orm/pg-core").PgColumn<{
            name: "titulo";
            tableName: "cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        descripcion: import("drizzle-orm/pg-core").PgColumn<{
            name: "descripcion";
            tableName: "cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fechaInicio: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_inicio";
            tableName: "cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaFin: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_fin";
            tableName: "cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        duracionHoras: import("drizzle-orm/pg-core").PgColumn<{
            name: "duracion_horas";
            tableName: "cursos";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        mediaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "media_id";
            tableName: "cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        colorPortada: import("drizzle-orm/pg-core").PgColumn<{
            name: "color_portada";
            tableName: "cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        tipoCurso: import("drizzle-orm/pg-core").PgColumn<{
            name: "tipo_curso";
            tableName: "cursos";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "INDUCCION" | "GESTION" | "TECNICO" | "HERRAMIENTAS" | "DESARROLLO";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: ["INDUCCION", "GESTION", "TECNICO", "HERRAMIENTAS", "DESARROLLO"];
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "cursos";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Grupos de asignación para organizar estudiantes
 */
export declare const grupoAsignacionTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "grupos_asignacion";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "grupos_asignacion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        nombre: import("drizzle-orm/pg-core").PgColumn<{
            name: "nombre";
            tableName: "grupos_asignacion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        supervisorPrincipalId: import("drizzle-orm/pg-core").PgColumn<{
            name: "supervisor_principal_id";
            tableName: "grupos_asignacion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        descripcion: import("drizzle-orm/pg-core").PgColumn<{
            name: "descripcion";
            tableName: "grupos_asignacion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "grupos_asignacion";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "grupos_asignacion";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "grupos_asignacion";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Relación muchos-a-muchos: Grupos - Usuarios
 */
export declare const grupoUsuarioTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "grupo_usuarios";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "grupo_usuarios";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        grupoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "grupo_id";
            tableName: "grupo_usuarios";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "grupo_usuarios";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fechaAsignacion: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_asignacion";
            tableName: "grupo_usuarios";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Relación muchos-a-muchos: Grupos - Supervisores adicionales
 */
export declare const grupoSupervisorTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "grupo_supervisores";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "grupo_supervisores";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        grupoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "grupo_id";
            tableName: "grupo_supervisores";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        supervisorId: import("drizzle-orm/pg-core").PgColumn<{
            name: "supervisor_id";
            tableName: "grupo_supervisores";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fechaAsignacion: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_asignacion";
            tableName: "grupo_supervisores";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Módulos dentro de un curso
 */
export declare const moduloTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "modulos";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "modulos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        cursoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "curso_id";
            tableName: "modulos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        titulo: import("drizzle-orm/pg-core").PgColumn<{
            name: "titulo";
            tableName: "modulos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        descripcion: import("drizzle-orm/pg-core").PgColumn<{
            name: "descripcion";
            tableName: "modulos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        orden: import("drizzle-orm/pg-core").PgColumn<{
            name: "orden";
            tableName: "modulos";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "modulos";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "modulos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "modulos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Temas dentro de un módulo
 */
export declare const temaTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "temas";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        moduloId: import("drizzle-orm/pg-core").PgColumn<{
            name: "modulo_id";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        titulo: import("drizzle-orm/pg-core").PgColumn<{
            name: "titulo";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        contenido: import("drizzle-orm/pg-core").PgColumn<{
            name: "contenido";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        orden: import("drizzle-orm/pg-core").PgColumn<{
            name: "orden";
            tableName: "temas";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        videoLocal: import("drizzle-orm/pg-core").PgColumn<{
            name: "video_local";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        videoYoutube: import("drizzle-orm/pg-core").PgColumn<{
            name: "video_youtube";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        videoExterno: import("drizzle-orm/pg-core").PgColumn<{
            name: "video_externo";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        imagenId: import("drizzle-orm/pg-core").PgColumn<{
            name: "imagen_id";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        documentoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "documento_id";
            tableName: "temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "temas";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "temas";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "temas";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Archivos adicionales adjuntos a temas
 */
export declare const archivoAdicionalTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "archivos_adicionales";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "archivos_adicionales";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        temaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "tema_id";
            tableName: "archivos_adicionales";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        nombre: import("drizzle-orm/pg-core").PgColumn<{
            name: "nombre";
            tableName: "archivos_adicionales";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        archivo: import("drizzle-orm/pg-core").PgColumn<{
            name: "archivo";
            tableName: "archivos_adicionales";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        orden: import("drizzle-orm/pg-core").PgColumn<{
            name: "orden";
            tableName: "archivos_adicionales";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "archivos_adicionales";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Quiz asociado a un módulo
 */
export declare const quizTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "quizzes";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "quizzes";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        moduloId: import("drizzle-orm/pg-core").PgColumn<{
            name: "modulo_id";
            tableName: "quizzes";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        titulo: import("drizzle-orm/pg-core").PgColumn<{
            name: "titulo";
            tableName: "quizzes";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        instrucciones: import("drizzle-orm/pg-core").PgColumn<{
            name: "instrucciones";
            tableName: "quizzes";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        mediaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "media_id";
            tableName: "quizzes";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        puntajeMinimoAprobacion: import("drizzle-orm/pg-core").PgColumn<{
            name: "puntaje_minimo_aprobacion";
            tableName: "quizzes";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        tiempoLimiteMinutos: import("drizzle-orm/pg-core").PgColumn<{
            name: "tiempo_limite_minutos";
            tableName: "quizzes";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "quizzes";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "quizzes";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "quizzes";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Preguntas de un quiz
 */
export declare const preguntaTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "preguntas";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "preguntas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        quizId: import("drizzle-orm/pg-core").PgColumn<{
            name: "quiz_id";
            tableName: "preguntas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        texto: import("drizzle-orm/pg-core").PgColumn<{
            name: "texto";
            tableName: "preguntas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        puntaje: import("drizzle-orm/pg-core").PgColumn<{
            name: "puntaje";
            tableName: "preguntas";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        orden: import("drizzle-orm/pg-core").PgColumn<{
            name: "orden";
            tableName: "preguntas";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        archivoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "archivo_id";
            tableName: "preguntas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "preguntas";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "preguntas";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Opciones de respuesta para preguntas
 */
export declare const opcionTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "opciones";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "opciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        preguntaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "pregunta_id";
            tableName: "opciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        texto: import("drizzle-orm/pg-core").PgColumn<{
            name: "texto";
            tableName: "opciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        esCorrecta: import("drizzle-orm/pg-core").PgColumn<{
            name: "es_correcta";
            tableName: "opciones";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        orden: import("drizzle-orm/pg-core").PgColumn<{
            name: "orden";
            tableName: "opciones";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "opciones";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Progreso de un usuario en un curso
 */
export declare const progresoCursoTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "progreso_cursos";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "progreso_cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "progreso_cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        cursoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "curso_id";
            tableName: "progreso_cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        completado: import("drizzle-orm/pg-core").PgColumn<{
            name: "completado";
            tableName: "progreso_cursos";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaCompletado: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_completado";
            tableName: "progreso_cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        encuestaCompletada: import("drizzle-orm/pg-core").PgColumn<{
            name: "encuesta_completada";
            tableName: "progreso_cursos";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        certificadoDescargado: import("drizzle-orm/pg-core").PgColumn<{
            name: "certificado_descargado";
            tableName: "progreso_cursos";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaDescargaCertificado: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_descarga_certificado";
            tableName: "progreso_cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        porcentajeProgreso: import("drizzle-orm/pg-core").PgColumn<{
            name: "porcentaje_progreso";
            tableName: "progreso_cursos";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "progreso_cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "progreso_cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Relación: Módulos completados por usuario en un curso
 */
export declare const progresoModuloTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "progreso_modulos";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "progreso_modulos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        progresoCursoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "progreso_curso_id";
            tableName: "progreso_modulos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        moduloId: import("drizzle-orm/pg-core").PgColumn<{
            name: "modulo_id";
            tableName: "progreso_modulos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fechaCompletado: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_completado";
            tableName: "progreso_modulos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Progreso de un usuario en un tema específico
 */
export declare const progresoTemaTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "progreso_temas";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "progreso_temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "progreso_temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        temaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "tema_id";
            tableName: "progreso_temas";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        completado: import("drizzle-orm/pg-core").PgColumn<{
            name: "completado";
            tableName: "progreso_temas";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaCompletado: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_completado";
            tableName: "progreso_temas";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "progreso_temas";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "progreso_temas";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Respuestas de usuarios a preguntas de quiz
 */
export declare const respuestaUsuarioTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "respuestas_usuario";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "respuestas_usuario";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "respuestas_usuario";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        preguntaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "pregunta_id";
            tableName: "respuestas_usuario";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        opcionSeleccionadaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "opcion_seleccionada_id";
            tableName: "respuestas_usuario";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "respuestas_usuario";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Resultados finales de quizzes por usuario
 */
export declare const resultadoQuizTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "resultados_quiz";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "resultados_quiz";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "resultados_quiz";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        quizId: import("drizzle-orm/pg-core").PgColumn<{
            name: "quiz_id";
            tableName: "resultados_quiz";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        puntaje: import("drizzle-orm/pg-core").PgColumn<{
            name: "puntaje";
            tableName: "resultados_quiz";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        puntajePorcentaje: import("drizzle-orm/pg-core").PgColumn<{
            name: "puntaje_porcentaje";
            tableName: "resultados_quiz";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        aprobado: import("drizzle-orm/pg-core").PgColumn<{
            name: "aprobado";
            tableName: "resultados_quiz";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        respuestasJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "respuestas_json";
            tableName: "resultados_quiz";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaRealizacion: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_realizacion";
            tableName: "resultados_quiz";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        tiempoEmpleadoSegundos: import("drizzle-orm/pg-core").PgColumn<{
            name: "tiempo_empleado_segundos";
            tableName: "resultados_quiz";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Learning Paths - Rutas de aprendizaje predefinidas
 * Permiten agrupar múltiples cursos en una secuencia ordenada
 */
export declare const learningPathTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "learning_paths";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        nombre: import("drizzle-orm/pg-core").PgColumn<{
            name: "nombre";
            tableName: "learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        descripcion: import("drizzle-orm/pg-core").PgColumn<{
            name: "descripcion";
            tableName: "learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        categoria: import("drizzle-orm/pg-core").PgColumn<{
            name: "categoria";
            tableName: "learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        duracionEstimadaHoras: import("drizzle-orm/pg-core").PgColumn<{
            name: "duracion_estimada_horas";
            tableName: "learning_paths";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        mediaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "media_id";
            tableName: "learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        activo: import("drizzle-orm/pg-core").PgColumn<{
            name: "activo";
            tableName: "learning_paths";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        requiereAprobacionSecuencial: import("drizzle-orm/pg-core").PgColumn<{
            name: "requiere_aprobacion_secuencial";
            tableName: "learning_paths";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "learning_paths";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "learning_paths";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Relación: Cursos dentro de un Learning Path
 * Define el orden secuencial de los cursos
 */
export declare const learningPathCursoTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "learning_path_cursos";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "learning_path_cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        learningPathId: import("drizzle-orm/pg-core").PgColumn<{
            name: "learning_path_id";
            tableName: "learning_path_cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        cursoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "curso_id";
            tableName: "learning_path_cursos";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        orden: import("drizzle-orm/pg-core").PgColumn<{
            name: "orden";
            tableName: "learning_path_cursos";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        obligatorio: import("drizzle-orm/pg-core").PgColumn<{
            name: "obligatorio";
            tableName: "learning_path_cursos";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        duracionEstimadaDias: import("drizzle-orm/pg-core").PgColumn<{
            name: "duracion_estimada_dias";
            tableName: "learning_path_cursos";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "learning_path_cursos";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Progreso de un usuario en un Learning Path completo
 */
export declare const progresoLearningPathTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "progreso_learning_paths";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "progreso_learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "progreso_learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        learningPathId: import("drizzle-orm/pg-core").PgColumn<{
            name: "learning_path_id";
            tableName: "progreso_learning_paths";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        porcentajeCompletado: import("drizzle-orm/pg-core").PgColumn<{
            name: "porcentaje_completado";
            tableName: "progreso_learning_paths";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        cursosCompletados: import("drizzle-orm/pg-core").PgColumn<{
            name: "cursos_completados";
            tableName: "progreso_learning_paths";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        totalCursos: import("drizzle-orm/pg-core").PgColumn<{
            name: "total_cursos";
            tableName: "progreso_learning_paths";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        completado: import("drizzle-orm/pg-core").PgColumn<{
            name: "completado";
            tableName: "progreso_learning_paths";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaCompletado: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_completado";
            tableName: "progreso_learning_paths";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaInicio: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_inicio";
            tableName: "progreso_learning_paths";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaLimite: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_limite";
            tableName: "progreso_learning_paths";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "progreso_learning_paths";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "progreso_learning_paths";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Asignaciones de Learning Paths
 * Registra quién asignó el path completo
 */
export declare const asignacionLearningPathTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "asignaciones_learning_path";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "asignaciones_learning_path";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        learningPathId: import("drizzle-orm/pg-core").PgColumn<{
            name: "learning_path_id";
            tableName: "asignaciones_learning_path";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "asignaciones_learning_path";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        asignadoPorId: import("drizzle-orm/pg-core").PgColumn<{
            name: "asignado_por_id";
            tableName: "asignaciones_learning_path";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fechaLimite: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_limite";
            tableName: "asignaciones_learning_path";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        prioridad: import("drizzle-orm/pg-core").PgColumn<{
            name: "prioridad";
            tableName: "asignaciones_learning_path";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        notas: import("drizzle-orm/pg-core").PgColumn<{
            name: "notas";
            tableName: "asignaciones_learning_path";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fecha: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha";
            tableName: "asignaciones_learning_path";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Historial de asignaciones de cursos a usuarios/grupos
 */
export declare const asignacionTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "asignaciones";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "asignaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        cursoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "curso_id";
            tableName: "asignaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "asignaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        grupoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "grupo_id";
            tableName: "asignaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        metodo: import("drizzle-orm/pg-core").PgColumn<{
            name: "metodo";
            tableName: "asignaciones";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "manual" | "grupo" | "automatico";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["manual", "grupo", "automatico"];
            baseColumn: never;
        }, {}, {}>;
        asignadoPorId: import("drizzle-orm/pg-core").PgColumn<{
            name: "asignado_por_id";
            tableName: "asignaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fecha: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha";
            tableName: "asignaciones";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        notas: import("drizzle-orm/pg-core").PgColumn<{
            name: "notas";
            tableName: "asignaciones";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Feedback de usuarios sobre temas
 */
export declare const feedbackTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "feedback";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "feedback";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "feedback";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        temaId: import("drizzle-orm/pg-core").PgColumn<{
            name: "tema_id";
            tableName: "feedback";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        puntuacion: import("drizzle-orm/pg-core").PgColumn<{
            name: "puntuacion";
            tableName: "feedback";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        comentario: import("drizzle-orm/pg-core").PgColumn<{
            name: "comentario";
            tableName: "feedback";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "feedback";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Encuestas de satisfacción post-curso
 */
export declare const encuestaSatisfaccionTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "encuestas_satisfaccion";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        cursoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "curso_id";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        departamento: import("drizzle-orm/pg-core").PgColumn<{
            name: "departamento";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "CONTABILIDAD" | "COBROS" | "COMPUTO" | "EXPERIENCIA_AL_CLIENTE" | "FINANZAS" | "GERENCIA" | "ITICO" | "LEGAL" | "NEGOCIOS" | "PROCESOS" | "RECURSOS_HUMANOS" | "SERVICIOS_GENERALES" | "TRAMITE";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["CONTABILIDAD", "COBROS", "COMPUTO", "EXPERIENCIA_AL_CLIENTE", "FINANZAS", "GERENCIA", "ITICO", "LEGAL", "NEGOCIOS", "PROCESOS", "RECURSOS_HUMANOS", "SERVICIOS_GENERALES", "TRAMITE"];
            baseColumn: never;
        }, {}, {}>;
        cargo: import("drizzle-orm/pg-core").PgColumn<{
            name: "cargo";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "Asistente" | "Analista" | "Oficial_Profesional" | "Coordinador" | "Encargada_Supervisor" | "Jefe" | "Gerente";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["Asistente", "Analista", "Oficial_Profesional", "Coordinador", "Encargada_Supervisor", "Jefe", "Gerente"];
            baseColumn: never;
        }, {}, {}>;
        expositor: import("drizzle-orm/pg-core").PgColumn<{
            name: "expositor";
            tableName: "encuestas_satisfaccion";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        utilidad: import("drizzle-orm/pg-core").PgColumn<{
            name: "utilidad";
            tableName: "encuestas_satisfaccion";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        satisfaccion: import("drizzle-orm/pg-core").PgColumn<{
            name: "satisfaccion";
            tableName: "encuestas_satisfaccion";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        aprendido: import("drizzle-orm/pg-core").PgColumn<{
            name: "aprendido";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        lugar: import("drizzle-orm/pg-core").PgColumn<{
            name: "lugar";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "OFICINA" | "CASA" | "TRANSPORTE";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["OFICINA", "CASA", "TRANSPORTE"];
            baseColumn: never;
        }, {}, {}>;
        rol: import("drizzle-orm/pg-core").PgColumn<{
            name: "rol";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "Participante" | "Expositor" | "Organizador" | "Otro";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["Participante", "Expositor", "Organizador", "Otro"];
            baseColumn: never;
        }, {}, {}>;
        recomendacion: import("drizzle-orm/pg-core").PgColumn<{
            name: "recomendacion";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        comentariosCurso: import("drizzle-orm/pg-core").PgColumn<{
            name: "comentarios_curso";
            tableName: "encuestas_satisfaccion";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fecha: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha";
            tableName: "encuestas_satisfaccion";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Certificados generados para usuarios
 */
export declare const certificadoTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "certificados";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "certificados";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "certificados";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        cursoId: import("drizzle-orm/pg-core").PgColumn<{
            name: "curso_id";
            tableName: "certificados";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        codigo: import("drizzle-orm/pg-core").PgColumn<{
            name: "codigo";
            tableName: "certificados";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        archivo: import("drizzle-orm/pg-core").PgColumn<{
            name: "archivo";
            tableName: "certificados";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        fechaGeneracion: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_generacion";
            tableName: "certificados";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        fechaDescarga: import("drizzle-orm/pg-core").PgColumn<{
            name: "fecha_descarga";
            tableName: "certificados";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        datosJson: import("drizzle-orm/pg-core").PgColumn<{
            name: "datos_json";
            tableName: "certificados";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Log de actividad del sistema
 */
export declare const actividadLogTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "actividad_log";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "actividad_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "actividad_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        tipo: import("drizzle-orm/pg-core").PgColumn<{
            name: "tipo";
            tableName: "actividad_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        entidadTipo: import("drizzle-orm/pg-core").PgColumn<{
            name: "entidad_tipo";
            tableName: "actividad_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        entidadId: import("drizzle-orm/pg-core").PgColumn<{
            name: "entidad_id";
            tableName: "actividad_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        descripcion: import("drizzle-orm/pg-core").PgColumn<{
            name: "descripcion";
            tableName: "actividad_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        metadata: import("drizzle-orm/pg-core").PgColumn<{
            name: "metadata";
            tableName: "actividad_log";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "actividad_log";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export type PerfilUsuario = typeof perfilUsuarioTable.$inferSelect;
export type Curso = typeof cursoTable.$inferSelect;
export type GrupoAsignacion = typeof grupoAsignacionTable.$inferSelect;
export type GrupoUsuario = typeof grupoUsuarioTable.$inferSelect;
export type GrupoSupervisor = typeof grupoSupervisorTable.$inferSelect;
export type Modulo = typeof moduloTable.$inferSelect;
export type Tema = typeof temaTable.$inferSelect;
export type ArchivoAdicional = typeof archivoAdicionalTable.$inferSelect;
export type Quiz = typeof quizTable.$inferSelect;
export type Pregunta = typeof preguntaTable.$inferSelect;
export type Opcion = typeof opcionTable.$inferSelect;
export type ProgresoCurso = typeof progresoCursoTable.$inferSelect;
export type ProgresoModulo = typeof progresoModuloTable.$inferSelect;
export type ProgresoTema = typeof progresoTemaTable.$inferSelect;
export type RespuestaUsuario = typeof respuestaUsuarioTable.$inferSelect;
export type ResultadoQuiz = typeof resultadoQuizTable.$inferSelect;
export type Asignacion = typeof asignacionTable.$inferSelect;
export type Feedback = typeof feedbackTable.$inferSelect;
export type EncuestaSatisfaccion = typeof encuestaSatisfaccionTable.$inferSelect;
export type Certificado = typeof certificadoTable.$inferSelect;
export type ActividadLog = typeof actividadLogTable.$inferSelect;
export type LearningPath = typeof learningPathTable.$inferSelect;
export type LearningPathCurso = typeof learningPathCursoTable.$inferSelect;
export type ProgresoLearningPath = typeof progresoLearningPathTable.$inferSelect;
export type AsignacionLearningPath = typeof asignacionLearningPathTable.$inferSelect;
export type RolCapacitaciones = typeof rolCapacitacionesEnum.enumValues[number];
export type TipoCurso = typeof tipoCursoEnum.enumValues[number];
export type MetodoAsignacion = typeof metodoAsignacionEnum.enumValues[number];
export type Departamento = typeof departamentoEnum.enumValues[number];
export type Cargo = typeof cargoEnum.enumValues[number];
export type Lugar = typeof lugarEnum.enumValues[number];
export type RolEncuesta = typeof rolEncuestaEnum.enumValues[number];
//# sourceMappingURL=academy-lms.schema.d.ts.map