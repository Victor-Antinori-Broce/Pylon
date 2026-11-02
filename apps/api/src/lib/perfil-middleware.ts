/**
 * Tiempo propio de cada middleware global (para medir, APAGADO por defecto)
 * ============================================================================
 *
 * Con `KITSUDEN_PERFIL_MIDDLEWARE=<fichero.json>` en el entorno, cada
 * middleware que se registra con `app.use` en `index.ts` (y lo que se monte
 * con `app.use` después) se envuelve para medir su TIEMPO PROPIO: lo que tarda
 * antes de llamar a `next()` más lo que tarda después de que `next()` vuelva.
 * Lo de dentro (rutas y middlewares siguientes) no cuenta. Cada 5 s se
 * escribe el resumen en ese fichero: llamadas, total, media y p95 por
 * middleware.
 *
 * Sin la variable no se envuelve nada: ni un `if` por petición. No cambia qué
 * hace ningún middleware ni su orden; solo mide. No es para producción (el
 * envoltorio cuesta unos microsegundos por capa); es para `scripts/bench`.
 */

import { writeFileSync } from "node:fs";

import type { Context, Hono, MiddlewareHandler, Next } from "hono";

interface Medida {
  llamadas: number;
  totalMs: number;
  muestras: number[];
}

const medidas = new Map<string, Medida>();
/** Muestras por middleware para el p95 (reservorio: ordenarlas al volcar debe costar poco). */
const MAX_MUESTRAS = 1000;

function anotar(nombre: string, ms: number): void {
  let m = medidas.get(nombre);
  if (!m) {
    m = { llamadas: 0, totalMs: 0, muestras: [] };
    medidas.set(nombre, m);
  }
  m.llamadas++;
  m.totalMs += ms;
  if (m.muestras.length < MAX_MUESTRAS) m.muestras.push(ms);
  else m.muestras[Math.floor(Math.random() * MAX_MUESTRAS)] = ms;
}

/** El resumen ordenado por tiempo total (lo que más pesa, arriba). */
export function resumenDePerfil(): {
  middleware: string;
  llamadas: number;
  totalMs: number;
  mediaMs: number;
  p95Ms: number;
}[] {
  return [...medidas.entries()]
    .map(([middleware, m]) => {
      const orden = [...m.muestras].sort((a, b) => a - b);
      const p95 = orden[Math.min(orden.length - 1, Math.ceil(orden.length * 0.95) - 1)] ?? 0;
      return {
        middleware,
        llamadas: m.llamadas,
        totalMs: Math.round(m.totalMs),
        mediaMs: Math.round((m.totalMs / m.llamadas) * 1000) / 1000,
        p95Ms: Math.round(p95 * 1000) / 1000,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}

/** Para pruebas. */
export function vaciarPerfil(): void {
  medidas.clear();
}

/** Envuelve un middleware para medir su tiempo propio. */
export function medirMiddleware(nombre: string, mw: MiddlewareHandler): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const t0 = performance.now();
    let antes = -1;
    let dentro = 0;
    const res = await mw(c, async () => {
      antes = performance.now() - t0;
      const t1 = performance.now();
      try {
        await next();
      } finally {
        dentro = performance.now() - t1;
      }
    });
    const total = performance.now() - t0;
    anotar(nombre, antes < 0 ? total : total - dentro);
    return res;
  };
}

/**
 * Si `KITSUDEN_PERFIL_MIDDLEWARE` está puesta, sustituye `app.use` por uno
 * que envuelve cada middleware con su nombre (`<orden> <ruta> <función>`) y
 * vuelca el resumen periódicamente. Devuelve si lo activó.
 */
export function activarPerfilDeMiddleware(app: Hono<any>, env = process.env): boolean {
  const fichero = env.KITSUDEN_PERFIL_MIDDLEWARE;
  if (!fichero) return false;
  const original = app.use.bind(app) as (...args: unknown[]) => unknown;
  let orden = 0;
  (app as { use: unknown }).use = (...args: unknown[]) => {
    const ruta = typeof args[0] === "string" ? args[0] : "*";
    const handlers = typeof args[0] === "string" ? args.slice(1) : args;
    const envueltos = handlers.map((h) => {
      orden++;
      const fn = h as MiddlewareHandler & { name?: string };
      const nombre = `${String(orden).padStart(3, "0")} ${ruta} ${fn.name || "anónimo"}`;
      return medirMiddleware(nombre, fn);
    });
    return typeof args[0] === "string" ? original(args[0], ...envueltos) : original(...envueltos);
  };
  const volcar = () => {
    try {
      writeFileSync(fichero, JSON.stringify(resumenDePerfil(), null, 2));
    } catch {
      /* medir no debe tumbar nada */
    }
  };
  setInterval(volcar, 5000).unref?.();
  process.on("exit", volcar);
  return true;
}
