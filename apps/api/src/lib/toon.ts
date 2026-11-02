/**
 * Kitsuden — negociación de formato de respuesta en /api/* (TOON, TRON, auto)
 *
 * Por defecto la API responde JSON, como siempre. Un cliente puede pedir otro
 * formato con la misma información:
 *
 *   Accept: application/vnd.kitsuden.auto  o  ?format=auto  → el más corto
 *           de JSON compacto / TOON / TRON para ESTA respuesta, comprobado
 *   Accept: application/vnd.toon           o  ?format=toon  → TOON
 *   Accept: application/vnd.tron           o  ?format=tron  → TRON
 *   Accept: application/json                               → JSON, siempre
 *           (aunque la URL lleve ?format=: el panel, Inti y las webs piden así)
 *
 * La respuesta dice en qué formato va con `Content-Type` y con la cabecera
 * `X-Kitsuden-Format: json|toon|tron`. Si el formato pedido no puede
 * representar los datos sin pérdida, se responde JSON y la cabecera lo dice.
 * Las reglas y la medición están en lib/formatos.ts y docs/agents/benchmarks.md.
 *
 * Los errores no se tocan: salen en application/problem+json (RFC 9457) para
 * todos los clientes (middleware/problemas-http.ts).
 */

import { type MiddlewareHandler } from "hono";

import { CABECERA_FORMATO, codificarRespuesta, formatoPedido, MIME } from "./formatos";
import { avisarAhorro, medirFormatoSincrono } from "./medida-de-formato";
import { encodeToon } from "./toon-tabular";

// ── MIME types ─────────────────────────────────────────────────
export const TOON_MIME = MIME.toon;
export const TRON_MIME = MIME.tron;
export const AUTO_MIME = MIME.auto;

// Re-export the canonical codec for consumers (SDK, tests).
export { encodeToon, decodeToon, ToonDecodeError } from "./toon-tabular";

/**
 * @deprecated Usa `encodeToon`. Antes desenvolvía `{ data }` y tiraba las
 * claves hermanas (`view`, `profile`…): ya no desenvuelve nada.
 */
export function encodeTOON(data: unknown): string {
  return encodeToon(data);
}

/** Clave de la caché por forma: método + ruta con los ids cambiados por `:`. */
function claveDeRuta(metodo: string, ruta: string): string {
  return `${metodo} ${ruta.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}|\/\d+(?=\/|$)/gi, "/:")}`;
}

/**
 * Middleware de negociación de formato. Las peticiones que no piden nada
 * pasan sin tocarse (ni un byte de diferencia para los clientes JSON).
 */
export function toonMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const pedido = formatoPedido(c.req.header("accept"), c.req.query("format"));
    if (!pedido) return next();

    await next();

    if (c.res.status >= 400 || c.res.status === 204) return;
    const contentType = c.res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return;

    let datos: unknown;
    try {
      datos = JSON.parse(await c.res.clone().text());
    } catch {
      return; // no es JSON de verdad: se deja como estaba
    }

    const { valor: salida, medida } = medirFormatoSincrono(() =>
      codificarRespuesta(datos, pedido.pedido, {
        candidatos: pedido.candidatos,
        clave: claveDeRuta(c.req.method, c.req.path),
      })
    );
    // Lo que ahorró a un AGENTE (panel → cuotas); a nadie más se le cuenta.
    avisarAhorro((c.get as (k: string) => { agentId?: string } | undefined)("agent")?.agentId, "rest", medida);

    // Hono copia al Response nuevo las cabeceras del anterior (CORS, caché…)
    // salvo Content-Type; las que describen el cuerpo viejo se quitan.
    c.res = new Response(salida.texto, {
      status: c.res.status,
      headers: {
        "Content-Type": MIME[salida.formato],
        [CABECERA_FORMATO]: salida.formato,
      },
    });
    c.res.headers.delete("content-length");
    c.res.headers.delete("etag");
    c.res.headers.append("Vary", "Accept");
  };
}
