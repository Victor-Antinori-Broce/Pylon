/**
 * @file agent-rbac.ts
 * @description Middleware RBAC (Role-Based Access Control) para Agentes NHI
 *
 * Fase 3: Implementa control de acceso granular basado en scopes.
 * Los scopes usan formato "action:resource" con soporte para wildcards.
 *
 * Ejemplos de scopes:
 * - "read:database" - Permiso de lectura en base de datos
 * - "write:files" - Permiso de escritura en archivos
 * - "mcp:connect" - Conexión MCP permitida
 * - "read:*" - Permiso de lectura en todos los recursos
 *
 * @author Gremius Security Team
 * @version 1.0.0
 */
import type { MiddlewareHandler } from "hono";
import type { AgentAuthContext } from "@/services/agent-auth";
/**
 * Opciones de configuración para el middleware RBAC
 */
export interface RBACOptions {
    /** Scopes requeridos para acceder al recurso */
    scopes: string[];
    /**
     * Modo de verificación:
     * - "all": Requiere TODOS los scopes (AND)
     * - "any": Requiere AL MENOS UNO (OR)
     * @default "all"
     */
    requireAll?: boolean;
    /**
     * Acción descriptiva para mensajes de error
     * @example "modificar registros de usuarios"
     */
    action?: string;
    /**
     * Recurso protegido para mensajes de error
     * @example "base de datos"
     */
    resource?: string;
}
/**
 * Códigos de error específicos para RBAC
 */
export declare enum RBACErrorCode {
    AGENT_NOT_AUTHENTICATED = "AGENT_NOT_AUTHENTICATED",
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
    SCOPE_MISSING = "SCOPE_MISSING",
    FORBIDDEN = "FORBIDDEN"
}
/**
 * Estructura de respuesta de error RBAC
 */
export interface RBACErrorResponse {
    error: string;
    code: RBACErrorCode;
    message: string;
    requiredScopes: string[];
    grantedScopes: string[];
    resource?: string;
    action?: string;
    timestamp: string;
    requestId: string;
}
/**
 * Tipo para el contexto RBAC almacenado en variables de Hono
 */
interface RBACContext {
    checkedScopes: string[];
    requireAll: boolean;
    timestamp: string;
}
/**
 * Middleware factory: Requiere scopes específicos
 *
 * @example
 * ```typescript
 * // Requiere todos los scopes
 * app.post("/api/database/query",
 *   requireAgentAuth(),
 *   requireScopes({ scopes: ["read:database", "write:database"] }),
 *   handler
 * );
 *
 * // Requiere al menos uno
 * app.get("/api/files",
 *   requireAgentAuth(),
 *   requireScopes({ scopes: ["read:files", "admin:*"], requireAll: false }),
 *   handler
 * );
 * ```
 */
export declare function requireScopes(options: RBACOptions): MiddlewareHandler;
/**
 * Middleware factory: Requiere un scope específico
 * Versión simplificada para un solo scope
 *
 * @example
 * ```typescript
 * app.get("/api/data", requireScope("read:database"), handler);
 * ```
 */
export declare function requireScope(scope: string, action?: string, resource?: string): MiddlewareHandler;
/**
 * Middleware factory: Permite acceso si tiene cualquiera de los scopes
 *
 * @example
 * ```typescript
 * app.get("/api/public", requireAnyScope(["read:public", "admin:*"]), handler);
 * ```
 */
export declare function requireAnyScope(scopes: string[], action?: string, resource?: string): MiddlewareHandler;
/**
 * Middleware: Solo administradores (scope especial admin:*)
 *
 * @example
 * ```typescript
 * app.delete("/api/agents/:id", requireAdmin, handler);
 * ```
 */
export declare const requireAdmin: MiddlewareHandler;
/**
 * Middleware combinado: Autenticación + RBAC en un solo paso
 * Útil para rutas que siempre requieren ambos
 *
 * @example
 * ```typescript
 * app.post("/api/mcp/invoke",
 *   agentAuthWithRBAC({ scopes: ["mcp:invoke"] }),
 *   handler
 * );
 * ```
 */
export interface AgentAuthWithRBACOptions extends RBACOptions {
    /** Si es true, no requiere autenticación (opcional) */
    optional?: boolean;
}
export declare function agentAuthWithRBAC(options: AgentAuthWithRBACOptions): MiddlewareHandler;
/**
 * Helper: Verifica si un agente tiene acceso a un recurso específico
 * Útil para verificaciones manuales en controladores
 *
 * @example
 * ```typescript
 * // En un controlador
 * const canWrite = checkResourceAccess(agent, "write", "database");
 * if (!canWrite) {
 *   return c.json({ error: "Forbidden" }, 403);
 * }
 * ```
 */
export declare function checkResourceAccess(agent: AgentAuthContext, action: string, resource: string): boolean;
/**
 * Helper: Obtiene todos los recursos a los que el agente tiene acceso
 * para una acción específica
 *
 * @example
 * ```typescript
 * const readableResources = getAccessibleResources(agent, "read");
 * // ["database", "files", "users", ...]
 * ```
 */
export declare function getAccessibleResources(agent: AgentAuthContext, action: string): string[];
/**
 * Declaración de tipo para extender ContextVariableMap
 */
declare module "hono" {
    interface ContextVariableMap {
        rbac?: RBACContext;
    }
}
declare const _default: {
    requireScopes: typeof requireScopes;
    requireScope: typeof requireScope;
    requireAnyScope: typeof requireAnyScope;
    requireAdmin: MiddlewareHandler;
    agentAuthWithRBAC: typeof agentAuthWithRBAC;
    checkResourceAccess: typeof checkResourceAccess;
    getAccessibleResources: typeof getAccessibleResources;
    RBACErrorCode: typeof RBACErrorCode;
};
export default _default;
//# sourceMappingURL=agent-rbac.d.ts.map