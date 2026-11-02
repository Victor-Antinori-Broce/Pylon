/**
 * OAuth 2.1 para MCP — configuración
 * ============================================================================
 *
 * Implementa la autorización de MCP, revisión **2026-07-28**
 * (https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):
 * OAuth 2.1 con Protected Resource Metadata (RFC 9728), Authorization Server
 * Metadata (RFC 8414), Client ID Metadata Documents (lo preferido) y Dynamic
 * Client Registration (RFC 7591, retenido por compatibilidad), código +
 * PKCE S256, resource indicators (RFC 8707), `iss` en la respuesta (RFC 9207)
 * y revocación (RFC 7009). Guía: docs/agents/oauth.md.
 *
 * Todo se lee del entorno EN CADA LLAMADA (no al importar): los tests cambian
 * los valores y el arranque no depende del orden de carga.
 *
 *   OAUTH_ISSUER_URL            URL pública de la API, sin ruta («https://api.ejemplo.com»).
 *                               Es el `issuer` y la base del recurso `<issuer>/api/mcp`.
 *                               Por defecto BETTER_AUTH_URL. En producción TIENE que ser https.
 *   KITSUDEN_OAUTH_ENABLED      `false` apaga todo (metadatos 404, endpoints 404).
 *   OAUTH_ACCESS_TOKEN_TTL      segundos (por defecto 900; 60–3600).
 *   OAUTH_REFRESH_TOKEN_TTL     segundos de cada refresco (por defecto 30 días).
 *   OAUTH_FAMILY_MAX_TTL        vida máxima de una familia de refrescos (90 días).
 *   KITSUDEN_OAUTH_CIMD         `false` apaga los Client ID Metadata Documents.
 *   KITSUDEN_OAUTH_CIMD_ALLOWED_HOSTS  lista de hosts permitidos (vacío = cualquiera público).
 *   KITSUDEN_OAUTH_DCR          `false` apaga el registro dinámico.
 *   KITSUDEN_OAUTH_CUSTOM_SCHEMES `false` rechaza esquemas propios (`cursor://…`).
 *   OAUTH_REGISTER_LIMIT        registros por IP y hora (30).
 *   OAUTH_TOKEN_LIMIT           peticiones al token por IP y minuto (60).
 */

import { enProduccion } from "../entorno";

export const PREFIJO_ACCESO = "kitsuden_oat_";
export const PREFIJO_REFRESCO = "kitsuden_ort_";
export const PREFIJO_CLIENTE = "kc_";
export const PREFIJO_SECRETO_CLIENTE = "kcs_";

/** Lo mínimo para funcionar (RFC 9728 `scopes_supported`; el consentimiento puede dar más). */
export const SCOPES_BASICOS = ["mcp:connect", "mcp:read", "mcp:write"] as const;

/** Ruta del endpoint MCP protegido. */
export const RUTA_MCP = "/api/mcp";

function numero(nombre: string, porDefecto: number, min: number, max: number): number {
  const n = Number(process.env[nombre]);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function apagado(nombre: string): boolean {
  return (process.env[nombre] ?? "").trim().toLowerCase() === "false";
}

/** El issuer: solo origen (esquema + host + puerto), sin barra final. */
export function issuer(): string {
  const crudo =
    process.env.OAUTH_ISSUER_URL ||
    process.env.BETTER_AUTH_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  try {
    const u = new URL(crudo);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return `http://localhost:${process.env.PORT || 3000}`;
  }
}

/** El recurso protegido (RFC 8707 / 9728): el endpoint MCP. */
export function recursoMcp(): string {
  return `${issuer()}${RUTA_MCP}`;
}

/** URL de los metadatos del recurso que se anuncia en `WWW-Authenticate`. */
export function urlMetadatosDelRecurso(): string {
  return `${issuer()}/.well-known/oauth-protected-resource${RUTA_MCP}`;
}

export function esLoopback(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
}

/**
 * ¿Está encendido? Apagado con KITSUDEN_OAUTH_ENABLED=false, y en producción
 * si el issuer no es https (MCP exige HTTPS en todo el servidor de
 * autorización): mejor no ofrecerlo que ofrecerlo sobre http.
 */
export function oauthEncendido(): boolean {
  if (apagado("KITSUDEN_OAUTH_ENABLED")) return false;
  const u = new URL(issuer());
  if (enProduccion() && u.protocol !== "https:" && !esLoopback(u.hostname)) return false;
  return true;
}

export const ttlAcceso = () => numero("OAUTH_ACCESS_TOKEN_TTL", 900, 60, 3600);
export const ttlRefresco = () => numero("OAUTH_REFRESH_TOKEN_TTL", 30 * 86_400, 3600, 90 * 86_400);
export const ttlFamilia = () => numero("OAUTH_FAMILY_MAX_TTL", 90 * 86_400, 3600, 365 * 86_400);
export const TTL_CODIGO_S = 60;
export const TTL_PETICION_S = 600;

export const cimdEncendido = () => !apagado("KITSUDEN_OAUTH_CIMD");
export const dcrEncendido = () => !apagado("KITSUDEN_OAUTH_DCR");
export const esquemasPropiosPermitidos = () => !apagado("KITSUDEN_OAUTH_CUSTOM_SCHEMES");
export const limiteDeRegistro = () => numero("OAUTH_REGISTER_LIMIT", 30, 1, 10_000);
export const limiteDeToken = () => numero("OAUTH_TOKEN_LIMIT", 60, 1, 100_000);

export function hostsCimdPermitidos(): string[] {
  return (process.env.KITSUDEN_OAUTH_CIMD_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** La pantalla de consentimiento del panel. */
export function urlDeConsentimiento(idPeticion: string): string {
  const panel = (process.env.ADMIN_URL || "http://localhost:5173").replace(/\/+$/, "");
  return `${panel}/oauth/consent?request=${encodeURIComponent(idPeticion)}`;
}

/**
 * Las rutas del PROTOCOLO: su forma la fija la especificación (formularios
 * `application/x-www-form-urlencoded`, redirecciones 302, errores
 * `{ error, error_description }` de RFC 6749 §5.2, documentos `.well-known`),
 * no el SDK de kons. tests/unit/cobertura-de-operaciones.test.ts las acepta
 * sin `defineOperacion` por estar AQUÍ; no son legado ni herramientas MCP. Se
 * sirven en routes/oauth.ts.
 */
export const RUTAS_DE_PROTOCOLO_OAUTH: readonly string[] = [
  "GET /.well-known/oauth-protected-resource",
  "GET /.well-known/oauth-protected-resource/api/mcp",
  "GET /.well-known/oauth-authorization-server",
  "POST /api/oauth/register",
  "GET /api/oauth/authorize",
  "POST /api/oauth/token",
  "POST /api/oauth/revoke",
];
