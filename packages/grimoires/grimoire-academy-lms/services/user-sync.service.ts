// @ts-nocheck
/**
 * Academy LMS - User Sync Service
 *
 * Servicio para sincronización de usuarios desde sistemas externos.
 * Soporta importación masiva, validación y mapeo de roles.
 */

import { z } from "zod";

// ============================================
// TIPOS Y ENUMS
// ============================================

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

// ============================================
// SCHEMAS DE VALIDACIÓN
// ============================================

export const usuarioExternoSchema = z.object({
  idExterno: z.string().min(1),
  email: z.string().email(),
  nombre: z.string().min(1),
  apellido: z.string().optional(),
  departamento: z.string().optional(),
  cargo: z.string().optional(),
  numeroColaborador: z.string().optional(),
  telefono: z.string().optional(),
  activo: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export const syncConfigSchema = z.object({
  proveedor: z.enum(["csv", "api", "ldap", "saml"]),
  mapeoRoles: z
    .object({
      campoExterno: z.string(),
      valores: z.record(z.string()),
      default: z.string(),
    })
    .optional(),
  crearUsuariosNuevos: z.boolean().default(true),
  actualizarExistentes: z.boolean().default(true),
  desactivarNoEncontrados: z.boolean().default(false),
  campoEmail: z.string().default("email"),
  campoNombre: z.string().default("nombre"),
  campoDepartamento: z.string().optional(),
  campoCargo: z.string().optional(),
});

// ============================================
// MAPEOS PREDEFINIDOS
// ============================================

/**
 * Mapeo de roles para sistema Pacifico
 */
export const mapeoRolesPacifico: RolMapping = {
  campoExterno: "rol",
  valores: {
    Administrador: "administrador",
    Supervisor: "supervisor",
    Oficial: "estudiante",
    Asistente: "estudiante",
    Analista: "estudiante",
    "Back Office": "estudiante",
    Usuario: "estudiante",
  },
  default: "estudiante",
};

/**
 * Mapeo de departamentos estándar
 */
export const mapeoDepartamentos: Record<string, string> = {
  CONTABILIDAD: "CONTABILIDAD",
  COBROS: "COBROS",
  COMPUTO: "COMPUTO",
  "EXPERIENCIA AL CLIENTE": "EXPERIENCIA_AL_CLIENTE",
  FINANZAS: "FINANZAS",
  GERENCIA: "GERENCIA",
  ITICO: "ITICO",
  LEGAL: "LEGAL",
  NEGOCIOS: "NEGOCIOS",
  PROCESOS: "PROCESOS",
  "RECURSOS HUMANOS": "RECURSOS_HUMANOS",
  "SERVICIOS GENERALES": "SERVICIOS_GENERALES",
  TRAMITE: "TRAMITE",
};

/**
 * Mapeo de cargos estándar
 */
export const mapeoCargos: Record<string, string> = {
  Asistente: "Asistente",
  Analista: "Analista",
  "Oficial Profesional": "Oficial_Profesional",
  Coordinador: "Coordinador",
  "Encargada/Supervisor": "Encargada_Supervisor",
  Jefe: "Jefe",
  Gerente: "Gerente",
};

// ============================================
// FUNCIONES DE VALIDACIÓN
// ============================================

/**
 * Valida un usuario externo
 */
export function validarUsuarioExterno(
  data: unknown
): { valido: true; usuario: UsuarioExterno } | { valido: false; errores: string[] } {
  const result = usuarioExternoSchema.safeParse(data);

  if (result.success) {
    return { valido: true, usuario: result.data };
  }

  return {
    valido: false,
    errores: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

/**
 * Valida una lista de usuarios externos
 */
export function validarUsuariosExternos(data: unknown[]): {
  validos: UsuarioExterno[];
  invalidos: Array<{ index: number; data: unknown; errores: string[] }>;
} {
  const validos: UsuarioExterno[] = [];
  const invalidos: Array<{ index: number; data: unknown; errores: string[] }> = [];

  data.forEach((item, index) => {
    const result = validarUsuarioExterno(item);
    if (result.valido) {
      validos.push(result.usuario);
    } else {
      invalidos.push({ index, data: item, errores: result.errores });
    }
  });

  return { validos, invalidos };
}

// ============================================
// FUNCIONES DE MAPEO
// ============================================

/**
 * Mapea un rol externo al rol interno
 */
export function mapearRol(rolExterno: string, mapeo: RolMapping): string {
  const rolNormalizado = rolExterno.trim();
  return mapeo.valores[rolNormalizado] || mapeo.default;
}

/**
 * Mapea un departamento al formato interno
 */
export function mapearDepartamento(deptoExterno: string): string | undefined {
  const deptoNormalizado = deptoExterno.toUpperCase().trim();
  return mapeoDepartamentos[deptoNormalizado];
}

/**
 * Mapea un cargo al formato interno
 */
export function mapearCargo(cargoExterno: string): string | undefined {
  const cargoNormalizado = cargoExterno.trim();
  return mapeoCargos[cargoNormalizado];
}

/**
 * Normaliza datos de usuario externo
 */
export function normalizarUsuarioExterno(
  usuario: UsuarioExterno,
  config: SyncConfig
): UsuarioExterno {
  return {
    ...usuario,
    email: usuario.email.toLowerCase().trim(),
    nombre: usuario.nombre.trim(),
    apellido: usuario.apellido?.trim(),
    departamento: usuario.departamento ? mapearDepartamento(usuario.departamento) : undefined,
    cargo: usuario.cargo ? mapearCargo(usuario.cargo) : undefined,
  };
}

// ============================================
// PROCESAMIENTO CSV
// ============================================

/**
 * Parsea CSV a usuarios externos
 * Formato esperado: idExterno,email,nombre,apellido,departamento,cargo,...
 */
export function parsearCSV(csvContent: string): UsuarioExterno[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const usuarios: UsuarioExterno[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    const usuario: UsuarioExterno = {
      idExterno: row.idExterno || row.id || row.ID || String(i),
      email: row.email || row.Email || row.EMAIL || "",
      nombre: row.nombre || row.name || row.Nombre || row.Name || "",
      apellido: row.apellido || row.lastname || row.Apellido,
      departamento: row.departamento || row.department || row.Departamento,
      cargo: row.cargo || row.position || row.Cargo,
      numeroColaborador: row.numeroColaborador || row.employeeNumber,
      telefono: row.telefono || row.phone || row.Telefono,
      activo: row.activo?.toLowerCase() !== "false" && row.active?.toLowerCase() !== "false",
    };

    usuarios.push(usuario);
  }

  return usuarios;
}

// ============================================
// FUNCIONES DE SINCRONIZACIÓN
// ============================================

export interface SyncOptions {
  db: {
    query: {
      perfilUsuarioTable: {
        findFirst: (args: { where: unknown }) => Promise<{ id: string } | null>;
      };
    };
    insert: (table: unknown) => {
      values: (data: unknown) => {
        returning: () => Promise<{ id: string }[]>;
        onConflictDoUpdate: (opts: { target: unknown; set: unknown }) => {
          returning: () => Promise<{ id: string }[]>;
        };
      };
    };
    update: (table: unknown) => {
      set: (data: unknown) => {
        where: (condition: unknown) => Promise<{ rowCount: number }>;
      };
    };
  };
  getUserByEmail: (email: string) => Promise<{ id: string } | null>;
  createUser: (data: {
    email: string;
    name: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ id: string }>;
}

/**
 * Sincroniza usuarios externos con el sistema
 * Nota: Esta es una función de ejemplo que debe adaptarse a tu implementación específica
 */
export async function sincronizarUsuarios(
  usuarios: UsuarioExterno[],
  config: SyncConfig,
  options: SyncOptions
): Promise<SyncResult> {
  const result: SyncResult = {
    exitosos: 0,
    fallidos: 0,
    creados: 0,
    actualizados: 0,
    errores: [],
  };

  for (const usuario of usuarios) {
    try {
      const usuarioNormalizado = normalizarUsuarioExterno(usuario, config);

      // Validar usuario
      const validacion = validarUsuarioExterno(usuarioNormalizado);
      if (!validacion.valido) {
        result.fallidos++;
        result.errores.push({
          usuario: usuarioNormalizado.email,
          error: `Validación fallida: ${validacion.errores.join(", ")}`,
        });
        continue;
      }

      // Buscar usuario existente
      const userExistente = await options.getUserByEmail(usuarioNormalizado.email);

      if (userExistente) {
        // Actualizar usuario existente
        if (config.actualizarExistentes !== false) {
          // Actualizar perfil de capacitaciones
          const rol = config.mapeoRoles
            ? mapearRol(
                (usuarioNormalizado.metadata?.[config.mapeoRoles.campoExterno] as string) || "",
                config.mapeoRoles
              )
            : "estudiante";

          const { perfilUsuarioTable } = await import("../academy-lms.schema");
          await options.db
            .update(perfilUsuarioTable)
            .set({
              rolCapacitaciones: rol as "administrador" | "supervisor" | "estudiante",
              notas: `Sincronizado: ${new Date().toISOString()}`,
            })
            .where({ userId: userExistente.id });

          result.actualizados++;
        }
      } else {
        // Crear nuevo usuario
        if (config.crearUsuariosNuevos !== false) {
          const nuevoUser = await options.createUser({
            email: usuarioNormalizado.email,
            name: `${usuarioNormalizado.nombre} ${usuarioNormalizado.apellido || ""}`.trim(),
            metadata: {
              numeroColaborador: usuarioNormalizado.numeroColaborador,
              departamento: usuarioNormalizado.departamento,
              cargo: usuarioNormalizado.cargo,
              idExterno: usuarioNormalizado.idExterno,
            },
          });

          // Crear perfil de capacitaciones
          const rol = config.mapeoRoles
            ? mapearRol(
                (usuarioNormalizado.metadata?.[config.mapeoRoles.campoExterno] as string) || "",
                config.mapeoRoles
              )
            : "estudiante";

          const { perfilUsuarioTable } = await import("../academy-lms.schema");
          await options.db.insert(perfilUsuarioTable).values({
            userId: nuevoUser.id,
            rolCapacitaciones: rol as "administrador" | "supervisor" | "estudiante",
            notas: `Creado vía sincronización: ${new Date().toISOString()}`,
          });

          result.creados++;
        }
      }

      result.exitosos++;
    } catch (error) {
      result.fallidos++;
      result.errores.push({
        usuario: usuario.email,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return result;
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Genera un resumen de sincronización
 */
export function generarResumenSync(result: SyncResult): string {
  return `
Sincronización completada:
- Total procesados: ${result.exitosos + result.fallidos}
- Exitosos: ${result.exitosos}
- Fallidos: ${result.fallidos}
- Usuarios creados: ${result.creados}
- Usuarios actualizados: ${result.actualizados}
${
  result.errores.length > 0
    ? `
Errores:
${result.errores
  .slice(0, 10)
  .map((e) => `  - ${e.usuario}: ${e.error}`)
  .join("\n")}
${result.errores.length > 10 ? `  ... y ${result.errores.length - 10} errores más` : ""}
`
    : ""
}
  `.trim();
}
