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

import { createHash } from "crypto";

import { verify as argon2Verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";

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

/** Prefijo canónico de las Agent NHI keys. */
const API_KEY_PREFIX = "kitsuden_agent_";

/**
 * Prefijos legacy aceptados SOLO al autenticar keys ya emitidas (nunca al
 * generar). Sunset 2026-08-01, alineado con las keys `kitsuden_sk_*`.
 */
const LEGACY_API_KEY_PREFIXES = ["grm_agent_"] as const;

/** Todos los prefijos que el parser acepta durante la migración. */
export const ACCEPTED_API_KEY_PREFIXES = [API_KEY_PREFIX, ...LEGACY_API_KEY_PREFIXES] as const;

/** True si el token tiene forma de Agent NHI key (canónica o legacy). */
export function isAgentApiKey(token: string): boolean {
  return ACCEPTED_API_KEY_PREFIXES.some((p) => token.startsWith(p));
}

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
 * // plainKey: "kitsuden_agent_claude-desktop_a1b2c3..."
 * ```
 */
export async function generateAgentApiKey(type?: string): Promise<{
  plainKey: string;
  keyHash: string;
  keyId: string;
  algorithm: "argon2id";
  keyPrefix: string;
}> {
  // Si se proporciona un tipo, usar el generador tipificado
  if (type) {
    const result = await generateTypedAgentApiKey({ type });
    return {
      plainKey: result.plainKey,
      keyHash: result.keyHash,
      keyId: result.keyId,
      algorithm: result.algorithm,
      keyPrefix: result.keyPrefix,
    };
  }

  // Fallback: generar sin tipo (legacy format migrado a Argon2id)
  return generateTypedAgentApiKey({ type: "legacy" });
}

/**
 * Hashea una API key legacy con SHA-256 (solo para backward compatibility).
 * Las nuevas keys usan Argon2id del secret.
 */
export function hashApiKeyLegacy(plainKey: string): string {
  return createHash("sha256").update(plainKey).digest("hex");
}

/**
 * Parsea una API key en sus componentes.
 * Formato nuevo: kitsuden_agent_{type}_{keyId}_{secret}
 * Formato legacy: kitsuden_agent_{type}_{secret} o kitsuden_agent_{secret}
 *
 * Acepta también el prefijo `grm_agent_` de keys emitidas antes del rebrand
 * (sunset 2026-08-01); el resto del parseo es idéntico porque el prefijo solo
 * marca el inicio — el keyId y el secret van por posición.
 */
function parseAgentApiKey(
  apiKey: string
): { type: string; keyId?: string; secret: string; isLegacy: boolean } | null {
  const prefix = ACCEPTED_API_KEY_PREFIXES.find((p) => apiKey.startsWith(p));
  if (!prefix) return null;

  const rest = apiKey.slice(prefix.length);
  const parts = rest.split("_");

  // El secret siempre es la última parte (base64url)
  const secret = parts[parts.length - 1];
  if (!secret) return null;

  // Detectar formato nuevo: penúltima parte es keyId de 16 hex
  const maybeKeyId = parts[parts.length - 2];
  if (maybeKeyId && /^[a-f0-9]{16}$/.test(maybeKeyId)) {
    const type = parts.slice(0, parts.length - 2).join("_");
    return { type, keyId: maybeKeyId, secret, isLegacy: false };
  }

  // Formato legacy
  const type = parts.slice(0, parts.length - 1).join("_");
  return { type, secret: rest.slice(type ? type.length + 1 : 0), isLegacy: true };
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
    // 1. Validar y parsear formato de la key
    const parsed = parseAgentApiKey(apiKey);
    if (!parsed) {
      logAuthFailure("unknown", "Invalid API key format", metadata?.ipAddress, metadata?.userAgent);
      return {
        success: false,
        error: "Invalid API key format",
        code: "INVALID_KEY_FORMAT",
      };
    }

    // 2. Buscar key en DB según formato
    let keyRow: typeof agentApiKeys.$inferSelect | undefined;
    if (!parsed.isLegacy && parsed.keyId) {
      // Formato Argon2id: buscar por keyId público
      const [found] = await db
        .select()
        .from(agentApiKeys)
        .where(eq(agentApiKeys.keyId, parsed.keyId))
        .limit(1);
      keyRow = found;
    } else {
      // Formato legacy SHA-256: buscar por hash de la key completa
      const legacyHash = hashApiKeyLegacy(apiKey);
      const [found] = await db
        .select()
        .from(agentApiKeys)
        .where(eq(agentApiKeys.keyHash, legacyHash))
        .limit(1);
      keyRow = found;
    }

    // 3. Verificar hash y expiración con join al agente
    if (!keyRow) {
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

    const isValid =
      keyRow.algorithm === "argon2id"
        ? await argon2Verify(keyRow.keyHash, parsed.secret)
        : keyRow.keyHash === hashApiKeyLegacy(apiKey);

    if (!isValid) {
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

    if (keyRow.expiresAt && keyRow.expiresAt < new Date()) {
      logAuthFailure("unknown", "API key expired", metadata?.ipAddress, metadata?.userAgent);
      return {
        success: false,
        error: "API key expired",
        code: "INVALID_KEY",
      };
    }

    const [agent] = await db
      .select()
      .from(agentIdentities)
      .where(eq(agentIdentities.id, keyRow.agentId))
      .limit(1);

    if (!agent) {
      logAuthFailure(keyRow.agentId, "Agent not found", metadata?.ipAddress, metadata?.userAgent);
      return {
        success: false,
        error: "Agent not found",
        code: "AGENT_NOT_FOUND",
      };
    }

    const key = keyRow;

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

  // Generar API key con tipo incluido (Argon2id)
  const { plainKey, keyHash, keyId, algorithm, keyPrefix } = await generateAgentApiKey(type);

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
    keyId,
    keyHash,
    keyPrefix,
    algorithm,
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

    // Formato: "Bearer kitsuden_agent_xxxxx"
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
