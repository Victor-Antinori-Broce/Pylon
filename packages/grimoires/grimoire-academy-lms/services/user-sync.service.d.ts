/**
 * Academy LMS - User Sync Service
 *
 * Servicio para sincronización de usuarios desde sistemas externos.
 * Soporta importación masiva, validación y mapeo de roles.
 */
import { z } from "zod";
export interface UsuarioExterno {
    idExterno: string;
    email: string;
    nombre: string;
    apellido?: string;
    departamento?: string;
    cargo?: string;
    numeroColaborador?: string;
    telefono?: string;
    activo?: boolean;
    metadata?: Record<string, unknown>;
}
export interface SyncResult {
    exitosos: number;
    fallidos: number;
    creados: number;
    actualizados: number;
    errores: Array<{
        usuario: string;
        error: string;
    }>;
}
export interface RolMapping {
    campoExterno: string;
    valores: Record<string, string>;
    default: string;
}
export interface SyncConfig {
    proveedor: "csv" | "api" | "ldap" | "saml";
    mapeoRoles?: RolMapping;
    crearUsuariosNuevos?: boolean;
    actualizarExistentes?: boolean;
    desactivarNoEncontrados?: boolean;
    campoEmail?: string;
    campoNombre?: string;
    campoDepartamento?: string;
    campoCargo?: string;
}
export declare const usuarioExternoSchema: z.ZodObject<{
    idExterno: z.ZodString;
    email: z.ZodString;
    nombre: z.ZodString;
    apellido: z.ZodOptional<z.ZodString>;
    departamento: z.ZodOptional<z.ZodString>;
    cargo: z.ZodOptional<z.ZodString>;
    numeroColaborador: z.ZodOptional<z.ZodString>;
    telefono: z.ZodOptional<z.ZodString>;
    activo: z.ZodDefault<z.ZodBoolean>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    activo: boolean;
    nombre: string;
    idExterno: string;
    metadata?: Record<string, unknown> | undefined;
    departamento?: string | undefined;
    cargo?: string | undefined;
    apellido?: string | undefined;
    numeroColaborador?: string | undefined;
    telefono?: string | undefined;
}, {
    email: string;
    nombre: string;
    idExterno: string;
    metadata?: Record<string, unknown> | undefined;
    departamento?: string | undefined;
    cargo?: string | undefined;
    activo?: boolean | undefined;
    apellido?: string | undefined;
    numeroColaborador?: string | undefined;
    telefono?: string | undefined;
}>;
export declare const syncConfigSchema: z.ZodObject<{
    proveedor: z.ZodEnum<["csv", "api", "ldap", "saml"]>;
    mapeoRoles: z.ZodOptional<z.ZodObject<{
        campoExterno: z.ZodString;
        valores: z.ZodRecord<z.ZodString, z.ZodString>;
        default: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        default: string;
        campoExterno: string;
        valores: Record<string, string>;
    }, {
        default: string;
        campoExterno: string;
        valores: Record<string, string>;
    }>>;
    crearUsuariosNuevos: z.ZodDefault<z.ZodBoolean>;
    actualizarExistentes: z.ZodDefault<z.ZodBoolean>;
    desactivarNoEncontrados: z.ZodDefault<z.ZodBoolean>;
    campoEmail: z.ZodDefault<z.ZodString>;
    campoNombre: z.ZodDefault<z.ZodString>;
    campoDepartamento: z.ZodOptional<z.ZodString>;
    campoCargo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    proveedor: "api" | "csv" | "ldap" | "saml";
    crearUsuariosNuevos: boolean;
    actualizarExistentes: boolean;
    desactivarNoEncontrados: boolean;
    campoEmail: string;
    campoNombre: string;
    mapeoRoles?: {
        default: string;
        campoExterno: string;
        valores: Record<string, string>;
    } | undefined;
    campoDepartamento?: string | undefined;
    campoCargo?: string | undefined;
}, {
    proveedor: "api" | "csv" | "ldap" | "saml";
    mapeoRoles?: {
        default: string;
        campoExterno: string;
        valores: Record<string, string>;
    } | undefined;
    crearUsuariosNuevos?: boolean | undefined;
    actualizarExistentes?: boolean | undefined;
    desactivarNoEncontrados?: boolean | undefined;
    campoEmail?: string | undefined;
    campoNombre?: string | undefined;
    campoDepartamento?: string | undefined;
    campoCargo?: string | undefined;
}>;
/**
 * Mapeo de roles para sistema Pacifico
 */
export declare const mapeoRolesPacifico: RolMapping;
/**
 * Mapeo de departamentos estándar
 */
export declare const mapeoDepartamentos: Record<string, string>;
/**
 * Mapeo de cargos estándar
 */
export declare const mapeoCargos: Record<string, string>;
/**
 * Valida un usuario externo
 */
export declare function validarUsuarioExterno(data: unknown): {
    valido: true;
    usuario: UsuarioExterno;
} | {
    valido: false;
    errores: string[];
};
/**
 * Valida una lista de usuarios externos
 */
export declare function validarUsuariosExternos(data: unknown[]): {
    validos: UsuarioExterno[];
    invalidos: Array<{
        index: number;
        data: unknown;
        errores: string[];
    }>;
};
/**
 * Mapea un rol externo al rol interno
 */
export declare function mapearRol(rolExterno: string, mapeo: RolMapping): string;
/**
 * Mapea un departamento al formato interno
 */
export declare function mapearDepartamento(deptoExterno: string): string | undefined;
/**
 * Mapea un cargo al formato interno
 */
export declare function mapearCargo(cargoExterno: string): string | undefined;
/**
 * Normaliza datos de usuario externo
 */
export declare function normalizarUsuarioExterno(usuario: UsuarioExterno, config: SyncConfig): UsuarioExterno;
/**
 * Parsea CSV a usuarios externos
 * Formato esperado: idExterno,email,nombre,apellido,departamento,cargo,...
 */
export declare function parsearCSV(csvContent: string): UsuarioExterno[];
export interface SyncOptions {
    db: {
        query: {
            perfilUsuarioTable: {
                findFirst: (args: {
                    where: unknown;
                }) => Promise<{
                    id: string;
                } | null>;
            };
        };
        insert: (table: unknown) => {
            values: (data: unknown) => {
                returning: () => Promise<{
                    id: string;
                }[]>;
                onConflictDoUpdate: (opts: {
                    target: unknown;
                    set: unknown;
                }) => {
                    returning: () => Promise<{
                        id: string;
                    }[]>;
                };
            };
        };
        update: (table: unknown) => {
            set: (data: unknown) => {
                where: (condition: unknown) => Promise<{
                    rowCount: number;
                }>;
            };
        };
    };
    getUserByEmail: (email: string) => Promise<{
        id: string;
    } | null>;
    createUser: (data: {
        email: string;
        name: string;
        metadata?: Record<string, unknown>;
    }) => Promise<{
        id: string;
    }>;
}
/**
 * Sincroniza usuarios externos con el sistema
 * Nota: Esta es una función de ejemplo que debe adaptarse a tu implementación específica
 */
export declare function sincronizarUsuarios(usuarios: UsuarioExterno[], config: SyncConfig, options: SyncOptions): Promise<SyncResult>;
/**
 * Genera un resumen de sincronización
 */
export declare function generarResumenSync(result: SyncResult): string;
//# sourceMappingURL=user-sync.service.d.ts.map