/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RLS NATIVO DE POSTGRESQL - El Muro de Titanio (Fase AI-Ready)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este middleware implementa la "segunda línea de defensa" contra fugas de datos
 * mediante Row Level Security (RLS) nativo de PostgreSQL.
 *
 * ARQUITECTURA HÍBRIDA DE SEGURIDAD:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ NIVEL 1 (App): RLS via Drizzle WHERE                                  │
 * │   → Rendimiento óptimo, filtros en SQL                                │
 * │   → Implementado en: lib/rls-builder.ts                               │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ NIVEL 2 (BD): RLS Nativo PostgreSQL  ← ESTE ARCHIVO                   │
 * │   → Seguridad absoluta, no se puede bypassar                          │
 * │   → Protege contra:                                                   │
 * │     • Bugs en el código de la aplicación                              │
 * │     • Queries SQL generadas por IA (MCP Server)                       │
 * │     • Acceso directo a la base de datos                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * CÓMO FUNCIONA:
 * 1. Cada petición HTTP se envuelve en una transacción PostgreSQL
 * 2. Se inyecta el user_id en la variable de sesión `app.current_user_id`
 * 3. PostgreSQL evalúa las políticas RLS en CADA query automáticamente
 * 4. Si un query intenta acceder a datos de otro usuario, PostgreSQL lo rechaza
 *
 * POLÍTICAS RLS (definidas en db/rls-policies.sql):
 * - data_entries_owner_isolation: Solo el dueño puede ver/modificar sus datos
 * - data_entries_public_read: Registros públicos visibles por todos
 *
 * EJEMPLO DE USO:
 * ```typescript
 * const app = new Hono()
 *   .use(withTransactionalRLS())  // ← Activa el Muro de Titanio
 *   .get("/api/datasets/:id/entries", async (c) => {
 *     // PostgreSQL automáticamente filtra solo los registros permitidos
 *     const entries = await c.get("tx").select().from(dataEntries);
 *     return c.json(entries);
 *   });
 * ```
 *
 * NOTA SOBRE MCP SERVER:
 * Cuando el servidor MCP (Model Context Protocol) genere queries SQL,
 * el RLS nativo garantiza que:
 * - Un usuario normal NUNCA verá datos de otros usuarios
 * - Solo los admins pueden ver todos los registros
 * - Incluso si la IA "alucina" y genera SELECT * FROM data_entries,
 *   PostgreSQL solo retornará los registros permitidos por las políticas.
 *
 * @module middleware/transactional-rls
 * @see db/rls-policies.sql - Definición de políticas RLS
 * @see lib/rls-builder.ts - Nivel 1 (Drizzle WHERE)
 * @see https://www.postgresql.org/docs/current/ddl-rowsecurity.html
 */
import type { Context, Next } from "hono";
import { type DatabaseTransaction } from "../db";
/**
 * User object from Better-Auth session
 */
export interface RLSUser {
    id: string;
    email?: string;
    role?: "admin" | "editor" | "user";
}
/**
 * Contexto RLS inyectado en la transacción
 */
export interface RLSContext {
    userId: string | null;
    userRole: string | null;
    isAdmin: boolean;
}
/**
 * Tipo para transacción de Drizzle
 */
type TransactionType = DatabaseTransaction;
/**
 * Establece el contexto RLS en la sesión de PostgreSQL.
 *
 * Esta función inyecta las variables de sesión que las políticas RLS
 * usarán para evaluar el acceso a los datos.
 *
 * @param tx - Transacción de Drizzle
 * @param user - Usuario autenticado o null para anónimo
 *
 * @example
 * ```typescript
 * await db.transaction(async (tx) => {
 *   await setRLSContext(tx, { id: "user-123", role: "user" });
 *   // Ahora todas las queries usarán este contexto RLS
 * });
 * ```
 */
