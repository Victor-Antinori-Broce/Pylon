/**
 * ID Generator Utilities
 * 
 * Utilidades centralizadas para generar identificadores únicos
 * con formatos estandarizados según el tipo de entidad.
 * 
 * Formato para Agentes: grm_agent_{tipo}_{hash_unico}
 * Ejemplo: grm_agent_claude_abc123xyz
 */

import { createHash, randomBytes } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

const AGENT_ID_PREFIX = "grm_agent";
const ID_HASH_LENGTH = 16; // Longitud del hash único
const API_KEY_RANDOM_LENGTH = 32; // Bytes para generar la parte aleatoria

// Tipos de agentes soportados
export const AGENT_TYPES = {
  CLAUDE_DESKTOP: "claude-desktop",
  CLAUDE_WEB: "claude-web",
  SCRAPER: "scraper",
  WORKER: "worker",
  WEBHOOK: "webhook",
  MCP_SERVER: "mcp-server",
  CUSTOM: "custom",
} as const;

export type AgentType = typeof AGENT_TYPES[keyof typeof AGENT_TYPES];

// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valida que un tipo de agente sea válido
 */
export function isValidAgentType(type: string): type is AgentType {
  return Object.values(AGENT_TYPES).includes(type as AgentType);
}

/**
 * Normaliza un tipo de agente (lowercase, sin espacios)
 */
