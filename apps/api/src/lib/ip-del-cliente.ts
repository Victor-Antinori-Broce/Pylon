/**
 * La IP de quien hace la petición, sin fiarse de lo que el cliente escriba.
 *
 * ── EL FALLO ──────────────────────────────────────────────────────────────
 *
 * El limitador usaba como identificador `x-forwarded-for` ENTERO (o, antes
 * aún, los 32 primeros caracteres de `Authorization`). Las dos cabeceras las
 * escribe el cliente: con una distinta en cada petición, cada petición caía en
 * un cubo nuevo y el límite no existía. Ni siquiera hacía falta una clave
 * válida: un `Authorization: Bearer <basura>` que no es de agente sigue su
 * camino como petición anónima.
 *
 * ── LA REGLA ──────────────────────────────────────────────────────────────
 *
 * Los proxies que tenemos delante (Caddy, el nginx del panel, la red de
 * Docker) viven en direcciones PRIVADAS; los visitantes llegan desde
 * direcciones PÚBLICAS. Así que:
 *
 *   1. Si quien abre el socket es una IP pública, no hay proxy delante: esa es
 *      la IP, y `x-forwarded-for` es texto del cliente → se ignora.
 *   2. Si es privada (o no se conoce), se recorre `x-forwarded-for` de DERECHA
 *      a izquierda saltando las privadas: la primera pública la añadió nuestro
 *      primer proxy. Lo que el cliente haya escrito queda a su izquierda y no
 *      cuenta.
 *   3. Si todo es privado (peticiones desde la propia máquina o la red
 *      interna), la entrada más a la derecha, o el socket.
 *
 * No hace falta saber cuántos saltos hay (Caddy → API, o Caddy → nginx → API):
 * vale para los dos montajes.
 */
/** Lo único que se usa del contexto de Hono (vale cualquier `Context<…>`). */
interface ContextoMinimo {
  env?: unknown;
  req: { header(nombre: string): string | undefined };
}

/** Rangos que se consideran «nuestros proxies» (y que se le pasan a better-auth). */
export const RANGOS_DE_PROXY = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "100.64.0.0/10",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
];

function limpiar(ip: string): string {
  let v = ip.trim();
  // [::1]:1234 → ::1 ; 1.2.3.4:5678 → 1.2.3.4
  const corchetes = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (corchetes) return corchetes[1]!.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  v = v.toLowerCase();
  if (v.startsWith("::ffff:") && /^\d{1,3}(\.\d{1,3}){3}$/.test(v.slice(7))) v = v.slice(7);
  return v;
}

function ipv4(v: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return n.every((x) => x <= 255) ? n : null;
}

/** ¿Es una dirección de red interna (o no es una IP válida)? */
export function esPrivada(ip: string): boolean {
  const v = limpiar(ip);
  const a = ipv4(v);
  if (a) {
    const [x, y] = a as [number, number, number, number];
    return (
      x === 127 ||
      x === 10 ||
      x === 0 ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 168) ||
      (x === 169 && y === 254) ||
      (x === 100 && y >= 64 && y <= 127)
    );
  }
  if (v.includes(":") && /^[0-9a-f:]+$/.test(v)) {
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  return true; // lo que no es una IP no identifica a nadie desde fuera
}

function esIp(v: string): boolean {
  return ipv4(v) !== null || (v.includes(":") && /^[0-9a-f:]+$/.test(v));
}

/** La dirección del socket que entrega `index.ts` (`app.fetch(req, { ip })`). */
function ipDelSocket(c: ContextoMinimo): string | null {
  const env = c.env as { ip?: { address?: string } | string } | undefined;
  const ip = typeof env?.ip === "string" ? env.ip : env?.ip?.address;
  return ip ? limpiar(ip) : null;
}

export function ipDelCliente(c: ContextoMinimo): string {
  const socket = ipDelSocket(c);
  if (socket && esIp(socket) && !esPrivada(socket)) return socket;

  const cadena = (c.req.header("x-forwarded-for") ?? "").split(",").map(limpiar).filter(esIp);

  for (let i = cadena.length - 1; i >= 0; i--) {
    if (!esPrivada(cadena[i]!)) return cadena[i]!;
  }

  const real = limpiar(c.req.header("x-real-ip") ?? "");
  if (real && esIp(real) && !esPrivada(real)) return real;

  return cadena[cadena.length - 1] ?? socket ?? "unknown";
}
