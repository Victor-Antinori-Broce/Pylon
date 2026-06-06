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

import { createHash, randomBytes } from "crypto";

import { eq, and, sql } from "drizzle-orm";

import { db } from "../db";
import { agentIdentities, agentApiKeys } from "../db/schema";
import { generateAgentApiKey as generateTypedAgentApiKey } from "../utils/id-generator";

import { logAuthSuccess, logAuthFailure, logRateLimited } from "./agent-audit";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

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

// Rate limit cache en memoria (para reducir queries a DB)
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitCache = new Map<string, RateLimitEntry>();

// ═══════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE API KEYS (CON TIPO)
// ═══════════════════════════════════════════════════════════════════════════

const API_KEY_PREFIX = "grm_agent_";

// Re-exportar tipos y constantes para conveniencia
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
export async function generateAgentApiKey(type?: string): Promise<{
  plainKey: string;
  keyHash: string;
  keyPrefix: string;
}> {
  // Si se proporciona un tipo, usar el generador tipificado
  if (type) {
    const result = generateTypedAgentApiKey({ type });
    return {
      plainKey: result.plainKey,
      keyHash: result.keyHash,
      keyPrefix: result.keyPrefix,
    };
  }

  // Fallback: generar sin tipo (legacy format)
  const randomPart = randomBytes(32).toString("base64url");
  const plainKey = `${API_KEY_PREFIX}_${randomPart}`;
  const keyHash = createHash("sha256").update(plainKey).digest("hex");
  const keyPrefix = `${API_KEY_PREFIX}_****${randomPart.slice(-8)}`;

  return { plainKey, keyHash, keyPrefix };
}

/**
 * Hashea una API key existente (para verificación)
 */
