// @ts-nocheck
/**
 * Agent RLS (Row Level Security) Policies
 *
 * Extiende el sistema de RLS de Gremius para soportar agentes NHI
 *
 * Estas políticas permiten que los agentes de IA accedan a datos
 * con restricciones basadas en sus scopes, similar a los usuarios humanos.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { hasScope } from "../services/agent-auth";
import { logger } from "./logger";
/**
 * Mapeo de tablas a scopes requeridos
 * Configurable por el administrador
 */
export const DEFAULT_AGENT_RLS_POLICIES = [
    // Posts / Blog
    { table: "blog_posts", action: "SELECT", scope: "read:posts" },
    { table: "blog_posts", action: "INSERT", scope: "write:posts" },
    { table: "blog_posts", action: "UPDATE", scope: "write:posts" },
    { table: "blog_posts", action: "DELETE", scope: "delete:posts" },
    // Games
    { table: "games", action: "SELECT", scope: "read:games" },
    { table: "games", action: "INSERT", scope: "write:games" },
    { table: "games", action: "UPDATE", scope: "write:games" },
    { table: "games", action: "DELETE", scope: "delete:games" },
    // Data Sets (BaaS)
    { table: "data_sets", action: "SELECT", scope: "read:datasets" },
    { table: "data_sets", action: "INSERT", scope: "write:datasets" },
    { table: "data_sets", action: "UPDATE", scope: "write:datasets" },
    { table: "data_sets", action: "DELETE", scope: "delete:datasets" },
    { table: "data_entries", action: "SELECT", scope: "read:datasets" },
    { table: "data_entries", action: "INSERT", scope: "write:datasets" },
    { table: "data_entries", action: "UPDATE", scope: "write:datasets" },
    { table: "data_entries", action: "DELETE", scope: "delete:datasets" },
    // Users (solo lectura para agentes por defecto)
    { table: "auth_users", action: "SELECT", scope: "read:users" },
    // Media
    { table: "media", action: "SELECT", scope: "read:media" },
    { table: "media", action: "INSERT", scope: "write:media" },
    // Agent identities (solo admins)
    { table: "agent_identities", action: "SELECT", scope: "admin:agents" },
    { table: "agent_identities", action: "INSERT", scope: "admin:agents" },
    { table: "agent_identities", action: "UPDATE", scope: "admin:agents" },
    { table: "agent_identities", action: "DELETE", scope: "admin:agents" },
];
// ═══════════════════════════════════════════════════════════════════════════
// VERIFICACIÓN DE PERMISOS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Verifica si un agente tiene permiso para realizar una acción sobre una tabla
 */
export function canAgentAccess(agentContext, table, action) {
    // Buscar política aplicable
    const policy = DEFAULT_AGENT_RLS_POLICIES.find((p) => p.table === table && p.action === action);
    if (!policy) {
        // Sin política = acceso denegado por defecto (Zero Trust)
        logger.debug({ table, action, agentId: agentContext.agentId }, "No RLS policy found for agent access");
        return false;
    }
    // Verificar scope
    return hasScope(agentContext, policy.scope);
}
/**
 * Middleware para verificar acceso de agente a una tabla
 * Lanza error si no tiene permiso
 */
export function requireAgentTableAccess(agentContext, table, action) {
    if (!canAgentAccess(agentContext, table, action)) {
        const policy = DEFAULT_AGENT_RLS_POLICIES.find((p) => p.table === table && p.action === action);
        const requiredScope = policy?.scope || `${action.toLowerCase()}:${table}`;
        logger.warn({
            agentId: agentContext.agentId,
            table,
            action,
            requiredScope,
            grantedScopes: agentContext.scopes,
        }, "Agent table access denied");
        throw new AgentRLSError(`Access denied to ${table}.${action}. Required scope: ${requiredScope}`, table, action, requiredScope);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// ERRORES
// ═══════════════════════════════════════════════════════════════════════════
export class AgentRLSError extends Error {
    table;
    action;
    requiredScope;
    constructor(message, table, action, requiredScope) {
        super(message);
        this.table = table;
        this.action = action;
        this.requiredScope = requiredScope;
        this.name = "AgentRLSError";
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// SETUP EN BASE DE DATOS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * SQL para crear políticas RLS en PostgreSQL
 * Estas políticas usan el current_setting de PostgreSQL para pasar el agent_id
 */
export const AGENT_RLS_SQL = {
    // Habilitar RLS en tablas
    enableRLS: (table) => sql.raw(`
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
  `),
    // Política para agentes (lectura)
    createSelectPolicy: (table) => sql.raw(`
    CREATE POLICY agent_select_${table} ON ${table}
      FOR SELECT
      USING (
        current_setting('app.current_agent_id', true) IS NOT NULL
        AND current_setting('app.current_agent_scopes', true) LIKE '%read:${table}%'
      );
  `),
    // Política para agentes (escritura)
    createInsertPolicy: (table) => sql.raw(`
    CREATE POLICY agent_insert_${table} ON ${table}
      FOR INSERT
      WITH CHECK (
        current_setting('app.current_agent_id', true) IS NOT NULL
        AND current_setting('app.current_agent_scopes', true) LIKE '%write:${table}%'
      );
  `),
    // Política para agentes (actualización)
    createUpdatePolicy: (table) => sql.raw(`
    CREATE POLICY agent_update_${table} ON ${table}
      FOR UPDATE
      USING (
        current_setting('app.current_agent_id', true) IS NOT NULL
        AND current_setting('app.current_agent_scopes', true) LIKE '%write:${table}%'
      );
  `),
    // Política para agentes (eliminación)
    createDeletePolicy: (table) => sql.raw(`
    CREATE POLICY agent_delete_${table} ON ${table}
      FOR DELETE
      USING (
        current_setting('app.current_agent_id', true) IS NOT NULL
        AND current_setting('app.current_agent_scopes', true) LIKE '%delete:${table}%'
      );
  `),
};
/**
 * Configura el contexto de agente para RLS en PostgreSQL
 * Esto debe llamarse antes de cada query cuando se ejecuta como agente
 */
export async function setAgentRLSContext(agentContext) {
    try {
        await db.execute(sql `
      SELECT set_config('app.current_agent_id', ${agentContext.agentId}, true);
    `);
        await db.execute(sql `
      SELECT set_config('app.current_agent_scopes', ${agentContext.scopes.join(",")}, true);
    `);
    }
    catch (error) {
        logger.error({ error, agentId: agentContext.agentId }, "Failed to set agent RLS context");
        throw error;
    }
}
/**
 * Limpia el contexto de agente (ejecutar después de la operación)
 */
export async function clearAgentRLSContext() {
    try {
        await db.execute(sql `
      SELECT set_config('app.current_agent_id', '', true);
    `);
        await db.execute(sql `
      SELECT set_config('app.current_agent_scopes', '', true);
    `);
    }
    catch (error) {
        logger.error({ error }, "Failed to clear agent RLS context");
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// WRAPPER PARA QUERIES CON RLS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Ejecuta una función dentro del contexto RLS de un agente
 * Garantiza que el contexto se limpie después
 */
export async function withAgentRLS(agentContext, operation) {
    await setAgentRLSContext(agentContext);
    try {
        return await operation();
    }
    finally {
        await clearAgentRLSContext();
    }
}
//# sourceMappingURL=agent-rls.js.map