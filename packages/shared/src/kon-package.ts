/**
 * ============================================================================
 * KON PACKAGE — Contrato estándar para paquetes npm de kons
 * ============================================================================
 *
 * Define la estructura que debe cumplir cualquier paquete npm instalable
 * como kon de Kitsuden.
 *
 * Uso:
 *   - package.json → campo "kitsuden" cumple KonPackage
 *   - kon.json (standalone) cumple KonPackage
 *   - CLI valida antes de install
 *   - API valida antes de cargar desde node_modules
 */

/**
 * Dependencias de otro kon (por ID, no por nombre de paquete npm).
 * El loader resuelve el ID al paquete npm correspondiente.
 */
export interface KonDependencies {
  /** IDs de kons requeridos (se instalan automáticamente) */
  kons?: string[];
  /** IDs de kons opcionales (se sugieren al usuario) */
  optional?: string[];
  /** Versiones mínimas requeridas de cada kon */
  konsMinVersion?: Record<string, string>;
}

/**
 * Configuración de montaje del router del kon en la API.
 */
export interface KonMountConfig {
  /** Ruta base del router (ej: /api/crm) */
  path?: string;
  /** Si requiere autenticación en todas las rutas */
  requireAuth?: boolean;
  /** Roles permitidos */
  allowedRoles?: string[];
}

/**
 * Definición de tabla expuesta por el kon para el schema merger.
 */
export interface KonTableConfig {
  name: string;
  /** Nombre de la tabla en Drizzle (si difiere del name) */
  table?: string;
  label?: string;
  icon?: string;
  description?: string;
  primaryKey?: string;
  searchableFields?: string[];
  filterableFields?: string[];
  readonly?: boolean;
}

/**
 * Hooks de lifecycle del kon (opcional).
 */
export interface KonLifecycleHooks {
  /** Ejecutado al montar el kon en la API */
  onStartup?: string;
  /** Ejecutado al desmontar el kon */
  onShutdown?: string;
}

/**
 * Contrato completo de un paquete npm de kon.
 *
 * Puede declararse en:
 *   1. Un archivo `kon.json` en la raíz del paquete.
 *   2. El campo `kitsuden` dentro del `package.json`.
 */
export interface KonPackage {
  /** ID único del kon (ej: "kon-crm") */
  id: string;
  /** Nombre legible para humanos */
  name: string;
  /** Versión semver */
  version: string;
  /** Tipo siempre "kon" para paquetes npm */
  type: "kon";
  /** Descripción corta */
  description?: string;
  /** Icono (nombre de icono o URL) */
  icon?: string;
  /** Autor del paquete */
  author?: string;
  /** Categoría del kon */
  category?: "core" | "core-den" | "optional" | string;
  /** Si es un kon core que siempre debe cargarse */
  core?: boolean;
  /** Ruta del admin en el frontend (ej: /g/crm) */
  adminRoute?: string;
  /** Tablas expuestas para el schema merger */
  tables?: (string | KonTableConfig)[];
  /** Configuración de montaje del router */
  mount?: KonMountConfig;
  /** Dependencias de otros kons */
  dependencies?: KonDependencies;
  /** Hooks de lifecycle (nombres de funciones exportadas) */
  hooks?: KonLifecycleHooks;
  /** Schema de OpenAPI que exporta el kon */
  openApi?: {
    tags?: Array<{ name: string; description?: string }>;
    paths?: Record<string, any>;
  };
  /** Si el kon maneja sus propias migraciones (no se mergea schema) */
  selfMigrating?: boolean;
}

/**
 * Versión mínima del contrato (solo campos requeridos).
 */
export type KonPackageMinimal = Pick<KonPackage, "id" | "name" | "version" | "type">;

/**
 * Valida si un objeto cumple el contrato mínimo de KonPackage.
 * No valida semver ni estructura profunda.
 */
export function isValidKonPackage(obj: unknown): obj is KonPackage {
  if (typeof obj !== "object" || obj === null) return false;
  const pkg = obj as Record<string, unknown>;
  return (
    typeof pkg.id === "string" &&
    pkg.id.length > 0 &&
    typeof pkg.name === "string" &&
    pkg.name.length > 0 &&
    typeof pkg.version === "string" &&
    pkg.version.length > 0 &&
    pkg.type === "kon"
  );
}
