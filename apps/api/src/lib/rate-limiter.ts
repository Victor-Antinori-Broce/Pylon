/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RATE LIMITER - Protección contra abuso de API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implementación basada en Valkey (Redis) con sliding window.
 * Soporta límites diferenciados por endpoint y tipo de autenticación.
 *
 * Sin `VALKEY_URL` (instancia única, kitsuden2.md B1b) TODAS las rutas
 * cuentan en la memoria del proceso. A propósito NO en una tabla de Postgres:
 * cada petición escribiría en la base, cuyo pool ya se agotó antes con
 * lecturas en paralelo. Con varias réplicas, Valkey.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { esPrivada, ipDelCliente } from "./ip-del-cliente";
import { getValkeyClient, valkeyConfigurado } from "./valkey";

import type { Context, Next } from "hono";

/**
 * ── EL SITIO PÚBLICO NO ES UN CLIENTE, ES MUCHOS ───────────────────────────
 *
 * El servidor del sitio (Astro) pregunta a la API en nombre de cada visitante,
 * desde SU propia IP y sin `x-forwarded-for`: todas las visitas caían en el
 * mismo cubo («unknown»). A las 300 páginas por minuto de una ruta caliente
 * (`/api/wiki/wikis`, `/api/settings`) la API contestaba 429 y el sitio servía
 * 404 a todo el mundo.
 *
 * Con la clave compartida (`SITIO_API_CLAVE`, en el sitio y en la API) el
 * sitio dice qué visitante hay detrás (`x-kitsuden-cliente`) y el cupo se
 * cuenta por visitante. Sin la clave, esa cabecera se ignora: cualquiera
 * podría escribir una IP distinta en cada petición para no agotar nunca nada.
 *
 * Devuelve el identificador del visitante, o `null` si la petición no viene
 * firmada por el sitio (o no hay clave configurada).
 */
