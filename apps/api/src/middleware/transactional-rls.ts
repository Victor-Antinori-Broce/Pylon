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

// Deep import del submódulo puro (NO la fachada @kitsuden/engine): el index del
// engine re-exporta este mismo archivo (withTransactionalRLS), así que
// importar la fachada desde aquí crearía un ciclo.
import { sql } from "drizzle-orm";
import type { Context, Next } from "hono";

import {
  comoSistema,
  contextoRlsDe,
  fijarContextoRls,
  transaccionRls,
} from "../../../../packages/engine/src/rls-peticion";
import { db, type DatabaseTransaction } from "../db";
// Logger LOCAL, no el de la fachada: mismo motivo que el deep import de arriba.
import { logger } from "../lib/logger";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════

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
export async function setRLSContext(tx: TransactionType, user: RLSUser | null): Promise<void> {
  /**
   * `is_local = true` (en `fijarContextoRls`): el valor vive lo que vive la
   * transacción y Postgres lo deshace solo al terminarla. Con `false` el valor
   * se quedaba en la SESIÓN —una conexión del pool que se presta a gente
   * distinta— y la petición siguiente que la tocara sin pasar por aquí heredaba
   * el usuario de la anterior.
   */
  await fijarContextoRls(tx, user);
}

/**
 * Qué id y qué rol ve Postgres para un usuario (o para nadie): la regla vive
 * en el engine (`contextoRlsDe`), compartida con los kons.
 *
 * · Sin usuario: id '' y rol `anonymous` —NO es el sistema, que es id Y rol
 *   vacíos—.
 * · Con usuario y sin rol: `user` (antes caía en `anonymous`).
 */
export const contextoDe = contextoRlsDe;

/** Como sistema dentro de la transacción de la petición (ver el engine). */
export { comoSistema };

/**
 * Limpia el contexto RLS al final de la transacción.
 *
 * Aunque no es estrictamente necesario (PostgreSQL limpia al cerrar
 * la conexión), es una buena práctica de seguridad.
 *
 * @param tx - Transacción de Drizzle
 */
export async function clearRLSContext(tx: TransactionType): Promise<void> {
  // Local, como al ponerlo: si no, «limpiar» dejaría la conexión marcada como
  // anónima para todo el que la use después, que es el mismo fallo al revés.
  await tx.execute(sql`SELECT set_config('app.current_user_id', '', true)`);
  await tx.execute(sql`SELECT set_config('app.current_user_role', '', true)`);
}

/**
 * Obtiene el contexto RLS actual desde la sesión de PostgreSQL.
 * Útil para debugging y logging.
 *
 * @param tx - Transacción de Drizzle
 * @returns Contexto RLS actual
 */
export async function getRLSContext(tx: TransactionType): Promise<RLSContext> {
  const [userIdResult, userRoleResult] = await Promise.all([
    tx.execute(sql`SELECT current_setting('app.current_user_id', true)`) as Promise<{
      rows: { current_setting: string }[];
    }>,
    tx.execute(sql`SELECT current_setting('app.current_user_role', true)`) as Promise<{
      rows: { current_setting: string }[];
    }>,
  ]);

  const userId = userIdResult.rows[0]?.current_setting || null;
  const userRole = userRoleResult.rows[0]?.current_setting || null;

  return {
    userId,
    userRole,
    isAdmin: userRole === "admin",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

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
export function withTransactionalRLS() {
  // La transacción, el contexto, la idempotencia (no anidar), el request-scope
  // y la reversión si la ruta falla viven en el engine (`transaccionRls`),
  // compartidos con los kons. Aquí solo lo propio del núcleo: `c.get("tx")`,
  // `rlsUser` y el log. El log va por el logger y NO por `console.log`: corre
  // en CADA petición y una línea suelta saldría sin `trace_id`.
  return transaccionRls(() => db, {
    alAbrir(c, tx, { userId, userRole }) {
      c.set("tx", tx);
      c.set("rlsUser", { id: userId || null, role: userRole });
      logger.debug({ userId: userId || null, userRole }, "[RLS] transacción abierta");
    },
    // Un error de SQL capturado y tragado dejó la transacción abortada y
    // Postgres deshizo la petición entera. Es un fallo de la ruta (le falta un
    // `conSavepoint`/`intentarSql`): que se vea en el log con su ruta.
    alPerderConfirmacion(_c, info) {
      logger.error(
        {
          method: info.metodo,
          path: info.ruta,
          status: info.estado,
          sqlCode: info.error?.code,
          sqlError: info.error?.message,
          responseReplaced: info.respuestaCambiada,
        },
        "[RLS] la transacción de la petición acabó abortada: no se guardó nada"
      );
    },
  });
}

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
export function withRLSContextOnly() {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as RLSUser | undefined;

    /**
     * Sin transacción no hay ámbito local: aquí el contexto es de SESIÓN por
     * fuerza, y la sesión es una conexión del pool que se presta a la petición
     * siguiente. Por eso se borra pase lo que pase: dejarlo puesto convierte
     * al usuario de esta petición en el de la próxima que reutilice la
     * conexión y no fije el suyo.
     */
    await db.execute(sql`SELECT set_config('app.current_user_id', ${user?.id ?? ""}, false)`);
    await db.execute(
      sql`SELECT set_config('app.current_user_role', ${user?.role ?? "anonymous"}, false)`
    );

    c.set("rlsUser", { id: user?.id ?? null, role: user?.role ?? "anonymous" });

    try {
      await next();
    } finally {
      await db.execute(sql`SELECT set_config('app.current_user_id', '', false)`);
      await db.execute(sql`SELECT set_config('app.current_user_role', '', false)`);
    }
  };
}

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
export async function withRLSContext<T>(
  user: RLSUser | null,
  fn: (tx: TransactionType) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await setRLSContext(tx, user);
    return await fn(tx);
  });
}

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
export async function withAdminRLS<T>(fn: (tx: TransactionType) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    await setRLSContext(tx, { id: "admin", role: "admin" });
    return await fn(tx);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DEFAULT
// ═══════════════════════════════════════════════════════════════════════════

export default withTransactionalRLS;