export function normalizeAgentType(type: string): string {
  return type.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERADORES DE ID
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentIdOptions {
  /** Tipo de agente (ej: 'claude-desktop', 'scraper') */
  type: string;
  /** Longitud del hash (default: 16) */
  hashLength?: number;
}

export interface GeneratedAgentId {
  /** ID completo: grm_agent_{tipo}_{hash} */
  id: string;
  /** Solo el tipo normalizado */
  type: string;
  /** Solo el hash único */
  hash: string;
  /** Prefijo completo */
  prefix: string;
}

/**
 * Genera un ID único para un agente con formato estandarizado.
 * 
 * Formato: grm_agent_{tipo}_{hash_unico}
 * Ejemplo: grm_agent_claude-desktop_a1b2c3d4e5f67890
 * 
 * @param options - Opciones de generación
 * @returns Objeto con el ID completo y sus componentes
 * 
 * @example
 * ```typescript
 * const agentId = generateAgentId({ type: "claude-desktop" });
 * console.log(agentId.id); // "grm_agent_claude-desktop_a1b2c3d4e5f67890"
 * ```
 */
export function generateAgentId(options: AgentIdOptions): GeneratedAgentId {
  const { type, hashLength = ID_HASH_LENGTH } = options;
  
  // Normalizar el tipo
  const normalizedType = normalizeAgentType(type);
  
  if (!normalizedType) {
    throw new Error("Agent type cannot be empty");
  }
  
  if (normalizedType.length > 50) {
    throw new Error("Agent type too long (max 50 chars)");
  }
  
  // Generar hash único usando crypto seguro
  const randomPart = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString(36);
  const hashInput = `${randomPart}-${timestamp}-${Math.random()}`;
  const hash = createHash("sha256")
    .update(hashInput)
    .digest("hex")
    .slice(0, hashLength);
  
  // Construir ID completo
  const id = `${AGENT_ID_PREFIX}_${normalizedType}_${hash}`;
  
  return {
    id,
    type: normalizedType,
    hash,
    prefix: AGENT_ID_PREFIX,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERADORES DE API KEYS
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentApiKeyOptions {
  /** Tipo de agente para incluir en la key */
  type: string;
  /** Longitud de la parte aleatoria (default: 32 bytes) */
  randomLength?: number;
}

export interface GeneratedAgentApiKey {
  /** API key completa en texto plano (SOLO MOSTRAR UNA VEZ) */
  plainKey: string;
  /** Hash SHA-256 para almacenar en DB */
  keyHash: string;
  /** Prefijo para mostrar en UI (oculta parte sensible) */
  keyPrefix: string;
  /** Componentes de la key */
  components: {
    prefix: string;
    type: string;
    random: string;
  };
}

/**
 * Genera una API key para un agente con formato estandarizado.
 * 
 * Formato: grm_agent_{tipo}_{random_base64url}
 * Ejemplo: grm_agent_claude-desktop_a1b2c3d4e5f6...
 * 
 * La key generada tiene alta entropía (256 bits) y es segura
 * para uso en headers de autorización.
 * 
 * @param options - Opciones de generación
 * @returns Objeto con la key plain, hash y prefijo
 * 
 * @example
 * ```typescript
 * const apiKey = generateAgentApiKey({ type: "claude-desktop" });
 * console.log(apiKey.plainKey); // "grm_agent_claude-desktop_..."
 * console.log(apiKey.keyHash);  // Guardar esto en DB
 * ```
 */
export function generateAgentApiKey(options: AgentApiKeyOptions): GeneratedAgentApiKey {
  const { type, randomLength = API_KEY_RANDOM_LENGTH } = options;
  
  // Normalizar tipo
  const normalizedType = normalizeAgentType(type);
  
  if (!normalizedType) {
    throw new Error("Agent type cannot be empty");
  }
  
  // Generar parte aleatoria (alta entropía)
  const randomPart = randomBytes(randomLength).toString("base64url");
  
  // Construir key completa
  const plainKey = `${AGENT_ID_PREFIX}_${normalizedType}_${randomPart}`;
  
  // Crear hash para almacenar (SHA-256 es suficiente para keys aleatorias de alta entropía)
  const keyHash = createHash("sha256").update(plainKey).digest("hex");
  
  // Prefijo para UI (últimos 8 caracteres visibles)
  const keyPrefix = `${AGENT_ID_PREFIX}_${normalizedType}_****${randomPart.slice(-8)}`;
  
  return {
    plainKey,
    keyHash,
    keyPrefix,
    components: {
      prefix: AGENT_ID_PREFIX,
      type: normalizedType,
      random: randomPart,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSERS Y VALIDADORES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parsea un ID de agente para extraer sus componentes
 * 
 * @param id - ID completo (ej: "grm_agent_claude-desktop_abc123")
 * @returns Componentes del ID o null si es inválido
 */
export function parseAgentId(id: string): { prefix: string; type: string; hash: string } | null {
  const parts = id.split("_");
  
  // Debe tener al menos 3 partes: grm, agent, tipo, hash
  if (parts.length < 4) return null;
  
  // Verificar prefijo
  if (parts[0] !== "grm" || parts[1] !== "agent") return null;
  
  // El tipo puede contener guiones (partes 2 hasta la última)
  const hash = parts[parts.length - 1];
  const type = parts.slice(2, parts.length - 1).join("_");
  
  return {
    prefix: `${parts[0]}_${parts[1]}`,
    type,
    hash,
  };
}

/**
 * Valida si un string es un ID de agente válido
 * 
 * @param id - String a validar
 * @param expectedType - Tipo esperado (opcional)
 * @returns true si es válido
 */
export function isValidAgentId(id: string, expectedType?: string): boolean {
  const parsed = parseAgentId(id);
  if (!parsed) return false;
  
  if (expectedType) {
    return parsed.type === normalizeAgentType(expectedType);
  }
  
  return true;
}

/**
 * Extrae el tipo de agente de un ID
 * 
 * @param id - ID del agente
 * @returns Tipo normalizado o null si es inválido
 */
export function getAgentTypeFromId(id: string): string | null {
  const parsed = parseAgentId(id);
  return parsed?.type || null;
}

/**
 * Extrae el tipo de agente de una API key
 * 
 * @param apiKey - API key completa
 * @returns Tipo normalizado o null si es inválido
 */
export function getAgentTypeFromApiKey(apiKey: string): string | null {
  if (!apiKey.startsWith(`${AGENT_ID_PREFIX}_`)) return null;
  
  const parts = apiKey.slice(AGENT_ID_PREFIX.length + 1).split("_");
  if (parts.length < 2) return null;
  
  // El tipo son todas las partes excepto la última (random)
  return parts.slice(0, parts.length - 1).join("_");
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERADORES LEGACY (Backward Compatibility)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera una API key sin tipo (formato legacy)
 * @deprecated Use generateAgentApiKey({ type: "..." }) instead
 */
export function generateLegacyAgentApiKey(): {
  plainKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const randomPart = randomBytes(32).toString("base64url");
  const plainKey = `${AGENT_ID_PREFIX}_${randomPart}`;
  const keyHash = createHash("sha256").update(plainKey).digest("hex");
  const keyPrefix = `${AGENT_ID_PREFIX}_****${randomPart.slice(-8)}`;
  
  return { plainKey, keyHash, keyPrefix };
}
