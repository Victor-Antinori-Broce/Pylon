/**
 * ID Generator Utilities
 *
 * Utilidades centralizadas para generar identificadores únicos
 * con formatos estandarizados según el tipo de entidad.
 *
 * Formato para Agentes: kitsuden_agent_{tipo}_{hash_unico}
 * Ejemplo: kitsuden_agent_claude_abc123xyz
 */

import { createHash, randomBytes } from "crypto";

import { hash as argon2Hash } from "@node-rs/argon2";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

const AGENT_ID_PREFIX = "kitsuden_agent";

/**
 * Prefijos legacy aceptados SOLO al parsear/validar identidades ya emitidas.
 * Nunca se generan. Sunset 2026-08-01 (mismo que las keys `kitsuden_sk_*`), tras
 * el cual se elimina esta lista y los tokens antiguos dejan de autenticar.
 */
const LEGACY_AGENT_ID_PREFIXES = ["grm_agent"] as const;

/** Prefijo canónico + legacy, para parseo tolerante durante la migración. */
const ACCEPTED_AGENT_ID_PREFIXES = [AGENT_ID_PREFIX, ...LEGACY_AGENT_ID_PREFIXES];

/** Devuelve el prefijo aceptado con el que empieza `value`, o null. */
function matchAgentPrefix(value: string): string | null {
  return ACCEPTED_AGENT_ID_PREFIXES.find((p) => value.startsWith(`${p}_`)) ?? null;
}
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

export type AgentType = (typeof AGENT_TYPES)[keyof typeof AGENT_TYPES];

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
  return type
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
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
  /** ID completo: kitsuden_agent_{tipo}_{hash} */
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
 * Formato: kitsuden_agent_{tipo}_{hash_unico}
 * Ejemplo: kitsuden_agent_claude-desktop_a1b2c3d4e5f67890
 *
 * @param options - Opciones de generación
 * @returns Objeto con el ID completo y sus componentes
 *
 * @example
 * ```typescript
 * const agentId = generateAgentId({ type: "claude-desktop" });
 * console.log(agentId.id); // "kitsuden_agent_claude-desktop_a1b2c3d4e5f67890"
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
  const hash = createHash("sha256").update(hashInput).digest("hex").slice(0, hashLength);

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
  /** Hash Argon2id del secret para almacenar en DB */
  keyHash: string;
  /** keyId público para lookup en DB */
  keyId: string;
  /** Algoritmo de hashing */
  algorithm: "argon2id";
  /** Prefijo para mostrar en UI (oculta parte sensible) */
  keyPrefix: string;
  /** Componentes de la key */
  components: {
    prefix: string;
    type: string;
    keyId: string;
    secret: string;
  };
}

/**
 * Genera una API key para un agente con formato estandarizado y Argon2id.
 *
 * Formato nuevo: kitsuden_agent_{tipo}_{key_id}_{secret}
 * Ejemplo: kitsuden_agent_claude-desktop_a1b2c3d4e5f67890_xxxxxxxx...
 *
 * - key_id: identificador público de 16 hex (64 bits) para lookup en DB.
 * - secret: parte secreta de 256 bits hasheada con Argon2id.
 *
 * @param options - Opciones de generación
 * @returns Objeto con la key plain, hash Argon2id y keyId
 *
 * @example
 * ```typescript
 * const apiKey = await generateAgentApiKey({ type: "claude-desktop" });
 * console.log(apiKey.plainKey); // "kitsuden_agent_claude-desktop_..."
 * console.log(apiKey.keyHash);  // Guardar esto en DB
 * ```
 */
export async function generateAgentApiKey(
  options: AgentApiKeyOptions
): Promise<GeneratedAgentApiKey> {
  const { type, randomLength = API_KEY_RANDOM_LENGTH } = options;

  // Normalizar tipo
  const normalizedType = normalizeAgentType(type);

  if (!normalizedType) {
    throw new Error("Agent type cannot be empty");
  }

  // key_id público de 16 hex (64 bits) para lookup único
  const keyId = randomBytes(8).toString("hex");

  // Secret de alta entropía (256 bits)
  const secret = randomBytes(randomLength).toString("base64url");

  // Key completa
  const plainKey = `${AGENT_ID_PREFIX}_${normalizedType}_${keyId}_${secret}`;

  // Hash Argon2id del secret (no de toda la key)
  const keyHash = await argon2Hash(secret);

  // Prefijo para UI (últimos 4 chars del keyId)
  const keyPrefix = `${AGENT_ID_PREFIX}_${normalizedType}_****${keyId.slice(-4)}`;

  return {
    plainKey,
    keyHash,
    keyId,
    algorithm: "argon2id",
    keyPrefix,
    components: {
      prefix: AGENT_ID_PREFIX,
      type: normalizedType,
      keyId,
      secret,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSERS Y VALIDADORES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parsea un ID de agente para extraer sus componentes
 *
 * @param id - ID completo (ej: "kitsuden_agent_claude-desktop_abc123")
 * @returns Componentes del ID o null si es inválido
 */
export function parseAgentId(id: string): { prefix: string; type: string; hash: string } | null {
  // Acepta el prefijo canónico (kitsuden_agent) y los legacy en sunset (grm_agent).
  const prefix = matchAgentPrefix(id);
  if (!prefix) return null;

  const parts = id.slice(prefix.length + 1).split("_");

  // Debe quedar al menos tipo + hash
  if (parts.length < 2) return null;

  // El tipo puede contener guiones bajos (todo menos la última parte)
  const hash = parts[parts.length - 1];
  const type = parts.slice(0, parts.length - 1).join("_");

  return { prefix, type, hash };
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
  const prefix = matchAgentPrefix(apiKey);
  if (!prefix) return null;

  const parts = apiKey.slice(prefix.length + 1).split("_");
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
export async function generateLegacyAgentApiKey(): Promise<{
  plainKey: string;
  keyHash: string;
  keyId: string;
  algorithm: "argon2id";
  keyPrefix: string;
}> {
  return generateAgentApiKey({ type: "legacy" });
}