export function visitanteDelSitio(c: Context<any>): string | null {
  const clave = process.env.SITIO_API_CLAVE ?? "";
  const recibida = c.req.header("x-kitsuden-sitio") ?? "";
  if (!clave || !recibida) return null;
  // Comparación en tiempo constante sobre resúmenes de igual longitud
  const a = createHash("sha256").update(clave).digest();
  const b = createHash("sha256").update(recibida).digest();
  if (!timingSafeEqual(a, b)) return null;
  const cliente = (c.req.header("x-kitsuden-cliente") ?? "").trim().slice(0, 64);
  return `sitio:${cliente || "sin-ip"}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export interface RateLimitConfig {
  /** Requests permitidos por ventana */
  limit: number;
  /** Ventana de tiempo en segundos */
  window: number;
  /** Mensaje de error personalizado */
  message?: string;
  /** Key personalizada para identificar el cliente */
  keyGenerator?: (c: Context<{ Variables: AppVariables }>) => string;
  /**
   * Espacio propio del contador en Valkey. Sin él, la clave es
   * `ratelimit:<ruta>:<cliente>`, la MISMA que usa `globalRateLimit` para esa
   * ruta: un límite de kon y el global apuntaban al mismo zset y cada petición
   * se contaba dos veces (un `limit: 10` de kon cortaba a las 5). Los límites
   * de kon lo fijan a `kon:<id>`.
   */
  espacio?: string;
  /** Si debe saltarse el rate limiting */
  skip?: (c: Context<{ Variables: AppVariables }>) => boolean;
  /**
   * Denegar si el contador no está disponible (Valkey caído).
   *
   * Por defecto `false` — el limitador FALLA ABIERTO para que una caída de
   * Valkey no tumbe la API entera. Es la elección correcta para el 99% de las
   * rutas: servir de más es mejor que no servir.
   *
   * Pero hay endpoints donde no lo es. Uno que manda correo a direcciones sin
   * verificar, o que cobra, prefiere rechazar la petición a quedarse sin
   * ningún freno: con Valkey caído y fallo abierto, un atacante manda correos
   * ilimitados desde tu dominio. Esos marcan `failClosed: true`.
   */
  failClosed?: boolean;
}

/** Configuración por defecto */
const DEFAULT_CONFIG: RateLimitConfig = {
  limit: 100,
  window: 60,
  message: "Rate limit exceeded. Please try again later.",
};

/** Configuraciones específicas por ruta */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Auth - más estricto para prevenir brute force.
  //
  // Con los caminos REALES de better-auth. Aquí ponía `/api/auth/login`,
  // `/register` y `/forgot-password`, que no existen: el inicio de sesión
  // (`/sign-in/email`) corría con el límite general de 300/min.
  "/api/auth/sign-in/email": {
    limit: 10,
    window: 300,
    message: "Too many login attempts. Try again in 5 minutes.",
    failClosed: true,
  },
  "/api/auth/sign-up/email": {
    limit: 5,
    window: 3600,
    message: "Too many registration attempts. Try again later.",
    failClosed: true,
  },
  "/api/auth/request-password-reset": {
    limit: 3,
    window: 3600,
    message: "Too many password reset attempts.",
    failClosed: true,
  },
  "/api/auth/forget-password": {
    limit: 3,
    window: 3600,
    message: "Too many password reset attempts.",
    failClosed: true,
  },
  "/api/auth/send-verification-email": {
    limit: 3,
    window: 3600,
    message: "Too many verification emails requested.",
    failClosed: true,
  },

  // El resto de caminos de better-auth que comprueban una contraseña o mandan
  // un correo. Con sesión, sí, pero una sesión robada sin la contraseña
  // actual no debe poder probar contraseñas sin freno (`change-password`,
  // `delete-user`), ni usar el dominio para mandar correos (`change-email`).
  // `reset-password` consume el token del correo y fija la contraseña nueva.
  "/api/auth/change-password": {
    limit: 10,
    window: 300,
    message: "Too many attempts. Try again in 5 minutes.",
    failClosed: true,
  },
  "/api/auth/change-email": {
    limit: 3,
    window: 3600,
    message: "Too many email change requests.",
    failClosed: true,
  },
  "/api/auth/delete-user": {
    limit: 5,
    window: 300,
    message: "Too many attempts. Try again in 5 minutes.",
    failClosed: true,
  },
  "/api/auth/reset-password": {
    limit: 10,
    window: 3600,
    message: "Too many password reset attempts.",
    failClosed: true,
  },

  // Enlace mágico de miembros: anónimo, crea la fila del miembro y manda un
  // correo a la dirección que se le dé. Sin esto, 300/min por IP de correos a
  // terceros (bombardeo de buzones y reputación del dominio de envío).
  "/api/members/signin": {
    limit: 5,
    window: 3600,
    message: "Too many sign-in links requested. Try again later.",
    failClosed: true,
  },

  // MCP - moderado por uso intensivo de AI
  "/api/mcp": { limit: 200, window: 60, message: "MCP rate limit exceeded." },

  // Agents playground - uso intensivo
  "/api/agents/playground": { limit: 50, window: 60, message: "Playground rate limit exceeded." },

  // Batch operations - más permisivo pero controlado
  "/api/datasets/batch": {
    limit: 30,
    window: 60,
    message: "Batch operations limited to 30/minute.",
  },

  // Import/Export - muy permisivo pero trackeable
  "/api/datasets/export": {
    limit: 10,
    window: 60,
    message: "Export operations limited to 10/minute.",
  },
  "/api/datasets/import": {
    limit: 10,
    window: 60,
    message: "Import operations limited to 10/minute.",
  },

  // Search - moderado
  "/api/search": { limit: 120, window: 60, message: "Search rate limit exceeded." },

  // GraphQL - moderado
  "/api/graphql": { limit: 100, window: 60, message: "GraphQL rate limit exceeded." },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  limit: number;
  retryAfter?: number;
  /**
   * No se ha podido contar (ni en Valkey ni en la reserva en memoria) y la
   * ruta falla cerrada: se responde 503, no 429 — no es que el cliente se
   * haya pasado, es que ahora mismo no podemos saberlo.
   */
  unavailable?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPLEMENTACIÓN CORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera la key para rate limiting basada en cliente
 */
export function generateKey(
  c: Context<{ Variables: AppVariables }>,
  config: RateLimitConfig
): string {
  const espacio = config.espacio ? `${config.espacio}:` : "";
  if (config.keyGenerator) {
    return `ratelimit:${espacio}${config.keyGenerator(c)}`;
  }

  // Visitante del sitio (firmado con SITIO_API_CLAVE) > IP real del cliente.
  //
  // Ni `Authorization` ni `x-forwarded-for` tal cual: los escribe el cliente, y
  // con un valor distinto en cada petición cada una caía en un cubo nuevo — el
  // límite no existía. Un `Bearer <basura>` que no es de agente ni siquiera da
  // 401: sigue como petición anónima. El usuario tampoco sirve aquí, porque el
  // limitador corre ANTES de la autenticación y `user` aún no está puesto.
  // Ver `ip-del-cliente.ts`.
  const identifier = visitanteDelSitio(c) || ipDelCliente(c);
  const route = rutaNormalizada(c.req.path);

  return `ratelimit:${espacio}${route}:${identifier}`;
}

/**
 * Lecturas de filas de datasets por API (`GET /api/data-sets/:id/entries`,
 * `/api/datasets/:id/entries`…): UN cubo por cliente para TODOS los datasets.
 *
 * Auditoría 2026-10-15: el sitio esconde `/data` y frena a los bots (403/429,
 * ver memoria datos-protegidos), pero la API servía las mismas filas a 100
 * peticiones/min POR DATASET y cliente — un barrido de 50 datasets eran 5.000
 * por minuto. Aquí el cubo es por cliente (visitante firmado del sitio o IP
 * real), no por ruta, y más bajo.
 *
 * Las llamadas internas (IP privada: el SSR de las webs en la red de Docker)
 * no cuentan: sin `SITIO_API_CLAVE` todas llegarían como un único cliente y el
 * sitio entero se quedaría sin datos (memoria limitador-api-da-404).
 */
export const LECTURA_DE_ENTRADAS: RateLimitConfig = {
  limit: 120,
  window: 60,
  message: "Too many dataset reads. Slow down.",
  keyGenerator: (c) => `entries:${visitanteDelSitio(c) || ipDelCliente(c)}`,
  skip: (c) => !visitanteDelSitio(c) && esPrivada(ipDelCliente(c)),
};

const PATRON_ENTRADAS = /^\/api\/(data-sets|datasets)\/[^/]+\/entries(\/|$)/;

export function configPorPatron(metodo: string, camino: string): RateLimitConfig | null {
  if (metodo.toUpperCase() === "GET" && PATRON_ENTRADAS.test(camino)) return LECTURA_DE_ENTRADAS;
  return null;
}

/**
 * The bucket above, for whoever calls the API directly. A visit to a website
 * (signed with the site key) reads several datasets per page, and the site has
 * its own guard for crawlers: at 120 a minute a crawler would start getting 503s
 * and lose pages from search engines. Those requests, and internal ones with no
 * signature, keep the general per-route limit.
 */
function cuboDeLecturaDirecta(c: Context<{ Variables: AppVariables }>): RateLimitConfig | null {
  const config = configPorPatron(c.req.method, rutaNormalizada(c.req.path));
  if (!config || visitanteDelSitio(c) || config.skip?.(c)) return null;
  return config;
}

/**
 * La ventana deslizante en un script de Valkey: quita lo caducado, cuenta y,
 * si cabe, apunta esta petición y renueva la caducidad. Devuelve el recuento
 * ANTES de apuntarla (lo mismo que leía `zCard`).
 */
const SCRIPT_VENTANA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
local n = redis.call('ZCARD', KEYS[1])
if n < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), ARGV[4])
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return n`;

/** `false` tras un fallo de EVAL que no es de conexión: no se vuelve a intentar. */
let scriptsDisponibles = true;

/**
 * El recuento con el script, o `null` si este cliente no puede ejecutarlo
 * (entonces se cuenta con los pasos sueltos). Un fallo de CONEXIÓN se propaga:
 * es el mismo caso que antes (abierto o cerrado según la ruta).
 */
async function contarConScript(
  valkey: unknown,
  key: string,
  ahora: number,
  ventanaMs: number,
  limite: number,
  miembro: string
): Promise<number | null> {
  const evaluar = (valkey as { eval?: unknown }).eval;
  if (!scriptsDisponibles || typeof evaluar !== "function") return null;
  try {
    const n = await (
      evaluar as (s: string, o: { keys: string[]; arguments: string[] }) => Promise<unknown>
    ).call(valkey, SCRIPT_VENTANA, {
      keys: [key],
      arguments: [String(ahora), String(ventanaMs), String(limite), miembro],
    });
    return Number(n);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    // NOSCRIPT / comando desconocido / scripts desactivados: pasos sueltos.
    if (/unknown command|NOSCRIPT|ERR.*script|not allowed|disabled/i.test(mensaje)) {
      scriptsDisponibles = false;
      return null;
    }
    throw err;
  }
}

/**
 * Verifica si el request está dentro del rate limit (sliding window)
 */
export async function checkRateLimit(
  c: Context<{ Variables: AppVariables }>,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const key = generateKey(c, config);
  const now = Date.now();
  const windowMs = config.window * 1000;
  const reset = now + windowMs;

  // `getValkeyClient()` no devuelve null cuando Valkey está caído: LANZA
  // (conexión rechazada o timeout). Antes la llamada estaba fuera del `try`, la
  // excepción subía hasta el `catch {}` del middleware —que deja pasar— y las
  // rutas `failClosed` fallaban ABIERTAS justo en el caso para el que existían.
  // Instancia única sin Valkey: el contador ES la memoria del proceso, para
  // todas las rutas. Si el tope de claves se llena, las rutas normales dejan
  // pasar (como con Valkey caído) y las `failClosed` rechazan.
  if (!valkeyConfigurado()) {
    return contarEnMemoria(key, config, now, !config.failClosed);
  }

  let valkey: Awaited<ReturnType<typeof getValkeyClient>> | null;
  try {
    valkey = await getValkeyClient();
  } catch {
    valkey = null;
  }

  // Sin Valkey no hay contador. Por defecto se permite (fail open) para que
  // una caída del caché no tumbe la API; las rutas que marcan `failClosed`
  // cuentan en la reserva en memoria y, si tampoco se puede, rechazan.
  if (!valkey) {
    if (config.failClosed) {
      return contarEnMemoria(key, config, now);
    }
    return { allowed: true, remaining: config.limit, reset, limit: config.limit };
  }

  try {
    // Usar sorted set para sliding window
    const windowStart = now - windowMs;
    const miembro = `${now}-${Math.random()}`;

    // Una sola ida y vuelta: el script hace lo mismo que los cuatro pasos de
    // abajo, y además de forma ATÓMICA (con cuatro llamadas sueltas, N
    // peticiones a la vez leían el mismo recuento y pasaban todas).
    let currentCount = await contarConScript(valkey, key, now, windowMs, config.limit, miembro);
    if (currentCount === null) {
      // Sin EVAL (un cliente de pruebas, un Valkey con los scripts
      // desactivados): los cuatro pasos de siempre.
      // Remover entradas antiguas fuera de la ventana
      await valkey.zRemRangeByScore(key, 0, windowStart);

      // Contar entradas actuales
      currentCount = await valkey.zCard(key);

      if (currentCount < config.limit) {
        // Añadir entrada actual
        await valkey.zAdd(key, { score: now, value: miembro });
        // Setear expiración
        await valkey.pExpire(key, windowMs);
      }
    }

    // Verificar si está dentro del límite
    const allowed = currentCount < config.limit;

    const remaining = Math.max(0, config.limit - currentCount - 1);

    return {
      allowed,
      remaining,
      reset,
      limit: config.limit,
      retryAfter: allowed ? undefined : Math.ceil(config.window / 2),
    };
  } catch (error) {
    console.error("Rate limiter error:", error);
    // Mismo criterio que arriba: abierto por defecto, cerrado si la ruta lo pide.
    if (config.failClosed) {
      return contarEnMemoria(key, config, now);
    }
    return { allowed: true, remaining: config.limit, reset, limit: config.limit };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTADOR EN MEMORIA (sin Valkey: todas las rutas; con Valkey caído: las failClosed)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Con Valkey caído, una ruta `failClosed` (login, alta, recuperar contraseña,
 * enlace mágico…) cuenta aquí, en memoria del proceso, en vez de rechazar
 * TODO. Por qué así:
 *
 *   · Rechazar siempre (503 sin más) cierra la puerta a todo el mundo: un
 *     hipo de Valkey y nadie puede entrar al panel. Contar en memoria sigue
 *     frenando la fuerza bruta y el bombardeo de correos con el mismo límite.
 *   · Es POR PROCESO: con N réplicas de la API el cupo real es N veces el
 *     configurado. El despliegue de Kitsuden es una sola réplica; con varias
 *     sigue siendo un freno acotado, que es lo que se pide.
 *   · Tiene un tope de claves. Un atacante que rota IP crea una clave por
 *     petición; sin tope eso es memoria ilimitada. Con el tope lleno (tras
 *     barrer las caducadas) ya no se puede contar a un cliente nuevo y la
 *     ruta falla cerrada de verdad: 503 con Retry-After.
 *
 * Las rutas que no marcan `failClosed` NO pasan por aquí: siguen fallando
 * abiertas, como siempre.
 */
interface CubetaEnMemoria {
  golpes: number[];
  ventanaMs: number;
}

const reservaEnMemoria = new Map<string, CubetaEnMemoria>();

/** Reintento que se pide cuando no se puede contar. */
export const REINTENTO_SIN_CONTADOR_S = 30;

function maxClavesEnMemoria(): number {
  const n = Number(process.env.RATE_LIMIT_MEMORY_MAX_KEYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10_000;
}

function barrerCaducadas(ahora: number): void {
  for (const [clave, cubeta] of reservaEnMemoria) {
    const ultimo = cubeta.golpes[cubeta.golpes.length - 1] ?? 0;
    if (ultimo <= ahora - cubeta.ventanaMs) reservaEnMemoria.delete(clave);
  }
}

function contarEnMemoria(
  key: string,
  config: RateLimitConfig,
  ahora: number,
  abiertoSiLleno = false
): RateLimitResult {
  const ventanaMs = config.window * 1000;
  const reset = ahora + ventanaMs;
  let cubeta = reservaEnMemoria.get(key);

  if (!cubeta) {
    if (reservaEnMemoria.size >= maxClavesEnMemoria()) barrerCaducadas(ahora);
    if (reservaEnMemoria.size >= maxClavesEnMemoria()) {
      if (abiertoSiLleno) {
        return { allowed: true, remaining: config.limit, reset, limit: config.limit };
      }
      return {
        allowed: false,
        unavailable: true,
        remaining: 0,
        reset,
        limit: config.limit,
        retryAfter: REINTENTO_SIN_CONTADOR_S,
      };
    }
    cubeta = { golpes: [], ventanaMs };
    reservaEnMemoria.set(key, cubeta);
  }

  const desde = ahora - ventanaMs;
  cubeta.golpes = cubeta.golpes.filter((t) => t > desde);
  const actuales = cubeta.golpes.length;
  const allowed = actuales < config.limit;
  if (allowed) cubeta.golpes.push(ahora);

  return {
    allowed,
    remaining: Math.max(0, config.limit - actuales - 1),
    reset,
    limit: config.limit,
    retryAfter: allowed ? undefined : Math.ceil(config.window / 2),
  };
}

/** Solo para pruebas: vacía la reserva en memoria. */
export function vaciarReservaEnMemoria(): void {
  reservaEnMemoria.clear();
}

/** Mensaje genérico del 503: no cuenta qué pieza interna falta. */
const MENSAJE_NO_DISPONIBLE = "This action is temporarily unavailable. Please try again shortly.";

/**
 * Respuesta común a los dos middlewares cuando la petición no pasa. Devuelve
 * `null` si puede seguir.
 */
function respuestaDeLimite(c: Context, result: RateLimitResult, message?: string) {
  if (result.allowed) return null;
  if (result.unavailable) {
    c.header("Retry-After", String(result.retryAfter ?? REINTENTO_SIN_CONTADOR_S));
    return c.json({ error: "Service Unavailable", message: MENSAJE_NO_DISPONIBLE }, 503);
  }
  c.header("Retry-After", String(result.retryAfter || 60));
  return c.json(
    {
      error: "Rate Limit Exceeded",
      message: message || "Too many requests. Please slow down.",
      retryAfter: result.retryAfter,
    },
    429
  );
}

/** El contador ha reventado de una forma no prevista: igual que sin contador. */
function sinContador(c: Context) {
  c.header("Retry-After", String(REINTENTO_SIN_CONTADOR_S));
  return c.json({ error: "Service Unavailable", message: MENSAJE_NO_DISPONIBLE }, 503);
}

/**
 * Middleware de rate limiting para Hono
 */
/**
 * La ruta sin barras finales ni dobles: `/api/auth/sign-in/email/` caía en el
 * cubo general (300/min) en vez del de login (auditoría 2026-10-25).
 */
function rutaNormalizada(ruta: string): string {
  const limpia = ruta.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return limpia === "" ? "/" : limpia;
}

/**
 * `RATE_LIMIT_ENABLED`: encendido salvo que diga otra cosa que `true` (la
 * misma regla que `lib/config.ts`). Se lee del entorno y no de `config` para
 * que `module-loader` no arrastre la validación entera de la configuración.
 */
export function limitadorEncendido(): boolean {
  return (process.env.RATE_LIMIT_ENABLED ?? "true") === "true";
}

export function rateLimit(config?: Partial<RateLimitConfig>) {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const path = rutaNormalizada(c.req.path);

    // Buscar configuración específica o usar default
    const pathConfig =
      RATE_LIMIT_CONFIGS[path] || configPorPatron(c.req.method, path) || DEFAULT_CONFIG;
    const finalConfig = { ...pathConfig, ...config };

    // Verificar si debe saltarse
    if (finalConfig.skip?.(c)) {
      return await next();
    }

    try {
      const result = await checkRateLimit(c, finalConfig);

      // Headers siempre presentes
      c.header("X-RateLimit-Limit", String(result.limit));
      c.header("X-RateLimit-Remaining", String(result.remaining));
      c.header("X-RateLimit-Reset", String(result.reset));

      const bloqueo = respuestaDeLimite(c, result, finalConfig.message);
      if (bloqueo) return bloqueo;
    } catch {
      // `checkRateLimit` ya no lanza por Valkey; esto es lo imprevisto. Abierto
      // por defecto, cerrado si la ruta lo pide.
      if (finalConfig.failClosed) return sinContador(c);
    }

    await next();
  };
}

/**
 * Middleware de rate limiting global (para aplicar en todas las rutas)
 */
export function globalRateLimit() {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    // Skip para health checks y assets estáticos
    if (
      c.req.path.startsWith("/health") ||
      c.req.path.startsWith("/assets") ||
      c.req.path === "/"
    ) {
      return await next();
    }

    // Buscar config específica o usar default conservador
    const pathConfig = RATE_LIMIT_CONFIGS[c.req.path] || cuboDeLecturaDirecta(c);
    const config: RateLimitConfig = pathConfig || { limit: 300, window: 60 }; // 300 req/min default

    try {
      const result = await checkRateLimit(c, config);

      c.header("X-RateLimit-Limit", String(result.limit));
      c.header("X-RateLimit-Remaining", String(result.remaining));
      c.header("X-RateLimit-Reset", String(Math.ceil(result.reset / 1000)));

      const bloqueo = respuestaDeLimite(c, result, config.message);
      if (bloqueo) return bloqueo;
    } catch {
      // Ver `rateLimit()`: abierto por defecto, cerrado si la ruta lo pide.
      if (config.failClosed) return sinContador(c);
    }

    await next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS DE ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from "hono";

import { requireAuth } from "../middleware/auth";
import type { AppVariables } from "../types/hono";

export const rateLimitRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * GET /api/admin/rate-limits - Ver estadísticas de rate limiting
 */
rateLimitRoutes.get("/", requireAuth, async (c) => {
  if (!valkeyConfigurado()) {
    // Instancia única: los contadores están en la memoria de este proceso.
    const stats: Record<string, { active: number; totalRequests: number }> = {};
    for (const [key, cubeta] of reservaEnMemoria) {
      const parts = key.split(":");
      const route = (parts[1] === "kon" ? parts.slice(1, 4).join(":") : parts[1]) || "unknown";
      stats[route] ??= { active: 0, totalRequests: 0 };
      stats[route].active++;
      stats[route].totalRequests += cubeta.golpes.length;
    }
    return c.json({
      store: "memory",
      activeKeys: reservaEnMemoria.size,
      routes: stats,
      configs: RATE_LIMIT_CONFIGS,
    });
  }

  let valkey: Awaited<ReturnType<typeof getValkeyClient>>;
  try {
    valkey = await getValkeyClient();
  } catch {
    return c.json({ error: "Valkey not available" }, 503);
  }

  try {
    // Scanear keys de rate limit
    const keys: string[] = [];
    let cursor = "0";

    do {
      const result = await valkey.scan(cursor, { MATCH: "ratelimit:*", COUNT: 100 });
      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== "0");

    // Agrupar por ruta
    const stats: Record<string, { active: number; totalRequests: number }> = {};

    for (const key of keys.slice(0, 100)) {
      // Limitar a 100 keys
      const parts = key.split(":");
      // Los límites de kon llevan su espacio delante: `ratelimit:kon:<id>:<ruta>:…`.
      const route = (parts[1] === "kon" ? parts.slice(1, 4).join(":") : parts[1]) || "unknown";
      const count = await valkey.zCard(key);

      if (!stats[route]) {
        stats[route] = { active: 0, totalRequests: 0 };
      }
      stats[route].active++;
      stats[route].totalRequests += count;
    }

    return c.json({
      activeKeys: keys.length,
      routes: stats,
      configs: RATE_LIMIT_CONFIGS,
    });
  } catch (error) {
    console.error("Rate limit stats error:", error);
    return c.json({ error: "Failed to fetch rate limit stats" }, 500);
  }
});

/**
 * DELETE /api/admin/rate-limits/:key - Resetear rate limit específico
 */
rateLimitRoutes.delete("/:key", requireAuth, async (c) => {
  const key = c.req.param("key");
  if (!valkeyConfigurado()) {
    reservaEnMemoria.delete(`ratelimit:${key}`);
    return c.json({ success: true, message: `Rate limit cleared for ${key}` });
  }

  let valkey: Awaited<ReturnType<typeof getValkeyClient>>;
  try {
    valkey = await getValkeyClient();
  } catch {
    return c.json({ error: "Valkey not available" }, 503);
  }

  try {
    await valkey.del(`ratelimit:${key}`);
    return c.json({ success: true, message: `Rate limit cleared for ${key}` });
  } catch (error) {
    return c.json({ error: "Failed to clear rate limit" }, 500);
  }
});
