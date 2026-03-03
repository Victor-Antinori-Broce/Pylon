/**
 * ============================================================================
 * RLS QUERY BUILDER - Traductor de Reglas JSON a Condiciones Drizzle ORM
 * ============================================================================
 * 
 * FASE DE RESCATE: Optimización de RAM y RLS de Aplicación
 * 
 * Este módulo elimina el antipatrón de filtrar datos en memoria (.filter())
 * y traduce las reglas JSON de permisos a condiciones SQL nativas usando
 * los operadores de Drizzle ORM.
 * 
 * Antes (Mata-RAM):
 *   const all = await db.select().from(table); // 100,000 filas
 *   const filtered = all.filter(createRLSFilter(rules, user)); // En memoria
 * 
 * Después (Drizzle Application RLS):
 *   const whereCondition = buildDrizzleWhere(rules, user);
 *   const filtered = await db.select().from(table).where(whereCondition); // 5 filas
 * 
 * La lógica de negocio permanece igual (RLS a nivel de aplicación), pero
 * el trabajo pesado de filtrado se mueve a PostgreSQL.
 */

import { eq, ne, gt, lt, like, and, SQL, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════════════

export type RLSType = "admin" | "public" | "authenticated";

export type RLSRule = {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt";
  value: string;
};

export type PolicyJson = {
  readAccess: RLSType;
  writeAccess: RLSType;
  enableRLS: boolean;
  rlsRules?: RLSRule[];
};

export type RLSUser = {
  id: string;
  role?: string;
} | null;

// ═══════════════════════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════════════════════

const USER_ID_PLACEHOLDER = "__USER_ID__";

// ═══════════════════════════════════════════════════════════════════════════
// Funciones Públicas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construye una condición WHERE de Drizzle ORM a partir de reglas RLS JSON.
 * 
 * Esta función traduce reglas como:
 *   `{ field: "author_id", operator: "eq", value: "__USER_ID__" }`
 * 
 * A condiciones SQL como:
 *   `data->>'author_id' = 'user-123'`
 * 
 * @param rules - Array de reglas RLS desde policyJson.rlsRules
 * @param user - Usuario autenticado (para reemplazar __USER_ID__)
 * @returns Condición SQL de Drizzle o undefined si no hay filtros
 * 
 * @example
 * ```typescript
 * const rules = [
 *   { field: "author_id", operator: "eq", value: "__USER_ID__" },
 *   { field: "status", operator: "eq", value: "published" }
 * ];
 * 
 * const whereCondition = buildDrizzleWhere(rules, { id: "user-123" });
 * // Resultado: AND(data->>'author_id' = 'user-123', data->>'status' = 'published')
 * 
 * const results = await db
 *   .select()
 *   .from(dataEntries)
 *   .where(whereCondition);
 * ```
 */
export function buildDrizzleWhere(
  rules: RLSRule[] | undefined,
  user: RLSUser
): SQL | undefined {
  if (!rules || rules.length === 0) {
    return undefined;
  }

  const conditions: SQL[] = [];

  for (const rule of rules) {
    const condition = buildRuleCondition(rule, user);
    if (condition) {
      conditions.push(condition);
    }
  }

  if (conditions.length === 0) {
    return undefined;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  // Combinar todas las condiciones con AND
  return and(...conditions) as SQL;
}

/**
 * Construye una condición WHERE que incluye filtrado por datasetId + RLS.
 * 
 * Útil para endpoints que necesitan filtrar por dataset y aplicar RLS
 * en una sola query.
 * 
 * @param datasetId - ID del dataset a filtrar
 * @param rules - Reglas RLS opcionales
 * @param user - Usuario autenticado
 * @param tableDataColumn - Nombre de la columna JSONB (default: "data")
 * @returns Objeto con condiciones separadas o combinadas
 * 
 * @example
 * ```typescript
 * const { where, hasRLS } = buildDatasetWhere(
 *   "dataset-123",
 *   policy.rlsRules,
 *   currentUser,
 *   dataEntries
 * );
 * 
 * const results = await db
 *   .select()
 *   .from(dataEntries)
 *   .where(where);
 * ```
 */
export function buildDatasetWhere(
  datasetId: string,
  rules: RLSRule[] | undefined,
  user: RLSUser,
  dataColumn: string = "data"
): { where: SQL | undefined; hasRLS: boolean } {
  const rlsCondition = buildDrizzleWhere(rules, user);
  
  // Filtro por datasetId (siempre requerido)
  const datasetFilter = sql`${sql.raw("data_set_id")} = ${datasetId}`;
  
  if (rlsCondition) {
    return {
      where: and(datasetFilter, rlsCondition) as SQL,
      hasRLS: true
    };
  }
  
  return {
    where: datasetFilter,
    hasRLS: false
  };
}

/**
 * Verifica si el usuario tiene acceso de lectura basado en policyJson.
 * Versión síncrona que no requiere consulta a base de datos.
 * 
 * @param policy - Configuración de política
 * @param user - Usuario autenticado
 * @returns true si tiene acceso
 */
export function checkReadAccess(policy: PolicyJson | null, user: RLSUser): boolean {
  // Sin política = solo admin
  if (!policy) {
    return user?.role === "admin";
  }

  switch (policy.readAccess) {
    case "public":
      return true;
    case "authenticated":
      return !!user;
    case "admin":
      return user?.role === "admin";
    default:
      return user?.role === "admin";
  }
}

/**
 * Verifica si el usuario tiene acceso de escritura basado en policyJson.
 * 
 * @param policy - Configuración de política
 * @param user - Usuario autenticado
 * @returns true si tiene acceso
 */
export function checkWriteAccess(policy: PolicyJson | null, user: RLSUser): boolean {
  // Sin política = solo admin
  if (!policy) {
    return user?.role === "admin";
  }

  switch (policy.writeAccess) {
    case "authenticated":
      return !!user;
    case "admin":
      return user?.role === "admin";
    default:
      return user?.role === "admin";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Funciones Privadas (Helpers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construye una condición SQL para una sola regla RLS.
 * 
 * Accede al campo dentro del JSONB usando PostgreSQL operators:
 * - `data->>'fieldName'` para valores de texto
 * - Casting numérico para operadores gt/lt
 */
function buildRuleCondition(rule: RLSRule, user: RLSUser): SQL | null {
  // Reemplazar placeholder __USER_ID__ con el ID real del usuario
  const compareValue = rule.value === USER_ID_PLACEHOLDER 
    ? user?.id 
    : rule.value;

  // Si necesitamos __USER_ID__ pero no hay usuario, la regla no se cumple
  if (rule.value === USER_ID_PLACEHOLDER && !user?.id) {
    // Retornar una condición imposible (1=0)
    return sql`1 = 0`;
  }

  // Acceso al campo dentro de la columna JSONB "data"
  // Usamos sql.raw para construir la expresión data->>'fieldName'
  const fieldPath = sql`${sql.raw("data")}->>${rule.field}`;

  switch (rule.operator) {
    case "eq":
      return sql`${fieldPath} = ${compareValue}`;

    case "neq":
      return sql`${fieldPath} <> ${compareValue}`;

    case "contains":
      // LIKE %value% - búsqueda de substring
      return sql`${fieldPath} LIKE ${`%${compareValue}%`}`;

    case "gt":
      // Casting a numérico para comparación
      return sql`(${fieldPath})::numeric > ${Number(compareValue)}`;

    case "lt":
      // Casting a numérico para comparación
      return sql`(${fieldPath})::numeric < ${Number(compareValue)}`;

    default:
      console.warn(`[RLS Builder] Operador desconocido: ${rule.operator}`);
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Legacy Exports (para compatibilidad)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use buildDrizzleWhere() en su lugar.
 * 
 * Crea una función de filtro en memoria (antipatrón).
 * Mantenido solo para compatibilidad con código legacy.
 */
export function createRLSFilter(
  policy: PolicyJson | null,
  user: RLSUser
): ((entry: Record<string, any>) => boolean) | null {
  if (!policy?.enableRLS || !policy.rlsRules?.length) {
    return null;
  }

  return (entry: Record<string, any>) => {
    return policy.rlsRules!.every((rule) => {
      const value = entry.data?.[rule.field];
      const compareValue = rule.value === "__USER_ID__" ? user?.id : rule.value;

      switch (rule.operator) {
        case "eq":
          return value === compareValue;
        case "neq":
          return value !== compareValue;
        case "contains":
          return typeof value === "string" && value.includes(compareValue);
        case "gt":
          return Number(value) > Number(compareValue);
        case "lt":
          return Number(value) < Number(compareValue);
        default:
          return true;
      }
    });
  };
}
