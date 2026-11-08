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
 * @author Kitsuden Security Team
 * @version 1.0.0
 */

import type { MiddlewareHandler, Context, Next } from "hono";

import { ipDelCliente } from "@/lib/ip-del-cliente";
import { logger } from "@/lib/logger";
import type { AgentAuthContext } from "@/services/agent-auth";
import { hasScope, hasAllScopes, hasAnyScope } from "@/services/agent-auth";

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
export enum RBACErrorCode {
  AGENT_NOT_AUTHENTICATED = "AGENT_NOT_AUTHENTICATED",
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  SCOPE_MISSING = "SCOPE_MISSING",
  FORBIDDEN = "FORBIDDEN",
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
export function requireScopes(options: RBACOptions): MiddlewareHandler {
  const { scopes, requireAll = true, action, resource } = options;

  return async (c: Context, next: Next) => {
    const requestId = c.get("requestId") || crypto.randomUUID();
    const agent: AgentAuthContext | undefined = c.get("agent");

    // 1. Verificar que el agente esté autenticado
    if (!agent) {
      const error: RBACErrorResponse = {
        error: "Unauthorized",
        code: RBACErrorCode.AGENT_NOT_AUTHENTICATED,
        message: "Agent authentication required for this resource",
        requiredScopes: scopes,
        grantedScopes: [],
        resource,
        action,
        timestamp: new Date().toISOString(),
        requestId,
      };

      logger.warn(
        {
          path: c.req.path,
          method: c.req.method,
          requestId,
          code: RBACErrorCode.AGENT_NOT_AUTHENTICATED,
        },
        "RBAC: Agent not authenticated"
      );

      return c.json(error, 401);
    }

    // 2. Verificar scopes
    const hasPermission = requireAll ? hasAllScopes(agent, scopes) : hasAnyScope(agent, scopes);

    if (!hasPermission) {
      const error: RBACErrorResponse = {
        error: "Forbidden",
        code: RBACErrorCode.INSUFFICIENT_PERMISSIONS,
        message: buildErrorMessage(action, resource, scopes, agent.scopes),
        requiredScopes: scopes,
        grantedScopes: agent.scopes,
        resource,
        action,
        timestamp: new Date().toISOString(),
        requestId,
      };

      logger.warn(
        {
          agentId: agent.agentId,
          agentName: agent.agentName,
          path: c.req.path,
          method: c.req.method,
          required: scopes,
          granted: agent.scopes,
          requireAll,
          requestId,
          code: RBACErrorCode.INSUFFICIENT_PERMISSIONS,
        },
        "RBAC: Permission denied"
      );

      // Headers de seguridad para debugging
      c.header("X-RBAC-Required", scopes.join(","));
      c.header("X-RBAC-Mode", requireAll ? "all" : "any");

      return c.json(error, 403);
    }

    // 3. Agregar metadata al contexto para uso posterior
    c.set("rbac", {
      checkedScopes: scopes,
      requireAll,
      timestamp: new Date().toISOString(),
    });

    logger.debug(
      {
        agentId: agent.agentId,
        path: c.req.path,
        scopes,
        requestId,
      },
      "RBAC: Permission granted"
    );

    await next();
  };
}

/**
 * Middleware factory: Requiere un scope específico
 * Versión simplificada para un solo scope
 *
 * @example
 * ```typescript
 * app.get("/api/data", requireScope("read:database"), handler);
 * ```
 */
export function requireScope(scope: string, action?: string, resource?: string): MiddlewareHandler {
  return requireScopes({ scopes: [scope], requireAll: true, action, resource });
}

/**
 * Middleware factory: Permite acceso si tiene cualquiera de los scopes
 *
 * @example
 * ```typescript
 * app.get("/api/public", requireAnyScope(["read:public", "admin:*"]), handler);
 * ```
 */
export function requireAnyScope(
  scopes: string[],
  action?: string,
  resource?: string
): MiddlewareHandler {
  return requireScopes({ scopes, requireAll: false, action, resource });
}

/**
 * Middleware: Solo administradores (scope especial admin:*)
 *
 * @example
 * ```typescript
 * app.delete("/api/agents/:id", requireAdmin, handler);
 * ```
 */
export const requireAdmin: MiddlewareHandler = requireScope("admin:*", "administrar", "sistema");

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

export function agentAuthWithRBAC(options: AgentAuthWithRBACOptions): MiddlewareHandler {
  const { optional = false, scopes, requireAll = true, action, resource } = options;

  return async (c: Context, next: Next) => {
    const requestId = c.get("requestId") || crypto.randomUUID();

    // Importar dinámicamente para evitar dependencias circulares
    const { authenticateAgent } = await import("@/services/agent-auth");

    const authHeader = c.req.header("Authorization");

    // Si no hay header y no es opcional, rechazar
    if (!authHeader) {
      if (optional) {
        return next();
      }
      return c.json(
        {
          error: "Unauthorized",
          code: RBACErrorCode.AGENT_NOT_AUTHENTICATED,
          message: "Authorization header required",
          requiredScopes: scopes,
          grantedScopes: [],
          timestamp: new Date().toISOString(),
          requestId,
        },
        401
      );
    }

    // Verificar formato Bearer
    const [scheme, apiKey] = authHeader.split(" ");

    if (scheme !== "Bearer" || !apiKey) {
      return c.json(
        {
          error: "Unauthorized",
          code: RBACErrorCode.AGENT_NOT_AUTHENTICATED,
          message: "Invalid authorization format. Use: Bearer <api-key>",
          requiredScopes: scopes,
          grantedScopes: [],
          timestamp: new Date().toISOString(),
          requestId,
        },
        401
      );
    }

    // Autenticar agente
    const result = await authenticateAgent(apiKey, {
      // La IP de verdad, no `x-forwarded-for` crudo (lo escribe el cliente):
      // igual que el middleware global de index.ts (auditoría 2026-10-25).
      ipAddress: ipDelCliente(c),
      userAgent: c.req.header("user-agent") || undefined,
      // La audiencia de un token OAuth (RFC 8707) se comprueba contra el camino.
      ruta: c.req.path,
    });

    if (!result.success || !result.context) {
      return c.json(
        {
          error: "Unauthorized",
          code: RBACErrorCode.AGENT_NOT_AUTHENTICATED,
          message: result.error || "Authentication failed",
          requiredScopes: scopes,
          grantedScopes: [],
          timestamp: new Date().toISOString(),
          requestId,
        },
        401
      );
    }

    // Guardar en contexto
    c.set("agent", result.context);
    c.header("X-Agent-Id", result.context.agentId);
    c.header("X-RateLimit-Limit", result.context.rateLimit.toString());

    // Verificar scopes
    const hasPermission = requireAll
      ? hasAllScopes(result.context, scopes)
      : hasAnyScope(result.context, scopes);

    if (!hasPermission) {
      return c.json(
        {
          error: "Forbidden",
          code: RBACErrorCode.INSUFFICIENT_PERMISSIONS,
          message: buildErrorMessage(action, resource, scopes, result.context.scopes),
          requiredScopes: scopes,
          grantedScopes: result.context.scopes,
          resource,
          action,
          timestamp: new Date().toISOString(),
          requestId,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Helper: Construye mensaje de error descriptivo
 */
function buildErrorMessage(
  action?: string,
  resource?: string,
  required?: string[],
  granted?: string[]
): string {
  if (action && resource) {
    return (
      `El agente no tiene permiso para ${action} en ${resource}. ` +
      `Scopes requeridos: ${required?.join(", ") || "ninguno"}. ` +
      `Scopes concedidos: ${granted?.join(", ") || "ninguno"}`
    );
  }

  if (action) {
    return (
      `Permiso denegado para ${action}. ` +
      `Scopes requeridos: ${required?.join(", ") || "ninguno"}`
    );
  }

  return (
    `Permisos insuficientes. ` +
    `Requerido: ${required?.join(", ") || "ninguno"}, ` +
    `Concedido: ${granted?.join(", ") || "ninguno"}`
  );
}

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
export function checkResourceAccess(
  agent: AgentAuthContext,
  action: string,
  resource: string
): boolean {
  // Verificar scope específico
  const specificScope = `${action}:${resource}`;
  if (hasScope(agent, specificScope)) return true;

  // Verificar wildcard de recurso
  const wildcardResource = `${action}:*`;
  if (hasScope(agent, wildcardResource)) return true;

  // Verificar wildcard de admin
  if (hasScope(agent, "admin:*")) return true;

  return false;
}

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
export function getAccessibleResources(agent: AgentAuthContext, action: string): string[] {
  const resources: string[] = [];
  const actionPrefix = `${action}:`;
  const adminWildcard = "admin:*";

  for (const scope of agent.scopes) {
    // Si tiene admin:*, tiene acceso a todo
    if (scope === adminWildcard) {
      return ["*"]; // Todos los recursos
    }

    // Si coincide con la acción, extraer recurso
    if (scope.startsWith(actionPrefix)) {
      const resource = scope.slice(actionPrefix.length);
      resources.push(resource);
    }

    // Si tiene wildcard de acción
    if (scope === `${action}:*`) {
      return ["*"]; // Todos los recursos para esta acción
    }
  }

  return [...new Set(resources)]; // Eliminar duplicados
}

/**
 * Declaración de tipo para extender ContextVariableMap
 */
declare module "hono" {
  interface ContextVariableMap {
    rbac?: RBACContext;
  }
}

export default {
  requireScopes,
  requireScope,
  requireAnyScope,
  requireAdmin,
  agentAuthWithRBAC,
  checkResourceAccess,
  getAccessibleResources,
  RBACErrorCode,
};
