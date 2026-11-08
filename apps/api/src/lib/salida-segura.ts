/**
 * Peticiones HTTP SALIENTES con destino comprobado (anti-SSRF)
 * ============================================================================
 *
 * Lo usan el `fetch` del sandbox (lib/worker-sandbox.ts) y las acciones
 * `webhook_out` (lib/actions/handlers/webhook-out-handler.ts): en los dos
 * casos la URL la escribe alguien que no debe poder hablar con lo que hay
 * DENTRO (la API en localhost, los servicios de la red de Docker, los
 * metadatos de la nube en 169.254.169.254).
 *
 * El fallo de antes (auditoría 2026-11-04, F81): se resolvía el nombre con
 * `dns.lookup`, se miraba la dirección, y después `fetch(url)` lo resolvía
 * OTRA VEZ. Un DNS del atacante con TTL 0 contesta una IP pública a la
 * comprobación y 169.254.169.254 a la conexión. Ahora:
 *
 *   1. la URL se valida (solo http/https, sin usuario:clave en ella);
 *   2. el nombre se resuelve UNA vez y se rechaza si alguna dirección no es
 *      pública (`direccionNoPublica`: privadas, loopback, link-local,
 *      0.0.0.0, IPv4 dentro de IPv6, NAT64, 6to4, Teredo…);
 *   3. la conexión va a ESA dirección: `node:http(s).request` con un
 *      `lookup` que devuelve siempre la dirección comprobada (Node y Bun lo
 *      respetan). El `Host` y el SNI/certificado siguen siendo el nombre
 *      original, así que TLS valida contra el nombre de verdad;
 *   4. las redirecciones no se siguen (se devuelven tal cual: un 302 a otro
 *      sitio saltaría la comprobación);
 *   5. la respuesta se lee con tope (descomprimida, contra bombas gzip).
 */

import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

import { direccionNoPublica } from "./oauth/cimd";

export class ErrorDeSalida extends Error {}

export interface DireccionResuelta {
  address: string;
  family: number;
}

/** Cómo se resuelve un nombre (sustituible en pruebas: no salen a la red). */
export type Resolutor = (host: string) => Promise<DireccionResuelta[]>;

const resolutorReal: Resolutor = (host) => dnsLookup(host, { all: true, verbatim: true });
let resolutor: Resolutor = resolutorReal;

/** Solo pruebas: sustituye el DNS. `null` repone el real. */
export function fijarResolutorDeSalida(r: Resolutor | null): void {
  resolutor = r ?? resolutorReal;
}

/** Forma de la URL: http/https, con host y sin credenciales. Lanza `ErrorDeSalida`. */
export function validarUrlSaliente(texto: string | URL): URL {
  let url: URL;
  try {
    url = texto instanceof URL ? new URL(texto.href) : new URL(String(texto ?? ""));
  } catch {
    throw new ErrorDeSalida("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ErrorDeSalida(`Protocol not allowed: ${url.protocol}`);
  }
  if (url.username || url.password) throw new ErrorDeSalida("Credentials in URL are not allowed");
  if (!url.hostname) throw new ErrorDeSalida("Invalid URL");
  return url;
}

/** El host sin corchetes (`[::1]` → `::1`) y sin el punto final. */
export function hostDeUrl(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

/** ¿Está `hostname` en la lista? (`a.com` exacto, `*.a.com` sus subdominios). */
export function hostEnLista(hostname: string, lista: readonly string[]): boolean {
  const h = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return lista.some((entrada) => {
    const p = entrada
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, "");
    if (!p) return false;
    return p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p;
  });
}

/**
 * Resuelve el host UNA vez. Sin `permitirInternos`, todas sus direcciones
 * tienen que ser públicas (una sola privada basta para rechazar: el sistema
 * podría elegir esa). Devuelve la dirección a la que hay que conectar.
 */
export async function resolverDestino(
  url: URL,
  opciones: { permitirInternos?: boolean } = {}
): Promise<DireccionResuelta> {
  const host = hostDeUrl(url);
  let direcciones: DireccionResuelta[];
  const familia = isIP(host);
  if (familia) {
    direcciones = [{ address: host, family: familia }];
  } else {
    try {
      direcciones = await resolutor(host);
    } catch {
      throw new ErrorDeSalida(`Host could not be resolved: ${url.hostname}`);
    }
  }
  direcciones = (direcciones ?? []).filter(
    (d) => d && typeof d.address === "string" && isIP(d.address)
  );
  if (!direcciones.length) throw new ErrorDeSalida(`Host could not be resolved: ${url.hostname}`);
  if (!opciones.permitirInternos && direcciones.some((d) => direccionNoPublica(d.address))) {
    throw new ErrorDeSalida(`Host resolves to a non-public address: ${url.hostname}`);
  }
  const elegida = direcciones[0]!;
  return { address: elegida.address, family: isIP(elegida.address) };
}

export interface PeticionSaliente {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** Bytes máximos de la respuesta (ya descomprimida). */
  maxBytes: number;
  /** Destinos internos permitidos (opt-in explícito de quien despliega). */
  permitirInternos?: boolean;
}

export interface RespuestaSaliente {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  url: string;
}

/** IPv4 dentro de IPv6 (`::ffff:1.2.3.4`) como IPv4, para comparar direcciones. */
function normalizarIp(ip: string): string {
  return ip.toLowerCase().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, "$1");
}

