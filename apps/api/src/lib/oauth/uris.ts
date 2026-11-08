/**
 * OAuth para MCP — URIs, PKCE y scopes (funciones puras)
 * ============================================================================
 *
 * Redirecciones (MCP 2026-07-28, «Communication Security» y «Open
 * Redirection»; OAuth 2.1 §2.3.1 y §8.4.2):
 *
 *   · se REGISTRAN https, o http a una dirección de loopback (`localhost`,
 *     `127.0.0.1`, `[::1]`), o un esquema propio de app nativa con forma de
 *     dominio invertido (`cursor://…`, RFC 8252 §7.1; se apaga con
 *     KITSUDEN_OAUTH_CUSTOM_SCHEMES=false). Nunca con fragmento, nunca
 *     `javascript:`/`data:`/`file:`.
 *   · se COMPARAN exactas, carácter a carácter. La única excepción es la de
 *     OAuth 2.1 §8.4.2: en loopback http el PUERTO puede cambiar (las apps
 *     nativas abren uno libre en cada intento).
 */

import { createHash, timingSafeEqual } from "crypto";

import { esLoopback, esquemasPropiosPermitidos, recursoMcp } from "./config";

const ESQUEMAS_PROHIBIDOS = new Set([
  "javascript:", "data:", "file:", "vbscript:", "about:", "blob:", "ftp:", "ws:", "wss:",
  // Manejadores del sistema que abren o ejecutan cosas en la máquina de quien
  // sigue el enlace (Follina usaba `ms-msdt:`). Ningún cliente MCP los usa.
  "search-ms:", "search:", "shell:", "mk:", "mhtml:", "jar:", "intent:", "smb:", "nfs:",
  "ldap:", "ldaps:", "res:", "its:", "hcp:", "telnet:", "ssh:", "tel:", "sms:", "mailto:",
]);

/** `ms-msdt:`, `ms-officecmd:`, `ms-word:`… — los manejadores de Windows van todos fuera. */
const PREFIJOS_DE_ESQUEMA_PROHIBIDOS = ["ms-"];

/** `null` si la URI de redirección se puede registrar; si no, el motivo. */
export function motivoDeRedireccionInvalida(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri || uri.length > 2000) return "must be a non-empty string up to 2000 characters";
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return "is not an absolute URI";
  }
  if (u.hash || uri.includes("#")) return "must not contain a fragment";
  if (u.username || u.password) return "must not contain credentials";
  if (u.protocol === "https:") return u.hostname ? null : "needs a host";
  if (u.protocol === "http:") {
    return esLoopback(u.hostname) ? null : "http is only allowed for loopback (localhost, 127.0.0.1, [::1]); use https";
  }
  if (ESQUEMAS_PROHIBIDOS.has(u.protocol) || PREFIJOS_DE_ESQUEMA_PROHIBIDOS.some((p) => u.protocol.startsWith(p))) {
    return `scheme '${u.protocol}' is not allowed`;
  }
  // Esquema propio de app nativa (RFC 8252 §7.1). Lo recomendable es un
  // dominio invertido (`com.example.app`), pero clientes reales usan su
  // nombre (`cursor://`, `vscode://`): se acepta cualquiera de 3+ caracteres
  // que no sea de la lista prohibida.
  const esquema = u.protocol.slice(0, -1);
  if (!esquemasPropiosPermitidos()) return "only https or loopback http redirect URIs are accepted";
  if (!/^[a-z][a-z0-9+.-]{2,}$/.test(esquema)) return "custom schemes need at least 3 characters (e.g. com.example.app)";
  return null;
}

/**
 * ¿Casa la redirección pedida con alguna registrada? Exacta; en loopback http
 * el puerto puede ser otro (OAuth 2.1 §8.4.2).
 */
