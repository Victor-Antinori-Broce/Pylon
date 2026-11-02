/**
 * OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document-00)
 * ============================================================================
 *
 * MCP 2026-07-28 lo prefiere al registro dinámico: el `client_id` es una URL
 * https con ruta, y en ella está el JSON del cliente (nombre y redirecciones).
 * Aquí se lee ese documento con las cautelas de la sección 6 del borrador:
 *
 *   · SSRF: solo https, puerto 443, sin credenciales en la URL, y el host tiene
 *     que resolver SOLO a direcciones públicas (nada de loopback, privadas,
 *     link-local, CGNAT, multicast…). Sin seguir redirecciones. 5 s y 64 KB
 *     como mucho. Opcional: KITSUDEN_OAUTH_CIMD_ALLOWED_HOSTS.
 *     Riesgo que queda: un DNS que cambie entre la comprobación y la conexión
 *     (rebinding). Se reduce con la lista de hosts; ver docs/agents/oauth.md.
 *   · el documento tiene que ser JSON con `client_id` IDÉNTICO a la URL,
 *     `client_name` y `redirect_uris` válidas; `token_endpoint_auth_method`
 *     `none` (no se admite `private_key_jwt`).
 *   · caché según Cache-Control (entre 5 min y 24 h; 1 h si no dice nada).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { hostsCimdPermitidos } from "./config";
import { motivoDeRedireccionInvalida } from "./uris";

export interface DocumentoDeCliente {
  clientId: string;
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
  redirectUris: string[];
  grantTypes: string[];
  softwareId: string | null;
  softwareVersion: string | null;
  /** Hasta cuándo vale la copia. */
  caduca: Date;
}

export type Lectura = { ok: true; doc: DocumentoDeCliente } | { ok: false; motivo: string };

/** ¿Tiene forma de client_id CIMD? (https con ruta). */
export function esClientIdUrl(clientId: string): boolean {
  if (!clientId.startsWith("https://")) return false;
  try {
    const u = new URL(clientId);
    return u.pathname.length > 1;
  } catch {
    return false;
  }
}

