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

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

import { concedeScope, puedeFirmar, type FirmanteDeAgente } from "@kitsuden/shared";
import { verify as argon2Verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { agentIdentities, agentApiKeys, authUsers } from "../db/schema";
import { generateAgentApiKey as generateTypedAgentApiKey } from "../utils/id-generator";
import { leerAjustesMcp, type AjustesMcp } from "../lib/ajustes-mcp";
import {
  buscarTokenDeAcceso,
  concesionDeClave,
  esTokenDeAccesoOAuth,
  scopesEfectivos,
} from "../lib/oauth/tokens";

import { logAuthSuccess, logAuthFailure } from "./agent-audit";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentAuthContext {
  agentId: string;
  agentName: string;
  scopes: string[];
  /** Peticiones por minuto. */
  rateLimit: number;
  /** Escrituras por día UTC (null = sin límite). Ver lib/cuotas-de-agente.ts. */
  writesPerDay: number | null;
  /** Unidades de presupuesto por día UTC (null = sin límite). */
  budgetUnitsPerDay: number | null;
  keyId: string;
  /**
   * Herramientas MCP que este agente puede usar (lo que se configura en el
   * panel). Vacío = sin lista: decide solo el scope de cada herramienta.
   */
  allowedTools: string[];
  /**
   * Fase F: el humano que FIRMA lo que el agente crea (`null` = sin
   * firmante). `valido: false` si la cuenta ya no existe o no es del equipo.
   * Ver @kitsuden/shared firmante.ts.
   */
  sponsor?: FirmanteDeAgente | null;
  /**
   * Ajustes MCP del panel (migración 0052): toolset por defecto y envoltorio
   * del contenido no confiable. `{}` = lo de siempre. Ver lib/ajustes-mcp.ts.
   */
  mcpSettings?: AjustesMcp;
  /**
   * OAuth para MCP (migración 0055): la conexión por la que entró, si entró
   * con un token OAuth y no con su clave estática. `keyId` es entonces la fila
   * `agent_api_keys` (algorithm 'oauth') de esa conexión. Ver lib/oauth/.
   */
  oauth?: { clientId: string; grantId: string };
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICACIONES ARGON2 YA HECHAS (rendimiento, 2026-10-27)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * argon2id cuesta ~31 ms de CPU por verificación (m=19456, t=2) y se hacía en
 * CADA petición de un agente —dos veces en `/api/mcp`—: medido en una copia de
 * producción, un agente no pasaba de ~20 peticiones por segundo con la CPU al
 * 220 %. Es el coste que tiene que pagar quien PRUEBA secretos, no quien ya
 * demostró que tiene uno.
 *
 * Aquí se recuerda, por clave, que un secreto concreto ya verificó contra un
 * hash concreto:
 *
 *   · Se guarda un HMAC-SHA256 del secreto con una clave aleatoria de ESTE
 *     proceso (nunca el secreto, y no sirve fuera del proceso), junto al
 *     `keyHash` de la fila contra el que verificó.
 *   · Solo se usa si la fila sigue teniendo el MISMO `keyHash` y el HMAC del
 *     secreto presentado coincide (comparación en tiempo constante). Un
 *     secreto distinto, o una clave rotada, vuelve a argon2.
 *   · Los fallos NO se recuerdan: cada intento con un secreto equivocado paga
 *     argon2 entero, como antes.
 *   · No cambia nada de lo que se comprueba después: la fila de la clave y la
 *     del agente se siguen leyendo de la base en CADA petición, así que una
 *     clave revocada, caducada o un agente desactivado dejan de valer en la
 *     petición siguiente, igual que antes.
 *   · Caduca a los `AGENT_KEY_VERIFY_CACHE_SECONDS` (300 s; 0 la apaga) y
 *     tiene tope de entradas.
 */
const SECRETO_DEL_PROCESO = randomBytes(32);
const VIDA_VERIFICADA_MS = (() => {
  const n = Number(process.env.AGENT_KEY_VERIFY_CACHE_SECONDS ?? 300);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 3600) * 1000 : 300_000;
})();
const MAX_VERIFICADAS = 10_000;
const verificadas = new Map<string, { keyHash: string; huella: Buffer; hasta: number }>();

function huellaDeSecreto(secreto: string): Buffer {
  return createHmac("sha256", SECRETO_DEL_PROCESO).update(secreto).digest();
}

/** argon2 de la clave `keyRowId`, o el recuerdo de una verificación idéntica reciente. */
async function verificarArgon2ConMemoria(keyRowId: string, keyHash: string, secreto: string): Promise<boolean> {
  const huella = huellaDeSecreto(secreto);
  const ahora = Date.now();
  const recuerdo = verificadas.get(keyRowId);
  if (
    recuerdo &&
    recuerdo.hasta > ahora &&
    recuerdo.keyHash === keyHash &&
    timingSafeEqual(recuerdo.huella, huella)
  ) {
    return true;
  }
  const valida = await argon2Verify(keyHash, secreto);
  if (valida && VIDA_VERIFICADA_MS > 0) {
    if (verificadas.size >= MAX_VERIFICADAS) {
      for (const [k, v] of verificadas) if (v.hasta <= ahora) verificadas.delete(k);
      if (verificadas.size >= MAX_VERIFICADAS) verificadas.delete(verificadas.keys().next().value as string);
    }
    verificadas.set(keyRowId, { keyHash, huella, hasta: ahora + VIDA_VERIFICADA_MS });
  }
  // Un secreto equivocado NO borra lo recordado: si lo hiciera, cualquiera que
  // conozca el id público de una clave obligaría a su dueño a pagar argon2 en
  // cada petición. No hace falta: el recuerdo solo vale para el secreto bueno.
  return valida;
}

/**
 * La autenticación ya hecha para ESTA petición (rendimiento, 2026-10-27).
 *
 * `/api/mcp` pasa por la autenticación global (index.ts) y luego por la suya
 * propia, con la MISMA cabecera: se autenticaba dos veces (dos argon2, dos
 * filas de auditoría `auth_success`, dos lecturas de clave y agente). La global
 * deja aquí su resultado, atado al objeto `Request` y al token exacto; la del
 * MCP lo reutiliza solo si coincide el token. Es la misma petición y la misma
 * lectura de la base de hace microsegundos: nada que revocar entre medias.
 */
const autenticadasEnLaPeticion = new WeakMap<object, { token: string; resultado: AgentAuthResult }>();

export function recordarAutenticacionDeLaPeticion(peticion: object, token: string, resultado: AgentAuthResult): void {
  if (resultado.success) autenticadasEnLaPeticion.set(peticion, { token, resultado });
}

export function autenticacionDeLaPeticion(peticion: object, token: string): AgentAuthResult | null {
  const r = autenticadasEnLaPeticion.get(peticion);
  return r && r.token === token ? r.resultado : null;
}

/** Para pruebas: olvida las verificaciones recordadas. */
export function olvidarVerificacionesDeClaves(): void {
  verificadas.clear();
}

/**
 * El firmante de un agente, comprobado AHORA (una consulta por clave primaria,
 * solo si el agente tiene firmante): existe y es admin o editor.
 */
export async function firmanteDeAgente(sponsorUserId: string | null | undefined): Promise<FirmanteDeAgente | null> {
  if (!sponsorUserId) return null;
  const [u] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, sponsorUserId))
    .limit(1);
  if (!u) return { userId: sponsorUserId, valido: false, motivo: "not_found" };
  return puedeFirmar(u.role)
    ? { userId: sponsorUserId, valido: true }
    : { userId: sponsorUserId, valido: false, motivo: "not_staff" };
}