function descomprimido(res: http.IncomingMessage): Readable {
  const codificacion = String(res.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();
  if (codificacion === "gzip" || codificacion === "x-gzip") return res.pipe(zlib.createGunzip());
  if (codificacion === "deflate") return res.pipe(zlib.createInflate());
  if (codificacion === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/**
 * La petición, conectada a la dirección comprobada. Lanza `ErrorDeSalida` si
 * la URL o el destino no valen, si la respuesta pasa del tope o por tiempo.
 */
export async function peticionSaliente(
  destino: string | URL,
  p: PeticionSaliente
): Promise<RespuestaSaliente> {
  const url = validarUrlSaliente(destino);
  const ip = await resolverDestino(url, { permitirInternos: p.permitirInternos });
  const esHttps = url.protocol === "https:";
  const modulo = esHttps ? https : http;
  const host = hostDeUrl(url);
  // Cualquier resolución que haga el runtime devuelve la dirección ya comprobada.
  const fijado = (_h: string, opciones: unknown, cb: (...args: unknown[]) => void) => {
    if (opciones && typeof opciones === "object" && (opciones as { all?: boolean }).all) {
      cb(null, [{ address: ip.address, family: ip.family }]);
    } else {
      cb(null, ip.address, ip.family);
    }
  };
  const cabeceras: Record<string, string> = { ...(p.headers ?? {}) };
  const nombres = new Set(Object.keys(cabeceras).map((k) => k.toLowerCase()));
  // Sin esto, un servidor podría comprimir y el texto llegaría en binario.
  if (!nombres.has("accept-encoding")) cabeceras["accept-encoding"] = "gzip, deflate, br";
  if (p.body !== undefined && !nombres.has("content-length")) {
    cabeceras["content-length"] = String(Buffer.byteLength(p.body));
  }

  return new Promise<RespuestaSaliente>((resolver, rechazar) => {
    let terminado = false;
    let peticion: http.ClientRequest | undefined;
    const acabar = (err: Error | null, r?: RespuestaSaliente) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      if (err) {
        peticion?.destroy();
        rechazar(err);
      } else resolver(r!);
    };
    const reloj = setTimeout(
      () => acabar(new ErrorDeSalida(`Request timed out after ${p.timeoutMs} ms`)),
      p.timeoutMs
    );

    try {
      peticion = modulo.request(
        {
          protocol: url.protocol,
          hostname: host,
          port: url.port ? Number(url.port) : esHttps ? 443 : 80,
          path: `${url.pathname}${url.search}`,
          method: (p.method ?? "GET").toUpperCase(),
          headers: cabeceras,
          lookup: fijado as never,
          // Conexión propia: nada de reutilizar un socket abierto hacia otra dirección.
          agent: false,
          // SNI y certificado contra el NOMBRE (si el host es una IP, no hay SNI).
          ...(esHttps && !isIP(host) ? { servername: host } : {}),
        },
        (res) => {
          // Segunda red: si el runtime dice a qué se conectó, tiene que ser lo comprobado.
          const remota = res.socket?.remoteAddress;
          if (remota && normalizarIp(remota) !== normalizarIp(ip.address)) {
            res.resume();
            acabar(new ErrorDeSalida(`Connected to an unexpected address for ${url.hostname}`));
            return;
          }
          let flujo: Readable;
          try {
            flujo = descomprimido(res);
          } catch {
            flujo = res;
          }
          const trozos: Buffer[] = [];
          let total = 0;
          flujo.on("data", (trozo: Buffer) => {
            total += trozo.byteLength;
            if (total > p.maxBytes) {
              res.destroy();
              flujo.destroy();
              acabar(new ErrorDeSalida(`Response too large (max ${p.maxBytes} bytes)`));
              return;
            }
            trozos.push(trozo);
          });
          flujo.on("error", (err: Error) =>
            acabar(new ErrorDeSalida(`Response could not be read: ${err.message}`))
          );
          flujo.on("end", () => {
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v === undefined) continue;
              headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
            }
            const status = res.statusCode ?? 0;
            acabar(null, {
              status,
              statusText: res.statusMessage ?? "",
              ok: status >= 200 && status < 300,
              headers,
              body: new TextDecoder().decode(Buffer.concat(trozos)),
              url: url.href,
            });
          });
        }
      );
      peticion.on("error", (err) =>
        acabar(err instanceof ErrorDeSalida ? err : new ErrorDeSalida(err.message))
      );
      if (p.body !== undefined) peticion.write(p.body);
      peticion.end();
    } catch (err) {
      // Cabecera inválida y similares: `request` lanza en el acto.
      acabar(new ErrorDeSalida(`Request could not be sent: ${(err as Error).message}`));
    }
  });
}
