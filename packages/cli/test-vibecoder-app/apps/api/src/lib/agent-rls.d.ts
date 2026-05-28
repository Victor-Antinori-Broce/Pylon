/**
 * Agent RLS (Row Level Security) Policies
 *
 * Extiende el sistema de RLS de Gremius para soportar agentes NHI
 *
 * Estas políticas permiten que los agentes de IA accedan a datos
 * con restricciones basadas en sus scopes, similar a los usuarios humanos.
 */
import type { AgentAuthContext } from "../services/agent-auth";
/**
 * Estructura de políticas RLS para agentes
 */
export interface AgentRLSPolicy {
    table: string;
    action: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
    scope: string;
    condition?: string;
}
/**
 * Mapeo de tablas a scopes requeridos
 * Configurable por el administrador
 */
export declare const DEFAULT_AGENT_RLS_POLICIES: AgentRLSPolicy[];
/**
 * Verifica si un agente tiene permiso para realizar una acción sobre una tabla
 */
export declare function canAgentAccess(agentContext: AgentAuthContext, table: string, action: "SELECT" | "INSERT" | "UPDATE" | "DELETE"): boolean;
/**
 * Middleware para verificar acceso de agente a una tabla
 * Lanza error si no tiene permiso
 */
export declare function requireAgentTableAccess(agentContext: AgentAuthContext, table: string, action: "SELECT" | "INSERT" | "UPDATE" | "DELETE"): void;
export declare class AgentRLSError extends Error {
    readonly table: string;
    readonly action: string;
    readonly requiredScope: string;
    constructor(message: string, table: string, action: string, requiredScope: string);
}
/**
 * SQL para crear políticas RLS en PostgreSQL
 * Estas políticas usan el current_setting de PostgreSQL para pasar el agent_id
 */
export declare const AGENT_RLS_SQL: {
    enableRLS: (table: string) => import("drizzle-orm").SQL<unknown>;
    createSelectPolicy: (table: string) => import("drizzle-orm").SQL<unknown>;
    createInsertPolicy: (table: string) => import("drizzle-orm").SQL<unknown>;
    createUpdatePolicy: (table: string) => import("drizzle-orm").SQL<unknown>;
    createDeletePolicy: (table: string) => import("drizzle-orm").SQL<unknown>;
};
/**
 * Configura el contexto de agente para RLS en PostgreSQL
 * Esto debe llamarse antes de cada query cuando se ejecuta como agente
 */
export declare function setAgentRLSContext(agentContext: AgentAuthContext): Promise<void>;
/**
 * Limpia el contexto de agente (ejecutar después de la operación)
 */
export declare function clearAgentRLSContext(): Promise<void>;
/**
 * Ejecuta una función dentro del contexto RLS de un agente
 * Garantiza que el contexto se limpie después
 */
export declare function withAgentRLS<T>(agentContext: AgentAuthContext, operation: () => Promise<T>): Promise<T>;
//# sourceMappingURL=agent-rls.d.ts.map