export interface AgentAuthResult {
  success: boolean;
  context?: AgentAuthContext;
  error?: string;
  code?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE API KEYS (CON TIPO)
// ═══════════════════════════════════════════════════════════════════════════

/** Prefijo canónico de las Agent NHI keys. */
const API_KEY_PREFIX = "kitsuden_agent_";

/**
 * Prefijos legacy: NINGUNO. `grm_agent_*` tenía sunset 2026-08-01 y se seguía
 * aceptando por REST (auditoría 2026-10-25); además hay una clave con ese
 * prefijo publicada en `docs/notes`. Retirarlo la invalida aunque no se haya
 * revocado. Ninguna web ni Inti la usaban.
 */
const LEGACY_API_KEY_PREFIXES = [] as const;

/** Todos los prefijos que el parser acepta durante la migración. */
export const ACCEPTED_API_KEY_PREFIXES = [API_KEY_PREFIX, ...LEGACY_API_KEY_PREFIXES] as const;

/** True si el token tiene forma de Agent NHI key (canónica o legacy). */
export function isAgentApiKey(token: string): boolean {
  return ACCEPTED_API_KEY_PREFIXES.some((p) => token.startsWith(p));
}

/**
 * True si el token es una credencial de agente: clave estática o token de
 * acceso OAuth (`kitsuden_oat_*`, lib/oauth). Las dos las resuelve
 * `authenticateAgent` al MISMO contexto de agente.
 */
export function esCredencialDeAgente(token: string): boolean {
  return isAgentApiKey(token) || esTokenDeAccesoOAuth(token);
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
export function parseAgentApiKey(
  apiKey: string
): { type: string; keyId?: string; secret: string; isLegacy: boolean } | null {
  const prefix = ACCEPTED_API_KEY_PREFIXES.find((p) => apiKey.startsWith(p));
  if (!prefix) return null;

  const rest = apiKey.slice(prefix.length);

  // Formato nuevo: `{type}_{keyId}_{secret}`, con keyId de 16 hex.
  //
  // El secret es base64url y PUEDE llevar `_`. Antes se partía por `_` y se
  // tomaba la última parte como secret y la penúltima como keyId: con un `_`
  // dentro del secret (≈ la mitad de las claves emitidas: 43 caracteres, 1/64
  // cada uno) ni el keyId ni el secret salían bien y la clave NUNCA
  // autenticaba. Se ancla en el primer `_<16 hex>_` y el resto entero es el
  // secret (auditoría 2026-10-15).
  const nuevo = /^(.*?)_([a-f0-9]{16})_(.+)$/.exec(rest);
  if (nuevo) {
    return { type: nuevo[1]!, keyId: nuevo[2]!, secret: nuevo[3]!, isLegacy: false };
  }

  const parts = rest.split("_");
  const secret = parts[parts.length - 1];
  if (!secret) return null;

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
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    /**
     * Camino de la petición. Un token OAuth solo vale en el recurso para el
     * que se emitió (`/api/mcp`, RFC 8707); sin camino, se rechaza.
     */
    ruta?: string;
  }
): Promise<AgentAuthResult> {
  if (esTokenDeAccesoOAuth(apiKey)) return autenticarTokenOAuth(apiKey, metadata);
  try {
    // 1. Validar y parsear formato de la key
    const parsed = parseAgentApiKey(apiKey);
    if (!parsed) {
      // Sin agente conocido: `null`, no "unknown" (violaba la FK y el intento
      // no quedaba auditado). Ver AuditLogEntry.agentId.
      logAuthFailure(null, "Invalid API key format", metadata?.ipAddress, metadata?.userAgent);
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

    // El id PÚBLICO de la clave que se intentó (nunca el secreto): permite ver
    // en la auditoría que alguien prueba contra una clave concreta.
    const intento = parsed.keyId ? { attemptedKeyId: parsed.keyId } : undefined;

    // 3. Verificar hash y expiración con join al agente
    if (!keyRow) {
      logAuthFailure(
        null,
        "Invalid or expired API key",
        metadata?.ipAddress,
        metadata?.userAgent,
        intento
      );
      return {
        success: false,
        error: "Invalid or expired API key",
        code: "INVALID_KEY",
      };
    }

    const isValid =
      keyRow.algorithm === "argon2id"
        ? await verificarArgon2ConMemoria(keyRow.id, keyRow.keyHash, parsed.secret)
        : keyRow.keyHash === hashApiKeyLegacy(apiKey);

    // La clave existe: el intento es contra ESE agente, y se registra a su
    // nombre (un secreto equivocado para una clave real es lo más sospechoso).
    if (!isValid) {
      logAuthFailure(
        keyRow.agentId,
        "Invalid or expired API key",
        metadata?.ipAddress,
        metadata?.userAgent,
        intento
      );
      return {
        success: false,
        error: "Invalid or expired API key",
        code: "INVALID_KEY",
      };
    }

    // Revocada: deja de valer en la PRÓXIMA petición (aquí se lee la base en
    // cada una; no hay caché que esperar). La fila se queda para auditar.
    if (keyRow.revokedAt) {
      logAuthFailure(
        keyRow.agentId,
        "API key revoked",
        metadata?.ipAddress,
        metadata?.userAgent,
        intento
      );
      return {
        success: false,
        error: "API key revoked",
        code: "KEY_REVOKED",
      };
    }

    if (keyRow.expiresAt && keyRow.expiresAt < new Date()) {
      logAuthFailure(
        keyRow.agentId,
        "API key expired",
        metadata?.ipAddress,
        metadata?.userAgent,
        intento
      );
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
      // El agente ya no existe: su id violaría la FK igual que "unknown".
      logAuthFailure(null, "Agent not found", metadata?.ipAddress, metadata?.userAgent, {
        ...intento,
        missingAgentId: keyRow.agentId,
      });
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

    // 5. Las cuotas (minuto, escrituras y presupuesto del día) NO se cuentan
    // aquí: esta función la llaman la autenticación global y la del MCP para
    // la MISMA petición, y contaba dos veces (y respondía 401 en vez de 429).
    // Las cuenta `cuotasDeAgente` (lib/cuotas-de-agente.ts) una sola vez.

    // 6. Actualizar last_used_at (async, no bloqueamos la respuesta)
    marcarUso(key.id);

    // 7. Loguear autenticación exitosa
    logAuthSuccess(agent.id, key.id, metadata?.ipAddress, metadata?.userAgent);

    return {
      success: true,
      context: {
        agentId: agent.id,
        agentName: agent.name,
        scopes: (agent.scopes as string[] | null) ?? [],
        rateLimit: agent.rateLimit ?? 60,
        writesPerDay: agent.writesPerDay ?? null,
        budgetUnitsPerDay: agent.budgetUnitsPerDay ?? null,
        keyId: key.id,
        allowedTools: Array.isArray(agent.allowedTools)
          ? (agent.allowedTools as unknown[]).filter((t): t is string => typeof t === "string")
          : [],
        sponsor: await firmanteDeAgente(agent.sponsorUserId),
        mcpSettings: leerAjustesMcp(agent.mcpSettings),
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

/**
 * OAuth para MCP: el token de acceso → el MISMO contexto que daría la clave
 * estática del agente, con los scopes estrechados por la concesión (lib/oauth/
 * tokens.ts `scopesEfectivos`). Todo lo demás (cuotas, denegaciones,
 * aprobaciones, RLS, firmante, auditoría) lo aplica quien recibe el contexto,
 * igual que siempre.
 */
async function autenticarTokenOAuth(
  token: string,
  metadata?: { ipAddress?: string; userAgent?: string; ruta?: string }
): Promise<AgentAuthResult> {
  try {
    const r = await buscarTokenDeAcceso(token, metadata?.ruta);
    if (!r.ok) {
      logAuthFailure(r.agentId ?? null, r.error, metadata?.ipAddress, metadata?.userAgent, { via: "oauth" });
      return { success: false, error: r.error, code: r.code };
    }
    const agent = r.agente;
    if (!agent.isActive) {
      logAuthFailure(agent.id, "Agent is deactivated", metadata?.ipAddress, metadata?.userAgent, { via: "oauth" });
      return { success: false, error: "Agent is deactivated", code: "AGENT_DEACTIVATED" };
    }
    marcarUso(r.clave.id);
    logAuthSuccess(agent.id, r.clave.id, metadata?.ipAddress, metadata?.userAgent);
    return {
      success: true,
      context: {
        agentId: agent.id,
        agentName: agent.name,
        scopes: r.scopes,
        rateLimit: agent.rateLimit ?? 60,
        writesPerDay: agent.writesPerDay ?? null,
        budgetUnitsPerDay: agent.budgetUnitsPerDay ?? null,
        keyId: r.clave.id,
        allowedTools: Array.isArray(agent.allowedTools)
          ? (agent.allowedTools as unknown[]).filter((t): t is string => typeof t === "string")
          : [],
        sponsor: await firmanteDeAgente(agent.sponsorUserId),
        mcpSettings: leerAjustesMcp(agent.mcpSettings),
        oauth: { clientId: r.clientId, grantId: r.grantId },
      },
    };
  } catch (error) {
    console.error("[AgentAuth] OAuth authentication error:", error);
    return { success: false, error: "Authentication failed", code: "AUTH_ERROR" };
  }
}

/**
 * Fase F: la identidad de un agente SIN su secreto, para ejecutar una
 * propuesta que un humano aprobó (lib/aprobaciones.ts). Se relee TODO de la
 * base en ese momento: si el agente se desactivó, o la clave con la que se
 * propuso se revocó o caducó, no hay contexto y la propuesta no se ejecuta.
 * Los scopes son los de AHORA, no los de cuando se propuso.
 */
export async function contextoDeAgenteParaAprobacion(
  agentId: string,
  keyId: string | null
): Promise<{ ok: true; context: AgentAuthContext } | { ok: false; motivo: string }> {
  const [agent] = await db.select().from(agentIdentities).where(eq(agentIdentities.id, agentId)).limit(1);
  if (!agent) return { ok: false, motivo: "agent_not_found" };
  if (!agent.isActive) return { ok: false, motivo: "agent_deactivated" };
  let scopes = (agent.scopes as string[] | null) ?? [];
  if (keyId) {
    const [key] = await db.select().from(agentApiKeys).where(eq(agentApiKeys.id, keyId)).limit(1);
    if (!key || key.agentId !== agentId) return { ok: false, motivo: "key_not_found" };
    if (key.revokedAt) return { ok: false, motivo: "key_revoked" };
    if (key.expiresAt && key.expiresAt < new Date()) return { ok: false, motivo: "key_expired" };
    // Propuesta hecha por una conexión OAuth: se ejecuta con lo que esa
    // conexión permite HOY (estrechado por la concesión), no con todo el agente.
    if (key.algorithm === "oauth") {
      const concesion = await concesionDeClave(key.id);
      if (!concesion || concesion.revocada) return { ok: false, motivo: "oauth_grant_revoked" };
      scopes = scopesEfectivos(scopes, concesion.scopes);
    }
  }
  return {
    ok: true,
    context: {
      agentId: agent.id,
      agentName: agent.name,
      scopes,
      rateLimit: agent.rateLimit ?? 60,
      writesPerDay: agent.writesPerDay ?? null,
      budgetUnitsPerDay: agent.budgetUnitsPerDay ?? null,
      keyId: keyId ?? "",
      allowedTools: Array.isArray(agent.allowedTools)
        ? (agent.allowedTools as unknown[]).filter((t): t is string => typeof t === "string")
        : [],
      sponsor: await firmanteDeAgente(agent.sponsorUserId),
      mcpSettings: leerAjustesMcp(agent.mcpSettings),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compatibilidad (no hace nada): el contador por minuto vivía aquí, en memoria.
 * Ahora está en lib/cuotas-de-agente.ts (Valkey, con reserva en memoria y
 * Postgres), que limpia sus ventanas solo. Sin importarlo aquí: los tests que
 * sustituyen `../db/schema` no deben arrastrar el módulo de cuotas.
 */
export function cleanupRateLimitCache(): void {
  /* nada que limpiar */
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `last_used_at` como mucho una vez por minuto y clave en este proceso
 * (rendimiento, 2026-10-27).
 *
 * Era un UPDATE (con su COMMIT y su conexión del pool) en CADA petición de un
 * agente, para una columna que el panel enseña como fecha («último uso»). La
 * auditoría de verdad —una fila `auth_success` por petición en
 * `agent_audit_logs`— no cambia: se sigue escribiendo cada vez.
 */
const MARCAR_USO_CADA_MS = 60_000;
const ultimaMarcaDeUso = new Map<string, number>();

function marcarUso(keyId: string): void {
  const ahora = Date.now();
  const previa = ultimaMarcaDeUso.get(keyId);
  if (previa !== undefined && ahora - previa < MARCAR_USO_CADA_MS) return;
  if (ultimaMarcaDeUso.size >= 10_000) ultimaMarcaDeUso.clear();
  ultimaMarcaDeUso.set(keyId, ahora);
  updateLastUsed(keyId).catch(() => {
    // Silenciar errores de auditoría; el siguiente intento no espera el minuto
    ultimaMarcaDeUso.delete(keyId);
  });
}

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
  // La regla única (comodines y denegaciones `!patrón`): @kitsuden/shared,
  // permisos-de-agente.ts. Ver docs/agents/permissions.md.
  return concedeScope(agentContext.scopes || [], requiredScope);
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
 * Revoca una API key: deja de autenticar en la siguiente petición. La fila se
 * queda (con `revoked_at` y quién) para la auditoría.
 */
export async function revokeApiKey(keyId: string, revokedBy?: string): Promise<void> {
  await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date(), revokedBy: revokedBy ?? null })
    .where(eq(agentApiKeys.id, keyId));
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