export function redireccionCasa(registradas: readonly string[], pedida: string): boolean {
  if (registradas.includes(pedida)) return true;
  let p: URL;
  try {
    p = new URL(pedida);
  } catch {
    return false;
  }
  if (p.protocol !== "http:" || !esLoopback(p.hostname) || p.hash) return false;
  return registradas.some((r) => {
    try {
      const u = new URL(r);
      return (
        u.protocol === "http:" &&
        u.hostname === p.hostname &&
        u.pathname === p.pathname &&
        u.search === p.search &&
        !u.hash
      );
    } catch {
      return false;
    }
  });
}

/**
 * ¿Se puede devolver un error de /authorize con un 302 a esta redirección?
 * Solo si es de fiar (RFC 9700 §4.11): http de loopback (vuelve a la máquina
 * de quien sigue el enlace) o un cliente ya aprobado por un humano
 * (`consentido`). Si no, el error se enseña en pantalla.
 */
export function errorSePuedeRedirigir(redirectUri: string, consentido: boolean): boolean {
  if (consentido) return true;
  try {
    const u = new URL(redirectUri);
    return u.protocol === "http:" && esLoopback(u.hostname);
  } catch {
    return false;
  }
}

export const LONGITUD_MAXIMA_DE_RECURSO = 2000;

/**
 * Quita las barras finales con un bucle: `/\/+$/` retrocede en cuadrático
 * sobre `/////…x` (`new URL` conserva las barras repetidas del camino).
 */
export function sinBarrasFinales(camino: string): string {
  let fin = camino.length;
  while (fin > 0 && camino.charCodeAt(fin - 1) === 47 /* "/" */) fin--;
  return camino.slice(0, fin);
}

/**
 * ¿Es `pedido` el recurso de este servidor? MCP: el cliente manda la URI
 * canónica; se aceptan mayúsculas en esquema y host, y la barra final.
 * Ausente → `null` (el llamador decide el recurso por defecto).
 */
export function recursoPedido(pedido: unknown): { ok: true; recurso: string } | { ok: false } | null {
  if (pedido === undefined || pedido === null || pedido === "") return null;
  // Un recurso legítimo no pasa de 2000 caracteres; más es basura o un ataque.
  if (typeof pedido !== "string" || pedido.length > LONGITUD_MAXIMA_DE_RECURSO) return { ok: false };
  try {
    const u = new URL(pedido);
    if (u.hash) return { ok: false };
    const normal = `${u.protocol}//${u.host}${sinBarrasFinales(u.pathname)}${u.search}`.toLowerCase();
    const nuestro = recursoMcp().toLowerCase();
    return normal === nuestro ? { ok: true, recurso: recursoMcp() } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── PKCE (RFC 7636, solo S256) ───────────────────────────────────────────────

const VERIFICADOR = /^[A-Za-z0-9\-._~]{43,128}$/;
const RETO = /^[A-Za-z0-9_-]{43}$/;

export function retoValido(reto: unknown): reto is string {
  return typeof reto === "string" && RETO.test(reto);
}

export function pkceCasa(verificador: unknown, reto: string): boolean {
  if (typeof verificador !== "string" || !VERIFICADOR.test(verificador)) return false;
  const calculado = createHash("sha256").update(verificador).digest("base64url");
  const a = Buffer.from(calculado);
  const b = Buffer.from(reto);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Scopes (RFC 6749 §3.3: separados por espacio) ───────────────────────────

const TOKEN_DE_SCOPE = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

/** Los scopes de un parámetro `scope`, sin repetidos ni `offline_access`. `null` si el formato es inválido. */
export function leerScopes(valor: unknown): string[] | null {
  if (valor === undefined || valor === null || valor === "") return [];
  if (typeof valor !== "string" || valor.length > 4000) return null;
  const salida: string[] = [];
  for (const s of valor.split(" ").filter(Boolean)) {
    if (!TOKEN_DE_SCOPE.test(s)) return null;
    if (s === "offline_access") continue;
    if (!salida.includes(s)) salida.push(s);
  }
  return salida.length > 200 ? null : salida;
}

export function hashDe(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}
