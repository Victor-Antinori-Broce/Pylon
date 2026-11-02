/**
 * Pool de Postgres agotado → 503 con Retry-After, no 500
 * ============================================================================
 *
 * Con carga (2026-10-18, `GET /api/blog` en ráfaga) el pool se quedaba sin
 * conexiones libres: pasados `connectionTimeoutMillis` (2 s fijos) pg-pool
 * lanza `timeout exceeded when trying to connect`. Eso no es un fallo del
 * servidor, es «ahora no puedo»: un 503 con Retry-After le dice al cliente (y
 * al SSR de las webs, y a un balanceador) que reintente, y no se confunde con
 * un error de verdad en los registros.
 *
 * El problema es que casi todos los kons capturan sus errores y responden un
 * 500 propio (`{ error: "Failed to fetch posts" }`), así que `app.onError`
 * nunca ve el error del pool. Por eso esto funciona en dos piezas:
 *
 *   1. `vigilarPool(pool)` envuelve `pool.connect` (pg-pool lo usa también
 *      por dentro de `pool.query`) y, si el fallo es de pool agotado, lo
 *      anota en la petición en curso (AsyncLocalStorage).
 *   2. `poolAgotadoA503()`, un middleware externo, convierte en 503 +
 *      Retry-After cualquier respuesta 5xx de una petición así anotada — la
 *      haya escrito `onError` o el `catch` de un kon.
 *
 * Tamaño y espera son configurables: `DB_POOL_MAX` (20) y
 * `DB_POOL_CONNECTION_TIMEOUT_MS` (5000; 2000 se quedaba corto en ráfagas
 * cortas, que es justo cuando hay que esperar un poco en vez de fallar).
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { Context, Next } from "hono";

/** Segundos que se piden al cliente antes de reintentar. */
export const REINTENTO_POOL_S = 5;

const MENSAJES_DE_POOL_AGOTADO = [
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
];

/** ¿Es (o envuelve, vía `cause`) un fallo por no conseguir conexión a tiempo? */
export function esPoolAgotado(err: unknown): boolean {
  let actual: unknown = err;
  for (let i = 0; i < 5 && actual; i++) {
    const mensaje = actual instanceof Error ? actual.message : String(actual);
    if (MENSAJES_DE_POOL_AGOTADO.some((m) => mensaje.includes(m))) return true;
    actual = actual instanceof Error ? actual.cause : undefined;
  }
  return false;
}

/** Configuración del pool desde el entorno, con valores por defecto sensatos. */
export function configuracionDelPool(env: Record<string, string | undefined> = process.env): {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
} {
  const entero = (valor: string | undefined, porDefecto: number, min: number, max: number) => {
    const n = Number(valor);
    return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
  };
  return {
    max: entero(env.DB_POOL_MAX, 20, 1, 500),
    connectionTimeoutMillis: entero(env.DB_POOL_CONNECTION_TIMEOUT_MS, 5000, 100, 60_000),
    idleTimeoutMillis: entero(env.DB_POOL_IDLE_TIMEOUT_MS, 30_000, 1000, 600_000),
  };
}

interface Marca {
  agotado: boolean;
}

const peticion = new AsyncLocalStorage<Marca>();

/** Anota la petición en curso si el error es de pool agotado. */
export function anotarSiPoolAgotado(err: unknown): void {
  if (!esPoolAgotado(err)) return;
  const marca = peticion.getStore();
  if (marca) marca.agotado = true;
}

/** Lo mínimo de pg-pool que hace falta: `connect` con promesa o con callback. */
interface PoolConectable {
  connect(...args: unknown[]): unknown;
}

/**
 * Envuelve `pool.connect` para anotar los fallos de pool agotado. No cambia
 * nada más: el error sigue llegando a quien lo esperaba.
 */
export function vigilarPool<P extends PoolConectable>(pool: P): P {
  const original = pool.connect.bind(pool);
  pool.connect = (...args: unknown[]) => {
    const callback = args[0];
    if (typeof callback === "function") {
      return original((err: unknown, ...resto: unknown[]) => {
        if (err) anotarSiPoolAgotado(err);
        callback(err, ...resto);
      });
    }
    const resultado = original();
    if (resultado instanceof Promise) {
      return resultado.catch((err: unknown) => {
        anotarSiPoolAgotado(err);
        throw err;
      });
    }
    return resultado;
  };
  return pool;
}

/**
 * Middleware: una petición que se quedó sin conexión y acaba en 5xx sale como
 * 503 + Retry-After con un mensaje genérico. Va por FUERA de `onError` y de
 * los `catch` de los kons para ver su respuesta final.
 */
export function poolAgotadoA503() {
  return async (c: Context, next: Next) => {
    const marca: Marca = { agotado: false };
    await peticion.run(marca, () => next());
    if (marca.agotado && c.res.status >= 500) {
      // Se conservan las cabeceras ya puestas (CORS, traza): sin ellas el
      // navegador ni siquiera dejaría leer el 503.
      const cabeceras = new Headers(c.res.headers);
      cabeceras.delete("content-length");
      cabeceras.set("content-type", "application/json; charset=utf-8");
      cabeceras.set("retry-after", String(REINTENTO_POOL_S));
      c.res = new Response(
        JSON.stringify({
          error: "Service Unavailable",
          // Código del catálogo (@kitsuden/shared): problemas-http lo respeta.
          code: "KITSUDEN_E_DB_POOL_EXHAUSTED",
          message: "The server is busy. Please retry shortly.",
          requestId: (c.get as (k: string) => unknown)("requestId") ?? null,
        }),
        { status: 503, headers: cabeceras }
      );
    }
  };
}