export declare function setRLSContext(tx: TransactionType, user: RLSUser | null): Promise<void>;
/**
 * Limpia el contexto RLS al final de la transacción.
 *
 * Aunque no es estrictamente necesario (PostgreSQL limpia al cerrar
 * la conexión), es una buena práctica de seguridad.
 *
 * @param tx - Transacción de Drizzle
 */
export declare function clearRLSContext(tx: TransactionType): Promise<void>;
/**
 * Obtiene el contexto RLS actual desde la sesión de PostgreSQL.
 * Útil para debugging y logging.
 *
 * @param tx - Transacción de Drizzle
 * @returns Contexto RLS actual
 */
export declare function getRLSContext(tx: TransactionType): Promise<RLSContext>;
/**
 * Middleware Hono que envuelve cada petición en una transacción PostgreSQL
 * con contexto RLS inyectado.
 *
 * Este es el "Muro de Titanio" - garantiza que incluso si el código de la
 * aplicación tiene bugs o la IA genera queries incorrectas, PostgreSQL
 * nunca permitirá ver datos de otros usuarios.
 *
 * CARACTERÍSTICAS:
 * - ✅ Inyecta automáticamente el user_id de la sesión
 * - ✅ Hace rollback automático si ocurre un error
 * - ✅ Expone `c.get("tx")` para usar la transacción en los handlers
 * - ✅ Logs de seguridad en modo debug
 * - ✅ Compatible con Better-Auth
 *
 * USO BÁSICO:
 * ```typescript
 * import { Hono } from "hono";
 * import { withTransactionalRLS } from "./middleware/transactional-rls";
 *
 * const app = new Hono();
 * app.use(withTransactionalRLS());
 *
 * app.get("/entries", async (c) => {
 *   const tx = c.get("tx");
 *   const entries = await tx.select().from(dataEntries);
 *   return c.json(entries);
 * });
 * ```
 *
 * USO AVANZADO (con Better-Auth):
 * ```typescript
 * app.use("/api/*", getSession).use(withTransactionalRLS());
 * ```
 *
 * @returns Middleware Hono
 */
export declare function withTransactionalRLS(): (c: Context, next: Next) => Promise<void>;
/**
 * Versión simplificada del middleware para rutas específicas.
 *
 * A diferencia de withTransactionalRLS(), esta versión NO envuelve
 * en transacción, solo establece el contexto RLS en la conexión actual.
 *
 * ⚠️ ADVERTENCIA: No proporciona atomicidad de transacciones.
 * Solo usar cuando no se necesite rollback automático.
 *
 * @returns Middleware Hono
 */
export declare function withRLSContextOnly(): (c: Context, next: Next) => Promise<void>;
/**
 * Helper para ejecutar código con contexto RLS en un contexto no-HTTP.
 *
 * Útil para background jobs, cron tasks, o código que no tiene acceso
 * al contexto Hono.
 *
 * @param user - Usuario para el contexto RLS
 * @param fn - Función a ejecutar con el contexto RLS
 * @returns Resultado de la función
 *
 * @example
 * ```typescript
 * const result = await withRLSContext(
 *   { id: "system", role: "admin" },
 *   async (tx) => {
 *     return await tx.select().from(dataEntries);
 *   }
 * );
 * ```
 */
export declare function withRLSContext<T>(user: RLSUser | null, fn: (tx: TransactionType) => Promise<T>): Promise<T>;
/**
 * Helper para ejecutar código como admin (bypass RLS).
 *
 * ⚠️ ADVERTENCIA DE SEGURIDAD: Solo usar para operaciones administrativas
 * o cuando se haya verificado explícitamente que el usuario es admin.
 *
 * @param fn - Función a ejecutar con bypass RLS
 * @returns Resultado de la función
 *
 * @example
 * ```typescript
 * const allEntries = await withAdminRLS(async (tx) => {
 *   return await tx.select().from(dataEntries);
 * });
 * ```
 */
export declare function withAdminRLS<T>(fn: (tx: TransactionType) => Promise<T>): Promise<T>;
export default withTransactionalRLS;
//# sourceMappingURL=transactional-rls.d.ts.map