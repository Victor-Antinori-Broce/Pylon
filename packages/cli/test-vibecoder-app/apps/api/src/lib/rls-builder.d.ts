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
import { SQL } from "drizzle-orm";
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
export declare function buildDrizzleWhere(rules: RLSRule[] | undefined, user: RLSUser): SQL | undefined;
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
export declare function buildDatasetWhere(datasetId: string, rules: RLSRule[] | undefined, user: RLSUser, dataColumn?: string): {
    where: SQL | undefined;
    hasRLS: boolean;
};
/**
 * Verifica si el usuario tiene acceso de lectura basado en policyJson.
 * Versión síncrona que no requiere consulta a base de datos.
 *
 * @param policy - Configuración de política
 * @param user - Usuario autenticado
 * @returns true si tiene acceso
 */
export declare function checkReadAccess(policy: PolicyJson | null, user: RLSUser): boolean;
/**
 * Verifica si el usuario tiene acceso de escritura basado en policyJson.
 *
 * @param policy - Configuración de política
 * @param user - Usuario autenticado
 * @returns true si tiene acceso
 */
export declare function checkWriteAccess(policy: PolicyJson | null, user: RLSUser): boolean;
/**
 * @deprecated Use buildDrizzleWhere() en su lugar.
 *
 * Crea una función de filtro en memoria (antipatrón).
 * Mantenido solo para compatibilidad con código legacy.
 */
export declare function createRLSFilter(policy: PolicyJson | null, user: RLSUser): ((entry: Record<string, any>) => boolean) | null;
//# sourceMappingURL=rls-builder.d.ts.map