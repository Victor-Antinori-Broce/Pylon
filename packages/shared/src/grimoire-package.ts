/**
 * ============================================================================
 * GRIMOIRE PACKAGE — Contrato estándar para paquetes npm de grimoires
 * ============================================================================
 *
 * Define la estructura que debe cumplir cualquier paquete npm instalable
 * como grimoire de GremiusCMS.
 *
 * Uso:
 *   - package.json → campo "gremius" cumple GrimoirePackage
 *   - grimoire.json (standalone) cumple GrimoirePackage
 *   - CLI valida antes de install
 *   - API valida antes de cargar desde node_modules
 */

/**
 * Dependencias de otro grimoire (por ID, no por nombre de paquete npm).
 * El loader resuelve el ID al paquete npm correspondiente.
 */
export interface GrimoireDependencies {
  /** IDs de grimoires requeridos (se instalan automáticamente) */
  grimoires?: string[];
  /** IDs de grimoires opcionales (se sugieren al usuario) */
  optional?: string[];
  /** Versiones mínimas requeridas de cada grimoire */
  grimoiresMinVersion?: Record<string, string>;
}

/**
 * Configuración de montaje del router del grimoire en la API.
 */
export interface GrimoireMountConfig {
  /** Ruta base del router (ej: /api/crm) */
  path?: string;
  /** Si requiere autenticación en todas las rutas */
  requireAuth?: boolean;
  /** Roles permitidos */
  allowedRoles?: string[];
}

/**
 * Definición de tabla expuesta por el grimoire para el schema merger.
 */
export interface GrimoireTableConfig {
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
 * Hooks de lifecycle del grimoire (opcional).
 */
export interface GrimoireLifecycleHooks {
  /** Ejecutado al montar el grimoire en la API */
  onStartup?: string;
  /** Ejecutado al desmontar el grimoire */
  onShutdown?: string;
}

/**
 * Contrato completo de un paquete npm de grimoire.
 *
 * Puede declararse en:
 *   1. Un archivo `grimoire.json` en la raíz del paquete.
 *   2. El campo `gremius` dentro del `package.json`.
 */
export interface GrimoirePackage {
  /** ID único del grimoire (ej: "grimoire-crm") */
  id: string;
  /** Nombre legible para humanos */
  name: string;
  /** Versión semver */
  version: string;
  /** Tipo siempre "grimoire" para paquetes npm */
  type: "grimoire";
  /** Descripción corta */
  description?: string;
  /** Icono (nombre de icono o URL) */
  icon?: string;
  /** Autor del paquete */
  author?: string;
  /** Categoría del grimoire */
  category?: "core" | "grimoire-core" | "optional" | string;
  /** Si es un grimoire core que siempre debe cargarse */
  core?: boolean;
  /** Ruta del admin en el frontend (ej: /g/crm) */
  adminRoute?: string;
  /** Tablas expuestas para el schema merger */
  tables?: (string | GrimoireTableConfig)[];
  /** Configuración de montaje del router */
  mount?: GrimoireMountConfig;
  /** Dependencias de otros grimoires */
  dependencies?: GrimoireDependencies;
  /** Hooks de lifecycle (nombres de funciones exportadas) */
  hooks?: GrimoireLifecycleHooks;
  /** Schema de OpenAPI que exporta el grimoire */
  openApi?: {
    tags?: Array<{ name: string; description?: string }>;
    paths?: Record<string, any>;
  };
  /** Si el grimoire maneja sus propias migraciones (no se mergea schema) */
  selfMigrating?: boolean;
}

/**
 * Versión mínima del contrato (solo campos requeridos).
 */
export type GrimoirePackageMinimal = Pick<
  GrimoirePackage,
  "id" | "name" | "version" | "type"
>;

/**
 * Valida si un objeto cumple el contrato mínimo de GrimoirePackage.
 * No valida semver ni estructura profunda.
 */
export function isValidGrimoirePackage(obj: unknown): obj is GrimoirePackage {
  if (typeof obj !== "object" || obj === null) return false;
  const pkg = obj as Record<string, unknown>;
  return (
    typeof pkg.id === "string" &&
    pkg.id.length > 0 &&
    typeof pkg.name === "string" &&
    pkg.name.length > 0 &&
    typeof pkg.version === "string" &&
    pkg.version.length > 0 &&
    pkg.type === "grimoire"
  );
}
