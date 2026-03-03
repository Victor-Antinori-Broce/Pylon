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
import { db } from "../db";
import { sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contexto RLS inyectado en PostgreSQL
 */
export interface RLSContext {
  userId: string | null;
  role: string | null;
  isMachine: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════════════════════

const RLS_CONFIG_KEY = "app.current_user_id";
const RLS_ROLE_KEY = "app.current_user_role";

// ═══════════════════════════════════════════════════════════════════════════
// Middleware Factory
// ═══════════════════════════════════════════════════════════════════════════

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
export function rlsContextMiddleware() {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as any;
    const userId = user?.id || null;
    const userRole = user?.role || "anonymous";

    // Almacenar en contexto de Hono para uso en aplicación
    c.set("rlsContext", {
      userId,
      role: userRole,
      isMachine: userId?.startsWith("machine-") || false,
    } as RLSContext);

    // Inyectar en PostgreSQL para RLS nativo
    // Usamos SET LOCAL (solo dura la transacción/sesión actual)
    try {
      if (userId) {
        await db.execute(sql`SELECT set_config(${RLS_CONFIG_KEY}, ${userId}, true)`);
        await db.execute(sql`SELECT set_config(${RLS_ROLE_KEY}, ${userRole}, true)`);
      } else {
        // Usuario anónimo - establecer contexto vacío
        await db.execute(sql`SELECT set_config(${RLS_CONFIG_KEY}, '', true)`);
        await db.execute(sql`SELECT set_config(${RLS_ROLE_KEY}, 'anonymous', true)`);
      }
    } catch (error) {
      console.error("[RLS Context] Error al inyectar contexto:", error);
      // No bloqueamos la petición, pero loggeamos el error
      // En producción crítica, podrías querer retornar 500 aquí
    }

    // Continuar con la petición
    await next();

    // Limpieza opcional (PostgreSQL limpia automáticamente al cerrar conexión)
    // Pero es buena práctica explicitarlo
    try {
      await db.execute(sql`SELECT set_config(${RLS_CONFIG_KEY}, '', true)`);
      await db.execute(sql`SELECT set_config(${RLS_ROLE_KEY}, '', true)`);
    } catch {
      // Ignorar errores de limpieza
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Ejecución con RLS en Transacción
// ═══════════════════════════════════════════════════════════════════════════

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
export async function withRLSTransaction<T>(
  userId: string | null,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // Inyectar contexto al INICIO de la transacción
    await tx.execute(sql`SELECT set_config(${RLS_CONFIG_KEY}, ${userId || ""}, true)`);
    await tx.execute(sql`SELECT set_config(${RLS_ROLE_KEY}, ${userId ? "user" : "anonymous"}, true)`);
    
    // Ejecutar la operación dentro de la transacción protegida
    const result = await callback(tx as typeof db);
    
    // El RLS se evalúa en cada query dentro de esta transacción
    return result;
  });
}

/**
 * Versión para queries individuales (no transaccionales).
 * Útil cuando solo necesitas ejecutar una query con RLS.
 */
export async function withRLSQuery<T>(
  userId: string | null,
  queryFn: () => Promise<T>
): Promise<T> {
  try {
    // Establecer contexto
    await db.execute(sql`SELECT set_config(${RLS_CONFIG_KEY}, ${userId || ""}, true)`);
    await db.execute(sql`SELECT set_config(${RLS_ROLE_KEY}, ${userId ? "user" : "anonymous"}, true)`);
    
    // Ejecutar query
    const result = await queryFn();
    
    return result;
  } finally {
    // Limpiar contexto (best effort)
    try {
      await db.execute(sql`SELECT set_config(${RLS_CONFIG_KEY}, '', true)`);
      await db.execute(sql`SELECT set_config(${RLS_ROLE_KEY}, '', true)`);
    } catch {
      // Ignorar
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers de Verificación
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica si el contexto RLS está correctamente configurado.
 * Útil para debugging y health checks.
 */
export async function verifyRLSContext(): Promise<{
  userId: string | null;
  role: string | null;
  active: boolean;
}> {
  try {
    const result = await db.execute<{ 
      user_id: string; 
      user_role: string;
    }>(sql`
      SELECT 
        current_setting('app.current_user_id', true) as user_id,
        current_setting('app.current_user_role', true) as user_role
    `);
    
    const row = result.rows?.[0];
    return {
      userId: row?.user_id || null,
      role: row?.user_role || null,
      active: !!row?.user_id,
    };
  } catch (error) {
    console.error("[RLS Context] Error de verificación:", error);
    return {
      userId: null,
      role: null,
      active: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Legacy Support
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use rlsContextMiddleware() en su lugar.
 * Mantenido para compatibilidad con código existente.
 */
export function injectRLSContext() {
  return rlsContextMiddleware();
}
