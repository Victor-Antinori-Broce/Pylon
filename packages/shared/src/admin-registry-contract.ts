/**
 * Contrato público del Admin Registry
 * ============================================================================
 *
 * `GET /api/admin/registry` es lo que hace que el panel de Kitsuden sea
 * **sustituible**: describe qué kons hay, qué tablas exponen y qué vistas
 * ofrecen, sin que el cliente sepa nada del backend.
 *
 * Eso importa estratégicamente. Directus y Strapi te encierran en su admin;
 * aquí el panel oficial es un CLIENTE de esta API, igual que lo sería uno
 * escrito en React por otra persona. Pero solo es cierto si el contrato está
 * versionado: sin versión, cualquier cambio interno rompe en silencio a quien
 * haya construido encima.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Reglas de evolución
 *
 * Dentro de una misma versión SOLO se permite:
 *   - añadir campos opcionales
 *   - añadir valores a un enum que el cliente ya trata con un `default`
 *
 * Requiere subir `ADMIN_REGISTRY_VERSION`:
 *   - quitar o renombrar un campo
 *   - cambiar el tipo o el significado de uno existente
 *   - volver obligatorio algo que era opcional
 *
 * El servidor manda la versión en el cuerpo y en la cabecera
 * `X-Kitsuden-Contract`, para que un cliente pueda decidir sin parsear.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Versión actual del contrato del registry. */
export const ADMIN_REGISTRY_VERSION = 1 as const;

/** Cabecera con la que el servidor anuncia la versión. */
export const CONTRACT_HEADER = "X-Kitsuden-Contract";

export interface AdminRegistryTable {
  name: string;
  label: string;
  icon?: string;
  description?: string;
  primaryKey?: string;
  searchableFields?: string[];
  filterableFields?: string[];
  readonly?: boolean;
}

export interface AdminRegistryView {
  id: string;
  /**
   * Un cliente que no reconozca un tipo debe caer a `grid`, no romperse: por
   * eso añadir tipos nuevos NO sube la versión del contrato.
   */
  type: "grid" | "kanban" | "calendar" | "custom" | "element";
  title: string;
  table?: string;
  /** @deprecated Vista Svelte acoplada al framework del admin. Usa `element`. */
  component?: string;
  /** Web Component agnóstico: nombre de la etiqueta. */
  element?: string;
  /** Artefacto compilado, relativo al paquete del kon. */
  src?: string;
  icon?: string;
  groupBy?: string;
  dateField?: string;
  titleField?: string;
}

export interface AdminRegistryKon {
  id: string;
  name: string;
  icon?: string;
  category: "core" | "content" | "data" | "esports";
  hasCustomView: boolean;
  tables: AdminRegistryTable[];
  views: AdminRegistryView[];
  defaultView: string;
  apiBase?: string;
}

/** Respuesta de `GET /api/admin/registry`. */
export interface AdminRegistryResponse {
  success: true;
  /** Versión del contrato. Compruébala antes de asumir la forma del resto. */
  contract: typeof ADMIN_REGISTRY_VERSION;
  kons: AdminRegistryKon[];
  total: number;
  withCustomViews: number;
  generatedAt: string;
}

/** Respuesta de `GET /api/admin/registry/:konId`. */
export interface AdminRegistryKonResponse {
  success: true;
  contract: typeof ADMIN_REGISTRY_VERSION;
  kon: AdminRegistryKon;
}

/**
 * Comprueba que la respuesta viene de una versión que el cliente entiende.
 *
 * Pensado para que un panel de terceros falle CLARO y pronto en vez de romperse
 * a mitad de render con un campo que ya no existe.
 */
export function assertSupportedContract(
  received: unknown,
  supported: number = ADMIN_REGISTRY_VERSION
): void {
  const version = (received as { contract?: unknown })?.contract;

  if (typeof version !== "number") {
    throw new Error(
      "La respuesta del admin registry no declara versión de contrato. " +
        "¿Estás hablando con un Kitsuden anterior a la v1?"
    );
  }
  if (version > supported) {
    throw new Error(
      `El admin registry habla el contrato v${version} y este cliente entiende hasta v${supported}. ` +
        "Actualiza el cliente."
    );
  }
}