function ipv4Privada(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** ¿Es una dirección a la que el servidor no debe conectarse por un cliente ajeno? */
export function direccionNoPublica(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Privada(ip);
  if (v !== 6) return true;
  const h = hextetosDeIpv6(ip);
  if (!h) return true;
  const ceros = (hasta: number) => h.slice(0, hasta).every((x) => x === 0);
  const ipv4Final = () => `${h[6]! >> 8}.${h[6]! & 255}.${h[7]! >> 8}.${h[7]! & 255}`;
  // `new URL` writes `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`: only the numbers count.
  if (ceros(5) && h[5] === 0xffff) return ipv4Privada(ipv4Final()); // IPv4-mapped
  if (ceros(6)) return true; // ::, ::1 and the deprecated IPv4-compatible ::/96
  return (
    (h[0]! & 0xfe00) === 0xfc00 || // fc00::/7, unique local
    (h[0]! & 0xffc0) === 0xfe80 || // fe80::/10, link-local
    (h[0]! & 0xffc0) === 0xfec0 || // fec0::/10, site-local
    (h[0]! & 0xff00) === 0xff00 || // ff00::/8, multicast
    (h[0] === 0x64 && h[1] === 0xff9b) || // NAT64
    h[0] === 0x2002 || // 6to4: tunnels to an IPv4 address
    (h[0] === 0x2001 && h[1] === 0) || // Teredo: same
    (h[0] === 0x2001 && h[1] === 0xdb8) // documentation
  );
}

/** The eight 16-bit groups of an IPv6 address (with `::` or a dotted tail), or `null`. */
function hextetosDeIpv6(ip: string): number[] | null {
  let texto = ip.toLowerCase().split("%")[0]!;
  const puntos = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(texto);
  if (puntos) {
    const [a, b, c, d] = puntos.slice(2).map(Number) as [number, number, number, number];
    texto = `${puntos[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [cabeza, cola] = texto.split("::");
  const trozos = (t: string | undefined) => (t ? t.split(":").map((x) => parseInt(x, 16)) : []);
  const inicio = trozos(cabeza);
  const fin = trozos(cola);
  const huecos = 8 - inicio.length - fin.length;
  if (huecos < 0 || (cola === undefined && huecos !== 0)) return null;
  const h = [...inicio, ...new Array<number>(huecos).fill(0), ...fin];
  return h.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? h : null;
}

type Buscador = (url: string) => Promise<Response>;

/** El fetch real, tras comprobar el destino. */
async function buscarConCautelas(url: string): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "https:" || (u.port && u.port !== "443") || u.username || u.password) {
    throw new Error("client_id must be an https URL on port 443 without credentials");
  }
  const permitidos = hostsCimdPermitidos();
  const host = u.hostname.toLowerCase();
  if (permitidos.length && !permitidos.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new Error("client_id host is not in KITSUDEN_OAUTH_CIMD_ALLOWED_HOSTS");
  }
  const direcciones = isIP(host.replace(/^\[|\]$/g, ""))
    ? [{ address: host.replace(/^\[|\]$/g, "") }]
    : await lookup(host, { all: true, verbatim: true });
  if (!direcciones.length || direcciones.some((d) => direccionNoPublica(d.address))) {
    throw new Error("client_id host resolves to a non-public address");
  }
  return fetch(url, {
    redirect: "manual",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
}

let buscador: Buscador = buscarConCautelas;

/** Solo pruebas: sustituye la red (los tests no salen de la máquina). `null` repone la real. */
export function fijarBuscadorDeMetadatos(b: Buscador | null): void {
  buscador = b ?? buscarConCautelas;
}

const MAX_BYTES = 64 * 1024;

async function leerCuerpo(res: Response): Promise<string> {
  const lector = res.body?.getReader();
  if (!lector) return "";
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await lector.cancel().catch(() => undefined);
      throw new Error("metadata document is larger than 64 KB");
    }
    trozos.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(trozos));
}

function caducidad(res: Response): Date {
  const cc = res.headers.get("cache-control") ?? "";
  const m = /max-age=(\d+)/i.exec(cc);
  let s = m ? Number(m[1]) : 3600;
  if (/no-store|no-cache/i.test(cc)) s = 300;
  s = Math.min(Math.max(s, 300), 86_400);
  return new Date(Date.now() + s * 1000);
}

const texto = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Lee y valida el documento del cliente. Nunca lanza: devuelve el motivo. */
export async function leerDocumentoDeCliente(clientId: string): Promise<Lectura> {
  if (!esClientIdUrl(clientId)) return { ok: false, motivo: "client_id is not an https URL with a path" };
  let res: Response;
  try {
    res = await buscador(clientId);
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "fetch failed" };
  }
  if (res.status !== 200) return { ok: false, motivo: `metadata document answered HTTP ${res.status}` };
  let doc: Record<string, unknown>;
  try {
    const crudo = JSON.parse(await leerCuerpo(res)) as unknown;
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) throw new Error("not an object");
    doc = crudo as Record<string, unknown>;
  } catch (e) {
    return { ok: false, motivo: `metadata document is not valid JSON (${e instanceof Error ? e.message : ""})` };
  }
  if (doc.client_id !== clientId) return { ok: false, motivo: "metadata client_id does not match the URL exactly" };
  const clientName = texto(doc.client_name, 200);
  if (!clientName) return { ok: false, motivo: "metadata document needs client_name" };
  const redirectUris = doc.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 20) {
    return { ok: false, motivo: "metadata document needs 1-20 redirect_uris" };
  }
  for (const r of redirectUris) {
    const motivo = motivoDeRedireccionInvalida(r);
    if (motivo) return { ok: false, motivo: `redirect_uri ${String(r).slice(0, 100)} ${motivo}` };
  }
  const metodo = doc.token_endpoint_auth_method ?? "none";
  if (metodo !== "none") {
    return { ok: false, motivo: "only token_endpoint_auth_method 'none' is supported for metadata-document clients" };
  }
  const grantTypes = Array.isArray(doc.grant_types) ? doc.grant_types.filter((g): g is string => typeof g === "string") : ["authorization_code"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return { ok: false, motivo: "only authorization_code and refresh_token grant types are supported" };
  }
  return {
    ok: true,
    doc: {
      clientId,
      clientName,
      clientUri: texto(doc.client_uri),
      logoUri: texto(doc.logo_uri),
      redirectUris: redirectUris as string[],
      grantTypes,
      softwareId: texto(doc.software_id, 200),
      softwareVersion: texto(doc.software_version, 100),
      caduca: caducidad(res),
    },
  };
}