export function hashApiKey(plainKey: string): string {
  return createHash("sha256").update(plainKey).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE AGENTES
// ═══════════════════════════════════════════════════════════════════════════

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
export async function authenticateAgent(
  apiKey: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<AgentAuthResult> {
  try {
    // 1. Validar formato de la key
    if (!apiKey.startsWith(API_KEY_PREFIX)) {
      logAuthFailure("unknown", "Invalid API key format", metadata?.ipAddress, metadata?.userAgent);
      return {
        success: false,
        error: "Invalid API key format",
        code: "INVALID_KEY_FORMAT",
      };
    }

    // 2. Hashear la key para buscarla
    const keyHash = hashApiKey(apiKey);

    // 3. Buscar en DB con join al agente
    const result = await db
      .select({
        key: agentApiKeys,
        agent: agentIdentities,
      })
      .from(agentApiKeys)
      .innerJoin(agentIdentities, eq(agentApiKeys.agentId, agentIdentities.id))
      .where(
        and(
          eq(agentApiKeys.keyHash, keyHash),
          // Verificar que no esté expirada
          sql`${agentApiKeys.expiresAt} IS NULL OR ${agentApiKeys.expiresAt} > NOW()`
        )
      )
      .limit(1);

    if (result.length === 0) {
      logAuthFailure(
        "unknown",
        "Invalid or expired API key",
        metadata?.ipAddress,
        metadata?.userAgent
      );
      return {
        success: false,
        error: "Invalid or expired API key",
        code: "INVALID_KEY",
      };
    }

    const { key, agent } = result[0];

    // 4. Verificar que el agente esté activo
    if (!agent.isActive) {
      logAuthFailure(agent.id, "Agent is deactivated", metadata?.ipAddress, metadata?.userAgent);
      return {
        success: false,
        error: "Agent is deactivated",
        code: "AGENT_DEACTIVATED",
      };
    }

    // 5. Verificar rate limit
    const rateLimitCheck = await checkRateLimit(agent.id, agent.rateLimit ?? 60);
    if (!rateLimitCheck.allowed) {
      logRateLimited(agent.id, agent.rateLimit ?? 60, metadata?.ipAddress);
      return {
        success: false,
        error: `Rate limit exceeded. Max ${agent.rateLimit} requests per minute`,
        code: "RATE_LIMIT_EXCEEDED",
      };
    }

    // 6. Actualizar last_used_at (async, no bloqueamos la respuesta)
    updateLastUsed(key.id).catch(() => {
      // Silenciar errores de auditoría
    });

    // 7. Loguear autenticación exitosa
    logAuthSuccess(agent.id, key.id, metadata?.ipAddress, metadata?.userAgent);

    return {
      success: true,
      context: {
        agentId: agent.id,
        agentName: agent.name,
        scopes: (agent.scopes as string[] | null) ?? [],
        rateLimit: agent.rateLimit ?? 60,
        keyId: key.id,
      },
    };
  } catch (error) {
    console.error("[AgentAuth] Authentication error:", error);
    return {
      success: false,
      error: "Authentication failed",
      code: "AUTH_ERROR",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Verifica el rate limit para un agente
 * Ventana de 1 minuto
 */
async function checkRateLimit(agentId: string, maxRequests: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  const cacheKey = `ratelimit:${agentId}`;

  let entry = rateLimitCache.get(cacheKey);

  // Si no hay entrada o la ventana expiró, crear nueva
  if (!entry || now - entry.windowStart > windowMs) {
    entry = {
      count: 1,
      windowStart: now,
    };
    rateLimitCache.set(cacheKey, entry);

    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    };
  }

  // Incrementar contador
  entry.count++;

  const allowed = entry.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetTime = entry.windowStart + windowMs;

  return {
    allowed,
    remaining,
    resetTime,
  };
}

/**
 * Limpia entradas antiguas del cache de rate limit
 * Ejecutar periódicamente (ej. cada 5 minutos)
 */
export function cleanupRateLimitCache(): void {
  const now = Date.now();
  const windowMs = 60 * 1000;

  for (const [key, entry] of rateLimitCache.entries()) {
    if (now - entry.windowStart > windowMs) {
      rateLimitCache.delete(key);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA
// ═══════════════════════════════════════════════════════════════════════════

async function updateLastUsed(keyId: string): Promise<void> {
  await db.update(agentApiKeys).set({ lastUsedAt: new Date() }).where(eq(agentApiKeys.id, keyId));
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICACIÓN DE SCOPES (Zero Trust)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica si un agente tiene un scope específico
 */
export function hasScope(agentContext: AgentAuthContext, requiredScope: string): boolean {
  const grantedScopes = agentContext.scopes || [];

  // 1. Super-scope: admin:* o admin permiten TODO
  if (grantedScopes.includes("admin:*") || grantedScopes.includes("admin")) {
    return true;
  }

  // 2. Verificar cada scope concedido
  return grantedScopes.some((scope) => {
    // Match exacto
    if (scope === requiredScope) return true;

    // Match con wildcard de recurso (ej: "read:*" permite "read:users")
    if (scope.endsWith(":*")) {
      const prefix = scope.slice(0, -1); // "read:*" -> "read:"
      return requiredScope.startsWith(prefix);
    }

    // Match con wildcard de acción (ej: "*:database" permite "read:database")
    if (scope.startsWith("*:")) {
      const suffix = scope.slice(1); // "*:database" -> ":database"
      return requiredScope.endsWith(suffix);
    }

    return false;
  });
}

/**
 * Verifica múltiples scopes (requiere TODOS)
 */
export function hasAllScopes(agentContext: AgentAuthContext, requiredScopes: string[]): boolean {
  return requiredScopes.every((scope) => hasScope(agentContext, scope));
}

/**
 * Verifica múltiples scopes (requiere AL MENOS UNO)
 */
export function hasAnyScope(agentContext: AgentAuthContext, requiredScopes: string[]): boolean {
  return requiredScopes.some((scope) => hasScope(agentContext, scope));
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

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
export async function createAgent(params: {
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
}> {
  const {
    name,
    description,
    type = "custom",
    capabilities = [],
    systemPrompt,
    allowedTools = [],
    scopes = [],
    rateLimit = 60,
    expiresInDays,
  } = params;

  // Generar API key con tipo incluido
  const { plainKey, keyHash, keyPrefix } = await generateAgentApiKey(type);

  // Crear agente con nuevos campos de persona
  const [agent] = await db
    .insert(agentIdentities)
    .values({
      name,
      description,
      type,
      capabilities,
      systemPrompt,
      allowedTools,
      scopes,
      rateLimit,
    })
    .returning();

  // Crear API key
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await db.insert(agentApiKeys).values({
    agentId: agent.id,
    keyHash,
    keyPrefix,
    expiresAt,
  });

  return { agent, plainApiKey: plainKey };
}

/**
 * Revoca una API key
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  await db.delete(agentApiKeys).where(eq(agentApiKeys.id, keyId));
}

/**
 * Desactiva un agente (elimina todas sus keys)
 */
export async function deactivateAgent(agentId: string): Promise<void> {
  await db.delete(agentApiKeys).where(eq(agentApiKeys.agentId, agentId));
  // Opcional: también podríamos marcar el agente como inactivo
}

/**
 * Obtiene todos los agentes con sus keys
 */
export async function listAgents() {
  const agents = await db.select().from(agentIdentities);

  const agentsWithKeys = await Promise.all(
    agents.map(async (agent) => {
      const keys = await db
        .select({
          id: agentApiKeys.id,
          keyPrefix: agentApiKeys.keyPrefix,
          createdAt: agentApiKeys.createdAt,
          lastUsedAt: agentApiKeys.lastUsedAt,
          expiresAt: agentApiKeys.expiresAt,
        })
        .from(agentApiKeys)
        .where(eq(agentApiKeys.agentId, agent.id));

      return {
        ...agent,
        keys,
      };
    })
  );

  return agentsWithKeys;
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

import type { MiddlewareHandler, Context, Next } from "hono";

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
export function requireAgentAuth(options?: {
  scopes?: string[];
  requireAll?: boolean;
}): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // 1. Obtener API key del header
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      return c.json(
        {
          error: "Authorization header required",
          code: "MISSING_AUTH",
        },
        401
      );
    }

    // Formato: "Bearer grm_agent_xxxxx"
    const [scheme, apiKey] = authHeader.split(" ");

    if (scheme !== "Bearer" || !apiKey) {
      return c.json(
        {
          error: "Invalid authorization format. Use: Bearer <api-key>",
          code: "INVALID_AUTH_FORMAT",
        },
        401
      );
    }

    // 2. Autenticar
    const result = await authenticateAgent(apiKey);

    if (!result.success || !result.context) {
      return c.json(
        {
          error: result.error,
          code: result.code,
        },
        401
      );
    }

    // 3. Verificar scopes si se requieren
    if (options?.scopes && options.scopes.length > 0) {
      const hasScopes =
        options.requireAll !== false
          ? hasAllScopes(result.context, options.scopes)
          : hasAnyScope(result.context, options.scopes);

      if (!hasScopes) {
        return c.json(
          {
            error: "Insufficient permissions",
            code: "FORBIDDEN",
            required: options.scopes,
            granted: result.context.scopes,
          },
          403
        );
      }
    }

    // 4. Guardar en contexto
    c.set("agent", result.context);

    // 5. Agregar headers de rate limit a la respuesta
    c.header("X-Agent-Id", result.context.agentId);
    c.header("X-RateLimit-Limit", result.context.rateLimit.toString());

    await next();
  };
}

/**
 * Middleware opcional: autentica si hay key, pero no requiere
 */
export function optionalAgentAuth(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (authHeader) {
      const [scheme, apiKey] = authHeader.split(" ");

      if (scheme === "Bearer" && apiKey) {
        const result = await authenticateAgent(apiKey);

        if (result.success && result.context) {
          c.set("agent", result.context);
        }
      }
    }

    await next();
  };
}
