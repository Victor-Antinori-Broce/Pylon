/**
 * ============================================================================
 * RLS CONTEXT MIDDLEWARE - El Muro de Titanio (Nivel 2)
 * ============================================================================
 *
 * FASE AI-READY: Middleware Transaccional para RLS Nativo de PostgreSQL
 *
 * Este middleware implementa la "segunda línea de defensa" contra fugas de datos.
 * Inyecta el ID del usuario autenticado en el contexto de PostgreSQL usando
 * `SET LOCAL app.current_user_id`, permitiendo que el motor de la base de datos
 * evalúe políticas de Row Level Security (RLS) nativas.
 *
 * ARQUITECTURA HÍBRIDA:
 * - Nivel 1 (Aplicación): RLS via Drizzle WHERE (rendimiento óptimo)
 * - Nivel 2 (Base de Datos): RLS Nativo PostgreSQL (seguridad absoluta)
 *
 * El Nivel 2 actúa como "Muro de Titanio" para proteger contra:
 * - Queries dinámicas maliciosas generadas por IA (MCP)
 * - Bypass accidental del middleware de aplicación
 * - Acceso directo a la base de datos con credenciales filtradas
 *
 * @example
 * ```typescript
 * // Aplicar a rutas críticas
 * app.use("/api/entries", rlsContextMiddleware());
 *
 * // O a todo el API
 * app.use("/api/*", rlsContextMiddleware());
 * ```
 */
import type { Context, Next } from "hono";
import { type DatabaseTransaction } from "../db";
/**
 * Contexto RLS inyectado en PostgreSQL
 */
export interface RLSContext {
    userId: string | null;
    role: string | null;
    isMachine: boolean;
}
/**
 * Crea el middleware de contexto RLS para Hono.
 *
 * Este middleware:
 * 1. Extrae el usuario de la sesión (ya establecido por auth middleware)
 * 2. Inyecta el user_id en PostgreSQL via SET LOCAL
 * 3. Ejecuta la petición dentro de un contexto seguro
 * 4. Limpia el contexto al finalizar
 *
 * NOTA: Este middleware NO envuelve en transacción cada query automáticamente,
 * sino que establece el contexto para que las políticas RLS nativas lo usen.
 * Para queries críticas, usar `withRLSTransaction()`.
 *
 * @returns Middleware de Hono
 */
export declare function rlsContextMiddleware(): (c: Context, next: Next) => Promise<void>;
/**
 * Tipo para el callback de transacción RLS
 */
type TransactionCallback<T> = (tx: DatabaseTransaction) => Promise<T>;
/**
 * Ejecuta una función dentro de una transacción con contexto RLS inyectado.
 *
 * ESTA es la función crítica para queries que bypassan el middleware,
 * como queries dinámicas generadas por IA (MCP Server).
 *
 * @param userId - ID del usuario para inyectar en PostgreSQL
 * @param callback - Función a ejecutar dentro de la transacción
 * @returns Resultado de la callback
 *
 * @example
 * ```typescript
 * // Query dinámica generada por IA
 * const results = await withRLSTransaction(user.id, async (tx) => {
 *   return await tx.select().from(dataEntries);
 * });
 * // PostgreSQL aplicará la política RLS automáticamente
 * ```
 */
export declare function withRLSTransaction<T>(userId: string | null, callback: TransactionCallback<T>): Promise<T>;
/**
 * Versión para queries individuales (no transaccionales).
 * Útil cuando solo necesitas ejecutar una query con RLS.
 */
export declare function withRLSQuery<T>(userId: string | null, queryFn: () => Promise<T>): Promise<T>;
/**
 * Resultado de la verificación de contexto RLS
 */
interface RLSVerificationResult {
    userId: string | null;
    role: string | null;
    active: boolean;
}
/**
 * Verifica si el contexto RLS está correctamente configurado.
 * Útil para debugging y health checks.
 */
export declare function verifyRLSContext(): Promise<RLSVerificationResult>;
/**
 * @deprecated Use rlsContextMiddleware() en su lugar.
 * Mantenido para compatibilidad con código existente.
 */
export declare function injectRLSContext(): (c: Context, next: Next) => Promise<void>;
export {};
//# sourceMappingURL=rls-context.d.ts.map