/**
 * ID Generator Utilities
 *
 * Utilidades centralizadas para generar identificadores únicos
 * con formatos estandarizados según el tipo de entidad.
 *
 * Formato para Agentes: grm_agent_{tipo}_{hash_unico}
 * Ejemplo: grm_agent_claude_abc123xyz
 */
export declare const AGENT_TYPES: {
    readonly CLAUDE_DESKTOP: "claude-desktop";
    readonly CLAUDE_WEB: "claude-web";
    readonly SCRAPER: "scraper";
    readonly WORKER: "worker";
    readonly WEBHOOK: "webhook";
    readonly MCP_SERVER: "mcp-server";
    readonly CUSTOM: "custom";
};
export type AgentType = typeof AGENT_TYPES[keyof typeof AGENT_TYPES];
/**
 * Valida que un tipo de agente sea válido
 */
export declare function isValidAgentType(type: string): type is AgentType;
/**
 * Normaliza un tipo de agente (lowercase, sin espacios)
 */
export declare function normalizeAgentType(type: string): string;
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
export declare function generateAgentId(options: AgentIdOptions): GeneratedAgentId;
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
export declare function generateAgentApiKey(options: AgentApiKeyOptions): GeneratedAgentApiKey;
/**
 * Parsea un ID de agente para extraer sus componentes
 *
 * @param id - ID completo (ej: "grm_agent_claude-desktop_abc123")
 * @returns Componentes del ID o null si es inválido
 */
export declare function parseAgentId(id: string): {
    prefix: string;
    type: string;
    hash: string;
} | null;
/**
 * Valida si un string es un ID de agente válido
 *
 * @param id - String a validar
 * @param expectedType - Tipo esperado (opcional)
 * @returns true si es válido
 */
export declare function isValidAgentId(id: string, expectedType?: string): boolean;
/**
 * Extrae el tipo de agente de un ID
 *
 * @param id - ID del agente
 * @returns Tipo normalizado o null si es inválido
 */
export declare function getAgentTypeFromId(id: string): string | null;
/**
 * Extrae el tipo de agente de una API key
 *
 * @param apiKey - API key completa
 * @returns Tipo normalizado o null si es inválido
 */
export declare function getAgentTypeFromApiKey(apiKey: string): string | null;
/**
 * Genera una API key sin tipo (formato legacy)
 * @deprecated Use generateAgentApiKey({ type: "..." }) instead
 */
export declare function generateLegacyAgentApiKey(): {
    plainKey: string;
    keyHash: string;
    keyPrefix: string;
};
//# sourceMappingURL=id-generator.d.ts.map