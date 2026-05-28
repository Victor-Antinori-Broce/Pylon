/**
 * Agent Authentication Service (NHI - Non-Human Identities)
 *
 * Servicio de autenticación para Agentes de IA (MCP, Workers, Automatización)
 *
 * Características:
 * - Validación de API keys con hashing seguro (argon2)
 * - Verificación de scopes (Zero Trust)
 * - Rate limiting por agente (FinOps)
 * - Auditoría de uso
 */
import { agentIdentities } from "../db/schema";
export interface AgentAuthContext {
    agentId: string;
    agentName: string;
    scopes: string[];
    rateLimit: number;
    keyId: string;
}
export interface AgentAuthResult {
    success: boolean;
    context?: AgentAuthContext;
    error?: string;
    code?: string;
}
export { AGENT_TYPES, type AgentType, getAgentTypeFromApiKey } from "../utils/id-generator";
/**
 * Genera una nueva API key para un agente
 * Retorna la key en texto plano (SOLO UNA VEZ) y el hash para almacenar
 *
 * @param type - Tipo de agente (ej: 'claude-desktop', 'scraper')
 * @returns Objeto con plainKey, keyHash y keyPrefix
 *
 * @example
 * ```typescript
 * const { plainKey, keyHash, keyPrefix } = await generateAgentApiKey('claude-desktop');
 * // plainKey: "grm_agent_claude-desktop_a1b2c3..."
 * ```
 */
export declare function generateAgentApiKey(type?: string): Promise<{
    plainKey: string;
    keyHash: string;
    keyPrefix: string;
}>;
/**
 * Hashea una API key existente (para verificación)
 */
export declare function hashApiKey(plainKey: string): string;
/**
 * Autentica un agente por su API key
 *
 * Flujo:
 * 1. Validar formato de la key
 * 2. Buscar key_hash en DB
 * 3. Verificar que no esté expirada
 * 4. Verificar que el agente esté activo
 * 5. Obtener agente y sus scopes
 * 6. Verificar rate limit
 * 7. Actualizar last_used_at y loguear
 */
export declare function authenticateAgent(apiKey: string, metadata?: {
    ipAddress?: string;
    userAgent?: string;
}): Promise<AgentAuthResult>;
/**
 * Limpia entradas antiguas del cache de rate limit
 * Ejecutar periódicamente (ej. cada 5 minutos)
 */
export declare function cleanupRateLimitCache(): void;
/**
 * Verifica si un agente tiene un scope específico
 */
export declare function hasScope(agentContext: AgentAuthContext, requiredScope: string): boolean;
/**
 * Verifica múltiples scopes (requiere TODOS)
 */
export declare function hasAllScopes(agentContext: AgentAuthContext, requiredScopes: string[]): boolean;
/**
 * Verifica múltiples scopes (requiere AL MENOS UNO)
 */
export declare function hasAnyScope(agentContext: AgentAuthContext, requiredScopes: string[]): boolean;
/**
 * Crea un nuevo agente con su API key
 *
 * @param params - Parámetros para crear el agente
 * @returns Agente creado y API key en texto plano
 *
 * @example
 * ```typescript
 * const { agent, plainApiKey } = await createAgent({
 *   name: "Claude Desktop",
 *   type: "claude-desktop",
 *   capabilities: ["web-search", "code-generation"],
 *   systemPrompt: "Eres un asistente de desarrollo...",
 *   allowedTools: ["read_dataset", "write_post"]
 * });
 * ```
 */
export declare function createAgent(params: {
    name: string;
    description?: string;
    type?: string;
    capabilities?: string[];
    systemPrompt?: string;
    allowedTools?: string[];
    scopes?: string[];
    rateLimit?: number;
    expiresInDays?: number;
}): Promise<{
    agent: typeof agentIdentities.$inferSelect;
    plainApiKey: string;
}>;
/**
 * Revoca una API key
 */
export declare function revokeApiKey(keyId: string): Promise<void>;
/**
 * Desactiva un agente (elimina todas sus keys)
 */
export declare function deactivateAgent(agentId: string): Promise<void>;
/**
 * Obtiene todos los agentes con sus keys
 */
export declare function listAgents(): Promise<{
    keys: {
        id: string;
        keyPrefix: string;
        createdAt: Date;
        lastUsedAt: Date | null;
        expiresAt: Date | null;
    }[];
    id: string;
    name: string;
    description: string | null;
    type: string;
    scopes: unknown;
    rateLimit: number | null;
    capabilities: unknown;
    systemPrompt: string | null;
    allowedTools: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}[]>;
import type { MiddlewareHandler } from "hono";
/**
 * Extiende el contexto de Hono con agente
 */
declare module "hono" {
    interface ContextVariableMap {
        agent: AgentAuthContext;
    }
}
/**
 * Middleware factory para requerir autenticación de agente
 */
export declare function requireAgentAuth(options?: {
    scopes?: string[];
    requireAll?: boolean;
}): MiddlewareHandler;
/**
 * Middleware opcional: autentica si hay key, pero no requiere
 */
export declare function optionalAgentAuth(): MiddlewareHandler;
//# sourceMappingURL=agent-auth.d.ts.map